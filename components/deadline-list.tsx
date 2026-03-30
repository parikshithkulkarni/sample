'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Circle, Trash2, Plus } from 'lucide-react';
import { daysUntil } from '@/lib/utils';

interface Deadline {
  id: string;
  title: string;
  due_date: string;
  category: string;
  notes: string | null;
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
  tax_us: 'bg-red-100 text-red-700',
  tax_india: 'bg-orange-100 text-orange-700',
  visa: 'bg-purple-100 text-purple-700',
  property: 'bg-blue-100 text-blue-700',
  other: 'bg-gray-100 text-gray-700',
};

export default function DeadlineList() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', due_date: '', category: 'other', notes: '' });

  useEffect(() => {
    fetch('/api/deadlines').then((r) => r.json()).then((d) => setDeadlines(Array.isArray(d) ? d : d?.data ?? []));
  }, []);

  async function toggleDone(d: Deadline) {
    await fetch(`/api/deadlines/${d.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_done: !d.is_done }),
    });
    setDeadlines((prev) => prev.map((x) => x.id === d.id ? { ...x, is_done: !x.is_done } : x));
  }

  async function remove(id: string) {
    await fetch(`/api/deadlines/${id}`, { method: 'DELETE' });
    setDeadlines((prev) => prev.filter((d) => d.id !== id));
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
        <h2 className="font-semibold text-gray-800">All Deadlines</h2>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-1 text-sm text-sky-600 font-medium"
        >
          <Plus size={16} /> Add
        </button>
      </div>

      {adding && (
        <form onSubmit={addDeadline} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          <input required type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
            {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
          </select>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes (optional)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          <button type="submit" className="w-full bg-sky-600 text-white rounded-xl py-2.5 text-sm font-medium">Save Deadline</button>
        </form>
      )}

      {byCategory.map(({ cat, items }) => (
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
                  className={`flex items-start gap-3 bg-white rounded-2xl p-4 shadow-sm border ${d.is_done ? 'opacity-50 border-gray-100' : 'border-gray-100'}`}
                >
                  <button onClick={() => toggleDone(d)} className="mt-0.5 shrink-0">
                    {d.is_done ? <CheckCircle size={20} className="text-emerald-500" /> : <Circle size={20} className="text-gray-300" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${d.is_done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{d.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(d.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {!d.is_done && (
                        <span className={`ml-2 font-medium ${days <= 7 ? 'text-red-500' : days <= 30 ? 'text-orange-500' : 'text-gray-400'}`}>
                          {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today!' : `${days} days`}
                        </span>
                      )}
                    </p>
                    {d.notes && <p className="text-xs text-gray-400 mt-1">{d.notes}</p>}
                  </div>
                  <button onClick={() => remove(d.id)} className="text-gray-300 hover:text-red-400 shrink-0">
                    <Trash2 size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
