'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Clock, TrendingUp, AlertTriangle, Building2, DollarSign, Calculator, FileText, MessageCircle, RefreshCw } from 'lucide-react';
import NetWorthChart from '@/components/net-worth-chart';
import { SkeletonCard } from '@/components/skeleton';
import { fmt, daysUntil } from '@/lib/utils';

interface Deadline {
  id: string;
  title: string;
  due_date: string;
  category: string;
  is_done: boolean;
}

interface Account {
  id: string;
  name: string;
  type: 'asset' | 'liability';
  category: string;
  balance: number;
  currency: string;
}

interface Property {
  id: string;
  address: string;
  market_value: number | null;
  mortgage_balance: number | null;
}

export default function DashboardCards() {
  const router = useRouter();
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [quickQ, setQuickQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  async function loadData() {
    await Promise.all([
      fetch('/api/deadlines').then((r) => r.json()).then((d) => setDeadlines(Array.isArray(d) ? d : d?.data ?? [])),
      fetch('/api/finance').then((r) => r.json()).then((a) => setAccounts(Array.isArray(a) ? a : a?.data ?? [])),
      fetch('/api/rentals').then((r) => r.json()).then((p) => setProperties(Array.isArray(p) ? p : p?.data ?? [])),
    ]);
  }

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  async function syncFromDocs() {
    setSyncing(true);
    try {
      await fetch('/api/documents/extract-all', { method: 'POST' });
      await loadData();
    } finally {
      setSyncing(false);
    }
  }

  const assets = accounts.filter((a) => a.type === 'asset');
  const liabilities = accounts.filter((a) => a.type === 'liability');
  const totalAssets = assets.reduce((s, a) => s + Number(a.balance), 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + Number(a.balance), 0);
  const netWorth = totalAssets - totalLiabilities;
  const totalEquity = properties.reduce((s, p) => {
    if (p.market_value && p.mortgage_balance) return s + Number(p.market_value) - Number(p.mortgage_balance);
    return s;
  }, 0);

  const overdue = deadlines.filter((d) => !d.is_done && daysUntil(d.due_date) < 0);
  const upcoming = deadlines.filter((d) => !d.is_done && daysUntil(d.due_date) >= 0).slice(0, 3);

  function handleQuickAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!quickQ.trim()) return;
    router.push(`/chat?q=${encodeURIComponent(quickQ.trim())}`);
  }

  const categoryColor: Record<string, string> = {
    tax_us:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    tax_india: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    visa:      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    property:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    other:     'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  };

  return (
    <div className="space-y-4">
      {/* Quick ask */}
      <form onSubmit={handleQuickAsk} className="flex gap-2">
        <input
          value={quickQ}
          onChange={(e) => setQuickQ(e.target.value)}
          placeholder="Ask your brain anything..."
          className="flex-1 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white dark:bg-gray-900 dark:text-gray-100 shadow-sm"
        />
        <button
          type="submit"
          disabled={!quickQ.trim()}
          className="w-12 h-12 bg-sky-600 rounded-xl flex items-center justify-center text-white disabled:opacity-40 shrink-0"
        >
          <Send size={18} />
        </button>
      </form>

      {/* Sync from docs */}
      <div className="flex justify-end">
        <button
          onClick={syncFromDocs}
          disabled={syncing}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/40 disabled:opacity-50 font-medium"
        >
          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing from docs…' : 'Sync from docs'}
        </button>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!loading && (
        <>
          {/* Overdue alert */}
          {overdue.length > 0 && (
            <div
              className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-2xl p-4 cursor-pointer animate-staggerIn"
              onClick={() => router.push('/deadlines')}
            >
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-semibold mb-2">
                <AlertTriangle size={14} /> {overdue.length} Overdue Deadline{overdue.length > 1 ? 's' : ''}
              </div>
              <ul className="space-y-1">
                {overdue.map((d) => (
                  <li key={d.id} className="text-sm text-red-700 dark:text-red-300 truncate">
                    {d.title} — {Math.abs(daysUntil(d.due_date))}d ago
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Net worth + breakdown */}
          {accounts.length > 0 && (
            <div
              className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 cursor-pointer active:scale-[0.98] transition-transform animate-staggerIn"
              style={{ animationDelay: '50ms' }}
              onClick={() => router.push('/finance')}
            >
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-3">
                <TrendingUp size={14} /> Net Worth
              </div>
              <p className={`text-2xl font-bold mb-3 ${netWorth >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                {fmt(netWorth)}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl px-3 py-2">
                  <p className="text-emerald-600 dark:text-emerald-400 font-medium">Assets</p>
                  <p className="text-gray-800 dark:text-gray-200 font-semibold">{fmt(totalAssets)}</p>
                  <p className="text-gray-400">{assets.length} account{assets.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-950/30 rounded-xl px-3 py-2">
                  <p className="text-red-500 dark:text-red-400 font-medium">Liabilities</p>
                  <p className="text-gray-800 dark:text-gray-200 font-semibold">{fmt(totalLiabilities)}</p>
                  <p className="text-gray-400">{liabilities.length} account{liabilities.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              {totalEquity > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <Building2 size={12} /> +{fmt(totalEquity)} real estate equity across {properties.length} propert{properties.length !== 1 ? 'ies' : 'y'}
                </div>
              )}
              {/* Sparkline */}
              <div className="mt-3 -mx-1">
                <NetWorthChart compact />
              </div>
            </div>
          )}

          {/* Upcoming deadlines */}
          {upcoming.length > 0 && (
            <div
              className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 cursor-pointer active:scale-[0.98] transition-transform animate-staggerIn"
              style={{ animationDelay: '100ms' }}
              onClick={() => router.push('/deadlines')}
            >
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-3">
                <Clock size={14} /> Upcoming Deadlines
              </div>
              <ul className="space-y-2">
                {upcoming.map((d) => {
                  const days = daysUntil(d.due_date);
                  return (
                    <li key={d.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${categoryColor[d.category] ?? categoryColor.other}`}>
                          {d.category.replace('_', ' ')}
                        </span>
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{d.title}</span>
                      </div>
                      <span className={`text-xs font-medium shrink-0 ml-2 ${days <= 14 ? 'text-red-500' : days <= 30 ? 'text-orange-500' : 'text-gray-400'}`}>
                        {days === 0 ? 'Today' : `${days}d`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Enhanced empty state when nothing set up yet */}
          {accounts.length === 0 && properties.length === 0 && deadlines.length === 0 && (
            <div className="space-y-3 animate-staggerIn">
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-sky-50 dark:bg-sky-950/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <MessageCircle size={28} className="text-sky-500" />
                </div>
                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Welcome to Second Brain</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-xs mx-auto">Get started by adding your financial data or uploading documents</p>
              </div>
              {[
                { label: 'Add accounts & net worth', icon: DollarSign, href: '/finance', desc: 'Track your assets and liabilities' },
                { label: 'Upload documents', icon: FileText, href: '/documents', desc: 'PDF, text, and markdown files' },
                { label: 'Track rental properties', icon: Building2, href: '/rentals', desc: 'Monitor NOI, cashflow, and cap rates' },
                { label: 'Run a tax scenario', icon: Calculator, href: '/scenarios', desc: 'ISO, capital gains, RNOR, and more' },
              ].map(({ label, icon: Icon, href, desc }, i) => (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  className="w-full flex items-center gap-3 bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 text-left hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-[0.98] transition-transform animate-staggerIn"
                  style={{ animationDelay: `${(i + 1) * 60}ms` }}
                >
                  <div className="w-10 h-10 bg-sky-50 dark:bg-sky-950/30 rounded-xl flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-sky-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
