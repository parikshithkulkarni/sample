'use client';

import { useEffect, useState } from 'react';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';

interface Doc {
  id: string;
  name: string;
  tags: string[];
  summary: string | null;
  insights: string[] | null;
  added_at: string;
}

interface Props {
  refresh?: number;
}

const TAG_COLORS = [
  'bg-sky-100 text-sky-700',
  'bg-purple-100 text-purple-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
];

export default function DocumentList({ refresh = 0 }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    setFetchError('');
    fetch('/api/documents')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setDocs(data);
        } else {
          setFetchError(data?.error ?? 'Unknown error loading documents');
        }
      })
      .catch((e) => setFetchError(e?.message ?? 'Failed to fetch'));
  }, [refresh]);

  async function remove(id: string) {
    if (!confirm('Delete this document and all its indexed chunks?')) return;
    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  if (fetchError) {
    return <p className="text-center text-red-400 text-sm py-6">Error: {fetchError}</p>;
  }

  if (docs.length === 0) {
    return <p className="text-center text-gray-400 text-sm py-10">No documents yet. Upload one above.</p>;
  }

  return (
    <ul className="space-y-3">
      {docs.map((d, i) => (
        <li key={d.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{d.name}</p>
                {d.summary && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{d.summary}</p>}
                <div className="flex flex-wrap gap-1 mt-2">
                  {d.tags?.map((tag, ti) => (
                    <span key={ti} className={`text-xs px-2 py-0.5 rounded-full ${TAG_COLORS[(i + ti) % TAG_COLORS.length]}`}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {d.insights && d.insights.length > 0 && (
                  <button
                    onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                    className="text-sky-500 hover:text-sky-700"
                  >
                    {expanded === d.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                )}
                <button onClick={() => remove(d.id)} className="text-gray-300 hover:text-red-400">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>

          {expanded === d.id && d.insights && (
            <div className="border-t border-gray-100 px-4 py-3 bg-sky-50">
              <p className="text-xs font-medium text-sky-700 mb-2">AI Insights</p>
              <ul className="space-y-1">
                {d.insights.map((insight, j) => (
                  <li key={j} className="text-sm text-gray-700 flex gap-2">
                    <span className="text-sky-500 shrink-0">•</span> {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
