'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { fmt } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import NetWorthChart from '@/components/net-worth-chart';
import FinanceBreakdownChart from '@/components/finance-breakdown-chart';

interface Account {
  id: string;
  name: string;
  type: 'asset' | 'liability';
  category: string;
  balance: number;
  currency: string;
  notes: string | null;
  updated_at: string;
}

const ASSET_SUGGESTIONS = ['401k', 'roth_ira', 'brokerage', 'rsu', 'espp', 'nso_options', 'iso_options', 'real_estate', 'savings', 'checking', 'money_market', 'cd', 'treasury', 'bond', 'crypto', 'hsa', '529_plan', 'life_insurance', 'annuity', 'pension', 'startup_equity', 'angel_investment', 'business_interest', 'commodity', 'collectibles', 'other'];
const LIABILITY_SUGGESTIONS = ['mortgage', 'heloc', 'auto_loan', 'credit_card', 'student_loan', 'personal_loan', 'tax_liability', 'margin_loan', 'other'];

export default function FinanceOverview() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState('');
  const [form, setForm] = useState({ name: '', type: 'asset' as 'asset' | 'liability', category: '', balance: '', currency: 'USD', notes: '' });

  useEffect(() => {
    fetch('/api/finance').then((r) => r.json()).then(setAccounts);
  }, []);

  const assets = accounts.filter((a) => a.type === 'asset');
  const liabilities = accounts.filter((a) => a.type === 'liability');
  const totalAssets = assets.reduce((s, a) => s + Number(a.balance), 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + Number(a.balance), 0);
  const netWorth = totalAssets - totalLiabilities;

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, balance: parseFloat(form.balance) }),
    });
    const acc = await res.json() as Account;
    setAccounts((prev) => [...prev, acc]);
    setForm({ name: '', type: 'asset', category: '', balance: '', currency: 'USD', notes: '' });
    setAdding(false);
  }

  async function saveBalance(id: string) {
    const res = await fetch(`/api/finance/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance: parseFloat(editBalance) }),
    });
    const updated = await res.json() as Account;
    setAccounts((prev) => prev.map((a) => a.id === id ? updated : a));
    setEditId(null);
  }

  async function remove(id: string) {
    await fetch(`/api/finance/${id}`, { method: 'DELETE' });
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }

  const AccountRow = ({ a }: { a: Account }) => (
    <li className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 truncate">{a.name}</p>
        <p className="text-xs text-gray-400">{a.category.replace('_', ' ')}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {editId === a.id ? (
          <>
            <input
              value={editBalance}
              onChange={(e) => setEditBalance(e.target.value)}
              className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right"
              autoFocus
            />
            <button onClick={() => saveBalance(a.id)} className="text-emerald-500"><Check size={16} /></button>
            <button onClick={() => setEditId(null)} className="text-gray-400"><X size={16} /></button>
          </>
        ) : (
          <>
            <span className={`text-sm font-medium ${a.type === 'asset' ? 'text-gray-800' : 'text-red-500'}`}>
              {fmt(Number(a.balance), a.currency)}
            </span>
            <button onClick={() => { setEditId(a.id); setEditBalance(String(a.balance)); }} className="text-gray-300 hover:text-sky-500">
              <Pencil size={14} />
            </button>
            <button onClick={() => remove(a.id)} className="text-gray-300 hover:text-red-400">
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-5">
      {/* Net worth card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <p className="text-xs text-gray-500 mb-1">Net Worth</p>
        <p className={`text-3xl font-bold ${netWorth >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(netWorth)}</p>
        <div className="flex gap-4 mt-3 text-sm">
          <div><span className="text-gray-400">Assets </span><span className="font-medium text-gray-800">{fmt(totalAssets)}</span></div>
          <div><span className="text-gray-400">Liabilities </span><span className="font-medium text-red-500">{fmt(totalLiabilities)}</span></div>
        </div>
      </div>

      {/* Net worth trend chart */}
      <NetWorthChart />

      {/* Asset/Liability breakdown donut */}
      <FinanceBreakdownChart />

      {/* Assets */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Assets</h3>
        <ul>{assets.map((a) => <AccountRow key={a.id} a={a} />)}</ul>
        {assets.length === 0 && <p className="text-xs text-gray-400">No assets added yet</p>}
      </div>

      {/* Liabilities */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Liabilities</h3>
        <ul>{liabilities.map((a) => <AccountRow key={a.id} a={a} />)}</ul>
        {liabilities.length === 0 && <p className="text-xs text-gray-400">No liabilities added yet</p>}
      </div>

      {/* Ask Claude */}
      {accounts.length > 0 && (
        <button
          onClick={() => router.push('/chat?q=Analyze+my+financial+snapshot+and+give+me+3+actionable+recommendations')}
          className="w-full bg-sky-600 text-white rounded-2xl py-3 text-sm font-medium"
        >
          Ask Claude about my finances
        </button>
      )}

      {/* Add account */}
      <div>
        <button onClick={() => setAdding(!adding)} className="flex items-center gap-2 text-sm text-sky-600 font-medium">
          <Plus size={16} /> Add Account
        </button>
        {adding && (
          <form onSubmit={addAccount} className="mt-3 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Account name" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'asset' | 'liability' })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
            </select>
            <input
              list="category-suggestions"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder={form.type === 'asset' ? 'Category (e.g. 401k, iso_options…)' : 'Category (e.g. mortgage, heloc…)'}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <datalist id="category-suggestions">
              {(form.type === 'asset' ? ASSET_SUGGESTIONS : LIABILITY_SUGGESTIONS).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <input required type="number" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} placeholder="Balance ($)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            <button type="submit" className="w-full bg-sky-600 text-white rounded-xl py-2.5 text-sm font-medium">Save Account</button>
          </form>
        )}
      </div>
    </div>
  );
}
