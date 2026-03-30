'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Clock, TrendingUp, AlertTriangle, Building2, DollarSign, Calculator } from 'lucide-react';
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/deadlines').then((r) => r.json()).then((d: Deadline[]) => setDeadlines(Array.isArray(d) ? d : []));
    fetch('/api/finance').then((r) => r.json()).then((a: Account[]) => setAccounts(Array.isArray(a) ? a : []));
    fetch('/api/rentals').then((r) => r.json()).then((p: Property[]) => setProperties(Array.isArray(p) ? p : []));
  }, []);

  const assets = accounts.filter((a) => a.type === 'asset');
  const liabilities = accounts.filter((a) => a.type === 'liability');
  const totalAssets = assets.reduce((s, a) => s + Number(a.balance), 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + Number(a.balance), 0);
  const netWorth = totalAssets - totalLiabilities;
  const totalEquity = properties.reduce((s, p) => {
    if (p.market_value && p.mortgage_balance) return s + Number(p.market_value) - Number(p.mortgage_balance);
    return s;
  }, 0);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = deadlines.filter((d) => !d.is_done && daysUntil(d.due_date) < 0);
  const upcoming = deadlines.filter((d) => !d.is_done && daysUntil(d.due_date) >= 0).slice(0, 3);

  function handleQuickAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!quickQ.trim()) return;
    router.push(`/chat?q=${encodeURIComponent(quickQ.trim())}`);
  }

  const categoryColor: Record<string, string> = {
    tax_us:    'bg-red-100 text-red-700',
    tax_india: 'bg-orange-100 text-orange-700',
    visa:      'bg-purple-100 text-purple-700',
    property:  'bg-blue-100 text-blue-700',
    other:     'bg-gray-100 text-gray-700',
  };

  return (
    <div className="space-y-4">
      {/* Quick ask */}
      <form onSubmit={handleQuickAsk} className="flex gap-2">
        <input
          ref={inputRef}
          value={quickQ}
          onChange={(e) => setQuickQ(e.target.value)}
          placeholder="Ask your brain anything..."
          className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white shadow-sm"
        />
        <button
          type="submit"
          disabled={!quickQ.trim()}
          className="w-12 h-12 bg-sky-600 rounded-xl flex items-center justify-center text-white disabled:opacity-40 shrink-0"
        >
          <Send size={18} />
        </button>
      </form>

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <div
          className="bg-red-50 border border-red-200 rounded-2xl p-4 cursor-pointer"
          onClick={() => router.push('/deadlines')}
        >
          <div className="flex items-center gap-2 text-red-600 text-xs font-semibold mb-2">
            <AlertTriangle size={14} /> {overdue.length} Overdue Deadline{overdue.length > 1 ? 's' : ''}
          </div>
          <ul className="space-y-1">
            {overdue.map((d) => (
              <li key={d.id} className="text-sm text-red-700 truncate">
                {d.title} — {Math.abs(daysUntil(d.due_date))}d ago
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Net worth + breakdown */}
      {accounts.length > 0 && (
        <div
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer active:scale-[0.98] transition-transform"
          onClick={() => router.push('/finance')}
        >
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-3">
            <TrendingUp size={14} /> Net Worth
          </div>
          <p className={`text-2xl font-bold mb-3 ${netWorth >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {fmt(netWorth)}
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-emerald-50 rounded-xl px-3 py-2">
              <p className="text-emerald-600 font-medium">Assets</p>
              <p className="text-gray-800 font-semibold">{fmt(totalAssets)}</p>
              <p className="text-gray-400">{assets.length} account{assets.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="bg-red-50 rounded-xl px-3 py-2">
              <p className="text-red-500 font-medium">Liabilities</p>
              <p className="text-gray-800 font-semibold">{fmt(totalLiabilities)}</p>
              <p className="text-gray-400">{liabilities.length} account{liabilities.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {totalEquity > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
              <Building2 size={12} /> +{fmt(totalEquity)} real estate equity across {properties.length} propert{properties.length !== 1 ? 'ies' : 'y'}
            </div>
          )}
        </div>
      )}

      {/* Upcoming deadlines */}
      {upcoming.length > 0 && (
        <div
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer active:scale-[0.98] transition-transform"
          onClick={() => router.push('/deadlines')}
        >
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-3">
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
                    <span className="text-sm text-gray-700 truncate">{d.title}</span>
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

      {/* Quick actions when nothing set up yet */}
      {accounts.length === 0 && properties.length === 0 && deadlines.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 text-center mb-3">Get started — add your financial data</p>
          {[
            { label: 'Add accounts & net worth', icon: DollarSign, href: '/finance' },
            { label: 'Track rental properties', icon: Building2, href: '/rentals' },
            { label: 'Run a tax scenario', icon: Calculator, href: '/scenarios' },
          ].map(({ label, icon: Icon, href }) => (
            <button
              key={href}
              onClick={() => router.push(href)}
              className="w-full flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-sm text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-transform"
            >
              <Icon size={18} className="text-sky-500 shrink-0" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
