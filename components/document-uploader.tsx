'use client';

import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';

interface InsightResult {
  id: string;
  name: string;
  summary: string | null;
  insights: string[] | null;
  chunkCount: number;
}

interface Props {
  onUploaded: (doc: InsightResult) => void;
}

export default function DocumentUploader({ onUploaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tags, setTags] = useState('');
  const [result, setResult] = useState<InsightResult | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, base64, tags }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as InsightResult;
      setResult(data);
      onUploaded(data);
      fetch(`/api/documents/${data.id}/analyze`, { method: 'POST' })
        .then(r => r.ok ? r.json() : null)
        .then(analyzed => { if (analyzed) { setResult(analyzed); onUploaded(analyzed); } })
        .catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }

  return (
    <div className="space-y-3">
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="Tags (comma separated, e.g. tax, 2024)"
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
      />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
          dragging ? 'border-sky-500 bg-sky-50' : 'border-gray-200 hover:border-sky-300'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.md"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Ingesting & analyzing...</p>
          </div>
        ) : (
          <>
            <Upload size={28} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm font-medium text-gray-600">Tap to upload or drag a file</p>
            <p className="text-xs text-gray-400 mt-1">PDF, TXT, MD — max 4MB</p>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {result && (
        <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sky-700 font-medium text-sm">
            <CheckCircle size={16} /> {result.name} — {result.chunkCount} chunks indexed
          </div>
          {result.summary && <p className="text-sm text-gray-600">{result.summary}</p>}
          {result.insights && result.insights.length > 0 && (
            <ul className="space-y-1">
              {result.insights.map((insight, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-sky-500 shrink-0">•</span> {insight}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
