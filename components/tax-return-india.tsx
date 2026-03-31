'use client';

import type { IndiaData, ResidentialStatus, TaxRegime, TaxSources } from '@/lib/tax-data';
import { calcIndia, INDIA_DEFAULT } from '@/lib/tax-data';

interface Props {
  taxYear: number;
  data: IndiaData;
  sources: TaxSources;
  onChange: (patch: Partial<IndiaData>) => void;
}

// Format INR
function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function Row({ label, value, onChange, note, source }: { label: string; value: number; onChange: (v: number) => void; note?: string; source?: { label: string; type: string } }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
      <div className="flex-1 min-w-0">
        <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
        {note && <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">({note})</span>}
        {source && (
          <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
            source.type === 'rental' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'
            : source.type === 'account' ? 'bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400'
            : 'bg-purple-50 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400'
          }`} title={source.label}>
            {source.label.length > 25 ? source.label.slice(0, 25) + '…' : source.label}
          </span>
        )}
      </div>
      <div className="relative shrink-0">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">₹</span>
        <input
          type="number"
          value={value ? Math.round(value * 100) / 100 : ''}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-32 pl-5 pr-2 py-1 text-xs text-right border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-400"
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

// Fiscal year display: 2024 → "FY 2024-25 (AY 2025-26)"
function fyLabel(year: number) {
  return `FY ${year}-${String(year + 1).slice(2)} (AY ${year + 1}-${String(year + 2).slice(2)})`;
}

export default function TaxReturnIndia({ taxYear, data, sources, onChange }: Props) {
  const src = (path: string) => sources[path] as { label: string; type: string } | undefined;
  // Merge with defaults so missing nested objects never crash the component
  const d: IndiaData = {
    ...INDIA_DEFAULT,
    ...(data ?? {}),
    income:     { ...INDIA_DEFAULT.income,     ...(data?.income     ?? {}) },
    deductions: { ...INDIA_DEFAULT.deductions, ...(data?.deductions ?? {}) },
    taxes_paid: { ...INDIA_DEFAULT.taxes_paid, ...(data?.taxes_paid ?? {}) },
    dtaa:       { ...INDIA_DEFAULT.dtaa,       ...(data?.dtaa       ?? {}) },
  };
  const calc = calcIndia(d, taxYear);

  function patch<K extends keyof IndiaData>(key: K, val: IndiaData[K]) {
    onChange({ [key]: val } as Partial<IndiaData>);
  }

  function patchIncome(field: keyof IndiaData['income'], val: string | number) {
    onChange({ income: { ...d.income, [field]: val } });
  }

  function patchDed(field: keyof IndiaData['deductions'], val: number) {
    const total80c = field.startsWith('sec_80c_')
      ? ['sec_80c_ppf', 'sec_80c_elss', 'sec_80c_lic', 'sec_80c_principal', 'sec_80c_other']
          .reduce((s, k) => s + (k === field ? val : (d.deductions[k as keyof IndiaData['deductions']] as number)), 0)
      : d.deductions.sec_80c;
    onChange({
      deductions: {
        ...d.deductions,
        [field]: val,
        // Keep sec_80c in sync with breakdown total
        ...(field.startsWith('sec_80c_') ? { sec_80c: total80c } : {}),
      },
    });
  }

  function patchTax(field: keyof IndiaData['taxes_paid'], val: number) {
    onChange({ taxes_paid: { ...d.taxes_paid, [field]: val } });
  }

  function patchDTAA(field: keyof IndiaData['dtaa'], val: string | number | boolean) {
    onChange({ dtaa: { ...d.dtaa, [field]: val } });
  }

  const refundOwed = calc.refundOwed;
  const isRefund = refundOwed >= 0;
  const isOldRegime = d.regime === 'old';

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs text-gray-400 mb-3">{fyLabel(taxYear)}</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-400">Gross Total Income</p>
            <p className="text-lg font-bold text-gray-800">{fmtINR(calc.totalIncome)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Taxable Income</p>
            <p className="text-lg font-bold text-gray-800">{fmtINR(calc.taxableIncome)}</p>
          </div>
          {isOldRegime && (
            <div>
              <p className="text-xs text-gray-400">Deductions (80C+)</p>
              <p className="text-lg font-bold text-gray-800">{fmtINR(calc.deductions)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400">Tax + Surcharge + Cess</p>
            <p className="text-lg font-bold text-gray-800">{fmtINR(calc.grossTax)}</p>
          </div>
        </div>
        <div className={`rounded-xl p-3 ${isRefund ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
          <p className="text-xs text-gray-500">{isRefund ? 'Estimated Refund' : 'Tax Payable'}</p>
          <p className={`text-2xl font-bold ${isRefund ? 'text-emerald-600' : 'text-red-600'}`}>
            {isRefund ? '+' : ''}{fmtINR(refundOwed)}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            TDS + Advance Tax {fmtINR(calc.totalPaid)} − Tax {fmtINR(calc.grossTax)}
          </p>
        </div>
      </div>

      {/* Filing options */}
      <Section title="Basic Info">
        <div className="py-2 space-y-3">
          <div>
            <label className="text-xs text-gray-600 block mb-1">Residential Status</label>
            <select
              value={d.residential_status}
              onChange={(e) => patch('residential_status', e.target.value as ResidentialStatus)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="ROR">ROR — Resident & Ordinarily Resident</option>
              <option value="RNOR">RNOR — Resident but Not Ordinarily Resident</option>
              <option value="NR">NR — Non-Resident</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Tax Regime</label>
            <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
              {(['new', 'old'] as TaxRegime[]).map((r) => (
                <button
                  key={r}
                  onClick={() => patch('regime', r)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${d.regime === r ? 'bg-sky-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {r === 'new' ? 'New Regime (Default)' : 'Old Regime'}
                </button>
              ))}
            </div>
            {d.regime === 'new' && (
              <p className="text-[10px] text-gray-400 mt-1">New regime: lower slab rates, most deductions not available (except 80CCD-2)</p>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Employer</label>
            <input
              value={d.income.employer}
              onChange={(e) => patchIncome('employer', e.target.value)}
              placeholder="Company name"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </div>
      </Section>

      {/* Salary */}
      <Section title="Salary Income" badge={fmtINR(calc.netSalary)}>
        <Row label="Gross Salary (Form 16 Part B)" value={d.income.salary} onChange={(v) => patchIncome('salary', v)} source={src('income.salary')} />
        <Row label="HRA Received" value={d.income.hra_received} onChange={(v) => patchIncome('hra_received', v)} />
        <Row label="HRA Exempt (u/s 10(13A))" value={d.income.hra_exempt} onChange={(v) => patchIncome('hra_exempt', v)} note="city-based formula" />
        <Row label="Standard Deduction" value={d.income.standard_deduction} onChange={(v) => patchIncome('standard_deduction', v)} note="₹50,000" />
        <Row label="Professional Tax" value={d.income.professional_tax} onChange={(v) => patchIncome('professional_tax', v)} />
      </Section>

      {/* House Property */}
      <Section title="House Property Income">
        <Row label="Annual Rent Received" value={d.income.house_property_rent} onChange={(v) => patchIncome('house_property_rent', v)} source={src('income.house_property_rent')} />
        {d.income.house_property_rent > 0 && (
          <div className="py-1 flex items-center gap-2 border-b border-gray-50">
            <span className="flex-1 text-xs text-gray-400">Standard Deduction (30%)</span>
            <span className="text-xs text-gray-600">−{fmtINR(calc.housePropertyStd)}</span>
          </div>
        )}
        <Row label="Home Loan Interest (u/s 24b)" value={d.income.home_loan_interest} onChange={(v) => patchIncome('home_loan_interest', v)} note="max ₹2L for self-occupied" />
      </Section>

      {/* Capital Gains */}
      <Section title="Capital Gains">
        <Row label="STCG — Equity (20% tax)" value={d.income.st_equity_gains} onChange={(v) => patchIncome('st_equity_gains', v)} note="Listed equity / MF" />
        <Row label="LTCG — Equity (total)" value={d.income.lt_equity_gains} onChange={(v) => patchIncome('lt_equity_gains', v)} note="Listed equity / MF" />
        <Row label="LTCG — Equity (above ₹1L, 12.5%)" value={d.income.lt_equity_gains_above_1l} onChange={(v) => patchIncome('lt_equity_gains_above_1l', v)} note="₹1L exempt per year" />
        <Row label="Other Capital Gains" value={d.income.other_capital_gains} onChange={(v) => patchIncome('other_capital_gains', v)} note="Debt, property, etc." />
      </Section>

      {/* Other income */}
      <Section title="Other Income">
        <Row label="Interest Income (FD, savings)" value={d.income.interest_income} onChange={(v) => patchIncome('interest_income', v)} source={src('income.interest_income')} />
        <Row label="Business / Profession Income" value={d.income.business_income} onChange={(v) => patchIncome('business_income', v)} source={src('income.business_income')} />
        <Row label="Other Sources" value={d.income.other_income} onChange={(v) => patchIncome('other_income', v)} />
        {d.residential_status !== 'NR' && (
          <Row label="Foreign Income (DTAA applicable)" value={d.income.foreign_income} onChange={(v) => patchIncome('foreign_income', v)} />
        )}
      </Section>

      {/* Deductions (old regime only meaningful) */}
      <Section title="Deductions" badge={isOldRegime ? fmtINR(calc.deductions) : 'Old regime only'}>
        <div className={!isOldRegime ? 'opacity-40 pointer-events-none' : ''}>
          <p className="text-[10px] text-gray-400 pt-1 pb-2 border-b border-gray-100">Section 80C (max ₹1,50,000)</p>
          <Row label="PPF" value={d.deductions.sec_80c_ppf} onChange={(v) => patchDed('sec_80c_ppf', v)} />
          <Row label="ELSS / Tax-saving MF" value={d.deductions.sec_80c_elss} onChange={(v) => patchDed('sec_80c_elss', v)} />
          <Row label="Life Insurance Premium" value={d.deductions.sec_80c_lic} onChange={(v) => patchDed('sec_80c_lic', v)} />
          <Row label="Home Loan Principal" value={d.deductions.sec_80c_principal} onChange={(v) => patchDed('sec_80c_principal', v)} />
          <Row label="Other 80C (NSC, ELSS, tuition…)" value={d.deductions.sec_80c_other} onChange={(v) => patchDed('sec_80c_other', v)} />
          <div className="py-1 flex items-center gap-2 border-b border-gray-50">
            <span className="flex-1 text-xs text-gray-500 font-medium">Total 80C (auto-summed, max ₹1.5L)</span>
            <span className="text-xs font-medium text-sky-600">{fmtINR(Math.min(150000, d.deductions.sec_80c))}</span>
          </div>

          <p className="text-[10px] text-gray-400 pt-2 pb-2 border-b border-gray-100">Other Deductions</p>
          <Row label="80D — Health Insurance" value={d.deductions.sec_80d} onChange={(v) => patchDed('sec_80d', v)} note="max ₹25k/50k" />
          <Row label="80E — Education Loan Interest" value={d.deductions.sec_80e} onChange={(v) => patchDed('sec_80e', v)} note="8 years" />
          <Row label="80G — Donations" value={d.deductions.sec_80g} onChange={(v) => patchDed('sec_80g', v)} />
          <Row label="80TTA — Savings Interest" value={d.deductions.sec_80tta} onChange={(v) => patchDed('sec_80tta', v)} note="max ₹10k" />
          <Row label="80CCD(1B) — NPS (extra)" value={d.deductions.sec_80ccd_1b} onChange={(v) => patchDed('sec_80ccd_1b', v)} note="max ₹50k" />
        </div>
        <Row label="80CCD(2) — Employer NPS" value={d.deductions.sec_80ccd_2} onChange={(v) => patchDed('sec_80ccd_2', v)} note="available in new regime too" />
        {isOldRegime && <Row label="Other Deductions" value={d.deductions.other_deductions} onChange={(v) => patchDed('other_deductions', v)} />}
      </Section>

      {/* Taxes Paid */}
      <Section title="Taxes Paid (Form 26AS)" badge={fmtINR(calc.totalPaid)}>
        <Row label="TDS on Salary (Form 16)" value={d.taxes_paid.tds_salary} onChange={(v) => patchTax('tds_salary', v)} source={src('taxes_paid.tds_salary')} />
        <Row label="TDS — Other Income (26AS)" value={d.taxes_paid.tds_other} onChange={(v) => patchTax('tds_other', v)} />
        <Row label="Advance Tax Paid" value={d.taxes_paid.advance_tax} onChange={(v) => patchTax('advance_tax', v)} />
        <Row label="Self-Assessment Tax" value={d.taxes_paid.self_assessment} onChange={(v) => patchTax('self_assessment', v)} />
      </Section>

      {/* DTAA */}
      <Section title="DTAA / Foreign Tax Relief">
        <div className="py-2">
          <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer mb-3">
            <input type="checkbox" checked={d.dtaa.applicable} onChange={(e) => patchDTAA('applicable', e.target.checked)} className="rounded" />
            DTAA applicable (foreign income / taxes paid abroad)
          </label>
          {d.dtaa.applicable && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-28 shrink-0">Country</span>
                <input
                  value={d.dtaa.country}
                  onChange={(e) => patchDTAA('country', e.target.value)}
                  placeholder="e.g. United States"
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
                />
              </div>
              <Row label="Foreign Income" value={d.dtaa.foreign_income} onChange={(v) => patchDTAA('foreign_income', v)} />
              <Row label="Foreign Tax Paid" value={d.dtaa.foreign_tax_paid} onChange={(v) => patchDTAA('foreign_tax_paid', v)} />
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
