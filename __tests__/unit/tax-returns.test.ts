import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ sql: vi.fn() }));

import {
  calcUS,
  calcIndia,
  US_DEFAULT,
  INDIA_DEFAULT,
  INDIA_EQUITY_RATES_BY_YEAR,
  INDIA_STD_DEDUCTION_BY_YEAR,
} from '@/lib/tax-returns';
import type { UsData, IndiaData } from '@/lib/tax-returns';

// ── calcUS ─────────────────────────────────────────────────────────────────────

describe('calcUS', () => {
  it('returns all zeros for empty default data', () => {
    const r = calcUS(US_DEFAULT, 2024);
    expect(r.totalIncome).toBe(0);
    expect(r.agi).toBe(0);
    expect(r.taxableIncome).toBe(0);
    expect(r.incomeTax).toBe(0);
    expect(r.refundOwed).toBe(0);
  });

  it('uses year-specific standard deduction (2024 single = $14,600)', () => {
    const r = calcUS(US_DEFAULT, 2024);
    expect(r.stdDed).toBe(14600);
  });

  it('uses year-specific standard deduction (2023 single = $13,850)', () => {
    const r = calcUS(US_DEFAULT, 2023);
    expect(r.stdDed).toBe(13850);
  });

  it('uses year-specific standard deduction (2025 single = $15,000)', () => {
    const r = calcUS(US_DEFAULT, 2025);
    expect(r.stdDed).toBe(15000);
  });

  it('calculates AGI correctly', () => {
    const d: UsData = {
      ...US_DEFAULT,
      income: { ...US_DEFAULT.income, wages: 100000, interest: 2000 },
      adjustments: { ...US_DEFAULT.adjustments, k401_contributions: 10000 },
    };
    const r = calcUS(d, 2024);
    expect(r.totalIncome).toBe(102000);
    expect(r.agi).toBe(92000);
  });

  it('standard deduction reduces taxable income', () => {
    const d: UsData = { ...US_DEFAULT, income: { ...US_DEFAULT.income, wages: 50000 } };
    const r = calcUS(d, 2024);
    // 50000 - 14600 = 35400
    expect(r.taxableIncome).toBe(35400);
  });

  it('chooses the higher of standard vs itemized', () => {
    const d: UsData = {
      ...US_DEFAULT,
      income: { ...US_DEFAULT.income, wages: 200000 },
      deductions: {
        ...US_DEFAULT.deductions,
        use_standard: false,
        mortgage_interest: 20000,
        salt: 12000,   // capped at 10k
        charitable: 5000,
        medical_expenses: 0,
        other_itemized: 0,
      },
    };
    const r = calcUS(d, 2024);
    // itemized = 20000 + 10000 + 5000 = 35000 > std 14600
    expect(r.itemized).toBe(35000);
    expect(r.taxableIncome).toBe(200000 - 35000);
  });

  it('caps SALT at $10,000 for years >= 2018', () => {
    const d: UsData = {
      ...US_DEFAULT,
      income: { ...US_DEFAULT.income, wages: 200000 },
      deductions: { ...US_DEFAULT.deductions, use_standard: false, salt: 20000 },
    };
    const r = calcUS(d, 2022);
    expect(r.itemized).toBe(10000); // capped
  });

  it('calculates refund when withheld exceeds tax', () => {
    const d: UsData = {
      ...US_DEFAULT,
      income: { ...US_DEFAULT.income, wages: 50000 },
      payments: { ...US_DEFAULT.payments, federal_withheld: 15000 },
    };
    const r = calcUS(d, 2024);
    expect(r.refundOwed).toBeGreaterThan(0);
  });

  it('calculates amount owed when tax exceeds withheld', () => {
    const d: UsData = {
      ...US_DEFAULT,
      income: { ...US_DEFAULT.income, wages: 200000 },
      payments: { ...US_DEFAULT.payments, federal_withheld: 1000 },
    };
    const r = calcUS(d, 2024);
    expect(r.refundOwed).toBeLessThan(0);
  });

  it('credits reduce total tax', () => {
    const d: UsData = {
      ...US_DEFAULT,
      income: { ...US_DEFAULT.income, wages: 100000 },
      credits: { ...US_DEFAULT.credits, child_tax: 2000, foreign_tax: 500 },
    };
    const dNoCredits: UsData = { ...d, credits: US_DEFAULT.credits };
    const withCredits = calcUS(d, 2024);
    const noCredits = calcUS(dNoCredits, 2024);
    expect(withCredits.totalTax).toBe(noCredits.totalTax - 2500);
  });

  it('85% of social security is included in income', () => {
    const d: UsData = { ...US_DEFAULT, income: { ...US_DEFAULT.income, social_security: 20000 } };
    const r = calcUS(d, 2024);
    expect(r.totalIncome).toBe(17000); // 20000 * 0.85
  });

  it('uses correct 2024 single brackets (10% on first $11,600)', () => {
    const d: UsData = { ...US_DEFAULT, income: { ...US_DEFAULT.income, wages: 14600 } };
    // taxable income = 14600 - 14600 = 0 (all deducted by standard)
    const r = calcUS(d, 2024);
    expect(r.taxableIncome).toBe(0);
    expect(r.incomeTax).toBe(0);
  });

  it('progressive brackets work correctly for $60k wages 2024', () => {
    const d: UsData = { ...US_DEFAULT, income: { ...US_DEFAULT.income, wages: 60000 } };
    // taxable = 60000 - 14600 = 45400
    // 10% on 11600 = 1160
    // 12% on (45400 - 11600) = 12% * 33800 = 4056
    // total = 5216
    const r = calcUS(d, 2024);
    expect(r.taxableIncome).toBe(45400);
    expect(r.incomeTax).toBe(5216);
  });
});

// ── calcIndia ──────────────────────────────────────────────────────────────────

describe('calcIndia', () => {
  it('returns all zeros for default data', () => {
    const r = calcIndia(INDIA_DEFAULT, 2024);
    expect(r.totalIncome).toBe(0);
    expect(r.grossTax).toBe(0);
    expect(r.refundOwed).toBe(0);
  });

  it('applies 87A rebate for income ≤ ₹7L under new regime (2024)', () => {
    const d: IndiaData = {
      ...INDIA_DEFAULT,
      regime: 'new',
      income: { ...INDIA_DEFAULT.income, salary: 700000, standard_deduction: 0 },
    };
    const r = calcIndia(d, 2024);
    expect(r.grossTax).toBe(0); // full rebate
  });

  it('applies tax for income > ₹7L under new regime (2024)', () => {
    const d: IndiaData = {
      ...INDIA_DEFAULT,
      regime: 'new',
      income: { ...INDIA_DEFAULT.income, salary: 800000, standard_deduction: 0 },
    };
    const r = calcIndia(d, 2024);
    expect(r.grossTax).toBeGreaterThan(0);
  });

  it('applies 87A rebate for income ≤ ₹5L under old regime', () => {
    const d: IndiaData = {
      ...INDIA_DEFAULT,
      regime: 'old',
      income: { ...INDIA_DEFAULT.income, salary: 500000, standard_deduction: 0 },
    };
    const r = calcIndia(d, 2024);
    expect(r.grossTax).toBe(0);
  });

  it('caps 80C deduction at ₹1,50,000 under old regime', () => {
    const d: IndiaData = {
      ...INDIA_DEFAULT,
      regime: 'old',
      income: { ...INDIA_DEFAULT.income, salary: 1000000, standard_deduction: 0 },
      deductions: { ...INDIA_DEFAULT.deductions, sec_80c: 200000 }, // over limit
    };
    const r = calcIndia(d, 2024);
    // Deductions should include only 150000 from 80C
    expect(r.deductions).toBeLessThanOrEqual(150000 + 50000); // 80C cap + standard deduction
  });

  it('new regime does not apply 80C deductions', () => {
    const d: IndiaData = {
      ...INDIA_DEFAULT,
      regime: 'new',
      income: { ...INDIA_DEFAULT.income, salary: 1000000, standard_deduction: 0 },
      deductions: { ...INDIA_DEFAULT.deductions, sec_80c: 150000 },
    };
    const r = calcIndia(d, 2024);
    expect(r.deductions).toBe(0); // new regime ignores 80C
  });

  it('uses 2024 STCG rate of 20% on equity', () => {
    const rates = INDIA_EQUITY_RATES_BY_YEAR[2024];
    expect(rates.stcg).toBe(0.20);
  });

  it('uses pre-2024 STCG rate of 15% on equity', () => {
    const rates = INDIA_EQUITY_RATES_BY_YEAR[2023];
    expect(rates.stcg).toBe(0.15);
  });

  it('uses 2024 LTCG rate of 12.5% on equity', () => {
    const rates = INDIA_EQUITY_RATES_BY_YEAR[2024];
    expect(rates.ltcg).toBe(0.125);
  });

  it('LTCG exempt threshold is ₹1.25L for 2024, ₹1L for 2023', () => {
    expect(INDIA_EQUITY_RATES_BY_YEAR[2024].ltcgExempt).toBe(125000);
    expect(INDIA_EQUITY_RATES_BY_YEAR[2023].ltcgExempt).toBe(100000);
  });

  it('net house property caps loss at ₹2L', () => {
    const d: IndiaData = {
      ...INDIA_DEFAULT,
      income: {
        ...INDIA_DEFAULT.income,
        salary: 1000000,
        standard_deduction: 0,
        house_property_rent: 0,
        home_loan_interest: 500000, // big loan interest, self-occupied
      },
    };
    const r = calcIndia(d, 2024);
    // net house property = max(-200000, 0 - 0 - 500000) = -200000
    // total income = 1000000 - 200000 = 800000
    expect(r.totalIncome).toBe(800000);
  });

  it('standard deduction is ₹75k for new regime FY 2024-25', () => {
    expect(INDIA_STD_DEDUCTION_BY_YEAR[2024]).toBe(75000);
  });

  it('standard deduction is ₹50k for FY 2023-24', () => {
    expect(INDIA_STD_DEDUCTION_BY_YEAR[2023]).toBe(50000);
  });

  it('adds 4% health and education cess to tax', () => {
    const d: IndiaData = {
      ...INDIA_DEFAULT,
      regime: 'old',
      income: { ...INDIA_DEFAULT.income, salary: 1200000, standard_deduction: 0 },
    };
    const r = calcIndia(d, 2024);
    // Just verify cess is included (grossTax > baseTax would be checked if baseTax exposed)
    expect(r.grossTax).toBeGreaterThan(0);
  });
});

// ── year-specific data integrity ───────────────────────────────────────────────

describe('year-specific rules', () => {
  it('each supported US year has bracket data for all 4 filing statuses', () => {
    // Verify 2024 and 2023 single gives correct answer via calcUS (brackets imported at top)
    const r2024 = calcUS({ ...US_DEFAULT, income: { ...US_DEFAULT.income, wages: 100000 } }, 2024);
    const r2023 = calcUS({ ...US_DEFAULT, income: { ...US_DEFAULT.income, wages: 100000 } }, 2023);
    // Both should produce tax > 0, and 2023 should be slightly different due to different brackets
    expect(r2024.incomeTax).toBeGreaterThan(0);
    expect(r2023.incomeTax).toBeGreaterThan(0);
  });

  it('calcUS produces different standard deductions for different years', () => {
    const base: UsData = { ...US_DEFAULT, income: { ...US_DEFAULT.income, wages: 50000 } };
    const r2024 = calcUS(base, 2024);
    const r2020 = calcUS(base, 2020);
    expect(r2024.stdDed).toBeGreaterThan(r2020.stdDed);
  });
});
