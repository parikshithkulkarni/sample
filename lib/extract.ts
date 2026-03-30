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
    .replace(/\b(apt|suite|ste|unit|#)\s*\w+/gi, '') // strip unit numbers
    .replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave').replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bdrive\b/g, 'dr').replace(/\broad\b/g, 'rd').replace(/\bcourt\b/g, 'ct')
    .replace(/\blane\b/g, 'ln').replace(/\bplace\b/g, 'pl').replace(/\bcircle\b/g, 'cir')
    .replace(/\bterrace\b/g, 'trl').replace(/\bparkway\b/g, 'pkwy').replace(/\bhighway\b/g, 'hwy')
    .replace(/\b(tx|ca|ny|fl|il|ga|oh|va|wa|nc|nj|pa|az|co|tn|md|mn|wi|or|sc|al|la|ky|ok|ct|ia|ms|ar|ks|nv|nm|ne|wv|id|hi|me|nh|ri|mt|de|sd|nd|ak|vt|wy|dc)\b/gi, '') // strip state abbreviations
    .replace(/[,\.#]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function addressesMatch(a: string, b: string): boolean {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Prefix match (one has city/state, the other doesn't)
  if (na.startsWith(nb + ' ') || nb.startsWith(na + ' ')) return true;
  // Substring match (one is contained in the other)
  if (na.length >= 8 && nb.length >= 8) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }
  return false;
}

// Normalize account name for dedup: lowercase, strip punctuation/corp suffixes, account numbers, years
export function normalizeAccountName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b20\d{2}\b/g, '')                    // strip years
    .replace(/\b\d{6,}\b/g, '')                      // strip account numbers (6+ digits)
    .replace(/\(account[^)]*\)/gi, '')               // strip "(Account ...)" parentheticals
    .replace(/\baccount\s*#?\s*\w+/gi, '')           // strip "Account #XYZ"
    .replace(/\b(inc|llc|corp|ltd|co|na|n\.a\.)\b\.?/g, '')
    .replace(/\b(account|accounts|bank|financial|investments?|services?|updated|new|current)\b/g, '')
    .replace(/\s*[-–—]\s*(updated|new|old|current|ytd|year.to.date)$/i, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function accountNamesMatch(a: string, b: string): boolean {
  const na = normalizeAccountName(a);
  const nb = normalizeAccountName(b);
  if (!na || !nb) return false;
  // Exact match after normalization
  if (na === nb) return true;
  // One contains the other (handles "Fidelity 401k" vs "Fidelity 401k Contribution 2024")
  if (na.length >= 4 && nb.length >= 4) {
    if (na.includes(nb) || nb.includes(na)) return true;
  }
  return false;
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
  return `You are filling in a personal finance dashboard from a document. Extract financial data carefully.

## Finance page — Accounts
Only create accounts for REAL financial accounts and holdings — things that hold a balance over time.

Each account has:
- name: descriptive string, e.g. "Chase Checking", "Fidelity 401k", "Apple RSU"
- type: exactly "asset" or "liability"
- category: MUST be one of the following:
    Assets: checking, savings, money_market, cd, treasury, bond, brokerage, rsu, espp, iso_options, nso_options, startup_equity, angel_investment, crypto, commodity, collectibles, 401k, roth_ira, ira, pension, annuity, hsa, 529_plan, life_insurance, real_estate, other
    Liabilities: mortgage, heloc, auto_loan, credit_card, student_loan, personal_loan, tax_liability, margin_loan, other
- balance: current account balance as positive number in USD
- currency: "USD" (or actual currency if foreign)
- notes: optional short string for extra context

DO NOT create accounts for:
- Income records (W-2 wages, 1099 income, dividends received, interest earned, capital gains)
- Tax withholdings or prepayments
- One-time transactions or events
- Historical income that isn't a current balance
These belong on the Tax Returns page, not Finance.

ONLY create an account if it represents a REAL FINANCIAL ACCOUNT with a CURRENT BALANCE:
- ✅ "Fidelity 401k" balance $450,000 — a retirement account
- ✅ "Chase Checking" balance $12,000 — a bank account
- ✅ "Robinhood Brokerage" balance $25,000 — an investment account
- ✅ "PHH Mortgage - 1014 Terrace" balance $213,000 — a real debt
- ❌ "2024 Wages - Google" — income, not an account
- ❌ "Federal Tax Withheld" — tax record, not an account
- ❌ "Capital Gains 2024" — a gain/loss, not an account
- ❌ "Interest Income 2024" — income, not an account
- ❌ "Robinhood Short-Term Sale Proceeds" — a transaction, not an account
- ❌ "Mortgage Interest Paid YTD" — an expense, not an account
- ❌ "Wash Sale Loss Disallowed" — a tax adjustment, not an account
- ❌ "Health Insurance Expense" — an expense, not an account
- ❌ "Subscription Fees 2025" — an expense, not an account
- ❌ "Employer Health Coverage" — a benefit, not an account
- ❌ "Realized Gains - Long Term" — a gain, not an account
- ❌ "NVDA Short-Term Sales 2025" — a trade, not an account
Put ALL income, gains, losses, expenses, withholdings into tax_data instead.

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

## Tax & Income Documents
For W-2, 1099, pay stubs, K-1 etc., extract ONLY actual account balances:
- W-2 Box 12 Code D (401k) → create account: { name: "[Employer] 401k", type: "asset", category: "401k" }
- W-2 Box 12 Code W (HSA) → create account: { name: "HSA", type: "asset", category: "hsa" }
DO NOT create accounts for income amounts (wages, interest, dividends, capital gains) or tax withholdings.
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

## Tax Data (W-2, 1099, K-1, pay stubs, etc.)
If the document contains income, tax, or withholding data, extract it into the tax_data section.
Do NOT create "accounts" for income — put it here instead.
Each tax_data entry has:
- tax_year: integer (e.g. 2024)
- field: dotted path to the tax return field (see mapping below)
- amount: number
- notes: optional string for context

### US tax field mappings:
Income:
- W-2 Box 1 wages → field: "us.income.wages"
- 1099-INT interest → field: "us.income.interest"
- 1099-DIV ordinary dividends → field: "us.income.ordinary_dividends"
- 1099-DIV qualified dividends → field: "us.income.qualified_dividends"
- 1099-B short-term capital gains → field: "us.income.st_capital_gains"
- 1099-B long-term capital gains → field: "us.income.lt_capital_gains"
- 1099-R retirement distributions → field: "us.income.ira_distributions"
- 1099-R pension/annuity → field: "us.income.pension_annuity"
- 1099-NEC/MISC self-employment → field: "us.income.business_income"
- K-1 business/partnership income → field: "us.income.business_income"
- Schedule E rental income → field: "us.income.rental_income"
- Social Security benefits → field: "us.income.social_security"
- Any other income → field: "us.income.other_income"

Adjustments:
- W-2 Box 12 Code D (401k contribution) → field: "us.adjustments.k401_contributions"
- W-2 Box 12 Code W (HSA contribution) → field: "us.adjustments.hsa_deduction"
- Traditional IRA deduction → field: "us.adjustments.ira_deduction"
- Student loan interest (1098-E) → field: "us.adjustments.student_loan_interest"
- Self-employment tax (half) → field: "us.adjustments.self_employment_tax"
- Educator expenses → field: "us.adjustments.educator_expenses"

Deductions:
- 1098 mortgage interest paid → field: "us.deductions.mortgage_interest"
- Property tax paid (1098 Box 10) → field: "us.deductions.salt"
- State/local income tax paid → field: "us.deductions.salt" (additive with property tax)
- Charitable contributions (cash/noncash) → field: "us.deductions.charitable"
- Medical/dental expenses → field: "us.deductions.medical_expenses"

Credits:
- Foreign tax paid (1099-DIV Box 7, 1116) → field: "us.credits.foreign_tax"
- Education credits (1098-T) → field: "us.credits.education"

Taxes:
- Self-employment tax → field: "us.other_taxes.se_tax"
- Net investment income tax → field: "us.other_taxes.niit"

Payments:
- W-2 Box 2 federal withheld → field: "us.payments.federal_withheld"
- W-2 Box 17 state withheld → field: "us.payments.state_withheld"
- 1099 federal withheld → field: "us.payments.federal_withheld" (additive)
- Estimated tax payments (1040-ES) → field: "us.payments.estimated_payments"

ISO/AMT:
- ISO exercise: shares → field: "us.iso_amt.shares_exercised"
- ISO exercise: FMV at exercise → field: "us.iso_amt.fmv_at_exercise"
- ISO exercise: strike price → field: "us.iso_amt.exercise_price"

FBAR:
- If foreign accounts mentioned with balance > $10k → include in notes

### India tax field mappings:
- Salary income → field: "india.income.salary"
- TDS on salary (Form 16) → field: "india.taxes_paid.tds_salary"
- TDS on other income → field: "india.taxes_paid.tds_other"
- Interest income (FD, savings) → field: "india.income.interest_income"
- House property rent → field: "india.income.house_property_rent"
- Home loan interest → field: "india.income.home_loan_interest"
- STCG equity → field: "india.income.st_equity_gains"
- LTCG equity → field: "india.income.lt_equity_gains"
- Business/profession income → field: "india.income.business_income"
- Foreign income → field: "india.income.foreign_income"
- Advance tax paid → field: "india.taxes_paid.advance_tax"
- Section 80C (PPF/ELSS/LIC/etc.) → field: "india.deductions.sec_80c"
- Section 80D health insurance → field: "india.deductions.sec_80d"
- NPS 80CCD(1B) → field: "india.deductions.sec_80ccd_1b"
- Employer NPS 80CCD(2) → field: "india.deductions.sec_80ccd_2"

Extract EVERYTHING. Be aggressive — include partial data (use null for unknown fields).
Skip accounts/properties already in the system above.

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
  ],
  "tax_data": [
    { "tax_year": 2024, "field": "us.income.wages", "amount": 180000, "notes": "W-2 Box 1 from Google" },
    { "tax_year": 2024, "field": "us.payments.federal_withheld", "amount": 35000, "notes": "W-2 Box 2" }
  ]
}`;
}

export async function extractAndInsert(documentId: string): Promise<{ accounts: string[]; properties: string[]; rentalRecords: string[]; taxData: string[] }> {
  // Sample chunks spread evenly across the whole document
  const allChunks = await sql`
    SELECT content, chunk_index FROM chunks WHERE document_id = ${documentId} ORDER BY chunk_index
  `;
  if ((allChunks as unknown[]).length === 0) return { accounts: [], properties: [], rentalRecords: [], taxData: [] };

  const [docRow] = await sql`SELECT name FROM documents WHERE id = ${documentId}`;
  const docName = (docRow as { name: string }).name;

  // Use the full document text. Claude sonnet supports 200K tokens (~800K chars).
  // The prompt itself is ~4K chars, and we need room for the response (4K tokens).
  // Safe limit: ~600K chars of document text.
  const MAX_DOC_CHARS = 600_000;
  const rows = allChunks as { content: string; chunk_index: number }[];
  let text = rows.map(r => r.content).join('\n\n');
  if (text.length > MAX_DOC_CHARS) {
    // Truncate but keep beginning and end (financial summaries are often at the end)
    const half = Math.floor(MAX_DOC_CHARS / 2);
    text = text.slice(0, half) + '\n\n[... middle section omitted for length ...]\n\n' + text.slice(-half);
  }

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
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = (msg.content[0] as { type: string; text: string }).text;
    const rawParsed = findAndParseJSON(text);
    if (!rawParsed) return { accounts: [], properties: [], rentalRecords: [], taxData: [] };
    const parsed = extractionOutputSchema.parse(rawParsed);

    const insertedAccounts: string[] = [];
    const insertedProperties: string[] = [];

    const allAccounts = await sql`SELECT id, name, balance FROM accounts` as { id: string; name: string; balance: number }[];
    for (const acct of parsed.accounts ?? []) {
      if (!acct.name || !acct.type || !acct.category) continue;
      const category = acct.category.toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'other';
      const balance = parseNum(acct.balance) ?? 0;
      // Upsert: update if match found, insert if new
      const match = allAccounts.find(a => accountNamesMatch(a.name, acct.name));
      if (match) {
        // Only update if new balance is higher (more recent/accurate)
        if (balance > Number(match.balance)) {
          await sql`UPDATE accounts SET balance = ${balance}, category = ${category}, notes = ${acct.notes ?? null}, updated_at = NOW() WHERE id = ${match.id}`;
          insertedAccounts.push(`${acct.name} (updated)`);
        }
        continue;
      }
      await sql`
        INSERT INTO accounts (name, type, category, balance, currency, notes)
        VALUES (${acct.name}, ${acct.type}, ${category}, ${balance}, ${acct.currency ?? 'USD'}, ${acct.notes ?? null})
      `;
      allAccounts.push({ id: 'new', name: acct.name, balance }); // prevent dupes within batch
      insertedAccounts.push(acct.name);
    }

    const allProps = await sql`SELECT id, address, market_value, mortgage_balance, purchase_price FROM properties` as { id: string; address: string; market_value: number | null; mortgage_balance: number | null; purchase_price: number | null }[];
    for (const prop of parsed.properties ?? []) {
      if (!prop.address) continue;
      const purchase_price   = parseNum(prop.purchase_price);
      const market_value     = parseNum(prop.market_value);
      const mortgage_balance = parseNum(prop.mortgage_balance);
      const match = allProps.find(p => addressesMatch(p.address, prop.address));
      if (match) {
        // Always upsert — fill nulls and update with newer values
        await sql`
          UPDATE properties SET
            purchase_price   = COALESCE(${purchase_price},   purchase_price),
            market_value     = COALESCE(${market_value},     market_value),
            mortgage_balance = COALESCE(${mortgage_balance}, mortgage_balance),
            purchase_date    = COALESCE(${prop.purchase_date ?? null}, purchase_date),
            notes            = COALESCE(${prop.notes ?? null}, notes)
          WHERE id = ${match.id}
        `;
        insertedProperties.push(`${prop.address} (updated)`);
        continue;
      }
      await sql`
        INSERT INTO properties (address, purchase_price, purchase_date, market_value, mortgage_balance, notes)
        VALUES (${prop.address}, ${purchase_price}, ${prop.purchase_date ?? null}, ${market_value}, ${mortgage_balance}, ${prop.notes ?? null})
      `;
      allProps.push({ id: 'new', address: prop.address, market_value, mortgage_balance, purchase_price }); // prevent dupes within batch
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

    // ── Tax data (income, withholdings, etc.) → directly to tax_returns ──
    const insertedTaxData: string[] = [];
    const { US_DEFAULT, INDIA_DEFAULT } = await import('@/lib/tax-data');
    for (const td of parsed.tax_data ?? []) {
      if (!td.field || !td.tax_year || !td.amount) continue;
      const isUS = td.field.startsWith('us.');
      const isIndia = td.field.startsWith('india.');
      if (!isUS && !isIndia) continue;

      const country = isUS ? 'US' : 'India';
      const taxPath = td.field.slice(isUS ? 3 : 6); // strip "us." or "india."
      const defaults = country === 'US' ? US_DEFAULT : INDIA_DEFAULT;

      // Load or create tax return
      const existing = await sql`SELECT id, data FROM tax_returns WHERE tax_year = ${td.tax_year} AND country = ${country}` as { id: string; data: Record<string, unknown> }[];
      const data = existing.length > 0
        ? { ...defaults, ...existing[0].data } as Record<string, unknown>
        : { ...defaults } as Record<string, unknown>;

      // Set the field value (additive for income fields)
      const keys = taxPath.split('.');
      let cur = data;
      for (let i = 0; i < keys.length - 1; i++) {
        if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
        cur = cur[keys[i]] as Record<string, unknown>;
      }
      const lastKey = keys[keys.length - 1];
      cur[lastKey] = (Number(cur[lastKey]) || 0) + td.amount;

      const dataJson = JSON.stringify(data);
      if (existing.length > 0) {
        await sql`UPDATE tax_returns SET data = ${dataJson}::jsonb, updated_at = NOW() WHERE id = ${existing[0].id}`;
      } else {
        await sql`INSERT INTO tax_returns (tax_year, country, data) VALUES (${td.tax_year}, ${country}, ${dataJson}::jsonb)`;
      }
      insertedTaxData.push(`${country} ${td.tax_year}: ${taxPath} = ${td.amount}`);
    }

    return { accounts: insertedAccounts, properties: insertedProperties, rentalRecords: insertedRecords, taxData: insertedTaxData };
  } catch {
    return { accounts: [], properties: [], rentalRecords: [], taxData: [] };
  }
}
