'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Building2, TrendingUp, Trash2, GitMerge } from 'lucide-react';
import { fmt } from '@/lib/utils';

function normalizeAddr(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave').replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bdrive\b/g, 'dr').replace(/\broad\b/g, 'rd').replace(/\bcourt\b/g, 'ct')
    .replace(/\blane\b/g, 'ln').replace(/\bplace\b/g, 'pl').replace(/\bcircle\b/g, 'cir')
    .replace(/[,\.#]/g, ' ').replace(/\s+/g, ' ').trim();
}

interface Property {
  id: string;
  address: string;
  purchase_price: number | null;
  purchase_date: string | null;
  market_value: number | null;
  mortgage_balance: number | null;
  notes: string | null;
}

interface RentalRecord {
  year: number;
  month: number;
  rent_collected: number;
  vacancy_days: number;
  mortgage_pmt: number;
  expenses: Record<string, number>;
}

interface PropertyStats extends Property {
  annualRent: number;
  annualExpenses: number;
  annualMortgage: number;
  noi: number;
  cashflow: number;
  capRate: number | null;
  equity: number | null;
}

export default function RentalPortfolio() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [stats, setStats] = useState<PropertyStats[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [form, setForm] = useState({ address: '', purchase_price: '', purchase_date: '', market_value: '', mortgage_balance: '', notes: '' });

  // Detect duplicate groups (same normalized address)
  const dupGroups: Property[][] = (() => {
    const groups: Record<string, Property[]> = {};
    for (const p of properties) {
      const key = normalizeAddr(p.address);
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return Object.values(groups).filter(g => g.length > 1);
  })();

  useEffect(() => {
    fetch('/api/rentals').then((r) => r.json()).then(setProperties);
  }, []);

  useEffect(() => {
    async function loadStats() {
      const all = await Promise.all(
        properties.map(async (p) => {
          const res = await fetch(`/api/rentals/${p.id}/records?year=${selectedYear}`);
          const records: RentalRecord[] = await res.json();

          const annualRent = records.reduce((s, r) => s + Number(r.rent_collected), 0);
          const annualMortgage = records.reduce((s, r) => s + Number(r.mortgage_pmt), 0);
          const annualExpenses = records.reduce((s, r) => {
            const expSum = Object.values(r.expenses).reduce((a: number, b) => a + Number(b), 0);
            return s + expSum;
          }, 0);
          const noi = annualRent - annualExpenses;
          const cashflow = noi - annualMortgage;
          const capRate = p.market_value ? (noi / Number(p.market_value)) * 100 : null;
          const equity = p.market_value && p.mortgage_balance
            ? Number(p.market_value) - Number(p.mortgage_balance)
            : null;

          return { ...p, annualRent, annualExpenses, annualMortgage, noi, cashflow, capRate, equity };
        })
      );
      setStats(all);
    }
    if (properties.length > 0) loadStats();
  }, [properties, selectedYear]);

  async function deleteProperty(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm('Delete this property and all its records?')) return;
    setDeleting(id);
    await fetch(`/api/rentals/${id}`, { method: 'DELETE' });
    setProperties((prev) => prev.filter((p) => p.id !== id));
    setStats((prev) => prev.filter((p) => p.id !== id));
    setDeleting(null);
  }

  async function mergeDuplicates() {
    setMerging(true);
    try {
      for (const group of dupGroups) {
        // Keep the oldest (first created) and merge the rest into it
        const keepId = group[0].id;
        const deleteIds = group.slice(1).map(p => p.id);
        await fetch('/api/rentals/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keepId, deleteIds }),
        });
      }
      const updated = await fetch('/api/rentals').then(r => r.json()) as Property[];
      setProperties(updated);
    } finally {
      setMerging(false);
    }
  }

  async function addProperty(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/rentals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: form.address,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : undefined,
        purchase_date: form.purchase_date || undefined,
        market_value: form.market_value ? parseFloat(form.market_value) : undefined,
        mortgage_balance: form.mortgage_balance ? parseFloat(form.mortgage_balance) : undefined,
        notes: form.notes || undefined,
      }),
    });
    const p = await res.json() as Property;
    setProperties((prev) => [p, ...prev]);
    setForm({ address: '', purchase_price: '', purchase_date: '', market_value: '', mortgage_balance: '', notes: '' });
    setAdding(false);
  }

  const totalNOI = stats.reduce((s, p) => s + p.noi, 0);
  const totalRent = stats.reduce((s, p) => s + p.annualRent, 0);
  const totalEquity = stats.reduce((s, p) => s + (p.equity ?? 0), 0);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-5">
      {/* Header with year selector */}
      <div className="flex items-center justify-between">
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={() => setAdding(!adding)} className="flex items-center gap-1 text-sm text-sky-600 font-medium">
          <Plus size={16} /> Add Property
        </button>
      </div>

      {/* Duplicate warning */}
      {dupGroups.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-amber-800">Duplicate properties detected</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {dupGroups.map(g => g[0].address.split(',')[0]).join(', ')} — {dupGroups.reduce((s, g) => s + g.length - 1, 0)} duplicate(s) will be merged
            </p>
          </div>
          <button
            onClick={mergeDuplicates}
            disabled={merging}
            className="shrink-0 flex items-center gap-1 text-xs px-3 py-1.5 bg-amber-600 text-white rounded-xl font-medium disabled:opacity-50"
          >
            <GitMerge size={13} />
            {merging ? 'Merging…' : 'Merge'}
          </button>
        </div>
      )}

      {/* Portfolio totals */}
      {stats.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-gray-400">Annual Rent</p>
            <p className="text-base font-bold text-gray-800">{fmt(totalRent)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">NOI</p>
            <p className={`text-base font-bold ${totalNOI >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(totalNOI)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Total Equity</p>
            <p className="text-base font-bold text-gray-800">{fmt(totalEquity)}</p>
          </div>
        </div>
      )}

      {/* NOI by property bar chart */}
      {stats.length > 1 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">NOI by Property ({selectedYear})</h3>
          {(() => {
            const maxAbs = Math.max(...stats.map((p) => Math.abs(p.noi)), 1);
            return (
              <div className="space-y-2">
                {stats.map((p) => {
                  const pct = Math.abs(p.noi) / maxAbs;
                  const isPos = p.noi >= 0;
                  const shortAddr = p.address.split(',')[0];
                  return (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 truncate shrink-0">{shortAddr}</span>
                      <div className="flex-1 flex items-center">
                        <div
                          className={`h-5 rounded-r-md transition-all ${isPos ? 'bg-emerald-400' : 'bg-red-400'}`}
                          style={{ width: `${pct * 100}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium w-20 text-right shrink-0 ${isPos ? 'text-emerald-600' : 'text-red-500'}`}>
                        {fmt(p.noi)}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Ask Claude */}
      {stats.length > 0 && (
        <button
          onClick={() => router.push('/chat?q=Analyze+my+rental+portfolio+and+give+me+tax+and+ROI+optimization+recommendations')}
          className="w-full bg-sky-600 text-white rounded-2xl py-3 text-sm font-medium flex items-center justify-center gap-2"
        >
          <TrendingUp size={16} /> Ask Claude: optimize my portfolio
        </button>
      )}

      {/* Add property form */}
      {adding && (
        <form onSubmit={addProperty} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Property address" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} placeholder="Purchase price" className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            <input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={form.market_value} onChange={(e) => setForm({ ...form, market_value: e.target.value })} placeholder="Current market value" className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            <input type="number" value={form.mortgage_balance} onChange={(e) => setForm({ ...form, mortgage_balance: e.target.value })} placeholder="Mortgage balance" className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <button type="submit" className="w-full bg-sky-600 text-white rounded-xl py-2.5 text-sm font-medium">Save Property</button>
        </form>
      )}

      {/* Property cards */}
      {stats.map((p) => (
        <div
          key={p.id}
          onClick={() => router.push(`/rentals/${p.id}`)}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer active:scale-[0.98] transition-transform"
        >
          <div className="flex items-start gap-3">
            <Building2 size={20} className="text-sky-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-1">
                <p className="text-sm font-medium text-gray-800 truncate">{p.address}</p>
                <button
                  onClick={(e) => deleteProperty(e, p.id)}
                  disabled={deleting === p.id}
                  className="shrink-0 text-gray-300 hover:text-red-400 disabled:opacity-40 p-0.5"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {p.purchase_date && (
                <p className="text-xs text-gray-400">Purchased {new Date(p.purchase_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</p>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
                <div>
                  <p className="text-xs text-gray-400">{selectedYear} Rent</p>
                  <p className="text-sm font-semibold text-gray-800">{fmt(p.annualRent)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Cashflow</p>
                  <p className={`text-sm font-semibold ${p.cashflow >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(p.cashflow)}</p>
                </div>
                {p.capRate !== null && (
                  <div>
                    <p className="text-xs text-gray-400">Cap Rate</p>
                    <p className="text-sm font-semibold text-gray-800">{p.capRate.toFixed(1)}%</p>
                  </div>
                )}
                {p.equity !== null && (
                  <div>
                    <p className="text-xs text-gray-400">Equity</p>
                    <p className="text-sm font-semibold text-emerald-600">{fmt(p.equity)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {properties.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No properties yet. Add one above.</p>
        </div>
      )}
    </div>
  );
}
