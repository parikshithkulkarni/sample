'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, RefreshCw, ExternalLink, ArrowRight, Copy, Check } from 'lucide-react';
import Link from 'next/link';

interface EnvVar {
  key: string;
  label: string;
  hint: string;
  ok: boolean;
}

interface SetupStatus {
  vars: EnvVar[];
  dbReady: boolean;
  dbError: string;
  allRequired: boolean;
  ready: boolean;
}

const SERVICE_LINKS: Record<string, { url: string; cta: string }> = {
  ANTHROPIC_API_KEY:  { url: 'https://console.anthropic.com/settings/keys',  cta: 'Get key' },
  VOYAGE_API_KEY:     { url: 'https://dash.voyageai.com',                     cta: 'Get key' },
  DATABASE_URL:       { url: 'https://neon.tech',                             cta: 'Create DB' },
  TAVILY_API_KEY:     { url: 'https://app.tavily.com',                        cta: 'Get key' },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  }, [text]);

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 font-mono text-xs bg-gray-100 hover:bg-gray-200 active:bg-gray-300 px-2 py-0.5 rounded transition-colors"
      title="Tap to copy"
    >
      {copied ? <Check size={10} className="text-emerald-600" /> : <Copy size={10} className="text-gray-400" />}
      <span className={copied ? 'text-emerald-600' : 'text-gray-700'}>{copied ? 'Copied!' : text}</span>
    </button>
  );
}

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
    <div className="p-4 pt-6 pb-24 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Setup</h1>
        <p className="text-sm text-gray-500 mt-1">Get your Second Brain running in ~10 minutes</p>
      </div>

      {/* Status banner */}
      {status && (
        <div className={`rounded-2xl p-4 mb-6 flex items-center gap-3 ${done ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
          {done
            ? <CheckCircle size={22} className="text-emerald-600 shrink-0" />
            : <AlertCircle size={22} className="text-amber-500 shrink-0" />}
          <div>
            <p className={`font-semibold text-sm ${done ? 'text-emerald-800' : 'text-amber-800'}`}>
              {done ? "You're all set — Second Brain is ready!" : 'Complete the steps below to go live'}
            </p>
            {done && (
              <Link href="/" className="text-xs text-emerald-700 underline mt-0.5 inline-block">
                Go to dashboard →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Step 1 — Deploy */}
      <section className="mb-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Step 1 — Deploy to Vercel</h2>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <ol className="space-y-2 text-sm text-gray-600 list-decimal list-inside">
            <li>Open <strong>vercel.com/new</strong></li>
            <li>Import <CopyButton text="parikshithkulkarni/sample" /></li>
            <li>Add env vars from Step 2 below</li>
            <li>Click <strong>Deploy</strong> — every future push auto-deploys</li>
          </ol>
          <a
            href="https://vercel.com/new"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 w-full justify-center bg-black text-white rounded-xl py-3 text-sm font-semibold"
          >
            Open Vercel <ExternalLink size={14} />
          </a>
        </div>
      </section>

      {/* Step 2 — Env vars */}
      <section className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Step 2 — Environment Variables</h2>
          <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs text-sky-600">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          Tap any variable name to copy it. Paste into Vercel → Settings → Environment Variables.
        </p>

        <div className="space-y-2">
          {status?.vars.map((v) => (
            <div
              key={v.key}
              className={`bg-white rounded-2xl px-4 py-3 shadow-sm border flex items-start gap-3 ${v.ok ? 'border-emerald-100' : 'border-gray-100'}`}
            >
              {v.ok
                ? <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                : <XCircle size={18} className="text-red-400 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CopyButton text={v.key} />
                  {SERVICE_LINKS[v.key] && !v.ok && (
                    <a
                      href={SERVICE_LINKS[v.key].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs text-sky-600 flex items-center gap-0.5 font-medium"
                    >
                      {SERVICE_LINKS[v.key].cta} <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">{v.hint}</p>
              </div>
            </div>
          ))}
        </div>

        {status && !status.allRequired && (
          <div className="mt-3 bg-sky-50 border border-sky-100 rounded-2xl p-4">
            <p className="text-xs font-semibold text-sky-800 mb-1">How to add in Vercel:</p>
            <p className="text-xs text-sky-700">Project → Settings → Environment Variables → paste name + value → Save → Redeploy</p>
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
              {status?.dbReady ? 'Database schema ready' : 'Database not set up yet'}
            </p>
            {status?.dbError
              ? <p className="text-xs text-amber-600 mt-0.5">{status.dbError}</p>
              : !status?.dbReady && (
                <div className="text-xs text-gray-500 mt-1 space-y-1">
                  <p>1. Sign up at <a href="https://neon.tech" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline">neon.tech</a> → New Project → copy the connection string</p>
                  <p>2. In your Neon project: <strong>Settings → Extensions → enable <CopyButton text="vector" /></strong></p>
                  <p>3. Paste the connection string as <CopyButton text="DATABASE_URL" /> in Vercel</p>
                  <p className="text-emerald-700 font-medium mt-1">✓ Tables create automatically on first deploy — no SQL to run</p>
                </div>
              )}
          </div>
        </div>
      </section>

      {/* Done CTA */}
      {done ? (
        <Link
          href="/"
          className="flex items-center justify-center gap-2 w-full bg-sky-600 text-white rounded-2xl py-4 text-sm font-semibold"
        >
          Open Second Brain <ArrowRight size={16} />
        </Link>
      ) : (
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-600 rounded-2xl py-4 text-sm font-medium"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Check status
        </button>
      )}
    </div>
  );
}
