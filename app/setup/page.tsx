'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, RefreshCw, ExternalLink, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface Check {
  key: string;
  label: string;
  hint: string;
  ok: boolean;
}

interface SetupStatus {
  vars: Check[];
  dbReady: boolean;
  dbError: string;
  allRequired: boolean;
  ready: boolean;
}

const SERVICE_LINKS: Record<string, string> = {
  ANTHROPIC_API_KEY: 'https://console.anthropic.com/settings/keys',
  VOYAGE_API_KEY: 'https://dash.voyageai.com',
  DATABASE_URL: 'https://neon.tech',
  TAVILY_API_KEY: 'https://tavily.com',
};

export default function SetupPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/setup');
      setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const done = status?.ready;

  return (
    <div className="p-4 pt-6 pb-24">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Setup</h1>
        <p className="text-sm text-gray-500 mt-1">Configure your Second Brain before first use</p>
      </div>

      {/* Overall status banner */}
      {status && (
        <div className={`rounded-2xl p-4 mb-6 flex items-center gap-3 ${done ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
          {done
            ? <CheckCircle size={22} className="text-emerald-600 shrink-0" />
            : <AlertCircle size={22} className="text-amber-500 shrink-0" />}
          <div>
            <p className={`font-semibold text-sm ${done ? 'text-emerald-800' : 'text-amber-800'}`}>
              {done ? 'Everything is configured — you\'re good to go!' : 'Complete the steps below to activate your Second Brain'}
            </p>
            {done && (
              <Link href="/" className="text-xs text-emerald-700 underline mt-0.5 inline-block">
                Go to dashboard →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Step 1 — Deploy to Vercel */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Step 1 — Deploy</h2>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <p className="text-sm text-gray-700">
            Push this repo to GitHub, then import it on Vercel. Vercel detects Next.js automatically — no config needed.
          </p>
          <ol className="space-y-2 text-sm text-gray-600 list-decimal list-inside">
            <li>Go to <span className="font-mono bg-gray-100 px-1 rounded text-xs">vercel.com/new</span></li>
            <li>Import the <span className="font-mono bg-gray-100 px-1 rounded text-xs">parikshithkulkarni/sample</span> repo</li>
            <li>Add environment variables (Step 2 below)</li>
            <li>Click <strong>Deploy</strong> — done</li>
          </ol>
          <a
            href="https://vercel.com/new"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 w-full justify-center bg-black text-white rounded-xl py-2.5 text-sm font-medium"
          >
            Open Vercel <ExternalLink size={14} />
          </a>
        </div>
      </section>

      {/* Step 2 — Env vars */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Step 2 — Environment Variables</h2>
          <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs text-sky-600">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div className="space-y-2">
          {status?.vars.map((v) => (
            <div key={v.key} className={`bg-white rounded-2xl px-4 py-3 shadow-sm border flex items-start gap-3 ${v.ok ? 'border-emerald-100' : 'border-gray-100'}`}>
              {v.ok
                ? <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                : <XCircle size={18} className="text-red-400 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-gray-700 font-semibold">{v.key}</span>
                  {SERVICE_LINKS[v.key] && !v.ok && (
                    <a href={SERVICE_LINKS[v.key]} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 text-xs text-sky-600 flex items-center gap-0.5">
                      Get key <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{v.hint}</p>
              </div>
            </div>
          ))}
        </div>

        {/* How to add env vars in Vercel */}
        {status && !status.allRequired && (
          <div className="mt-3 bg-sky-50 border border-sky-100 rounded-2xl p-4">
            <p className="text-xs font-semibold text-sky-800 mb-2">How to add env vars in Vercel:</p>
            <ol className="text-xs text-sky-700 space-y-1 list-decimal list-inside">
              <li>Project dashboard → Settings → Environment Variables</li>
              <li>Add each variable above</li>
              <li>Redeploy (Deployments → Redeploy)</li>
            </ol>
          </div>
        )}
      </section>

      {/* Step 3 — Database */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Step 3 — Database</h2>
        <div className={`bg-white rounded-2xl p-4 shadow-sm border flex items-start gap-3 ${status?.dbReady ? 'border-emerald-100' : 'border-gray-100'}`}>
          {status?.dbReady
            ? <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5" />
            : <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800">
              {status?.dbReady ? 'Database ready' : 'Database not migrated yet'}
            </p>
            {status?.dbError && <p className="text-xs text-amber-600 mt-0.5">{status.dbError}</p>}
            {!status?.dbReady && (
              <p className="text-xs text-gray-500 mt-1">
                Tables are created <strong>automatically</strong> on first app startup. Just make sure <span className="font-mono bg-gray-100 px-1 rounded">DATABASE_URL</span> is set and the <strong>pgvector</strong> extension is enabled in your Neon project (Settings → Extensions → enable <span className="font-mono bg-gray-100 px-1 rounded">vector</span>).
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Done */}
      {done && (
        <Link
          href="/"
          className="flex items-center justify-center gap-2 w-full bg-sky-600 text-white rounded-2xl py-4 text-sm font-semibold"
        >
          Open Second Brain <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
