import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL!);

// ── Auto-migrations ───────────────────────────────────────────────────────────
// Called automatically on startup via instrumentation.ts — no manual SQL needed.

export async function runMigrations() {
  if (!process.env.DATABASE_URL) return;

  // Documents — stores ingested files
  await sql`
    CREATE TABLE IF NOT EXISTS documents (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      tags       TEXT[] DEFAULT '{}',
      summary    TEXT,
      insights   TEXT[] DEFAULT '{}',
      added_at   TIMESTAMPTZ DEFAULT now()
    )
  `;

  // Chunks — text segments with auto-generated full-text search vector (no API key needed)
  await sql`
    CREATE TABLE IF NOT EXISTS chunks (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      content     TEXT NOT NULL,
      tsv         TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
    )
  `;

  // GIN index for fast full-text search
  await sql`
    CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING GIN(tsv)
  `;

  // Deadlines — tax dates, visa milestones, property deadlines
  await sql`
    CREATE TABLE IF NOT EXISTS deadlines (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title        TEXT NOT NULL,
      due_date     DATE NOT NULL,
      category     TEXT NOT NULL,
      notes        TEXT,
      is_done      BOOLEAN DEFAULT false,
      is_recurring BOOLEAN DEFAULT false
    )
  `;

  // Properties — rental real estate
  await sql`
    CREATE TABLE IF NOT EXISTS properties (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      address          TEXT NOT NULL,
      purchase_price   NUMERIC(15,2),
      purchase_date    DATE,
      market_value     NUMERIC(15,2),
      mortgage_balance NUMERIC(15,2),
      notes            TEXT,
      created_at       TIMESTAMPTZ DEFAULT now()
    )
  `;

  // Rental records — monthly P&L per property
  await sql`
    CREATE TABLE IF NOT EXISTS rental_records (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      property_id    UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      year           INTEGER NOT NULL,
      month          INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      rent_collected NUMERIC(10,2) DEFAULT 0,
      vacancy_days   INTEGER DEFAULT 0,
      mortgage_pmt   NUMERIC(10,2) DEFAULT 0,
      expenses       JSONB NOT NULL DEFAULT '{}',
      notes          TEXT,
      UNIQUE(property_id, year, month)
    )
  `;

  // Accounts — assets and liabilities for net worth
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      type       TEXT NOT NULL CHECK (type IN ('asset','liability')),
      category   TEXT NOT NULL,
      balance    NUMERIC(15,2) NOT NULL DEFAULT 0,
      currency   TEXT NOT NULL DEFAULT 'USD',
      notes      TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `;

  // Add extracted_at to documents if not present (tracks which docs have had data saved)
  await sql`ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ`;

  // Admin users — stores hashed credentials so no env vars needed after first setup
  await sql`
    CREATE TABLE IF NOT EXISTS admin_users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT now()
    )
  `;
}

// ── Seed data ─────────────────────────────────────────────────────────────────
const STANDARD_DEADLINES = [
  { title: 'Q1 Estimated Tax (US)', due_date: '2026-04-15', category: 'tax_us', notes: 'Form 1040-ES Q1', is_recurring: true },
  { title: 'Q2 Estimated Tax (US)', due_date: '2026-06-16', category: 'tax_us', notes: 'Form 1040-ES Q2', is_recurring: true },
  { title: 'Q3 Estimated Tax (US)', due_date: '2026-09-15', category: 'tax_us', notes: 'Form 1040-ES Q3', is_recurring: true },
  { title: 'Q4 Estimated Tax (US)', due_date: '2027-01-15', category: 'tax_us', notes: 'Form 1040-ES Q4', is_recurring: true },
  { title: 'US Federal Tax Return', due_date: '2026-04-15', category: 'tax_us', notes: 'Form 1040', is_recurring: true },
  { title: 'FBAR (FinCEN 114)',      due_date: '2026-04-15', category: 'tax_us', notes: 'Foreign bank accounts > $10k', is_recurring: true },
  { title: 'India ITR Filing',       due_date: '2026-07-31', category: 'tax_india', notes: 'Income Tax Return India', is_recurring: true },
];

export async function seedDeadlines() {
  try {
    const existing = await sql`SELECT count(*)::int as n FROM deadlines`;
    if ((existing[0] as { n: number }).n > 0) return;
    for (const d of STANDARD_DEADLINES) {
      await sql`
        INSERT INTO deadlines (title, due_date, category, notes, is_recurring)
        VALUES (${d.title}, ${d.due_date}, ${d.category}, ${d.notes}, ${d.is_recurring})
      `;
    }
  } catch {
    // Silently skip if table doesn't exist yet during cold start
  }
}
