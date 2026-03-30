import { sql } from '@/lib/db';

// ── Default data shapes ────────────────────────────────────────────────────────

export const US_DEFAULT: UsData = {
  filing_status: 'single',
  income: { wages: 0, interest: 0, ordinary_dividends: 0, qualified_dividends: 0, st_capital_gains: 0, lt_capital_gains: 0, ira_distributions: 0, pension_annuity: 0, rental_income: 0, business_income: 0, social_security: 0, other_income: 0 },
  adjustments: { k401_contributions: 0, ira_deduction: 0, hsa_deduction: 0, student_loan_interest: 0, self_employment_tax: 0, educator_expenses: 0, other_adjustments: 0 },
  deductions: { use_standard: true, mortgage_interest: 0, salt: 0, charitable: 0, medical_expenses: 0, other_itemized: 0 },
  credits: { child_tax: 0, education: 0, foreign_tax: 0, child_care: 0, retirement_savings: 0, other_credits: 0 },
  other_taxes: { se_tax: 0, niit: 0, amt: 0, other: 0 },
  payments: { federal_withheld: 0, state_withheld: 0, estimated_payments: 0, applied_from_prior: 0 },
  iso_amt: { shares_exercised: 0, fmv_at_exercise: 0, exercise_price: 0, amt_adjustment: 0 },
  fbar_required: false,
};

export const INDIA_DEFAULT: IndiaData = {
  residential_status: 'ROR',
  regime: 'new',
  income: { salary: 0, employer: '', hra_received: 0, hra_exempt: 0, standard_deduction: 50000, professional_tax: 0, house_property_rent: 0, home_loan_interest: 0, st_equity_gains: 0, lt_equity_gains: 0, lt_equity_gains_above_1l: 0, other_capital_gains: 0, business_income: 0, interest_income: 0, other_income: 0, foreign_income: 0 },
  deductions: { sec_80c: 0, sec_80c_ppf: 0, sec_80c_elss: 0, sec_80c_lic: 0, sec_80c_principal: 0, sec_80c_other: 0, sec_80d: 0, sec_80e: 0, sec_80g: 0, sec_80tta: 0, sec_80ccd_1b: 0, sec_80ccd_2: 0, other_deductions: 0 },
  taxes_paid: { tds_salary: 0, tds_other: 0, advance_tax: 0, self_assessment: 0 },
  dtaa: { applicable: false, country: '', foreign_income: 0, foreign_tax_paid: 0 },
};

// ── Type definitions ───────────────────────────────────────────────────────────

export type FilingStatus = 'single' | 'married_joint' | 'married_separate' | 'head_of_household';
export type ResidentialStatus = 'ROR' | 'RNOR' | 'NR';
export type TaxRegime = 'old' | 'new';

export interface UsData {
  filing_status: FilingStatus;
  income: { wages: number; interest: number; ordinary_dividends: number; qualified_dividends: number; st_capital_gains: number; lt_capital_gains: number; ira_distributions: number; pension_annuity: number; rental_income: number; business_income: number; social_security: number; other_income: number };
  adjustments: { k401_contributions: number; ira_deduction: number; hsa_deduction: number; student_loan_interest: number; self_employment_tax: number; educator_expenses: number; other_adjustments: number };
  deductions: { use_standard: boolean; mortgage_interest: number; salt: number; charitable: number; medical_expenses: number; other_itemized: number };
  credits: { child_tax: number; education: number; foreign_tax: number; child_care: number; retirement_savings: number; other_credits: number };
  other_taxes: { se_tax: number; niit: number; amt: number; other: number };
  payments: { federal_withheld: number; state_withheld: number; estimated_payments: number; applied_from_prior: number };
  iso_amt: { shares_exercised: number; fmv_at_exercise: number; exercise_price: number; amt_adjustment: number };
  fbar_required: boolean;
}

export interface IndiaData {
  residential_status: ResidentialStatus;
  regime: TaxRegime;
  income: { salary: number; employer: string; hra_received: number; hra_exempt: number; standard_deduction: number; professional_tax: number; house_property_rent: number; home_loan_interest: number; st_equity_gains: number; lt_equity_gains: number; lt_equity_gains_above_1l: number; other_capital_gains: number; business_income: number; interest_income: number; other_income: number; foreign_income: number };
  deductions: { sec_80c: number; sec_80c_ppf: number; sec_80c_elss: number; sec_80c_lic: number; sec_80c_principal: number; sec_80c_other: number; sec_80d: number; sec_80e: number; sec_80g: number; sec_80tta: number; sec_80ccd_1b: number; sec_80ccd_2: number; other_deductions: number };
  taxes_paid: { tds_salary: number; tds_other: number; advance_tax: number; self_assessment: number };
  dtaa: { applicable: boolean; country: string; foreign_income: number; foreign_tax_paid: number };
}

// ── Year-specific US tax rules ─────────────────────────────────────────────────
// Brackets: [upper_limit, rate]. Source: IRS Rev. Proc. for each year.

type BracketSet = Record<FilingStatus, [number, number][]>;

const US_BRACKETS_BY_YEAR: Record<number, BracketSet> = {
  2024: {
    single:           [[11600,0.10],[47150,0.12],[100525,0.22],[191950,0.24],[243725,0.32],[609350,0.35],[Infinity,0.37]],
    married_joint:    [[23200,0.10],[94300,0.12],[201050,0.22],[383900,0.24],[487450,0.32],[731200,0.35],[Infinity,0.37]],
    married_separate: [[11600,0.10],[47150,0.12],[100525,0.22],[191950,0.24],[243725,0.32],[365600,0.35],[Infinity,0.37]],
    head_of_household:[[16550,0.10],[63100,0.12],[100500,0.22],[191950,0.24],[243700,0.32],[609350,0.35],[Infinity,0.37]],
  },
  2025: {
    single:           [[11925,0.10],[48475,0.12],[103350,0.22],[197300,0.24],[250525,0.32],[626350,0.35],[Infinity,0.37]],
    married_joint:    [[23850,0.10],[96950,0.12],[206700,0.22],[394600,0.24],[501050,0.32],[751600,0.35],[Infinity,0.37]],
    married_separate: [[11925,0.10],[48475,0.12],[103350,0.22],[197300,0.24],[250525,0.32],[375800,0.35],[Infinity,0.37]],
    head_of_household:[[17000,0.10],[64850,0.12],[103350,0.22],[197300,0.24],[250500,0.32],[626350,0.35],[Infinity,0.37]],
  },
  2023: {
    single:           [[11000,0.10],[44725,0.12],[95375,0.22],[182050,0.24],[231250,0.32],[578125,0.35],[Infinity,0.37]],
    married_joint:    [[22000,0.10],[89450,0.12],[190750,0.22],[364200,0.24],[462500,0.32],[693750,0.35],[Infinity,0.37]],
    married_separate: [[11000,0.10],[44725,0.12],[95375,0.22],[182050,0.24],[231250,0.32],[346875,0.35],[Infinity,0.37]],
    head_of_household:[[15700,0.10],[59850,0.12],[95350,0.22],[182050,0.24],[231250,0.32],[578100,0.35],[Infinity,0.37]],
  },
  2022: {
    single:           [[10275,0.10],[41775,0.12],[89075,0.22],[170050,0.24],[215950,0.32],[539900,0.35],[Infinity,0.37]],
    married_joint:    [[20550,0.10],[83550,0.12],[178150,0.22],[340100,0.24],[431900,0.32],[647850,0.35],[Infinity,0.37]],
    married_separate: [[10275,0.10],[41775,0.12],[89075,0.22],[170050,0.24],[215950,0.32],[323925,0.35],[Infinity,0.37]],
    head_of_household:[[14650,0.10],[55900,0.12],[89050,0.22],[170050,0.24],[215950,0.32],[539900,0.35],[Infinity,0.37]],
  },
  2021: {
    single:           [[9950,0.10],[40525,0.12],[86375,0.22],[164925,0.24],[209425,0.32],[523600,0.35],[Infinity,0.37]],
    married_joint:    [[19900,0.10],[81050,0.12],[172750,0.22],[329850,0.24],[418850,0.32],[628300,0.35],[Infinity,0.37]],
    married_separate: [[9950,0.10],[40525,0.12],[86375,0.22],[164925,0.24],[209425,0.32],[314150,0.35],[Infinity,0.37]],
    head_of_household:[[14200,0.10],[54200,0.12],[86350,0.22],[164900,0.24],[209400,0.32],[523600,0.35],[Infinity,0.37]],
  },
  2020: {
    single:           [[9875,0.10],[40125,0.12],[85525,0.22],[163300,0.24],[207350,0.32],[518400,0.35],[Infinity,0.37]],
    married_joint:    [[19750,0.10],[80250,0.12],[171050,0.22],[326600,0.24],[414700,0.32],[622050,0.35],[Infinity,0.37]],
    married_separate: [[9875,0.10],[40125,0.12],[85525,0.22],[163300,0.24],[207350,0.32],[311025,0.35],[Infinity,0.37]],
    head_of_household:[[14100,0.10],[53700,0.12],[85500,0.22],[163300,0.24],[207350,0.32],[518400,0.35],[Infinity,0.37]],
  },
  2019: {
    single:           [[9700,0.10],[39475,0.12],[84200,0.22],[160725,0.24],[204100,0.32],[510300,0.35],[Infinity,0.37]],
    married_joint:    [[19400,0.10],[78950,0.12],[168400,0.22],[321450,0.24],[408200,0.32],[612350,0.35],[Infinity,0.37]],
    married_separate: [[9700,0.10],[39475,0.12],[84200,0.22],[160725,0.24],[204100,0.32],[306175,0.35],[Infinity,0.37]],
    head_of_household:[[13850,0.10],[52850,0.12],[84200,0.22],[160700,0.24],[204100,0.32],[510300,0.35],[Infinity,0.37]],
  },
};

const US_STANDARD_BY_YEAR: Record<number, Record<FilingStatus, number>> = {
  2025: { single: 15000, married_joint: 30000, married_separate: 15000, head_of_household: 22500 },
  2024: { single: 14600, married_joint: 29200, married_separate: 14600, head_of_household: 21900 },
  2023: { single: 13850, married_joint: 27700, married_separate: 13850, head_of_household: 20800 },
  2022: { single: 12950, married_joint: 25900, married_separate: 12950, head_of_household: 19400 },
  2021: { single: 12550, married_joint: 25100, married_separate: 12550, head_of_household: 18800 },
  2020: { single: 12400, married_joint: 24800, married_separate: 12400, head_of_household: 18650 },
  2019: { single: 12200, married_joint: 24400, married_separate: 12200, head_of_household: 18350 },
};

function getBrackets(year: number, status: FilingStatus): [number, number][] {
  const y = US_BRACKETS_BY_YEAR[year] ?? US_BRACKETS_BY_YEAR[2024];
  return y[status];
}

function getStdDeduction(year: number, status: FilingStatus): number {
  const y = US_STANDARD_BY_YEAR[year] ?? US_STANDARD_BY_YEAR[2024];
  return y[status];
}

// ── US tax calculation ─────────────────────────────────────────────────────────

function bracketTax(income: number, brackets: [number, number][]): number {
  let tax = 0, prev = 0;
  for (const [limit, rate] of brackets) {
    if (income <= prev) break;
    tax += Math.min(income - prev, limit - prev) * rate;
    prev = limit;
  }
  return Math.round(tax);
}

export function calcUS(d: UsData, year: number) {
  const inc = d.income;
  const totalIncome = inc.wages + inc.interest + inc.ordinary_dividends + inc.st_capital_gains + inc.lt_capital_gains + inc.ira_distributions + inc.pension_annuity + inc.rental_income + inc.business_income + inc.social_security * 0.85 + inc.other_income;
  const adj = d.adjustments;
  const totalAdj = adj.k401_contributions + adj.ira_deduction + adj.hsa_deduction + adj.student_loan_interest + adj.self_employment_tax + adj.educator_expenses + adj.other_adjustments;
  const agi = Math.max(0, totalIncome - totalAdj);

  const stdDed = getStdDeduction(year, d.filing_status);
  const saltCap = year >= 2018 ? 10000 : Infinity; // SALT cap since TCJA 2018
  const itemized = d.deductions.mortgage_interest + Math.min(saltCap, d.deductions.salt) + d.deductions.charitable + d.deductions.other_itemized;
  const deduction = d.deductions.use_standard ? stdDed : Math.max(stdDed, itemized);
  const taxableIncome = Math.max(0, agi - deduction);

  const brackets = getBrackets(year, d.filing_status);
  const incomeTax = bracketTax(taxableIncome, brackets);
  const totalCredits = Object.values(d.credits).reduce((s, v) => s + (v as number), 0);
  const otherTaxes = d.other_taxes.se_tax + d.other_taxes.niit + d.other_taxes.amt + d.other_taxes.other;
  const totalTax = Math.max(0, incomeTax + otherTaxes - totalCredits);
  const totalPayments = d.payments.federal_withheld + d.payments.estimated_payments + d.payments.applied_from_prior;
  const refundOwed = totalPayments - totalTax;

  return { totalIncome, agi, taxableIncome, incomeTax, totalTax, totalPayments, refundOwed, stdDed, itemized };
}

// ── India tax calculation ──────────────────────────────────────────────────────

function indiaTaxOld(income: number): number {
  if (income <= 250000) return 0;
  if (income <= 500000) return (income - 250000) * 0.05;
  if (income <= 1000000) return 12500 + (income - 500000) * 0.20;
  return 12500 + 100000 + (income - 1000000) * 0.30;
}

function indiaTaxNew(income: number): number {
  if (income <= 300000) return 0;
  if (income <= 700000) return (income - 300000) * 0.05;
  if (income <= 1000000) return 20000 + (income - 700000) * 0.10;
  if (income <= 1200000) return 50000 + (income - 1000000) * 0.15;
  if (income <= 1500000) return 80000 + (income - 1200000) * 0.20;
  return 140000 + (income - 1500000) * 0.30;
}

function indiaSurcharge(tax: number, income: number): number {
  if (income > 50000000) return tax * 0.37;
  if (income > 20000000) return tax * 0.25;
  if (income > 10000000) return tax * 0.15;
  if (income > 5000000)  return tax * 0.10;
  return 0;
}

// India standard deduction by FY start year (e.g., 2024 = FY 2024-25)
export const INDIA_STD_DEDUCTION_BY_YEAR: Record<number, number> = {
  2024: 75000, // FY 2024-25: Budget raised it to ₹75k for new regime
  2023: 50000,
  2022: 50000,
  2021: 50000,
  2020: 50000,
  2019: 50000,
};
// STCG/LTCG equity rates by FY start year (post Budget 2024)
export const INDIA_EQUITY_RATES_BY_YEAR: Record<number, { stcg: number; ltcg: number; ltcgExempt: number }> = {
  2024: { stcg: 0.20, ltcg: 0.125, ltcgExempt: 125000 }, // Budget July 2024
  2023: { stcg: 0.15, ltcg: 0.10,  ltcgExempt: 100000 },
  2022: { stcg: 0.15, ltcg: 0.10,  ltcgExempt: 100000 },
  2021: { stcg: 0.15, ltcg: 0.10,  ltcgExempt: 100000 },
  2020: { stcg: 0.15, ltcg: 0.10,  ltcgExempt: 100000 },
  2019: { stcg: 0.15, ltcg: 0.10,  ltcgExempt: 100000 },
};
// New regime slabs by FY start year
function indiaTaxNewByYear(income: number, year: number): number {
  if (year >= 2024) {
    // FY 2024-25 new regime slabs
    if (income <= 300000) return 0;
    if (income <= 700000) return (income - 300000) * 0.05;
    if (income <= 1000000) return 20000 + (income - 700000) * 0.10;
    if (income <= 1200000) return 50000 + (income - 1000000) * 0.15;
    if (income <= 1500000) return 80000 + (income - 1200000) * 0.20;
    return 140000 + (income - 1500000) * 0.30;
  }
  if (year === 2023) {
    // FY 2023-24 new regime slabs (old new regime)
    if (income <= 300000) return 0;
    if (income <= 600000) return (income - 300000) * 0.05;
    if (income <= 900000) return 15000 + (income - 600000) * 0.10;
    if (income <= 1200000) return 45000 + (income - 900000) * 0.15;
    if (income <= 1500000) return 90000 + (income - 1200000) * 0.20;
    return 150000 + (income - 1500000) * 0.30;
  }
  // FY 2022 and before: new regime was optional but with same slab (introduced 2020)
  if (income <= 250000) return 0;
  if (income <= 500000) return (income - 250000) * 0.05;
  if (income <= 750000) return 12500 + (income - 500000) * 0.10;
  if (income <= 1000000) return 37500 + (income - 750000) * 0.15;
  if (income <= 1250000) return 75000 + (income - 1000000) * 0.20;
  if (income <= 1500000) return 125000 + (income - 1250000) * 0.25;
  return 187500 + (income - 1500000) * 0.30;
}
function indiaRebateLimit(year: number, regime: string): number {
  if (regime === 'new') return year >= 2024 ? 700000 : 700000;
  return 500000; // old regime 87A limit ₹5L
}

export function calcIndia(d: IndiaData, year = new Date().getFullYear() - 1) {
  const inc = d.income;
  // Net salary
  const netSalary = Math.max(0, inc.salary - inc.hra_exempt - inc.standard_deduction - inc.professional_tax);
  // Net house property (30% std deduction on rent, minus loan interest)
  const housePropertyStd = inc.house_property_rent * 0.30;
  const netHouseProperty = Math.max(-200000, inc.house_property_rent - housePropertyStd - inc.home_loan_interest);
  // LTCG exempt threshold varies by year
  const equityRates = INDIA_EQUITY_RATES_BY_YEAR[year] ?? INDIA_EQUITY_RATES_BY_YEAR[2024];
  const ltcgTaxable = Math.max(0, inc.lt_equity_gains_above_1l - equityRates.ltcgExempt);

  const totalIncome = netSalary + netHouseProperty + inc.st_equity_gains + ltcgTaxable + inc.other_capital_gains + inc.business_income + inc.interest_income + inc.other_income + (d.residential_status !== 'NR' ? inc.foreign_income : 0);

  let deductions = 0;
  if (d.regime === 'old') {
    const sec80c = Math.min(150000, d.deductions.sec_80c);
    deductions = sec80c + Math.min(25000, d.deductions.sec_80d) + d.deductions.sec_80e + d.deductions.sec_80g + Math.min(10000, d.deductions.sec_80tta) + Math.min(50000, d.deductions.sec_80ccd_1b) + d.deductions.sec_80ccd_2 + d.deductions.other_deductions;
  } else {
    // New regime: only 80ccd_2 allowed
    deductions = d.deductions.sec_80ccd_2;
  }

  const taxableIncome = Math.max(0, totalIncome - deductions);
  const baseTax = d.regime === 'new' ? indiaTaxNewByYear(taxableIncome, year) : indiaTaxOld(taxableIncome);

  // Capital gains rates vary by year
  const rates = INDIA_EQUITY_RATES_BY_YEAR[year] ?? INDIA_EQUITY_RATES_BY_YEAR[2024];
  const stcgTax = inc.st_equity_gains * rates.stcg;
  const ltcgTax = ltcgTaxable * rates.ltcg;

  const surcharge = indiaSurcharge(baseTax, taxableIncome);
  const totalBeforeCess = baseTax + stcgTax + ltcgTax + surcharge;
  const cess = totalBeforeCess * 0.04;
  const grossTax = Math.round(totalBeforeCess + cess);

  // Rebate u/s 87A
  const rebateLimit = indiaRebateLimit(year, d.regime);
  const finalTax = taxableIncome <= rebateLimit ? 0 : grossTax;

  const totalPaid = d.taxes_paid.tds_salary + d.taxes_paid.tds_other + d.taxes_paid.advance_tax + d.taxes_paid.self_assessment + (d.dtaa.applicable ? d.dtaa.foreign_tax_paid : 0);
  const refundOwed = totalPaid - finalTax;

  return { totalIncome, taxableIncome, deductions, baseTax: finalTax, grossTax: finalTax, totalPaid, refundOwed, netSalary, housePropertyStd, ltcgTaxable };
}

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
  cur[last] = (Number(cur[last]) || 0) + value;
}

export async function syncTaxReturnsFromAccounts(forceYear?: number): Promise<void> {
  const accounts = await sql`SELECT name, type, category, balance, notes FROM accounts` as { name: string; type: string; category: string; balance: string; notes: string | null }[];

  // Find all years mentioned in account names, plus forceYear
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

    for (const acct of accounts) {
      const y = extractYear(acct.name);
      if (y && y !== taxYear) continue; // Skip accounts explicitly belonging to another year
      const bal = Math.abs(Number(acct.balance));
      const notes = (acct.notes ?? '').toLowerCase();
      const name = acct.name.toLowerCase();

      switch (acct.category) {
        case 'employment_income':
          usUpdates['income.wages'] = (usUpdates['income.wages'] ?? 0) + bal;
          indiaUpdates['income.salary'] = (indiaUpdates['income.salary'] ?? 0) + bal;
          break;
        case 'tax_prepayment':
          if (name.includes('federal') || notes.includes('federal')) {
            usUpdates['payments.federal_withheld'] = (usUpdates['payments.federal_withheld'] ?? 0) + bal;
          } else if (name.includes('state') || notes.includes('state')) {
            usUpdates['payments.state_withheld'] = (usUpdates['payments.state_withheld'] ?? 0) + bal;
          } else {
            usUpdates['payments.federal_withheld'] = (usUpdates['payments.federal_withheld'] ?? 0) + bal;
          }
          if (name.includes('tds') || notes.includes('tds') || notes.includes('india')) {
            indiaUpdates['taxes_paid.tds_salary'] = (indiaUpdates['taxes_paid.tds_salary'] ?? 0) + bal;
          }
          break;
        case '401k':
          // Only treat as contribution (not total balance) if notes mention W-2/contribution
          if (notes.includes('contribution') || notes.includes('box 12') || notes.includes('w-2')) {
            usUpdates['adjustments.k401_contributions'] = (usUpdates['adjustments.k401_contributions'] ?? 0) + bal;
          }
          break;
        case 'hsa':
          if (notes.includes('contribution') || notes.includes('w-2') || notes.includes('box 12')) {
            usUpdates['adjustments.hsa_deduction'] = (usUpdates['adjustments.hsa_deduction'] ?? 0) + bal;
          }
          break;
        case 'interest_income':
          usUpdates['income.interest'] = (usUpdates['income.interest'] ?? 0) + bal;
          indiaUpdates['income.interest_income'] = (indiaUpdates['income.interest_income'] ?? 0) + bal;
          break;
        case 'dividend_income':
          usUpdates['income.ordinary_dividends'] = (usUpdates['income.ordinary_dividends'] ?? 0) + bal;
          break;
        case 'retirement_distribution':
          usUpdates['income.ira_distributions'] = (usUpdates['income.ira_distributions'] ?? 0) + bal;
          break;
        case 'self_employment_income':
          usUpdates['income.business_income'] = (usUpdates['income.business_income'] ?? 0) + bal;
          break;
        case 'iso_options':
          if (notes.includes('exercise') || notes.includes('box 12')) {
            usUpdates['iso_amt.amt_adjustment'] = (usUpdates['iso_amt.amt_adjustment'] ?? 0) + bal;
          }
          break;
        case 'partnership_income':
        case 'business_interest':
          usUpdates['income.business_income'] = (usUpdates['income.business_income'] ?? 0) + bal;
          indiaUpdates['income.business_income'] = (indiaUpdates['income.business_income'] ?? 0) + bal;
          break;
      }
    }

    // Rental income from records table
    const rentalRows = await sql`
      SELECT COALESCE(SUM(rent_collected), 0) AS total_rent
      FROM rental_records WHERE year = ${taxYear}
    ` as { total_rent: string }[];
    const rentalRent = Number(rentalRows[0]?.total_rent ?? 0);
    if (rentalRent > 0) {
      usUpdates['income.rental_income'] = rentalRent;
      indiaUpdates['income.house_property_rent'] = rentalRent;
    }

    // Upsert both countries
    await upsertTaxReturn(taxYear, 'US', usUpdates);
    await upsertTaxReturn(taxYear, 'India', indiaUpdates);
  }
}

async function upsertTaxReturn(taxYear: number, country: 'US' | 'India', updates: Record<string, number>) {
  if (Object.keys(updates).length === 0) return;

  const rows = await sql`SELECT id, data FROM tax_returns WHERE tax_year = ${taxYear} AND country = ${country}` as { id: string; data: Record<string, unknown> }[];
  const existing = rows[0]?.data ?? {};
  // Deep-merge defaults so we never lose user-entered fields
  const base: Record<string, unknown> = JSON.parse(JSON.stringify(country === 'US' ? US_DEFAULT : INDIA_DEFAULT));
  deepMerge(base, existing);

  for (const [path, val] of Object.entries(updates)) {
    addPath(base, path, 0); // ensure path exists
    setPath(base, path, val);
  }

  await sql`
    INSERT INTO tax_returns (tax_year, country, data)
    VALUES (${taxYear}, ${country}, ${JSON.stringify(base)})
    ON CONFLICT (tax_year, country)
    DO UPDATE SET data = ${JSON.stringify(base)}, updated_at = now()
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
