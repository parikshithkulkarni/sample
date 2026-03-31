// Server-only: DB sync logic. Pure data/types/calcs are in lib/tax-data.ts
import { sql } from '@/lib/db';
import { US_DEFAULT, INDIA_DEFAULT } from '@/lib/tax-data';
import type { TaxSources, FieldSource } from '@/lib/tax-data';

// Re-export everything from tax-data for backwards compatibility
export * from '@/lib/tax-data';

// ── Auto-sync from accounts and rental records ─────────────────────────────────

function extractYear(name: string): number | null {
  const m = name.match(/\b(20\d{2})\b/);
  return m ? parseInt(m[1]) : null;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}

function addPath(obj: Record<string, unknown>, path: string, value: number) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  cur[last] = Math.round(((Number(cur[last]) || 0) + value) * 100) / 100;
}

/** Track which account/source populated each tax field */
function addSource(sources: TaxSources, path: string, acctName: string, type: FieldSource['type'] = 'account') {
  sources[path] = { label: acctName, type };
}

export async function syncTaxReturnsFromAccounts(forceYear?: number): Promise<void> {
  const accounts = await sql`SELECT name, type, category, balance, notes FROM accounts` as { name: string; type: string; category: string; balance: string; notes: string | null }[];

  const yearsSet = new Set<number>();
  if (forceYear) yearsSet.add(forceYear);
  for (const a of accounts) {
    const y = extractYear(a.name);
    if (y && y >= 2018 && y <= new Date().getFullYear() + 1) yearsSet.add(y);
  }
  if (yearsSet.size === 0) yearsSet.add(new Date().getFullYear() - 1);

  for (const taxYear of yearsSet) {
    const usUpdates: Record<string, number> = {};
    const indiaUpdates: Record<string, number> = {};
    const usSources: TaxSources = {};
    const indiaSources: TaxSources = {};

    for (const acct of accounts) {
      const y = extractYear(acct.name);
      if (y && y !== taxYear) continue;
      const bal = Math.abs(Number(acct.balance));
      if (bal === 0) continue;
      const notes = (acct.notes ?? '').toLowerCase();
      const name = acct.name.toLowerCase();

      switch (acct.category) {
        case 'employment_income':
          usUpdates['income.wages'] = (usUpdates['income.wages'] ?? 0) + bal;
          addSource(usSources, 'income.wages', acct.name);
          indiaUpdates['income.salary'] = (indiaUpdates['income.salary'] ?? 0) + bal;
          addSource(indiaSources, 'income.salary', acct.name);
          break;

        case 'tax_prepayment':
          if (name.includes('federal') || notes.includes('federal')) {
            usUpdates['payments.federal_withheld'] = (usUpdates['payments.federal_withheld'] ?? 0) + bal;
            addSource(usSources, 'payments.federal_withheld', acct.name);
          } else if (name.includes('state') || notes.includes('state')) {
            usUpdates['payments.state_withheld'] = (usUpdates['payments.state_withheld'] ?? 0) + bal;
            addSource(usSources, 'payments.state_withheld', acct.name);
          } else {
            usUpdates['payments.federal_withheld'] = (usUpdates['payments.federal_withheld'] ?? 0) + bal;
            addSource(usSources, 'payments.federal_withheld', acct.name);
          }
          if (name.includes('tds') || notes.includes('tds') || notes.includes('india')) {
            indiaUpdates['taxes_paid.tds_salary'] = (indiaUpdates['taxes_paid.tds_salary'] ?? 0) + bal;
            addSource(indiaSources, 'taxes_paid.tds_salary', acct.name);
          }
          break;

        case '401k':
          if (notes.includes('contribution') || notes.includes('box 12') || notes.includes('w-2')) {
            usUpdates['adjustments.k401_contributions'] = (usUpdates['adjustments.k401_contributions'] ?? 0) + bal;
            addSource(usSources, 'adjustments.k401_contributions', acct.name);
          }
          break;

        case 'hsa':
          if (notes.includes('contribution') || notes.includes('w-2') || notes.includes('box 12')) {
            usUpdates['adjustments.hsa_deduction'] = (usUpdates['adjustments.hsa_deduction'] ?? 0) + bal;
            addSource(usSources, 'adjustments.hsa_deduction', acct.name);
          }
          break;

        case 'interest_income':
          usUpdates['income.interest'] = (usUpdates['income.interest'] ?? 0) + bal;
          addSource(usSources, 'income.interest', acct.name);
          indiaUpdates['income.interest_income'] = (indiaUpdates['income.interest_income'] ?? 0) + bal;
          addSource(indiaSources, 'income.interest_income', acct.name);
          break;

        case 'dividend_income':
          usUpdates['income.ordinary_dividends'] = (usUpdates['income.ordinary_dividends'] ?? 0) + bal;
          addSource(usSources, 'income.ordinary_dividends', acct.name);
          if (notes.includes('qualified')) {
            usUpdates['income.qualified_dividends'] = (usUpdates['income.qualified_dividends'] ?? 0) + bal;
            addSource(usSources, 'income.qualified_dividends', acct.name);
          }
          break;

        case 'retirement_distribution':
          usUpdates['income.ira_distributions'] = (usUpdates['income.ira_distributions'] ?? 0) + bal;
          addSource(usSources, 'income.ira_distributions', acct.name);
          break;

        case 'self_employment_income':
          usUpdates['income.business_income'] = (usUpdates['income.business_income'] ?? 0) + bal;
          addSource(usSources, 'income.business_income', acct.name);
          break;

        case 'iso_options':
          if (notes.includes('exercise') || notes.includes('box 12')) {
            usUpdates['iso_amt.amt_adjustment'] = (usUpdates['iso_amt.amt_adjustment'] ?? 0) + bal;
            addSource(usSources, 'iso_amt.amt_adjustment', acct.name);
          }
          break;

        case 'partnership_income':
        case 'business_interest':
          usUpdates['income.business_income'] = (usUpdates['income.business_income'] ?? 0) + bal;
          addSource(usSources, 'income.business_income', acct.name);
          indiaUpdates['income.business_income'] = (indiaUpdates['income.business_income'] ?? 0) + bal;
          addSource(indiaSources, 'income.business_income', acct.name);
          break;

        case 'student_loan':
          // Student loan interest deduction (from 1098-E)
          if (notes.includes('interest') || notes.includes('1098')) {
            usUpdates['adjustments.student_loan_interest'] = (usUpdates['adjustments.student_loan_interest'] ?? 0) + bal;
            addSource(usSources, 'adjustments.student_loan_interest', acct.name);
          }
          break;
      }
    }

    // ── Rental records: income, mortgage, property tax, insurance ────────────
    const rentalRows = await sql`
      SELECT
        COALESCE(SUM(rent_collected), 0)::numeric AS total_rent,
        COALESCE(SUM(mortgage_pmt), 0)::numeric AS total_mortgage,
        COALESCE(SUM((SELECT COALESCE(SUM(v::numeric), 0) FROM jsonb_each_text(expenses) WHERE key = 'property_tax')), 0)::numeric AS total_property_tax,
        COALESCE(SUM((SELECT COALESCE(SUM(v::numeric), 0) FROM jsonb_each_text(expenses) WHERE key = 'insurance')), 0)::numeric AS total_insurance
      FROM rental_records WHERE year = ${taxYear}
    ` as { total_rent: string; total_mortgage: string; total_property_tax: string; total_insurance: string }[];

    const rentalRent = Number(rentalRows[0]?.total_rent ?? 0);
    const rentalMortgage = Number(rentalRows[0]?.total_mortgage ?? 0);
    const rentalPropertyTax = Number(rentalRows[0]?.total_property_tax ?? 0);

    if (rentalRent > 0) {
      usUpdates['income.rental_income'] = rentalRent;
      addSource(usSources, 'income.rental_income', `${taxYear} rental records`, 'rental');
      indiaUpdates['income.house_property_rent'] = rentalRent;
      addSource(indiaSources, 'income.house_property_rent', `${taxYear} rental records`, 'rental');
    }
    if (rentalMortgage > 0) {
      // Mortgage interest is a deduction (for rental properties, it's on Schedule E)
      usUpdates['deductions.mortgage_interest'] = (usUpdates['deductions.mortgage_interest'] ?? 0) + rentalMortgage;
      addSource(usSources, 'deductions.mortgage_interest', `${taxYear} rental mortgage`, 'rental');
      indiaUpdates['income.home_loan_interest'] = (indiaUpdates['income.home_loan_interest'] ?? 0) + rentalMortgage;
      addSource(indiaSources, 'income.home_loan_interest', `${taxYear} rental mortgage`, 'rental');
    }
    if (rentalPropertyTax > 0) {
      usUpdates['deductions.salt'] = (usUpdates['deductions.salt'] ?? 0) + rentalPropertyTax;
      addSource(usSources, 'deductions.salt', `${taxYear} property tax`, 'rental');
    }

    await upsertTaxReturn(taxYear, 'US', usUpdates, usSources);
    await upsertTaxReturn(taxYear, 'India', indiaUpdates, indiaSources);
  }
}

async function upsertTaxReturn(taxYear: number, country: 'US' | 'India', updates: Record<string, number>, sources: TaxSources) {
  if (Object.keys(updates).length === 0) return;

  const rows = await sql`SELECT id, data, sources FROM tax_returns WHERE tax_year = ${taxYear} AND country = ${country}` as { id: string; data: Record<string, unknown>; sources: TaxSources }[];
  const existing = rows[0]?.data ?? {};
  const existingSources: TaxSources = (rows[0]?.sources as TaxSources) ?? {};
  const base: Record<string, unknown> = JSON.parse(JSON.stringify(country === 'US' ? US_DEFAULT : INDIA_DEFAULT));
  deepMerge(base, existing);

  for (const [path, val] of Object.entries(updates)) {
    addPath(base, path, 0);
    setPath(base, path, val);
  }

  // Merge sources: new sources overwrite existing for the same paths
  const mergedSources = { ...existingSources, ...sources };

  await sql`
    INSERT INTO tax_returns (tax_year, country, data, sources)
    VALUES (${taxYear}, ${country}, ${JSON.stringify(base)}, ${JSON.stringify(mergedSources)})
    ON CONFLICT (tax_year, country)
    DO UPDATE SET data = ${JSON.stringify(base)}, sources = ${JSON.stringify(mergedSources)}, updated_at = now()
  `;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key]) && typeof target[key] === 'object' && target[key] !== null) {
      deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }
}
