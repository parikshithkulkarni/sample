'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, TrendingUp } from 'lucide-react';
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

const EXPENSE_KEYS = ['property_tax','insurance','maintenance','hoa','management','repairs','other'];

interface Props {
  propertyId: string;
}

export default function RentalPropertyDetail({ propertyId }: Props) {
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [records, setRecords] = useState<RentalRecord[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [addingRecord, setAddingRecord] = useState(false);
  const [form, setForm] = useState({
    month: new Date().getMonth() + 1,
    rent_collected: '',
    vacancy_days: '0',
    mortgage_pmt: '',
    notes: '',
    property_tax: '', insurance: '', maintenance: '', hoa: '', management: '', repairs: '', other: '',
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
      const v = parseFloat((form as Record<string, string>)[k] ?? '0');
      if (v > 0) expenses[k] = v;
    });

    await fetch(`/api/rentals/${propertyId}/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        year: selectedYear,
        month: form.month,
        rent_collected: parseFloat(form.rent_collected) || 0,
        vacancy_days: parseInt(form.vacancy_days) || 0,
        mortgage_pmt: parseFloat(form.mortgage_pmt) || 0,
        expenses,
        notes: form.notes || undefined,
      }),
    });

    const res = await fetch(`/api/rentals/${propertyId}/records?year=${selectedYear}`);
    setRecords(await res.json());
    setAddingRecord(false);
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
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <p className="font-semibold text-gray-800">{property.address}</p>
        {property.purchase_price && <p className="text-xs text-gray-400 mt-0.5">Purchased for {fmt(Number(property.purchase_price))}</p>}
        {property.market_value && <p className="text-xs text-gray-400">Current value: {fmt(Number(property.market_value))}</p>}
        {property.mortgage_balance && <p className="text-xs text-gray-400">Mortgage balance: {fmt(Number(property.mortgage_balance))}</p>}
      </div>

      {/* Year selector */}
      <div className="flex items-center justify-between">
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
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
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-400">Annual Rent</p>
          <p className="text-base font-bold text-gray-800">{fmt(annualRent)}</p>
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
            <p className="text-base font-bold text-gray-800">{capRate.toFixed(2)}%</p>
          </div>
        )}
        {cashOnCash !== null && (
          <div>
            <p className="text-xs text-gray-400">Cash-on-Cash</p>
            <p className="text-base font-bold text-gray-800">{cashOnCash.toFixed(2)}%</p>
          </div>
        )}
      </div>

      {/* Monthly records table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Monthly Records</h3>
          <button onClick={() => setAddingRecord(!addingRecord)} className="flex items-center gap-1 text-xs text-sky-600 font-medium">
            <Plus size={14} /> Log Month
          </button>
        </div>

        {addingRecord && (
          <form onSubmit={logMonth} className="p-4 space-y-3 border-b border-gray-100 bg-sky-50">
            <div className="grid grid-cols-2 gap-2">
              <select value={form.month} onChange={(e) => setForm({ ...form, month: parseInt(e.target.value) })} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none">
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <input type="number" value={form.rent_collected} onChange={(e) => setForm({ ...form, rent_collected: e.target.value })} placeholder="Rent collected ($)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={form.mortgage_pmt} onChange={(e) => setForm({ ...form, mortgage_pmt: e.target.value })} placeholder="Mortgage ($)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
              <input type="number" value={form.vacancy_days} onChange={(e) => setForm({ ...form, vacancy_days: e.target.value })} placeholder="Vacancy days" className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
            </div>
            <p className="text-xs text-gray-500 font-medium">Expenses</p>
            <div className="grid grid-cols-2 gap-2">
              {EXPENSE_KEYS.map((k) => (
                <input key={k} type="number" value={(form as Record<string, string>)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={`${k.replace('_', ' ')} ($)`} className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
              ))}
            </div>
            <button type="submit" className="w-full bg-sky-600 text-white rounded-xl py-2.5 text-sm font-medium">Save</button>
          </form>
        )}

        {records.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">No records for {selectedYear}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-400 bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Month</th>
                <th className="px-3 py-2 text-right">Rent</th>
                <th className="px-3 py-2 text-right">Exp.</th>
                <th className="px-3 py-2 text-right">Cashflow</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const exp = Object.values(r.expenses as Record<string, number>).reduce((a, b) => a + b, 0);
                const cf = Number(r.rent_collected) - exp - Number(r.mortgage_pmt);
                return (
                  <tr key={r.id} className="border-t border-gray-50">
                    <td className="px-4 py-2.5 text-gray-700">{MONTHS[r.month - 1]}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{fmt(Number(r.rent_collected))}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{fmt(exp + Number(r.mortgage_pmt))}</td>
                    <td className={`px-3 py-2.5 text-right font-medium ${cf >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(cf)}</td>
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
