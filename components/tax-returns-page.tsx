'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import TaxReturnUS from '@/components/tax-return-us';
import TaxReturnIndia from '@/components/tax-return-india';
import { US_DEFAULT, INDIA_DEFAULT } from '@/lib/tax-data';
import type { UsData, IndiaData, TaxSources } from '@/lib/tax-data';

type Country = 'US' | 'India';

interface TaxReturn {
  id: string | null;
  tax_year: number;
  country: Country;
  data: UsData | IndiaData;
  sources: TaxSources;
  updated_at: string | null;
}

// Ensure all top-level nested objects exist — prevents crashes when DB has partial data
function withDefaults(data: unknown, country: Country): UsData | IndiaData {
  if (country === 'US') {
    const s = (data && typeof data === 'object' ? data : {}) as Partial<UsData>;
    return { ...US_DEFAULT, ...s,
      income:      { ...US_DEFAULT.income,      ...(s.income      ?? {}) },
      adjustments: { ...US_DEFAULT.adjustments, ...(s.adjustments ?? {}) },
      deductions:  { ...US_DEFAULT.deductions,  ...(s.deductions  ?? {}) },
      credits:     { ...US_DEFAULT.credits,     ...(s.credits     ?? {}) },
      other_taxes: { ...US_DEFAULT.other_taxes, ...(s.other_taxes ?? {}) },
      payments:    { ...US_DEFAULT.payments,    ...(s.payments    ?? {}) },
      iso_amt:     { ...US_DEFAULT.iso_amt,     ...(s.iso_amt     ?? {}) },
    };
  } else {
    const s = (data && typeof data === 'object' ? data : {}) as Partial<IndiaData>;
    return { ...INDIA_DEFAULT, ...s,
      income:     { ...INDIA_DEFAULT.income,     ...(s.income     ?? {}) },
      deductions: { ...INDIA_DEFAULT.deductions, ...(s.deductions ?? {}) },
      taxes_paid: { ...INDIA_DEFAULT.taxes_paid, ...(s.taxes_paid ?? {}) },
      dtaa:       { ...INDIA_DEFAULT.dtaa,       ...(s.dtaa       ?? {}) },
    };
  }
}

const CURRENT_YEAR = new Date().getFullYear();
// Tax returns go back to 2019; current year may be in-progress
const YEARS = Array.from({ length: CURRENT_YEAR - 2018 }, (_, i) => CURRENT_YEAR - i);

function timeAgo(iso: string | null) {
  if (!iso) return null;
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TaxReturnsPage() {
  const [year, setYear] = useState(CURRENT_YEAR - 1);
  const [country, setCountry] = useState<Country>('US');
  const [taxReturn, setTaxReturn] = useState<TaxReturn | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadReturn = useCallback(async (y: number, c: Country) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tax-returns?year=${y}&country=${c}`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json() as TaxReturn;
      if (!json?.data || typeof json.data !== 'object') throw new Error('Invalid response shape');
      // Merge with defaults so missing nested fields never crash the component
      setTaxReturn({ ...json, sources: json.sources ?? {}, data: withDefaults(json.data, c) });
    } catch {
      setTaxReturn({ id: null, tax_year: y, country: c, data: withDefaults(null, c), sources: {}, updated_at: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReturn(year, country);
  }, [year, country, loadReturn]);

  async function syncFromDocs() {
    if (!taxReturn) return;
    setSyncing(true);
    try {
      // Step 1: Re-extract all documents (writes correct tax_data to tax_returns)
      await fetch('/api/documents/extract-all', { method: 'POST' }).catch(() => {});
      // Step 2: Reset + sync from accounts/rental records
      const res = await fetch('/api/tax-returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, country }),
      });
      const updated = await res.json() as TaxReturn;
      setTaxReturn({ ...updated, sources: updated.sources ?? {}, data: withDefaults(updated.data, country) });
    } finally {
      setSyncing(false);
    }
  }

  // Debounced auto-save on data change
  function handleChange(patch: Partial<UsData> | Partial<IndiaData>) {
    if (!taxReturn) return;
    const next: TaxReturn = { ...taxReturn, data: { ...taxReturn.data, ...patch } as UsData | IndiaData };
    setTaxReturn(next);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const id = next.id ?? 'new';
        const res = await fetch(`/api/tax-returns/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year: next.tax_year, country: next.country, data: patch }),
        });
        const saved = await res.json() as TaxReturn;
        setTaxReturn((prev) => prev ? { ...prev, id: saved.id, updated_at: saved.updated_at } : prev);
      } finally {
        setSaving(false);
      }
    }, 800);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-base font-semibold text-gray-800 dark:text-gray-200">Tax Returns</h1>
            <div className="flex items-center gap-2">
              {saving && <Loader2 size={13} className="animate-spin text-gray-400" />}
              {taxReturn?.updated_at && !saving && (
                <span className="text-[10px] text-gray-400">saved {timeAgo(taxReturn.updated_at)}</span>
              )}
              <button
                onClick={syncFromDocs}
                disabled={syncing}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/50 disabled:opacity-50"
              >
                <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
                Sync from docs
              </button>
            </div>
          </div>

          {/* Year selector */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setYear((y) => Math.min(CURRENT_YEAR, y + 1))}
              disabled={year >= CURRENT_YEAR}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex-1 overflow-x-auto flex gap-1 no-scrollbar">
              {YEARS.map((y) => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  className={`shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    year === y ? 'bg-sky-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
            <button
              onClick={() => setYear((y) => Math.max(2019, y - 1))}
              disabled={year <= 2019}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Country toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
            {(['US', 'India'] as Country[]).map((c) => (
              <button
                key={c}
                onClick={() => setCountry(c)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${country === c ? 'bg-sky-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              >
                {c === 'US' ? '🇺🇸 US (Form 1040)' : '🇮🇳 India (ITR)'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="animate-spin text-gray-300" />
          </div>
        ) : taxReturn ? (
          taxReturn.country === 'US' ? (
            <TaxReturnUS
              taxYear={year}
              data={withDefaults(taxReturn.data, 'US') as UsData}
              sources={taxReturn.sources ?? {}}
              onChange={handleChange}
            />
          ) : (
            <TaxReturnIndia
              taxYear={year}
              data={withDefaults(taxReturn.data, 'India') as IndiaData}
              sources={taxReturn.sources ?? {}}
              onChange={handleChange}
            />
          )
        ) : null}
      </div>
    </div>
  );
}
