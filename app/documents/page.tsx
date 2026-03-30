'use client';

import { useState } from 'react';
import DocumentUploader from '@/components/document-uploader';
import DocumentList from '@/components/document-list';
import { RefreshCw, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

export default function DocumentsPage() {
  const [refresh, setRefresh]         = useState(0);
  const [reindexing, setReindexing]   = useState(false);
  const [reindexMsg, setReindexMsg]   = useState('');
  const [reindexErr, setReindexErr]   = useState('');

  async function reindex() {
    setReindexing(true); setReindexMsg(''); setReindexErr('');
    try {
      const res  = await fetch('/api/documents/reindex', { method: 'POST' });
      const data = await res.json() as { reindexed: number; remaining: number; message: string; error?: string };
      if (data.error) { setReindexErr(data.error); return; }
      setReindexMsg(data.message);
    } catch (e) {
      setReindexErr(String(e));
    } finally {
      setReindexing(false);
    }
  }

  return (
    <div className="p-4 pt-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="text-sm text-gray-500">Upload docs — tap Extract to review and save financial data</p>
        </div>
        <button
          onClick={reindex}
          disabled={reindexing}
          title="Generate semantic embeddings for all documents (requires OPENAI_API_KEY)"
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
        >
          {reindexing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Re-index
        </button>
      </div>

      {reindexMsg && (
        <p className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
          <CheckCircle size={14} /> {reindexMsg}
        </p>
      )}
      {reindexErr && (
        <p className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <AlertCircle size={14} /> {reindexErr}
        </p>
      )}

      <DocumentUploader onUploaded={() => setRefresh((n) => n + 1)} />

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Your Documents</h2>
        <DocumentList refresh={refresh} />
      </div>
    </div>
  );
}
