'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, GitMerge } from 'lucide-react';
import { fmt } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import NetWorthChart from '@/components/net-worth-chart';
import FinanceBreakdownChart from '@/components/finance-breakdown-chart';
import { SkeletonCard, SkeletonList } from '@/components/skeleton';
import { useToast } from '@/components/toast';

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

function normalizeAcctName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|corp|ltd|co|na|n\.a\.)\b\.?/g, '')
    .replace(/\b(account|accounts|bank|financial|investments?|services?)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function FinanceOverview() {
  const router = useRouter();
  const { addToast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [merging, setMerging] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState('');
  const [form, setForm] = useState({ name: '', type: 'asset' as 'asset' | 'liability', category: '', balance: '', currency: 'USD', notes: '' });

  // Detect duplicate groups: same normalized name
  const dupGroups: Account[][] = (() => {
    const visited = new Set<string>();
    const groups: Account[][] = [];
    for (let i = 0; i < accounts.length; i++) {
      if (visited.has(accounts[i].id)) continue;
      const group = [accounts[i]];
      for (let j = i + 1; j < accounts.length; j++) {
        if (!visited.has(accounts[j].id) && normalizeAcctName(accounts[i].name) === normalizeAcctName(accounts[j].name)) {
          group.push(accounts[j]);
          visited.add(accounts[j].id);
        }
      }
      if (group.length > 1) { visited.add(accounts[i].id); groups.push(group); }
    }
    return groups;
  })();

  useEffect(() => {
    fetch('/api/finance')
      .then((r) => r.json())
      .then(setAccounts)
      .finally(() => setLoading(false));
  }, []);

  const assets = accounts.filter((a) => a.type === 'asset');
  const liabilities = accounts.filter((a) => a.type === 'liability');
  const totalAssets = assets.reduce((s, a) => s + Number(a.balance), 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + Number(a.balance), 0);
  const netWorth = totalAssets - totalLiabilities;

  async function mergeDuplicates() {
    setMerging(true);
    try {
      for (const group of dupGroups) {
        // Keep the one with the highest balance; sum all into it
        const keepId = group.reduce((best, a) => Number(a.balance) > Number(best.balance) ? a : best).id;
        const deleteIds = group.filter(a => a.id !== keepId).map(a => a.id);
        await fetch('/api/finance/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keepId, deleteIds }),
        });
      }
      const updated = await fetch('/api/finance').then(r => r.json()) as Account[];
      setAccounts(updated);
    } finally {
      setMerging(false);
    }
  }

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
    const prev = accounts;
    const newBalance = parseFloat(editBalance);
    // Optimistic update
    setAccounts((cur) => cur.map((a) => a.id === id ? { ...a, balance: newBalance } : a));
    setEditId(null);
    try {
      const res = await fetch(`/api/finance/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: newBalance }),
      });
      const updated = await res.json() as Account;
      setAccounts((cur) => cur.map((a) => a.id === id ? updated : a));
      addToast({ type: 'success', message: 'Balance updated' });
    } catch {
      setAccounts(prev);
      addToast({ type: 'error', message: 'Failed to update balance' });
    }
  }

  async function remove(id: string) {
    const prev = accounts;
    // Optimistic update
    setAccounts((cur) => cur.filter((a) => a.id !== id));
    try {
      await fetch(`/api/finance/${id}`, { method: 'DELETE' });
      addToast({ type: 'success', message: 'Account removed' });
    } catch {
      setAccounts(prev);
      addToast({ type: 'error', message: 'Failed to remove account' });
    }
  }

  const AccountRow = ({ a }: { a: Account }) => (
    <li className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{a.name}</p>
        <p className="text-xs text-gray-400">{a.category.replace('_', ' ')}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {editId === a.id ? (
          <>
            <input
              value={editBalance}
              onChange={(e) => setEditBalance(e.target.value)}
              className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
              autoFocus
            />
            <button onClick={() => saveBalance(a.id)} className="text-emerald-500"><Check size={16} /></button>
            <button onClick={() => setEditId(null)} className="text-gray-400"><X size={16} /></button>
          </>
        ) : (
          <>
            <span className={`text-sm font-medium ${a.type === 'asset' ? 'text-gray-800 dark:text-gray-200' : 'text-red-500'}`}>
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

  if (loading) {
    return (
      <div className="space-y-5">
        <SkeletonCard />
        <SkeletonList count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Duplicate account warning */}
      {dupGroups.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-amber-800">Duplicate accounts detected</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {dupGroups.map(g => g[0].name).join(', ')} — balances will be summed into one
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

      {/* Net worth card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Net Worth</p>
        <p className={`text-3xl font-bold ${netWorth >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(netWorth)}</p>
        <div className="flex gap-4 mt-3 text-sm">
          <div><span className="text-gray-400">Assets </span><span className="font-medium text-gray-800 dark:text-gray-200">{fmt(totalAssets)}</span></div>
          <div><span className="text-gray-400">Liabilities </span><span className="font-medium text-red-500">{fmt(totalLiabilities)}</span></div>
        </div>
      </div>

      {/* Net worth trend chart */}
      <NetWorthChart />

      {/* Asset/Liability breakdown donut */}
      <FinanceBreakdownChart />

      {/* Assets */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Assets</h3>
        <ul>{assets.map((a) => <AccountRow key={a.id} a={a} />)}</ul>
        {assets.length === 0 && <p className="text-xs text-gray-400">No assets added yet</p>}
      </div>

      {/* Liabilities */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Liabilities</h3>
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
          <form onSubmit={addAccount} className="mt-3 bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 space-y-3">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Account name" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'asset' | 'liability' })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
            </select>
            <input
              list="category-suggestions"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder={form.type === 'asset' ? 'Category (e.g. 401k, iso_options…)' : 'Category (e.g. mortgage, heloc…)'}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            />
            <datalist id="category-suggestions">
              {(form.type === 'asset' ? ASSET_SUGGESTIONS : LIABILITY_SUGGESTIONS).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <input required type="number" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} placeholder="Balance ($)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
            <button type="submit" className="w-full bg-sky-600 text-white rounded-xl py-2.5 text-sm font-medium">Save Account</button>
          </form>
        )}
      </div>
    </div>
  );
}
