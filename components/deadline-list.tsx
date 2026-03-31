'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Circle, Trash2, Plus, CalendarX, Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { daysUntil } from '@/lib/utils';
import { SkeletonList } from '@/components/skeleton';
import { useToast } from '@/components/toast';

interface Deadline {
  id: string;
  title: string;
  due_date: string;
  category: string;
  notes: string | null;
  ai_context: string | null;
  is_done: boolean;
  is_recurring: boolean;
}

const CATEGORIES = ['tax_us', 'tax_india', 'visa', 'property', 'other'] as const;

const categoryLabel: Record<string, string> = {
  tax_us: 'US Tax',
  tax_india: 'India Tax',
  visa: 'Visa/Immigration',
  property: 'Property',
  other: 'Other',
};

const categoryColor: Record<string, string> = {
  tax_us: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  tax_india: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  visa: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  property: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

export default function DeadlineList() {
  const { addToast } = useToast();
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', due_date: '', category: 'other', notes: '' });
  const [enriching, setEnriching] = useState<string | null>(null);
  const [expandedContext, setExpandedContext] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/deadlines').then((r) => r.json()).then((d) => { setDeadlines(Array.isArray(d) ? d : d?.data ?? []); setLoading(false); });
  }, []);

  async function toggleDone(d: Deadline) {
    // Optimistic update: immediately toggle in state
    setDeadlines((prev) => prev.map((x) => x.id === d.id ? { ...x, is_done: !x.is_done } : x));
    try {
      const res = await fetch(`/api/deadlines/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_done: !d.is_done }),
      });
      if (!res.ok) throw new Error('Failed to update');
    } catch {
      // Revert on error with user feedback
      setDeadlines((prev) => prev.map((x) => x.id === d.id ? { ...x, is_done: d.is_done } : x));
      addToast('Failed to update deadline', 'error');
    }
  }

  async function remove(id: string) {
    await fetch(`/api/deadlines/${id}`, { method: 'DELETE' });
    setDeadlines((prev) => prev.filter((d) => d.id !== id));
  }

  async function enrichDeadline(id: string) {
    setEnriching(id);
    try {
      const res = await fetch(`/api/deadlines/${id}/enrich`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json() as Deadline;
        setDeadlines((prev) => prev.map((d) => d.id === id ? { ...d, ai_context: updated.ai_context } : d));
        setExpandedContext(id);
      }
    } catch { /* non-fatal */ }
    finally { setEnriching(null); }
  }

  async function addDeadline(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/deadlines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const newD = await res.json() as Deadline;
    setDeadlines((prev) => [...prev, newD].sort((a, b) => a.due_date.localeCompare(b.due_date)));
    setForm({ title: '', due_date: '', category: 'other', notes: '' });
    setAdding(false);
  }

  const byCategory = CATEGORIES.map((cat) => ({
    cat,
    items: deadlines.filter((d) => d.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200">All Deadlines</h2>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1 text-sm text-sky-600 font-medium"
        >
          <Plus size={16} /> Add
        </button>
      </div>

      {adding && (
        <form onSubmit={addDeadline} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3 dark:bg-gray-900 dark:border-gray-800">
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
          <input required type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
            {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
          </select>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes (optional)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100" />
          <button type="submit" className="w-full bg-sky-600 text-white rounded-xl py-2.5 text-sm font-medium">Save Deadline</button>
        </form>
      )}

      {loading && (
        <div className="space-y-4">
          <SkeletonList />
          <SkeletonList />
          <SkeletonList />
        </div>
      )}

      {!loading && deadlines.length === 0 && (
        <div className="text-center py-12">
          <div className="w-14 h-14 bg-sky-50 dark:bg-sky-950/30 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <CalendarX size={24} className="text-sky-500" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No deadlines yet</p>
          <p className="text-xs text-gray-400 mt-1">Add your first deadline to start tracking important dates</p>
        </div>
      )}

      {!loading && byCategory.map(({ cat, items }) => (
        <div key={cat}>
          <h3 className={`text-xs font-semibold px-2 py-1 rounded-full inline-block mb-3 ${categoryColor[cat]}`}>
            {categoryLabel[cat]}
          </h3>
          <ul className="space-y-2">
            {items.map((d) => {
              const days = daysUntil(d.due_date);
              return (
                <li
                  key={d.id}
                  className={`flex items-start gap-3 bg-white rounded-2xl p-4 shadow-sm border dark:bg-gray-900 ${d.is_done ? 'opacity-50 border-gray-100 dark:border-gray-800' : 'border-gray-100 dark:border-gray-800'}`}
                >
                  <button onClick={() => toggleDone(d)} className="mt-0.5 shrink-0">
                    {d.is_done ? <CheckCircle size={20} className="text-emerald-500" /> : <Circle size={20} className="text-gray-300" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${d.is_done ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-200'}`}>{d.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(d.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {!d.is_done && (
                        <span className={`ml-2 font-medium ${days <= 7 ? 'text-red-500' : days <= 30 ? 'text-orange-500' : 'text-gray-400'}`}>
                          {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today!' : `${days} days`}
                        </span>
                      )}
                    </p>
                    {d.notes && <p className="text-xs text-gray-400 mt-1">{d.notes}</p>}
                    {/* AI context */}
                    {d.ai_context && (
                      <button
                        onClick={() => setExpandedContext(expandedContext === d.id ? null : d.id)}
                        className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-1.5 hover:underline"
                      >
                        <Sparkles size={10} /> AI Context
                        {expandedContext === d.id ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </button>
                    )}
                    {expandedContext === d.id && d.ai_context && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1.5 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2 whitespace-pre-wrap">{d.ai_context}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {!d.ai_context && (
                      <button
                        onClick={() => enrichDeadline(d.id)}
                        disabled={enriching === d.id}
                        className="text-gray-300 hover:text-amber-500 disabled:opacity-50"
                        title="Generate AI context"
                      >
                        {enriching === d.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      </button>
                    )}
                    <button onClick={() => remove(d.id)} className="text-gray-300 hover:text-red-400">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
