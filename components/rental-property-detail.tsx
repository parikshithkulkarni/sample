'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, TrendingUp, Pencil, Check, X } from 'lucide-react';
import RentalCashflowChart from '@/components/rental-cashflow-chart';
import { fmt } from '@/lib/utils';

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
  id: string;
  year: number;
  month: number;
  rent_collected: number;
  vacancy_days: number;
  mortgage_pmt: number;
  expenses: Record<string, number>;
  notes: string | null;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const EXPENSE_KEYS = [
  'property_tax', 'insurance', 'maintenance', 'repairs', 'hoa',
  'management', 'utilities', 'landscaping', 'pest_control',
  'cleaning', 'advertising', 'legal', 'accounting',
  'capital_improvements', 'supplies', 'travel', 'other',
];

interface Props {
  propertyId: string;
}

export default function RentalPropertyDetail({ propertyId }: Props) {
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [records, setRecords] = useState<RentalRecord[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [addingRecord, setAddingRecord] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ address: '', purchase_price: '', purchase_date: '', market_value: '', mortgage_balance: '', notes: '' });
  const [form, setForm] = useState<Record<string, string | number>>({
    month: new Date().getMonth() + 1,
    rent_collected: '',
    vacancy_days: '0',
    mortgage_pmt: '',
    notes: '',
    ...Object.fromEntries(EXPENSE_KEYS.map(k => [k, ''])),
  });

  useEffect(() => {
    fetch(`/api/rentals/${propertyId}`).then((r) => r.json()).then(setProperty);
  }, [propertyId]);

  useEffect(() => {
    fetch(`/api/rentals/${propertyId}/records?year=${selectedYear}`)
      .then((r) => r.json())
      .then(setRecords);
  }, [propertyId, selectedYear]);

  async function logMonth(e: React.FormEvent) {
    e.preventDefault();
    const expenses: Record<string, number> = {};
    EXPENSE_KEYS.forEach((k) => {
      const v = parseFloat(String(form[k] ?? '0'));
      if (v > 0) expenses[k] = v;
    });

    await fetch(`/api/rentals/${propertyId}/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: selectedYear,
        month: Number(form.month),
        rent_collected: parseFloat(String(form.rent_collected)) || 0,
        vacancy_days: parseInt(String(form.vacancy_days)) || 0,
        mortgage_pmt: parseFloat(String(form.mortgage_pmt)) || 0,
        expenses,
        notes: String(form.notes || '') || undefined,
      }),
    });

    const res = await fetch(`/api/rentals/${propertyId}/records?year=${selectedYear}`);
    setRecords(await res.json());
    setAddingRecord(false);
  }

  function startEdit() {
    setEditForm({
      address: property!.address,
      purchase_price: property!.purchase_price != null ? String(property!.purchase_price) : '',
      purchase_date: property!.purchase_date ?? '',
      market_value: property!.market_value != null ? String(property!.market_value) : '',
      mortgage_balance: property!.mortgage_balance != null ? String(property!.mortgage_balance) : '',
      notes: property!.notes ?? '',
    });
    setEditing(true);
  }

  async function saveEdit() {
    const res = await fetch(`/api/rentals/${propertyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: editForm.address || undefined,
        purchase_price: editForm.purchase_price ? parseFloat(editForm.purchase_price) : null,
        purchase_date: editForm.purchase_date || null,
        market_value: editForm.market_value ? parseFloat(editForm.market_value) : null,
        mortgage_balance: editForm.mortgage_balance ? parseFloat(editForm.mortgage_balance) : null,
        notes: editForm.notes || null,
      }),
    });
    setProperty(await res.json());
    setEditing(false);
  }

  async function deleteProperty() {
    if (!confirm('Delete this property and all its records?')) return;
    await fetch(`/api/rentals/${propertyId}`, { method: 'DELETE' });
    router.replace('/rentals');
  }

  if (!property) return <div className="p-4 text-gray-400 text-sm">Loading...</div>;

  const annualRent = records.reduce((s, r) => s + Number(r.rent_collected), 0);
  const annualMortgage = records.reduce((s, r) => s + Number(r.mortgage_pmt), 0);
  const annualExpenses = records.reduce((s, r) => {
    return s + Object.values(r.expenses as Record<string, number>).reduce((a, b) => a + b, 0);
  }, 0);
  const noi = annualRent - annualExpenses;
  const cashflow = noi - annualMortgage;
  const capRate = property.market_value ? (noi / Number(property.market_value)) * 100 : null;
  const cashOnCash = property.purchase_price && property.mortgage_balance
    ? (cashflow / (Number(property.purchase_price) - Number(property.mortgage_balance))) * 100
    : null;
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-5">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-sky-600 font-medium">
        <ArrowLeft size={16} /> All Properties
      </button>

      {/* Property header */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
        {editing ? (
          <div className="space-y-2">
            <input value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} placeholder="Address" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={editForm.purchase_price} onChange={e => setEditForm({...editForm, purchase_price: e.target.value})} placeholder="Purchase price" className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
              <input type="date" value={editForm.purchase_date} onChange={e => setEditForm({...editForm, purchase_date: e.target.value})} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={editForm.market_value} onChange={e => setEditForm({...editForm, market_value: e.target.value})} placeholder="Market value" className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
              <input type="number" value={editForm.mortgage_balance} onChange={e => setEditForm({...editForm, mortgage_balance: e.target.value})} placeholder="Mortgage balance" className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
            </div>
            <input value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} placeholder="Notes" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
            <div className="flex gap-2 pt-1">
              <button onClick={saveEdit} className="flex items-center gap-1 text-sm text-emerald-600 font-medium"><Check size={15} /> Save</button>
              <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-sm text-gray-400"><X size={15} /> Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between">
              <p className="font-semibold text-gray-800 dark:text-gray-200">{property.address}</p>
              <div className="flex gap-2 shrink-0 ml-2">
                <button onClick={startEdit} className="text-gray-300 hover:text-sky-500"><Pencil size={15} /></button>
                <button onClick={deleteProperty} className="text-gray-300 hover:text-red-400"><Trash2 size={15} /></button>
              </div>
            </div>
            {property.purchase_price && <p className="text-xs text-gray-400 mt-0.5">Purchased for {fmt(Number(property.purchase_price))}{property.purchase_date ? ` · ${new Date(property.purchase_date + 'T00:00:00').toLocaleDateString('en-US', {month:'short',year:'numeric'})}` : ''}</p>}
            {property.market_value && <p className="text-xs text-gray-400">Current value: {fmt(Number(property.market_value))}</p>}
            {property.mortgage_balance && <p className="text-xs text-gray-400">Mortgage balance: {fmt(Number(property.mortgage_balance))}</p>}
            {property.notes && <p className="text-xs text-gray-500 mt-1">{property.notes}</p>}
          </div>
        )}
      </div>

      {/* Year selector */}
      <div className="flex items-center justify-between">
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button
          onClick={() => router.push(`/chat?q=Analyze+my+rental+at+${encodeURIComponent(property.address)}+for+${selectedYear}`)}
          className="flex items-center gap-1 text-sm text-sky-600 font-medium"
        >
          <TrendingUp size={14} /> Ask Claude
        </button>
      </div>

      {/* Annual KPIs */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-400">Annual Rent</p>
          <p className="text-base font-bold text-gray-800 dark:text-gray-200">{fmt(annualRent)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">NOI</p>
          <p className={`text-base font-bold ${noi >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(noi)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Cashflow</p>
          <p className={`text-base font-bold ${cashflow >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(cashflow)}</p>
        </div>
        {capRate !== null && (
          <div>
            <p className="text-xs text-gray-400">Cap Rate</p>
            <p className="text-base font-bold text-gray-800 dark:text-gray-200">{capRate.toFixed(2)}%</p>
          </div>
        )}
        {cashOnCash !== null && (
          <div>
            <p className="text-xs text-gray-400">Cash-on-Cash</p>
            <p className="text-base font-bold text-gray-800 dark:text-gray-200">{cashOnCash.toFixed(2)}%</p>
          </div>
        )}
      </div>

      {/* Cashflow chart */}
      {records.length > 0 && (() => {
        const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const chartData = Array.from({ length: 12 }, (_, i) => {
          const rec = records.find((r) => r.month === i + 1);
          return {
            label: MONTHS_SHORT[i],
            rent: rec ? Number(rec.rent_collected) : 0,
            expenses: rec ? Object.values(rec.expenses as Record<string, number>).reduce((a, b) => a + Number(b), 0) : 0,
            mortgage: rec ? Number(rec.mortgage_pmt) : 0,
          };
        }).filter((d) => d.rent > 0 || d.expenses > 0);
        return <RentalCashflowChart data={chartData} year={selectedYear} />;
      })()}

      {/* Monthly records table */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Monthly Records</h3>
          <button onClick={() => setAddingRecord(!addingRecord)} className="flex items-center gap-1 text-xs text-sky-600 font-medium">
            <Plus size={14} /> Log Month
          </button>
        </div>

        {addingRecord && (
          <form onSubmit={logMonth} className="p-4 space-y-3 border-b border-gray-100 dark:border-gray-800 bg-sky-50 dark:bg-sky-950/30">
            <div className="grid grid-cols-2 gap-2">
              <select value={form.month} onChange={(e) => setForm({ ...form, month: parseInt(e.target.value) })} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <input type="number" value={form.rent_collected} onChange={(e) => setForm({ ...form, rent_collected: e.target.value })} placeholder="Rent collected ($)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={form.mortgage_pmt} onChange={(e) => setForm({ ...form, mortgage_pmt: e.target.value })} placeholder="Mortgage ($)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
              <input type="number" value={form.vacancy_days} onChange={(e) => setForm({ ...form, vacancy_days: e.target.value })} placeholder="Vacancy days" className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
            </div>
            <p className="text-xs text-gray-500 font-medium">Expenses</p>
            <div className="grid grid-cols-2 gap-2">
              {EXPENSE_KEYS.map((k) => (
                <input key={k} type="number" value={String(form[k] ?? '')} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={`${k.replace(/_/g, ' ')} ($)`} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
              ))}
            </div>
            <button type="submit" className="w-full bg-sky-600 text-white rounded-xl py-2.5 text-sm font-medium">Save</button>
          </form>
        )}

        {records.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">No records for {selectedYear}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-2 text-left">Month</th>
                <th className="px-3 py-2 text-right">Rent</th>
                <th className="px-3 py-2 text-right">Exp.</th>
                <th className="px-3 py-2 text-right">Cashflow</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const expEntries = Object.entries(r.expenses as Record<string, number>).filter(([, v]) => v > 0);
                const exp = expEntries.reduce((a, [, b]) => a + b, 0);
                const cf = Number(r.rent_collected) - exp - Number(r.mortgage_pmt);
                const isExpanded = expandedRow === r.id;
                return (
                  <tr key={r.id} className="border-t border-gray-50 dark:border-gray-800" onClick={() => setExpandedRow(isExpanded ? null : r.id)}>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 cursor-pointer">
                      <div>{MONTHS[r.month - 1]}</div>
                      {isExpanded && expEntries.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {Number(r.mortgage_pmt) > 0 && (
                            <div className="text-[10px] text-gray-400 flex justify-between pr-2">
                              <span>mortgage</span><span>{fmt(Number(r.mortgage_pmt))}</span>
                            </div>
                          )}
                          {expEntries.map(([k, v]) => (
                            <div key={k} className="text-[10px] text-gray-400 flex justify-between pr-2">
                              <span>{k.replace(/_/g, ' ')}</span><span>{fmt(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700 dark:text-gray-300 align-top">{fmt(Number(r.rent_collected))}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500 align-top">{fmt(exp + Number(r.mortgage_pmt))}</td>
                    <td className={`px-3 py-2.5 text-right font-medium align-top ${cf >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(cf)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
