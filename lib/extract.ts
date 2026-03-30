import { sql } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// Robustly parse a value Claude might return as "$450,000" / "450k" / 450000 / null
// Normalize address for dedup: lowercase, strip trailing punctuation, collapse whitespace,
// abbreviate common suffixes so "123 Main Street" == "123 main st"
export function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/\b\d{5}(-\d{4})?\b/g, '')       // strip zip codes
    .replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave').replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bdrive\b/g, 'dr').replace(/\broad\b/g, 'rd').replace(/\bcourt\b/g, 'ct')
    .replace(/\blane\b/g, 'ln').replace(/\bplace\b/g, 'pl').replace(/\bcircle\b/g, 'cir')
    .replace(/[,\.#]/g, ' ').replace(/\s+/g, ' ').trim();
}

function addressesMatch(a: string, b: string): boolean {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  return na === nb || na.startsWith(nb + ' ') || nb.startsWith(na + ' ');
}

export function parseNum(v: unknown): number | null {
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

  const prompt = `You are filling in a personal finance dashboard from a document. Extract EVERYTHING financially useful — be aggressive.

## Finance page — Accounts
Each account has:
- name: descriptive string, e.g. "Chase Checking", "Fidelity 401k", "2024 Federal Tax Withheld"
- type: exactly "asset" or "liability"
- category: descriptive snake_case string. Examples:
    Assets: 401k, roth_ira, brokerage, rsu, espp, nso_options, iso_options, real_estate, savings, checking, money_market, cd, treasury, bond, crypto, hsa, 529_plan, life_insurance, annuity, pension, startup_equity, angel_investment, business_interest, commodity, collectibles, employment_income, tax_prepayment, other
    Liabilities: mortgage, heloc, auto_loan, credit_card, student_loan, personal_loan, tax_liability, margin_loan, other
    Invent descriptive snake_case names for anything not listed.
- balance: positive number in USD (no $ signs, no commas)
- currency: "USD" (or actual currency if foreign)
- notes: optional short string for extra context

## Rentals page — Properties
Each property has:
- address: full street address string
- purchase_price: number or null
- purchase_date: "YYYY-MM-DD" string or null
- market_value: current estimated value as number or null
- mortgage_balance: remaining mortgage owed as number or null
- notes: optional string

## Tax & Income Documents (W-2, 1099, pay stubs, K-1, Schedule K, etc.)
These contain VERY useful data — extract all of it:
- W-2 Box 1 wages → { name: "[Year] Wages - [Employer Name]", type: "asset", category: "employment_income", balance: <wages>, notes: "Gross wages per W-2" }
- W-2 Box 2 federal tax withheld → { name: "[Year] Federal Tax Withheld", type: "asset", category: "tax_prepayment", balance: <amount>, notes: "Federal income tax withheld" }
- W-2 Box 12 Code D (traditional 401k) → { name: "[Employer] 401k", type: "asset", category: "401k", balance: <contribution>, notes: "401k contribution per W-2 Box 12D" }
- W-2 Box 12 Code W (HSA) → { name: "HSA", type: "asset", category: "hsa", balance: <amount> }
- W-2 Box 12 Code V (ISO exercise income) → category: "iso_options"
- W-2 Box 17 state tax withheld → { name: "[Year] [State] Tax Withheld", type: "asset", category: "tax_prepayment" }
- 1099-INT: interest income → { name: "[Bank] Interest Income [Year]", type: "asset", category: "interest_income" }
- 1099-DIV: dividends → { name: "[Broker] Dividends [Year]", type: "asset", category: "dividend_income" }
- 1099-R: retirement distributions → category: "retirement_distribution"
- 1099-NEC/MISC: self-employment income → category: "self_employment_income"
- K-1: partnership/S-corp income → category: "business_interest" or "partnership_income"
- Pay stub: gross pay → category: "employment_income"; 401k deduction → category: "401k"

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

Extract every financial item. Be aggressive — include partial data (use null for unknown fields).
Skip anything already in the system above.

Return ONLY valid JSON (no markdown fences, no explanation).
ALL numeric fields must be plain JSON numbers — integer or decimal, no quotes, no $ signs, no commas.
CORRECT: 450000   WRONG: "450,000" or "$450k"

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
    // Find the outermost JSON object (handles any key ordering from Claude)
    const anchors = ['{"accounts"', '{"properties"', '{  "accounts"', '{  "properties"', '{ "accounts"', '{ "properties"']
      .map(a => text.indexOf(a)).filter(i => i !== -1);
    const start = anchors.length > 0 ? Math.min(...anchors) : text.indexOf('{');
    const end = start !== -1 ? text.lastIndexOf('}') : -1;
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
      const allProps = await sql`SELECT id, address, market_value, mortgage_balance, purchase_price FROM properties` as { id: string; address: string; market_value: number | null; mortgage_balance: number | null; purchase_price: number | null }[];
      const existing = allProps.filter(p => addressesMatch(p.address, prop.address));
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
