'use client';

import { useEffect, useState } from 'react';
import { Trash2, ChevronDown, ChevronUp, Sparkles, Loader2, Check, X, ChevronRight } from 'lucide-react';

interface Doc {
  id: string;
  name: string;
  tags: string[];
  summary: string | null;
  insights: string[] | null;
  added_at: string;
  extracted_at: string | null;
}

interface ExtractedAccount {
  name: string;
  type: string;
  category: string;
  balance: number | null;
  currency: string;
  notes: string;
  _include: boolean;
}

interface ExtractedProperty {
  address: string;
  purchase_price: number | null;
  purchase_date: string | null;
  market_value: number | null;
  mortgage_balance: number | null;
  monthly_rent: number | null;
  notes: string;
  _include: boolean;
}

interface ReviewState {
  docId: string;
  loading: boolean;
  accounts: ExtractedAccount[];
  properties: ExtractedProperty[];
  saving: boolean;
  saved: boolean;
  error: string;
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

const ASSET_SUGGESTIONS = ['401k','roth_ira','brokerage','rsu','espp','nso_options','iso_options','real_estate','savings','checking','money_market','cd','treasury','bond','crypto','hsa','529_plan','life_insurance','annuity','pension','startup_equity','business_interest','employment_income','tax_prepayment','interest_income','dividend_income','other'];
const LIABILITY_SUGGESTIONS = ['mortgage','heloc','auto_loan','credit_card','student_loan','personal_loan','tax_liability','margin_loan','other'];

function numField(
  label: string,
  value: number | null,
  onChange: (v: number | null) => void,
) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-400 w-24 shrink-0">{label}</span>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
        className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
      />
    </div>
  );
}

function strField(
  label: string,
  value: string,
  onChange: (v: string) => void,
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-400 w-24 shrink-0">{label}</span>
      <input
        {...inputProps}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
      />
    </div>
  );
}

export default function DocumentList({ refresh = 0 }: Props) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [review, setReview] = useState<ReviewState | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(attempt = 0) {
      try {
        const r = await fetch('/api/documents');
        const data = await r.json();
        if (cancelled) return;
        if (Array.isArray(data)) {
          setFetchError('');
          setRetrying(false);
          setDocs(data);
        } else if (attempt < 5) {
          setRetrying(true);
          setTimeout(() => { if (!cancelled) load(attempt + 1); }, 2000 * (attempt + 1));
        } else {
          setRetrying(false);
          setFetchError(data?.error ?? 'Database unavailable');
        }
      } catch {
        if (cancelled) return;
        if (attempt < 5) {
          setRetrying(true);
          setTimeout(() => { if (!cancelled) load(attempt + 1); }, 2000 * (attempt + 1));
        } else {
          setRetrying(false);
          setFetchError('Could not reach server');
        }
      }
    }
    setFetchError('');
    setRetrying(false);
    load();
    return () => { cancelled = true; };
  }, [refresh]);

  async function remove(id: string) {
    if (!confirm('Delete this document and all its indexed chunks?')) return;
    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    setDocs((prev) => prev.filter((d) => d.id !== id));
    if (review?.docId === id) setReview(null);
  }

  async function startReview(docId: string) {
    if (review?.docId === docId) { setReview(null); return; }
    setReview({ docId, loading: true, accounts: [], properties: [], saving: false, saved: false, error: '' });
    try {
      const res = await fetch(`/api/documents/${docId}/extract-preview`, { method: 'POST' });
      const data = await res.json() as { accounts?: ExtractedAccount[]; properties?: ExtractedProperty[]; error?: string };
      if (data.error) {
        setReview((r) => r ? { ...r, loading: false, error: data.error! } : r);
        return;
      }
      const accounts: ExtractedAccount[] = (data.accounts ?? []).map((a) => ({ ...a, notes: a.notes ?? '', _include: true }));
      const properties: ExtractedProperty[] = (data.properties ?? []).map((p) => ({ ...p, notes: p.notes ?? '', monthly_rent: (p as { monthly_rent?: number | null }).monthly_rent ?? null, _include: true }));
      setReview({ docId, loading: false, accounts, properties, saving: false, saved: false, error: '' });
    } catch (e) {
      setReview((r) => r ? { ...r, loading: false, error: String(e) } : r);
    }
  }

  async function saveReview() {
    if (!review) return;
    setReview((r) => r ? { ...r, saving: true, error: '' } : r);
    try {
      const accounts = review.accounts.filter((a) => a._include);
      const properties = review.properties.filter((p) => p._include);
      const res = await fetch(`/api/documents/${review.docId}/extract-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts, properties }),
      });
      const data = await res.json() as { saved: { accounts: string[]; properties: string[] }; error?: string };
      if (data.error) { setReview((r) => r ? { ...r, saving: false, error: data.error! } : r); return; }
      setReview((r) => r ? { ...r, saving: false, saved: true } : r);
    } catch (e) {
      setReview((r) => r ? { ...r, saving: false, error: String(e) } : r);
    }
  }

  function updateAccount(i: number, patch: Partial<ExtractedAccount>) {
    setReview((r) => r ? { ...r, accounts: r.accounts.map((a, idx) => idx === i ? { ...a, ...patch } : a) } : r);
  }

  function updateProperty(i: number, patch: Partial<ExtractedProperty>) {
    setReview((r) => r ? { ...r, properties: r.properties.map((p, idx) => idx === i ? { ...p, ...patch } : p) } : r);
  }

  if (retrying) return <p className="text-center text-gray-400 text-sm py-6 animate-pulse">Setting up database…</p>;
  if (fetchError) return <p className="text-center text-red-400 text-sm py-6">Error: {fetchError}</p>;
  if (docs.length === 0) return <p className="text-center text-gray-400 text-sm py-10">No documents yet. Upload one above.</p>;

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
                  {d.extracted_at && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      ✓ extracted
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => startReview(d.id)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${
                    review?.docId === d.id
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
                  }`}
                  title="Extract & Review financial data"
                >
                  {review?.docId === d.id && review.loading
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Sparkles size={12} />}
                  Extract
                </button>
                {d.insights && d.insights.length > 0 && (
                  <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} className="text-sky-500 hover:text-sky-700">
                    {expanded === d.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                )}
                <button onClick={() => remove(d.id)} className="text-gray-300 hover:text-red-400">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* AI Insights */}
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

          {/* Extract & Review panel */}
          {review?.docId === d.id && !review.loading && (
            <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-4">
              {review.error && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{review.error}</p>
              )}

              {review.saved && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 flex items-center gap-1.5">
                  <Check size={13} /> Saved to Finance & Rentals pages.
                </p>
              )}

              {review.accounts.length === 0 && review.properties.length === 0 && !review.error && (
                <p className="text-xs text-gray-400 text-center py-2">No financial data found in this document.</p>
              )}

              {/* Accounts */}
              {review.accounts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">
                    Accounts found ({review.accounts.filter((a) => a._include).length} selected)
                  </p>
                  <div className="space-y-3">
                    {review.accounts.map((acct, idx) => (
                      <div key={idx} className={`rounded-xl border p-3 space-y-2 ${acct._include ? 'border-sky-200 bg-white' : 'border-gray-200 bg-gray-100 opacity-60'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={acct._include}
                              onChange={(e) => updateAccount(idx, { _include: e.target.checked })}
                              className="rounded"
                            />
                            <input
                              value={acct.name}
                              onChange={(e) => updateAccount(idx, { name: e.target.value })}
                              className="flex-1 min-w-0 text-xs font-medium border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-400"
                            />
                          </div>
                          <select
                            value={acct.type}
                            onChange={(e) => updateAccount(idx, { type: e.target.value, category: 'other' })}
                            className="text-xs border border-gray-200 rounded-lg px-1 py-1 focus:outline-none"
                          >
                            <option value="asset">Asset</option>
                            <option value="liability">Liability</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400 w-24 shrink-0">Category</span>
                          <input
                            list="review-category-suggestions"
                            value={acct.category}
                            onChange={(e) => updateAccount(idx, { category: e.target.value })}
                            placeholder="e.g. 401k, iso_options…"
                            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-400"
                          />
                          <datalist id="review-category-suggestions">
                            {(acct.type === 'asset' ? ASSET_SUGGESTIONS : LIABILITY_SUGGESTIONS).map((c) => (
                              <option key={c} value={c} />
                            ))}
                          </datalist>
                        </div>
                        {numField('Balance ($)', acct.balance, (v) => updateAccount(idx, { balance: v }))}
                        {strField('Notes', acct.notes, (v) => updateAccount(idx, { notes: v }))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Properties */}
              {review.properties.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">
                    Properties found ({review.properties.filter((p) => p._include).length} selected)
                  </p>
                  <div className="space-y-3">
                    {review.properties.map((prop, idx) => (
                      <div key={idx} className={`rounded-xl border p-3 space-y-2 ${prop._include ? 'border-sky-200 bg-white' : 'border-gray-200 bg-gray-100 opacity-60'}`}>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={prop._include}
                            onChange={(e) => updateProperty(idx, { _include: e.target.checked })}
                            className="rounded shrink-0"
                          />
                          <input
                            value={prop.address}
                            onChange={(e) => updateProperty(idx, { address: e.target.value })}
                            className="flex-1 min-w-0 text-xs font-medium border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-400"
                          />
                        </div>
                        {numField('Purchase $', prop.purchase_price, (v) => updateProperty(idx, { purchase_price: v }))}
                        {strField('Purchase date', prop.purchase_date ?? '', (v) => updateProperty(idx, { purchase_date: v || null }), { type: 'date' })}
                        {numField('Market value $', prop.market_value, (v) => updateProperty(idx, { market_value: v }))}
                        {numField('Mortgage bal $', prop.mortgage_balance, (v) => updateProperty(idx, { mortgage_balance: v }))}
                        {numField('Monthly rent $', prop.monthly_rent, (v) => updateProperty(idx, { monthly_rent: v }))}
                        {strField('Notes', prop.notes, (v) => updateProperty(idx, { notes: v }))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              {(review.accounts.length > 0 || review.properties.length > 0) && !review.saved && (
                <div className="flex gap-2">
                  <button
                    onClick={saveReview}
                    disabled={review.saving}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-sky-600 text-white rounded-xl py-2.5 text-xs font-medium disabled:opacity-50"
                  >
                    {review.saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {review.saving ? 'Saving…' : 'Confirm & Save'}
                  </button>
                  <button
                    onClick={() => setReview(null)}
                    className="px-4 rounded-xl border border-gray-200 text-xs text-gray-500 hover:bg-gray-100"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {review.saved && (
                <button onClick={() => setReview(null)} className="w-full text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1">
                  <ChevronRight size={13} /> Done
                </button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
