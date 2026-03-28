'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from 'ai/react';

type ScenarioType = 'iso' | 'rnor' | 'capital_gains' | 'rental';

const TABS: { key: ScenarioType; label: string }[] = [
  { key: 'iso', label: 'ISO Exercise' },
  { key: 'rnor', label: 'RNOR Window' },
  { key: 'capital_gains', label: 'Capital Gains' },
  { key: 'rental', label: 'Rental Income' },
];

interface FieldDef {
  key: string;
  label: string;
  type: 'number' | 'text' | 'select';
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

const FIELDS: Record<ScenarioType, FieldDef[]> = {
  iso: [
    { key: 'shares', label: 'Shares to Exercise', type: 'number', placeholder: '1000', required: true },
    { key: 'strike', label: 'Strike Price ($)', type: 'number', placeholder: '10.00', required: true },
    { key: 'fmv', label: 'Current FMV ($)', type: 'number', placeholder: '50.00', required: true },
    { key: 'agi', label: 'Estimated AGI ($)', type: 'number', placeholder: '250000' },
    { key: 'filing_status', label: 'Filing Status', type: 'select', options: ['single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household'] },
    { key: 'state', label: 'State', type: 'text', placeholder: 'CA' },
  ],
  rnor: [
    { key: 'return_year', label: 'Year Returned to India', type: 'number', placeholder: '2024', required: true },
    { key: 'years_abroad', label: 'Years Abroad as NRI', type: 'number', placeholder: '10', required: true },
    { key: 'us_salary', label: 'Annual US Salary ($)', type: 'number', placeholder: '200000' },
    { key: 'foreign_income', label: 'Other Foreign Income ($)', type: 'number', placeholder: '0' },
    { key: 'india_income', label: 'India-Sourced Income (₹)', type: 'number', placeholder: '0' },
  ],
  capital_gains: [
    { key: 'asset_name', label: 'Asset Name', type: 'text', placeholder: 'Apple shares / Rental property', required: true },
    { key: 'purchase_date', label: 'Purchase Date', type: 'text', placeholder: '2021-01-15', required: true },
    { key: 'sale_date', label: 'Sale Date', type: 'text', placeholder: '2025-06-01' },
    { key: 'cost_basis', label: 'Cost Basis ($)', type: 'number', placeholder: '100000', required: true },
    { key: 'sale_price', label: 'Sale Price ($)', type: 'number', placeholder: '180000', required: true },
    { key: 'agi', label: 'Other AGI ($)', type: 'number', placeholder: '200000' },
    { key: 'filing_status', label: 'Filing Status', type: 'select', options: ['single', 'married_filing_jointly'] },
    { key: 'state', label: 'State', type: 'text', placeholder: 'CA' },
  ],
  rental: [
    { key: 'monthly_rent', label: 'Monthly Rent ($)', type: 'number', placeholder: '3500', required: true },
    { key: 'mortgage', label: 'Monthly Mortgage P&I ($)', type: 'number', placeholder: '2000' },
    { key: 'property_tax', label: 'Annual Property Tax ($)', type: 'number', placeholder: '6000' },
    { key: 'insurance', label: 'Annual Insurance ($)', type: 'number', placeholder: '1800' },
    { key: 'maintenance', label: 'Annual Maintenance ($)', type: 'number', placeholder: '2000' },
    { key: 'mgmt_pct', label: 'Mgmt Fee (%)', type: 'number', placeholder: '8' },
    { key: 'purchase_price', label: 'Purchase Price ($)', type: 'number', placeholder: '500000' },
    { key: 'depr_basis', label: 'Depreciation Basis ($)', type: 'number', placeholder: '400000' },
    { key: 'agi', label: 'Other AGI ($)', type: 'number', placeholder: '150000' },
  ],
};

export default function ScenarioForm() {
  const [activeTab, setActiveTab] = useState<ScenarioType>('iso');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, append, isLoading, setMessages } = useChat({ api: '/api/scenarios' });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function switchTab(tab: ScenarioType) {
    setActiveTab(tab);
    setFormValues({});
    setMessages([]);
    setSubmitted(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params: Record<string, string | number> = {};
    FIELDS[activeTab].forEach((f) => {
      const v = formValues[f.key];
      if (v) params[f.key] = f.type === 'number' ? parseFloat(v) : v;
    });
    setSubmitted(true);
    await append({
      role: 'user',
      content: JSON.stringify({ type: activeTab, params }),
    });
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === t.key ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Form */}
      {!submitted && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          {FIELDS[activeTab].map((f) => (
            <div key={f.key}>
              <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
              {f.type === 'select' ? (
                <select
                  value={formValues[f.key] ?? ''}
                  onChange={(e) => setFormValues({ ...formValues, [f.key]: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">Select...</option>
                  {f.options?.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                </select>
              ) : (
                <input
                  required={f.required}
                  type={f.type}
                  value={formValues[f.key] ?? ''}
                  onChange={(e) => setFormValues({ ...formValues, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              )}
            </div>
          ))}
          <button type="submit" className="w-full bg-sky-600 text-white rounded-xl py-3 text-sm font-medium">
            Analyze
          </button>
        </form>
      )}

      {/* Result */}
      {submitted && messages.length > 0 && (
        <div className="space-y-3">
          {messages.filter((m) => m.role === 'assistant').map((m) => (
            <div key={m.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
              {m.content}
            </div>
          ))}
          {isLoading && (
            <div className="bg-gray-100 rounded-2xl px-4 py-3 flex gap-1">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          )}
          <button
            onClick={() => { setSubmitted(false); setMessages([]); setFormValues({}); }}
            className="w-full border border-gray-200 rounded-xl py-3 text-sm text-gray-600"
          >
            Run New Scenario
          </button>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
