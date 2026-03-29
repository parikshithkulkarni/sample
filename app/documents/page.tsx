'use client';

import { useState } from 'react';
import DocumentUploader from '@/components/document-uploader';
import DocumentList from '@/components/document-list';
import { Sparkles, Loader2 } from 'lucide-react';

export default function DocumentsPage() {
  const [refresh, setRefresh] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<string>('');

  async function extractAll() {
    setExtracting(true);
    setExtractResult('');
    try {
      const res = await fetch('/api/documents/extract-all', { method: 'POST' });
      const data = await res.json() as { processed: number; results: { name: string; accounts: string[]; properties: string[] }[] };
      const newAccounts = data.results.flatMap(r => r.accounts).length;
      const newProps = data.results.flatMap(r => r.properties).length;
      setExtractResult(
        newAccounts + newProps === 0
          ? `Scanned ${data.processed} documents — no new data found.`
          : `Found ${newAccounts} account${newAccounts !== 1 ? 's' : ''} and ${newProps} propert${newProps !== 1 ? 'ies' : 'y'} across ${data.processed} documents.`
      );
    } catch {
      setExtractResult('Extraction failed — try again.');
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="p-4 pt-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="text-sm text-gray-500">Upload documents to make them searchable</p>
        </div>
        <button
          onClick={extractAll}
          disabled={extracting}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 disabled:opacity-50"
        >
          {extracting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {extracting ? 'Scanning…' : 'Extract from all docs'}
        </button>
      </div>

      {extractResult && (
        <p className="text-sm text-sky-700 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2">{extractResult}</p>
      )}

      <DocumentUploader onUploaded={() => setRefresh((n) => n + 1)} />

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Your Documents</h2>
        <DocumentList refresh={refresh} />
      </div>
    </div>
  );
}
