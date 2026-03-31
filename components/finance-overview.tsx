'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, GitMerge, ChevronDown, ChevronUp, Landmark, TrendingUp, Wallet, Building2, Shield, Briefcase, CreditCard, PiggyBank, Coins, RefreshCw } from 'lucide-react';
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

// ── Semantic category groups ────────────────────────────────────────────────
// Each account category maps to a semantic group for organized display

type SemanticGroup = {
  key: string;
  label: string;
  icon: typeof Landmark;
  categories: string[];
  type: 'asset' | 'liability' | 'both';
};

const SEMANTIC_GROUPS: SemanticGroup[] = [
  {
    key: 'cash',
    label: 'Cash & Banking',
    icon: Wallet,
    categories: ['checking', 'savings', 'money_market'],
    type: 'asset',
  },
  {
    key: 'retirement',
    label: 'Retirement',
    icon: Landmark,
    categories: ['401k', 'roth_ira', 'ira', 'pension', 'annuity', 'hsa', '529_plan'],
    type: 'asset',
  },
  {
    key: 'brokerage',
    label: 'Brokerage & Trading',
    icon: TrendingUp,
    categories: ['brokerage', 'crypto', 'bond', 'treasury', 'cd', 'commodity', 'collectibles'],
    type: 'asset',
  },
  {
    key: 'equity_comp',
    label: 'Equity & Compensation',
    icon: Briefcase,
    categories: ['rsu', 'espp', 'iso_options', 'nso_options', 'startup_equity', 'angel_investment', 'business_interest'],
    type: 'asset',
  },
  {
    key: 'real_estate',
    label: 'Real Estate',
    icon: Building2,
    categories: ['real_estate'],
    type: 'asset',
  },
  {
    key: 'insurance',
    label: 'Insurance',
    icon: Shield,
    categories: ['life_insurance'],
    type: 'asset',
  },
  {
    key: 'mortgage_debt',
    label: 'Mortgages & Secured Debt',
    icon: Building2,
    categories: ['mortgage', 'heloc', 'auto_loan'],
    type: 'liability',
  },
  {
    key: 'unsecured_debt',
    label: 'Credit & Unsecured Debt',
    icon: CreditCard,
    categories: ['credit_card', 'personal_loan', 'student_loan', 'margin_loan'],
    type: 'liability',
  },
  {
    key: 'tax_liability',
    label: 'Tax Obligations',
    icon: Coins,
    categories: ['tax_liability'],
    type: 'liability',
  },
];

// Categories that are income/tax records, not real accounts — displayed separately
const INCOME_TAX_CATEGORIES = new Set([
  'employment_income', 'self_employment_income', 'partnership_income',
  'interest_income', 'dividend_income', 'capital_gains', 'rental_income',
  'tax_prepayment', 'retirement_distribution',
]);

function getSemanticGroup(account: Account): string {
  const cat = account.category.toLowerCase();
  if (INCOME_TAX_CATEGORIES.has(cat)) return 'tax_records';
  for (const group of SEMANTIC_GROUPS) {
    if (group.categories.includes(cat)) return group.key;
  }
  return account.type === 'asset' ? 'other_assets' : 'other_liabilities';
}

// All categories for the add-account form
const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  'Cash & Banking': ['checking', 'savings', 'money_market'],
  'Retirement': ['401k', 'roth_ira', 'ira', 'pension', 'annuity', 'hsa', '529_plan'],
  'Brokerage & Trading': ['brokerage', 'crypto', 'bond', 'treasury', 'cd', 'commodity', 'collectibles'],
  'Equity & Compensation': ['rsu', 'espp', 'iso_options', 'nso_options', 'startup_equity', 'angel_investment'],
  'Real Estate': ['real_estate'],
  'Insurance': ['life_insurance'],
  'Mortgages & Secured Debt': ['mortgage', 'heloc', 'auto_loan'],
  'Credit & Unsecured Debt': ['credit_card', 'personal_loan', 'student_loan', 'margin_loan'],
  'Tax Obligations': ['tax_liability'],
};

function normalizeAcctName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|corp|ltd|co|na|n\.a\.)\b\.?/g, '')
    .replace(/\b(account|accounts|bank|financial|investments?|services?)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasDuplicates(accounts: { name: string }[]): boolean {
  const seen = new Set<string>();
  for (const a of accounts) {
    const key = normalizeAcctName(a.name);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function labelFor(cat: string) {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function FinanceOverview() {
  const router = useRouter();
  const { addToast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [merging, setMerging] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
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
    async function load() {
      // Run cleanup on load: removes income/tax records, deduplicates, syncs to tax page
      await fetch('/api/finance/cleanup', { method: 'POST' }).catch(() => {});
      const res = await fetch('/api/finance').then(r => r.json());
      setAccounts(Array.isArray(res) ? res : res?.data ?? []);
    }
    load().finally(() => setLoading(false));
  }, []);

  // Exclude income/tax records from net worth — they aren't real account balances
  const realAccounts = accounts.filter((a) => !INCOME_TAX_CATEGORIES.has(a.category.toLowerCase()));
  const assets = realAccounts.filter((a) => a.type === 'asset');
  const liabilities = realAccounts.filter((a) => a.type === 'liability');
  const totalAssets = assets.reduce((s, a) => s + Number(a.balance), 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + Number(a.balance), 0);
  const netWorth = totalAssets - totalLiabilities;

  // Build semantic groups with accounts
  const groupedAccounts = (() => {
    const grouped = new Map<string, Account[]>();
    for (const acct of accounts) {
      const key = getSemanticGroup(acct);
      const list = grouped.get(key) ?? [];
      list.push(acct);
      grouped.set(key, list);
    }

    const result: { group: SemanticGroup; accounts: Account[]; total: number }[] = [];

    // Named groups
    for (const group of SEMANTIC_GROUPS) {
      const accts = grouped.get(group.key);
      if (accts && accts.length > 0) {
        const total = accts.reduce((s, a) => s + Number(a.balance), 0);
        result.push({ group, accounts: accts.sort((a, b) => Number(b.balance) - Number(a.balance)), total });
      }
    }

    // Other assets
    const otherAssets = grouped.get('other_assets');
    if (otherAssets && otherAssets.length > 0) {
      result.push({
        group: { key: 'other_assets', label: 'Other Assets', icon: PiggyBank, categories: [], type: 'asset' },
        accounts: otherAssets.sort((a, b) => Number(b.balance) - Number(a.balance)),
        total: otherAssets.reduce((s, a) => s + Number(a.balance), 0),
      });
    }

    // Other liabilities
    const otherLiabs = grouped.get('other_liabilities');
    if (otherLiabs && otherLiabs.length > 0) {
      result.push({
        group: { key: 'other_liabilities', label: 'Other Liabilities', icon: Coins, categories: [], type: 'liability' },
        accounts: otherLiabs.sort((a, b) => Number(b.balance) - Number(a.balance)),
        total: otherLiabs.reduce((s, a) => s + Number(a.balance), 0),
      });
    }

    // Tax & income records (legacy entries from extraction — not real accounts)
    const taxRecords = grouped.get('tax_records');
    if (taxRecords && taxRecords.length > 0) {
      result.push({
        group: { key: 'tax_records', label: 'Tax & Income Records', icon: Briefcase, categories: [], type: 'both' },
        accounts: taxRecords.sort((a, b) => Number(b.balance) - Number(a.balance)),
        total: taxRecords.reduce((s, a) => s + Number(a.balance), 0),
      });
    }

    return result;
  })();

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function mergeDuplicates() {
    setMerging(true);
    try {
      await fetch('/api/finance/dedup', { method: 'POST' });
      const res = await fetch('/api/finance').then(r => r.json());
      setAccounts(Array.isArray(res) ? res : res?.data ?? []);
      addToast('Duplicates merged', 'success');
    } catch {
      addToast('Failed to merge duplicates', 'error');
    } finally {
      setMerging(false);
    }
  }

  async function syncFromDocs() {
    setSyncing(true);
    try {
      // Re-extract all documents, then cleanup
      const res1 = await fetch('/api/documents/extract-all', { method: 'POST' });
      if (!res1.ok) throw new Error(`Extraction failed: ${res1.status}`);
      await fetch('/api/finance/cleanup', { method: 'POST' }).catch(() => {});
      const res = await fetch('/api/finance').then(r => r.json());
      setAccounts(Array.isArray(res) ? res : res?.data ?? []);
      addToast('Synced from documents', 'success');
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Sync failed', 'error');
    } finally {
      setSyncing(false);
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
      addToast('Balance updated', 'success');
    } catch {
      setAccounts(prev);
      addToast('Failed to update balance', 'error');
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this account?')) return;
    const prev = accounts;
    setAccounts((cur) => cur.filter((a) => a.id !== id));
    try {
      await fetch(`/api/finance/${id}`, { method: 'DELETE' });
      addToast('Account removed', 'success');
    } catch {
      setAccounts(prev);
      addToast('Failed to remove account', 'error');
    }
  }

  const AccountRow = ({ a }: { a: Account }) => (
    <li className="flex items-center justify-between py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{a.name}</p>
        <p className="text-xs text-gray-400">{labelFor(a.category)}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {editId === a.id ? (
          <>
            <input
              type="number"
              step="any"
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

  // Flatten category suggestions for the datalist
  const allSuggestions = form.type === 'asset'
    ? Object.entries(CATEGORY_SUGGESTIONS).filter(([k]) => !['Debt & Loans', 'Credit & Tax'].includes(k)).flatMap(([, v]) => v)
    : Object.entries(CATEGORY_SUGGESTIONS).filter(([k]) => ['Debt & Loans', 'Credit & Tax'].includes(k)).flatMap(([, v]) => v);

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

      {/* Sync button */}
      <div className="flex justify-end">
        <button
          onClick={syncFromDocs}
          disabled={syncing}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/40 disabled:opacity-50 font-medium"
        >
          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync from docs'}
        </button>
      </div>

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

      {/* Semantically grouped accounts */}
      {groupedAccounts.map(({ group, accounts: groupAccounts, total }) => {
        const Icon = group.icon;
        const isLiability = group.type === 'liability';
        const isTaxRecord = group.key === 'tax_records';
        // Tax records start collapsed by default
        const collapsed = isTaxRecord ? !collapsedGroups.has(group.key) : collapsedGroups.has(group.key);

        return (
          <div key={group.key} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <button
              onClick={() => toggleGroup(group.key)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isTaxRecord ? 'bg-amber-50 dark:bg-amber-950/30' : isLiability ? 'bg-red-50 dark:bg-red-950/30' : 'bg-sky-50 dark:bg-sky-950/30'}`}>
                  <Icon size={16} className={isTaxRecord ? 'text-amber-500' : isLiability ? 'text-red-500' : 'text-sky-500'} />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{group.label}</h3>
                  <p className="text-xs text-gray-400">
                    {isTaxRecord ? 'Not included in net worth' : `${groupAccounts.length} account${groupAccounts.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${isLiability ? 'text-red-500' : 'text-gray-800 dark:text-gray-200'}`}>
                  {fmt(total)}
                </span>
                {collapsed ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronUp size={16} className="text-gray-400" />}
              </div>
            </button>
            {!collapsed && (
              <div className="px-4 pb-3 border-t border-gray-50 dark:border-gray-800">
                <ul>{groupAccounts.map((a) => <AccountRow key={a.id} a={a} />)}</ul>
              </div>
            )}
          </div>
        );
      })}

      {accounts.length === 0 && (
        <div className="text-center py-12">
          <div className="w-14 h-14 bg-sky-50 dark:bg-sky-950/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <PiggyBank size={24} className="text-sky-500" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No accounts yet</p>
          <p className="text-xs text-gray-400 mt-1">Add your first account to start tracking your net worth</p>
        </div>
      )}

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
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Account name (e.g. Fidelity 401k)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'asset' | 'liability', category: '' })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
            </select>
            <input
              list="category-suggestions"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Category (e.g. 401k, brokerage, mortgage…)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
            />
            <datalist id="category-suggestions">
              {allSuggestions.map((c) => (
                <option key={c} value={c}>{labelFor(c)}</option>
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
