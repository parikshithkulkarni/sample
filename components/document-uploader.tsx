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

const MAX_PDF_BYTES = 3.5 * 1024 * 1024; // 3.5 MB — fits in Vercel's 4.5 MB limit as base64
const MAX_TEXT_BYTES = 25 * 1024 * 1024;  // 25 MB for txt/md
const CHUNKS_PER_BATCH = 400;             // ~800 KB per batch at 2000 chars/chunk

// Simple client-side text chunker matching server-side logic
function splitTextToChunks(text: string, chunkSize = 2000): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = '';
  for (const para of paragraphs) {
    if ((current + para).length > chunkSize) {
      if (current.trim().length > 20) chunks.push(current.trim());
      // If a single paragraph is too long, split by sentences
      if (para.length > chunkSize) {
        const sentences = para.split(/(?<=\. )/);
        for (const s of sentences) {
          if ((current + s).length > chunkSize) {
            if (current.trim().length > 20) chunks.push(current.trim());
            current = s;
          } else {
            current += s;
          }
        }
      } else {
        current = para + '\n\n';
      }
    } else {
      current += para + '\n\n';
    }
  }
  if (current.trim().length > 20) chunks.push(current.trim());
  return chunks;
}

export default function DocumentUploader({ onUploaded }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [tags, setTags] = useState('');
  const [result, setResult] = useState<InsightResult | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setError('');
    setResult(null);
    setProgress('Reading file…');

    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);

    try {
      if (isPdf) {
        // PDF: send as base64 (server extracts text)
        if (file.size > MAX_PDF_BYTES) {
          throw new Error(`PDF too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 3.5 MB for PDFs.`);
        }
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);

        setProgress('Uploading…');
        const res = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, base64, tags: tagList }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json() as InsightResult;
        setResult(data);
        onUploaded(data);
        kickOffAnalysis(data.id);
      } else {
        // Text/MD: extract text client-side, upload in batches
        if (file.size > MAX_TEXT_BYTES) {
          throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 25 MB.`);
        }
        setProgress('Extracting text…');
        const text = await file.text();
        const chunks = splitTextToChunks(text);
        if (chunks.length === 0) throw new Error('No text content found in file.');

        // First batch creates the document
        setProgress(`Uploading… (batch 1)`);
        const firstBatch = chunks.slice(0, CHUNKS_PER_BATCH);
        const res = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, chunks: firstBatch, tags: tagList }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json() as InsightResult;

        // Remaining batches
        let chunksSent = firstBatch.length;
        let batch = 2;
        while (chunksSent < chunks.length) {
          setProgress(`Uploading… (batch ${batch})`);
          const slice = chunks.slice(chunksSent, chunksSent + CHUNKS_PER_BATCH);
          const r = await fetch(`/api/documents/${data.id}/chunks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chunks: slice, startIndex: chunksSent }),
          });
          if (!r.ok) throw new Error(await r.text());
          chunksSent += slice.length;
          batch++;
        }

        const final = { ...data, chunkCount: chunks.length };
        setResult(final);
        onUploaded(final);
        kickOffAnalysis(data.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress('');
    }
  }

  function kickOffAnalysis(id: string) {
    // AI summary + insights
    fetch(`/api/documents/${id}/analyze`, { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then(analyzed => { if (analyzed) { setResult(analyzed); onUploaded(analyzed); } })
      .catch(() => {});
    // Auto-extract financial/rental data into Finance + Rentals pages
    fetch(`/api/documents/${id}/extract`, { method: 'POST' }).catch(() => {});
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['pdf', 'txt', 'md'].includes(ext)) {
      setError('Unsupported file type. Please upload PDF, TXT, or MD files.');
      return;
    }
    upload(file);
  }

  return (
    <div className="space-y-3">
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="Tags (comma separated, e.g. tax, 2024)"
        className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
      />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
          dragging ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/30' : 'border-gray-200 hover:border-sky-300 dark:border-gray-700 dark:hover:border-sky-600'
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
            <p className="text-sm text-gray-500 dark:text-gray-400">{progress || 'Uploading…'}</p>
          </div>
        ) : (
          <>
            <Upload size={28} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Tap to upload or drag a file</p>
            <p className="text-xs text-gray-400 mt-1">PDF (max 3.5 MB) · TXT · MD (max 25 MB)</p>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {result && (
        <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300 font-medium text-sm">
            <CheckCircle size={16} /> {result.name} — {result.chunkCount} chunks indexed
          </div>
          {result.summary && <p className="text-sm text-gray-600 dark:text-gray-400">{result.summary}</p>}
          {result.insights && result.insights.length > 0 && (
            <ul className="space-y-1">
              {result.insights.map((insight, i) => (
                <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex gap-2">
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
