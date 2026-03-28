'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Clock, TrendingUp } from 'lucide-react';
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
  type: 'asset' | 'liability';
  balance: number;
}

interface Capture {
  id: string;
  name: string;
  added_at: string;
}

export default function DashboardCards() {
  const router = useRouter();
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [quickQ, setQuickQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/deadlines').then((r) => r.json()).then((d: Deadline[]) => setDeadlines(d));
    fetch('/api/finance').then((r) => r.json()).then((a: Account[]) => setAccounts(a));
    // Recent captures = docs with 'capture' tag
    fetch('/api/documents').then((r) => r.json()).then((docs: Capture[]) =>
      setCaptures(docs.slice(0, 3))
    );
  }, []);

  const upcoming = deadlines.filter((d) => !d.is_done).slice(0, 3);
  const netWorth =
    accounts.reduce((s, a) => s + (a.type === 'asset' ? Number(a.balance) : -Number(a.balance)), 0);

  function handleQuickAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!quickQ.trim()) return;
    const encoded = encodeURIComponent(quickQ.trim());
    router.push(`/chat?q=${encoded}`);
  }

  const categoryColor: Record<string, string> = {
    tax_us: 'bg-red-100 text-red-700',
    tax_india: 'bg-orange-100 text-orange-700',
    visa: 'bg-purple-100 text-purple-700',
    property: 'bg-blue-100 text-blue-700',
    other: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="space-y-5">
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

      {/* Net worth */}
      {accounts.length > 0 && (
        <div
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 cursor-pointer active:scale-[0.98] transition-transform"
          onClick={() => router.push('/finance')}
        >
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
            <TrendingUp size={14} /> Net Worth
          </div>
          <p className={`text-2xl font-bold ${netWorth >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {fmt(netWorth)}
          </p>
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
                    {days === 0 ? 'Today' : days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Recent captures */}
      {captures.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-3">Recent Captures</p>
          <ul className="space-y-1.5">
            {captures.map((c) => (
              <li key={c.id} className="text-sm text-gray-700 truncate">{c.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
