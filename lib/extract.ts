import { sql } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Robustly parse a value Claude might return as "$450,000" / "450k" / 450000 / null
function parseNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).replace(/[$,\s]/g, '').toLowerCase();
  if (s === '' || s === 'null' || s === 'n/a' || s === 'unknown') return null;
  const multiplier = s.endsWith('k') ? 1000 : s.endsWith('m') ? 1_000_000 : 1;
  const num = parseFloat(s.replace(/[km]$/, ''));
  return isNaN(num) ? null : num * multiplier;
}

export async function extractAndInsert(documentId: string): Promise<{ accounts: string[]; properties: string[] }> {
  // Sample chunks spread evenly across the whole document
  const allChunks = await sql`
    SELECT content, chunk_index FROM chunks WHERE document_id = ${documentId} ORDER BY chunk_index
  `;
  if ((allChunks as unknown[]).length === 0) return { accounts: [], properties: [] };

  const [docRow] = await sql`SELECT name FROM documents WHERE id = ${documentId}`;
  const docName = (docRow as { name: string }).name;

  // Use the full document — no sampling, no cropping
  const rows = allChunks as { content: string; chunk_index: number }[];
  const text = rows.map(r => r.content).join('\n\n');

  // Fetch what's already in the system so Claude can skip duplicates and understand context
  const existingAccounts = await sql`SELECT name, type, category, balance, currency FROM accounts ORDER BY name`;
  const existingProperties = await sql`SELECT address, market_value, mortgage_balance FROM properties ORDER BY address`;

  const existingAccountsList = (existingAccounts as { name: string; type: string; category: string; balance: number; currency: string }[])
    .map(a => `  - "${a.name}" (${a.type}, ${a.category}, balance: ${a.balance} ${a.currency})`)
    .join('\n') || '  (none yet)';

  const existingPropertiesList = (existingProperties as { address: string; market_value: number | null; mortgage_balance: number | null }[])
    .map(p => `  - "${p.address}"`)
    .join('\n') || '  (none yet)';

  const prompt = `You are filling in a personal finance dashboard from a document. Here is exactly how the dashboard is structured:

## Finance page — Accounts
Each account has these exact fields:
- name: descriptive string, e.g. "Chase Checking", "Fidelity 401k", "Tesla RSUs", "Amex Gold"
- type: MUST be exactly "asset" or "liability"
- category: a descriptive snake_case string. Use specific types, e.g.:
    Assets: 401k, roth_ira, brokerage, rsu, espp, nso_options, iso_options, real_estate, savings, checking, money_market, cd, treasury, bond, crypto, hsa, 529_plan, life_insurance, annuity, pension, startup_equity, angel_investment, business_interest, commodity, collectibles, other
    Liabilities: mortgage, heloc, auto_loan, credit_card, student_loan, personal_loan, tax_liability, margin_loan, other
    Use the most specific category that fits. Do NOT limit yourself to this list — invent descriptive snake_case names for anything not listed.
- balance: positive number in USD (no $ signs, no commas)
- currency: "USD" (or actual currency if foreign)
- notes: optional short string for extra context

## Rentals page — Properties
Each property has these exact fields:
- address: full street address string
- purchase_price: number or null
- purchase_date: "YYYY-MM-DD" string or null
- market_value: current estimated value as number or null
- mortgage_balance: remaining mortgage owed as number or null
- notes: optional string

## Already in the system (DO NOT duplicate these):
Accounts already added:
${existingAccountsList}

Properties already added:
${existingPropertiesList}

## Document to extract from:
Name: "${docName}"
---
${text}
---

Extract every account and property you can find or reasonably infer from this document.
Be aggressive — include partial data (use null for unknown fields).
Skip anything already in the system above.

Return ONLY valid JSON (no markdown fences, no explanation).
ALL numeric fields must be plain JSON numbers — integer or decimal, no quotes, no $ signs, no commas.
  CORRECT: 450000   WRONG: "450,000" or "$450k" or "450000"

{
  "accounts": [
    { "name": "...", "type": "asset"|"liability", "category": "...", "balance": 450000, "currency": "USD", "notes": "..." }
  ],
  "properties": [
    { "address": "...", "purchase_price": 450000, "purchase_date": "2020-06-15", "market_value": 620000, "mortgage_balance": 310000, "notes": "" }
  ]
}`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = (msg.content[0] as { type: string; text: string }).text;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return { accounts: [], properties: [] };

    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      accounts: { name: string; type: string; category: string; balance: number; currency: string; notes?: string }[];
      properties: { address: string; purchase_price?: number; purchase_date?: string; market_value?: number; mortgage_balance?: number; notes?: string }[];
    };

    const insertedAccounts: string[] = [];
    const insertedProperties: string[] = [];

    for (const acct of parsed.accounts ?? []) {
      if (!acct.name || !acct.type || !acct.category) continue;
      const category = acct.category.toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'other';
      const balance = parseNum(acct.balance) ?? 0;
      const existing = await sql`SELECT id FROM accounts WHERE lower(name) = lower(${acct.name})`;
      if ((existing as unknown[]).length > 0) continue;
      await sql`
        INSERT INTO accounts (name, type, category, balance, currency, notes)
        VALUES (${acct.name}, ${acct.type}, ${category}, ${balance}, ${acct.currency ?? 'USD'}, ${acct.notes ?? null})
      `;
      insertedAccounts.push(acct.name);
    }

    for (const prop of parsed.properties ?? []) {
      if (!prop.address) continue;
      const purchase_price   = parseNum(prop.purchase_price);
      const market_value     = parseNum(prop.market_value);
      const mortgage_balance = parseNum(prop.mortgage_balance);
      const existing = await sql`SELECT id, market_value, mortgage_balance, purchase_price FROM properties WHERE lower(address) = lower(${prop.address})` as { id: string; market_value: number | null; mortgage_balance: number | null; purchase_price: number | null }[];
      if (existing.length > 0) {
        // Update only fields that were null/zero and now have real values
        const row = existing[0];
        const needsUpdate = (!row.market_value && market_value) || (!row.mortgage_balance && mortgage_balance) || (!row.purchase_price && purchase_price);
        if (needsUpdate) {
          await sql`
            UPDATE properties SET
              purchase_price   = COALESCE(${purchase_price},   purchase_price),
              market_value     = COALESCE(${market_value},     market_value),
              mortgage_balance = COALESCE(${mortgage_balance}, mortgage_balance),
              purchase_date    = COALESCE(${prop.purchase_date ?? null}, purchase_date),
              notes            = COALESCE(${prop.notes ?? null}, notes)
            WHERE id = ${row.id}
          `;
          insertedProperties.push(`${prop.address} (updated)`);
        }
        continue;
      }
      await sql`
        INSERT INTO properties (address, purchase_price, purchase_date, market_value, mortgage_balance, notes)
        VALUES (${prop.address}, ${purchase_price}, ${prop.purchase_date ?? null}, ${market_value}, ${mortgage_balance}, ${prop.notes ?? null})
      `;
      insertedProperties.push(prop.address);
    }

    return { accounts: insertedAccounts, properties: insertedProperties };
  } catch {
    return { accounts: [], properties: [] };
  }
}
