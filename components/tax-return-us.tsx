'use client';

import { useEffect, useRef } from 'react';
import { fmt } from '@/lib/utils';
import type { UsData, FilingStatus } from '@/lib/tax-returns';
import { calcUS } from '@/lib/tax-returns';

interface Props {
  taxYear: number;
  data: UsData;
  onChange: (patch: Partial<UsData>) => void;
}

const FILING_STATUSES: { value: FilingStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'married_joint', label: 'Married Filing Jointly' },
  { value: 'married_separate', label: 'Married Filing Separately' },
  { value: 'head_of_household', label: 'Head of Household' },
];

function Row({ label, value, onChange, note }: { label: string; value: number; onChange: (v: number) => void; note?: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <span className="text-xs text-gray-600">{label}</span>
        {note && <span className="text-[10px] text-gray-400 ml-1">({note})</span>}
      </div>
      <div className="relative shrink-0">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">$</span>
        <input
          type="number"
          value={value || ''}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-32 pl-5 pr-2 py-1 text-xs text-right border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-400"
          placeholder="0"
        />
      </div>
    </div>
  );
}

function Section({ title, children, badge }: { title: string; children: React.ReactNode; badge?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {badge && <span className="text-xs font-medium text-sky-600">{badge}</span>}
      </div>
      <div className="px-4 py-2">{children}</div>
    </div>
  );
}

export default function TaxReturnUS({ taxYear, data, onChange }: Props) {
  const calc = calcUS(data, taxYear);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function patch<K extends keyof UsData>(key: K, val: UsData[K]) {
    onChange({ [key]: val } as Partial<UsData>);
  }

  function patchIncome(field: keyof UsData['income'], val: number) {
    onChange({ income: { ...data.income, [field]: val } });
  }

  function patchAdj(field: keyof UsData['adjustments'], val: number) {
    onChange({ adjustments: { ...data.adjustments, [field]: val } });
  }

  function patchDed(field: keyof UsData['deductions'], val: number | boolean) {
    onChange({ deductions: { ...data.deductions, [field]: val } });
  }

  function patchCredits(field: keyof UsData['credits'], val: number) {
    onChange({ credits: { ...data.credits, [field]: val } });
  }

  function patchOtherTax(field: keyof UsData['other_taxes'], val: number) {
    onChange({ other_taxes: { ...data.other_taxes, [field]: val } });
  }

  function patchPayments(field: keyof UsData['payments'], val: number) {
    onChange({ payments: { ...data.payments, [field]: val } });
  }

  function patchISO(field: keyof UsData['iso_amt'], val: number) {
    onChange({ iso_amt: { ...data.iso_amt, [field]: val } });
  }

  // Suppress unused warning
  void debounceRef;

  const refundOwed = calc.refundOwed;
  const isRefund = refundOwed >= 0;

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-400">AGI</p>
            <p className="text-lg font-bold text-gray-800">{fmt(calc.agi)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Taxable Income</p>
            <p className="text-lg font-bold text-gray-800">{fmt(calc.taxableIncome)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Est. Income Tax</p>
            <p className="text-lg font-bold text-gray-800">{fmt(calc.incomeTax)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Total Tax</p>
            <p className="text-lg font-bold text-gray-800">{fmt(calc.totalTax)}</p>
          </div>
        </div>
        <div className={`rounded-xl p-3 ${isRefund ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
          <p className="text-xs text-gray-500">{isRefund ? 'Estimated Refund' : 'Estimated Amount Owed'}</p>
          <p className={`text-2xl font-bold ${isRefund ? 'text-emerald-600' : 'text-red-600'}`}>
            {isRefund ? '+' : '-'}{fmt(Math.abs(refundOwed))}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            Payments {fmt(calc.totalPayments)} − Tax {fmt(calc.totalTax)}
          </p>
        </div>
      </div>

      {/* Filing info */}
      <Section title="Filing Info">
        <div className="py-2">
          <label className="text-xs text-gray-600 block mb-1">Filing Status</label>
          <select
            value={data.filing_status}
            onChange={(e) => patch('filing_status', e.target.value as FilingStatus)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {FILING_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div className="flex items-center gap-2 mt-3">
            <input
              type="checkbox"
              id="fbar"
              checked={data.fbar_required}
              onChange={(e) => patch('fbar_required', e.target.checked)}
              className="rounded"
            />
            <label htmlFor="fbar" className="text-xs text-gray-600">FBAR required (foreign accounts &gt; $10,000)</label>
          </div>
        </div>
      </Section>

      {/* Income */}
      <Section title="Income (Form 1040)" badge={fmt(calc.totalIncome)}>
        <Row label="Wages, Salaries (W-2 Box 1)" value={data.income.wages} onChange={(v) => patchIncome('wages', v)} note="Box 1" />
        <Row label="Interest Income (1099-INT)" value={data.income.interest} onChange={(v) => patchIncome('interest', v)} />
        <Row label="Ordinary Dividends (1099-DIV)" value={data.income.ordinary_dividends} onChange={(v) => patchIncome('ordinary_dividends', v)} />
        <Row label="Qualified Dividends" value={data.income.qualified_dividends} onChange={(v) => patchIncome('qualified_dividends', v)} />
        <Row label="Short-Term Capital Gains" value={data.income.st_capital_gains} onChange={(v) => patchIncome('st_capital_gains', v)} />
        <Row label="Long-Term Capital Gains" value={data.income.lt_capital_gains} onChange={(v) => patchIncome('lt_capital_gains', v)} />
        <Row label="IRA / 401k Distributions (1099-R)" value={data.income.ira_distributions} onChange={(v) => patchIncome('ira_distributions', v)} />
        <Row label="Pension & Annuity" value={data.income.pension_annuity} onChange={(v) => patchIncome('pension_annuity', v)} />
        <Row label="Rental Income (Schedule E)" value={data.income.rental_income} onChange={(v) => patchIncome('rental_income', v)} />
        <Row label="Business / Self-Employment" value={data.income.business_income} onChange={(v) => patchIncome('business_income', v)} />
        <Row label="Social Security Benefits" value={data.income.social_security} onChange={(v) => patchIncome('social_security', v)} note="85% taxable" />
        <Row label="Other Income" value={data.income.other_income} onChange={(v) => patchIncome('other_income', v)} />
      </Section>

      {/* Adjustments */}
      <Section title="Adjustments to Income" badge={`−${fmt(Object.values(data.adjustments).reduce((s, v) => s + v, 0))}`}>
        <Row label="401k / 403b Contributions" value={data.adjustments.k401_contributions} onChange={(v) => patchAdj('k401_contributions', v)} note="W-2 Box 12D" />
        <Row label="Traditional IRA Deduction" value={data.adjustments.ira_deduction} onChange={(v) => patchAdj('ira_deduction', v)} />
        <Row label="HSA Deduction (Form 8889)" value={data.adjustments.hsa_deduction} onChange={(v) => patchAdj('hsa_deduction', v)} />
        <Row label="Student Loan Interest" value={data.adjustments.student_loan_interest} onChange={(v) => patchAdj('student_loan_interest', v)} note="max $2,500" />
        <Row label="½ Self-Employment Tax" value={data.adjustments.self_employment_tax} onChange={(v) => patchAdj('self_employment_tax', v)} />
        <Row label="Educator Expenses" value={data.adjustments.educator_expenses} onChange={(v) => patchAdj('educator_expenses', v)} note="max $300" />
        <Row label="Other Adjustments" value={data.adjustments.other_adjustments} onChange={(v) => patchAdj('other_adjustments', v)} />
      </Section>

      {/* Deductions */}
      <Section title="Deductions (Schedule A)" badge={fmt(data.deductions.use_standard ? calc.stdDed : Math.max(calc.stdDed, calc.itemized))}>
        <div className="py-2 flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="radio" name="ded" checked={data.deductions.use_standard} onChange={() => patchDed('use_standard', true)} />
            Standard ({fmt(calc.stdDed)})
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
            <input type="radio" name="ded" checked={!data.deductions.use_standard} onChange={() => patchDed('use_standard', false)} />
            Itemize ({fmt(calc.itemized)})
          </label>
        </div>
        <div className={data.deductions.use_standard ? 'opacity-40 pointer-events-none' : ''}>
          <Row label="Mortgage Interest (1098)" value={data.deductions.mortgage_interest} onChange={(v) => patchDed('mortgage_interest', v)} />
          <Row label="State & Local Taxes (SALT)" value={data.deductions.salt} onChange={(v) => patchDed('salt', v)} note="capped $10k" />
          <Row label="Charitable Contributions" value={data.deductions.charitable} onChange={(v) => patchDed('charitable', v)} />
          <Row label="Medical Expenses" value={data.deductions.medical_expenses} onChange={(v) => patchDed('medical_expenses', v)} note="&gt;7.5% AGI" />
          <Row label="Other Itemized" value={data.deductions.other_itemized} onChange={(v) => patchDed('other_itemized', v)} />
        </div>
      </Section>

      {/* Credits */}
      <Section title="Credits" badge={`−${fmt(Object.values(data.credits).reduce((s, v) => s + v, 0))}`}>
        <Row label="Child Tax Credit" value={data.credits.child_tax} onChange={(v) => patchCredits('child_tax', v)} note="$2k/child" />
        <Row label="Education Credits (8863)" value={data.credits.education} onChange={(v) => patchCredits('education', v)} />
        <Row label="Foreign Tax Credit (1116)" value={data.credits.foreign_tax} onChange={(v) => patchCredits('foreign_tax', v)} />
        <Row label="Child & Dependent Care" value={data.credits.child_care} onChange={(v) => patchCredits('child_care', v)} />
        <Row label="Retirement Savings (Form 8880)" value={data.credits.retirement_savings} onChange={(v) => patchCredits('retirement_savings', v)} />
        <Row label="Other Credits" value={data.credits.other_credits} onChange={(v) => patchCredits('other_credits', v)} />
      </Section>

      {/* Other taxes */}
      <Section title="Other Taxes">
        <Row label="Self-Employment Tax (Schedule SE)" value={data.other_taxes.se_tax} onChange={(v) => patchOtherTax('se_tax', v)} note="15.3% of net SE" />
        <Row label="Net Investment Income Tax" value={data.other_taxes.niit} onChange={(v) => patchOtherTax('niit', v)} note="3.8% if income &gt; $200k" />
        <Row label="Alternative Minimum Tax (AMT)" value={data.other_taxes.amt} onChange={(v) => patchOtherTax('amt', v)} />
        <Row label="Other Taxes" value={data.other_taxes.other} onChange={(v) => patchOtherTax('other', v)} />
      </Section>

      {/* ISO / AMT detail */}
      <Section title="ISO Options & AMT (Form 3921)">
        <Row label="Shares Exercised (#)" value={data.iso_amt.shares_exercised} onChange={(v) => patchISO('shares_exercised', v)} />
        <Row label="FMV at Exercise" value={data.iso_amt.fmv_at_exercise} onChange={(v) => patchISO('fmv_at_exercise', v)} />
        <Row label="Exercise Price" value={data.iso_amt.exercise_price} onChange={(v) => patchISO('exercise_price', v)} />
        <Row label="AMT Adjustment" value={data.iso_amt.amt_adjustment} onChange={(v) => patchISO('amt_adjustment', v)} note="(FMV − Strike) × Shares" />
      </Section>

      {/* Payments */}
      <Section title="Payments & Withholding" badge={fmt(calc.totalPayments)}>
        <Row label="Federal Tax Withheld (W-2 Box 2)" value={data.payments.federal_withheld} onChange={(v) => patchPayments('federal_withheld', v)} />
        <Row label="State Tax Withheld" value={data.payments.state_withheld} onChange={(v) => patchPayments('state_withheld', v)} />
        <Row label="Estimated Tax Payments" value={data.payments.estimated_payments} onChange={(v) => patchPayments('estimated_payments', v)} note="Form 1040-ES" />
        <Row label="Applied from Prior Year" value={data.payments.applied_from_prior} onChange={(v) => patchPayments('applied_from_prior', v)} />
      </Section>
    </div>
  );
}
