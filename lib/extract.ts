import { sql } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import { extractionOutputSchema } from '@/lib/validators';
import { JSON_ANCHORS } from '@/lib/constants';

const anthropic = new Anthropic();

/**
 * Find and parse the first JSON object in a string (handles Claude's prose/markdown wrapping).
 */
export function findAndParseJSON(text: string): unknown | null {
  const anchors = JSON_ANCHORS.map(a => text.indexOf(a)).filter(i => i !== -1);
  const start = anchors.length > 0 ? Math.min(...anchors) : text.indexOf('{');
  const end = start !== -1 ? text.lastIndexOf('}') : -1;
  if (start === -1 || end === -1) return null;
  return JSON.parse(text.slice(start, end + 1));
}

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

export function addressesMatch(a: string, b: string): boolean {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  return na === nb || na.startsWith(nb + ' ') || nb.startsWith(na + ' ');
}

// Normalize account name for dedup: lowercase, strip punctuation/corp suffixes, collapse spaces
export function normalizeAccountName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|corp|ltd|co|na|n\.a\.)\b\.?/g, '')
    .replace(/\b(account|accounts|bank|financial|investments?|services?)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function accountNamesMatch(a: string, b: string): boolean {
  const na = normalizeAccountName(a);
  const nb = normalizeAccountName(b);
  return na === nb;
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

export function buildExtractionPrompt(
  docName: string,
  docText: string,
  existingAccountsList: string,
  existingPropertiesList: string,
): string {
  return `You are filling in a personal finance dashboard from a document. Extract EVERYTHING financially useful — be aggressive.

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

## Rental Records — Monthly P&L per property
If the document contains rental income/expense data (1098, 1099-MISC, property management statements, lease agreements, etc.), extract monthly or annual rental records.
Each rental_record has:
- address: the property address this record belongs to (must match a property above)
- year: integer (e.g. 2024)
- month: integer 1-12 (if only annual data, use month 12 for the full year total)
- rent_collected: monthly rent income as number (0 if unknown)
- mortgage_pmt: monthly mortgage payment as number (0 if unknown)
- vacancy_days: integer (0 if unknown)
- expenses: object with any of these keys (all numbers, 0 if not applicable):
    property_tax, insurance, maintenance, repairs, hoa, management, utilities,
    landscaping, pest_control, cleaning, advertising, legal, accounting,
    capital_improvements, supplies, travel, other
- notes: optional string

### What to extract as rental records:
- 1098 Mortgage Interest Statement → mortgage interest = mortgage_pmt (monthly ÷ 12 if annual), property_tax from Box 10
- 1099-MISC Box 1 (Rents) → rent_collected
- Property management statements → rent_collected, management fees, maintenance, repairs
- Insurance declarations → insurance amount
- HOA statements → hoa amount
- Lease agreements → rent_collected amount, property address
- Schedule E data → rental income, expenses by category

## Tax & Income Documents (W-2, 1099, pay stubs, K-1, Schedule K, etc.)
These contain VERY useful data — extract all of it:
- W-2 Box 1 wages → { name: "[Year] Wages - [Employer Name]", type: "asset", category: "employment_income", balance: <wages>, notes: "Gross wages per W-2" }
- W-2 Box 2 federal tax withheld → { name: "[Year] Federal Tax Withheld", type: "asset", category: "tax_prepayment", balance: <amount> }
- W-2 Box 12 Code D (401k) → { name: "[Employer] 401k", type: "asset", category: "401k" }
- W-2 Box 12 Code W (HSA) → { name: "HSA", type: "asset", category: "hsa" }
- 1099-INT → { category: "interest_income" }
- 1099-DIV → { category: "dividend_income" }
- 1099-R → { category: "retirement_distribution" }
- 1099-NEC/MISC → { category: "self_employment_income" } (unless Box 1 Rents → use rental_records)
- K-1 → { category: "business_interest" or "partnership_income" }

## Already in the system (DO NOT duplicate these):
Accounts already added:
${existingAccountsList}

Properties already added:
${existingPropertiesList}

## Document to extract from:
Name: "${docName}"
---
${docText}
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
  ],
  "rental_records": [
    { "address": "123 Main St", "year": 2024, "month": 1, "rent_collected": 2500, "mortgage_pmt": 1800, "vacancy_days": 0, "expenses": { "property_tax": 300, "insurance": 150, "management": 250 }, "notes": "" }
  ]
}`;
}

export async function extractAndInsert(documentId: string): Promise<{ accounts: string[]; properties: string[]; rentalRecords: string[] }> {
  // Sample chunks spread evenly across the whole document
  const allChunks = await sql`
    SELECT content, chunk_index FROM chunks WHERE document_id = ${documentId} ORDER BY chunk_index
  `;
  if ((allChunks as unknown[]).length === 0) return { accounts: [], properties: [], rentalRecords: [] };

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

  const prompt = buildExtractionPrompt(docName, text, existingAccountsList, existingPropertiesList);

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = (msg.content[0] as { type: string; text: string }).text;
    const rawParsed = findAndParseJSON(text);
    if (!rawParsed) return { accounts: [], properties: [], rentalRecords: [] };
    const parsed = extractionOutputSchema.parse(rawParsed);

    const insertedAccounts: string[] = [];
    const insertedProperties: string[] = [];

    const allAccounts = await sql`SELECT id, name FROM accounts` as { id: string; name: string }[];
    for (const acct of parsed.accounts ?? []) {
      if (!acct.name || !acct.type || !acct.category) continue;
      const category = acct.category.toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'other';
      const balance = parseNum(acct.balance) ?? 0;
      // Use normalized name matching to prevent near-duplicate insertions
      const isDuplicate = allAccounts.some(a => accountNamesMatch(a.name, acct.name));
      if (isDuplicate) continue;
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

    // ── Rental records ────────────────────────────────────────────────────
    const insertedRecords: string[] = [];
    for (const rec of parsed.rental_records ?? []) {
      if (!rec.address || !rec.year || !rec.month) continue;
      // Find the property by address
      const allProps = await sql`SELECT id, address FROM properties` as { id: string; address: string }[];
      const matchingProp = allProps.find(p => addressesMatch(p.address, rec.address));
      if (!matchingProp) continue; // skip if no matching property found

      const expensesJson = JSON.stringify(rec.expenses ?? {});
      await sql`
        INSERT INTO rental_records (property_id, year, month, rent_collected, vacancy_days, mortgage_pmt, expenses, notes)
        VALUES (${matchingProp.id}, ${rec.year}, ${rec.month}, ${rec.rent_collected ?? 0}, ${rec.vacancy_days ?? 0}, ${rec.mortgage_pmt ?? 0}, ${expensesJson}::jsonb, ${rec.notes ?? null})
        ON CONFLICT (property_id, year, month) DO UPDATE SET
          rent_collected = EXCLUDED.rent_collected,
          vacancy_days   = EXCLUDED.vacancy_days,
          mortgage_pmt   = EXCLUDED.mortgage_pmt,
          expenses       = EXCLUDED.expenses,
          notes          = EXCLUDED.notes
      `;
      insertedRecords.push(`${rec.address} ${rec.year}/${rec.month}`);
    }

    return { accounts: insertedAccounts, properties: insertedProperties, rentalRecords: insertedRecords };
  } catch {
    return { accounts: [], properties: [], rentalRecords: [] };
  }
}
