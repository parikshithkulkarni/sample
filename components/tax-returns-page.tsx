'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import TaxReturnUS from '@/components/tax-return-us';
import TaxReturnIndia from '@/components/tax-return-india';
import { US_DEFAULT, INDIA_DEFAULT } from '@/lib/tax-returns';
import type { UsData, IndiaData } from '@/lib/tax-returns';

type Country = 'US' | 'India';

interface TaxReturn {
  id: string | null;
  tax_year: number;
  country: Country;
  data: UsData | IndiaData;
  updated_at: string | null;
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
      const data = await res.json() as TaxReturn;
      setTaxReturn(data);
    } catch {
      setTaxReturn({ id: null, tax_year: y, country: c, data: c === 'US' ? US_DEFAULT : INDIA_DEFAULT, updated_at: null });
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
      const res = await fetch('/api/tax-returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, country }),
      });
      const updated = await res.json() as TaxReturn;
      setTaxReturn(updated);
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
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-base font-semibold text-gray-800">Tax Returns</h1>
            <div className="flex items-center gap-2">
              {saving && <Loader2 size={13} className="animate-spin text-gray-400" />}
              {taxReturn?.updated_at && !saving && (
                <span className="text-[10px] text-gray-400">saved {timeAgo(taxReturn.updated_at)}</span>
              )}
              <button
                onClick={syncFromDocs}
                disabled={syncing}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 disabled:opacity-50"
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
              className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex-1 overflow-x-auto flex gap-1 no-scrollbar">
              {YEARS.map((y) => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  className={`shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    year === y ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
            <button
              onClick={() => setYear((y) => Math.max(2019, y - 1))}
              disabled={year <= 2019}
              className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Country toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200">
            {(['US', 'India'] as Country[]).map((c) => (
              <button
                key={c}
                onClick={() => setCountry(c)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${country === c ? 'bg-sky-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
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
          country === 'US' ? (
            <TaxReturnUS
              taxYear={year}
              data={taxReturn.data as UsData}
              onChange={handleChange}
            />
          ) : (
            <TaxReturnIndia
              taxYear={year}
              data={taxReturn.data as IndiaData}
              onChange={handleChange}
            />
          )
        ) : null}
      </div>
    </div>
  );
}
