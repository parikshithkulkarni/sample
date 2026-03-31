import { sql } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import { extractionOutputSchema } from '@/lib/validators';
import { JSON_ANCHORS } from '@/lib/constants';
import { buildExtractionPrompt } from '@/lib/prompts';

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

// Re-export for backwards compatibility with existing imports
export { buildExtractionPrompt } from '@/lib/prompts';

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

    // Categories that are income/tax records, not real balance-sheet accounts
    const INCOME_CATEGORIES = new Set([
      'employment_income', 'self_employment_income', 'partnership_income',
      'interest_income', 'dividend_income', 'capital_gains', 'rental_income',
      'tax_prepayment', 'retirement_distribution', 'capital_gains_short_term',
      'capital_gains_long_term', 'other_income', 'wages', 'salary', 'dividends',
      'escrow', 'escrow_disbursement',
    ]);
    // Name patterns that indicate income/tax, not a real account
    const INCOME_NAME_PATTERNS = [
      /\bwages?\b/i, /\bsalary\b/i, /\brental\s*income\b/i, /\bdividends?\b/i,
      /\bsubstitute\s*payments?\b/i, /\bescrow\s*(balance|disbursement)\b/i,
      /\bhazard\s*insurance\s*paid\b/i, /\binterest\s*(income|earned)\b/i,
      /\bcapital\s*gains?\b/i, /\b(gross|net)\s*(pay|income|wages)\b/i,
    ];

    const allAccounts = await sql`SELECT id, name, balance FROM accounts` as { id: string; name: string; balance: number }[];
    for (const acct of parsed.accounts ?? []) {
      if (!acct.name || !acct.type || !acct.category) continue;
      const category = acct.category.toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'other';
      // Skip income/tax items — they should be in tax_data, not accounts
      if (INCOME_CATEGORIES.has(category) || INCOME_NAME_PATTERNS.some(p => p.test(acct.name))) continue;
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

    // Collect all tax data by year/country first, then write once (prevents double-counting on re-extract)
    const taxBatch = new Map<string, { country: string; taxYear: number; fields: Record<string, number>; sourceFields: Record<string, { label: string; type: string }> }>();
    for (const td of parsed.tax_data ?? []) {
      if (!td.field || !td.tax_year || !td.amount) continue;
      const isUS = td.field.startsWith('us.');
      const isIndia = td.field.startsWith('india.');
      if (!isUS && !isIndia) continue;

      const country = isUS ? 'US' : 'India';
      const taxPath = td.field.slice(isUS ? 3 : 6); // strip "us." or "india."
      const batchKey = `${country}:${td.tax_year}`;

      let batch = taxBatch.get(batchKey);
      if (!batch) {
        batch = { country, taxYear: td.tax_year, fields: {}, sourceFields: {} };
        taxBatch.set(batchKey, batch);
      }
      // Round to 2 decimal places to avoid floating point issues
      const amount = Math.round(td.amount * 100) / 100;
      batch.fields[taxPath] = (batch.fields[taxPath] ?? 0) + amount;
      batch.sourceFields[taxPath] = { label: docName, type: 'document' };
      insertedTaxData.push(`${country} ${td.tax_year}: ${taxPath} = ${amount}`);
    }

    // Write each year/country batch using SET semantics (not additive to DB values)
    for (const [, batch] of taxBatch) {
      const defaults = batch.country === 'US' ? US_DEFAULT : INDIA_DEFAULT;
      const existing = await sql`SELECT id, data, sources FROM tax_returns WHERE tax_year = ${batch.taxYear} AND country = ${batch.country}` as { id: string; data: Record<string, unknown>; sources: Record<string, unknown> }[];
      const data = existing.length > 0
        ? { ...defaults, ...existing[0].data } as Record<string, unknown>
        : { ...defaults } as Record<string, unknown>;
      const existingSources = (existing[0]?.sources ?? {}) as Record<string, unknown>;

      for (const [taxPath, val] of Object.entries(batch.fields)) {
        const keys = taxPath.split('.');
        let cur = data;
        for (let i = 0; i < keys.length - 1; i++) {
          if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
          cur = cur[keys[i]] as Record<string, unknown>;
        }
        cur[keys[keys.length - 1]] = val; // SET, not add — prevents double-counting on re-extract
      }

      const mergedSources = { ...existingSources, ...batch.sourceFields };
      const dataJson = JSON.stringify(data);
      const sourcesJson = JSON.stringify(mergedSources);
      if (existing.length > 0) {
        await sql`UPDATE tax_returns SET data = ${dataJson}::jsonb, sources = ${sourcesJson}::jsonb, updated_at = NOW() WHERE id = ${existing[0].id}`;
      } else {
        await sql`INSERT INTO tax_returns (tax_year, country, data, sources) VALUES (${batch.taxYear}, ${batch.country}, ${dataJson}::jsonb, ${sourcesJson}::jsonb)`;
      }
    }

    return { accounts: insertedAccounts, properties: insertedProperties, rentalRecords: insertedRecords, taxData: insertedTaxData };
  } catch (err) {
    console.error('[extractAndInsert] Extraction failed for document', documentId, err);
    return { accounts: [], properties: [], rentalRecords: [], taxData: [] };
  }
}
