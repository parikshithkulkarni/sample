'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, RefreshCw, ExternalLink, ArrowRight, Copy, Check } from 'lucide-react';
import Link from 'next/link';

interface EnvVar {
  key: string;
  label: string;
  hint: string;
  link?: string;
  ok: boolean;
  required: boolean;
}

interface SetupStatus {
  vars: EnvVar[];
  dbReady: boolean;
  dbError: string;
  allRequired: boolean;
  ready: boolean;
}

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-1 font-mono text-xs bg-gray-100 hover:bg-gray-200 active:bg-gray-300 px-2 py-0.5 rounded transition-colors ${className}`}
      title="Tap to copy"
    >
      {copied ? <Check size={10} className="text-emerald-600 shrink-0" /> : <Copy size={10} className="text-gray-400 shrink-0" />}
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
  const required = status?.vars.filter((v) => v.required) ?? [];
  const optional = status?.vars.filter((v) => !v.required) ?? [];
  const doneCount = required.filter((v) => v.ok).length;

  return (
    <div className="p-4 pt-6 pb-24 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Setup</h1>
        <p className="text-sm text-gray-500 mt-1">~10 minutes · 1 external signup</p>
      </div>

      {/* Status banner */}
      {status && (
        <div className={`rounded-2xl p-4 mb-6 flex items-center gap-3 ${done ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
          {done
            ? <CheckCircle size={22} className="text-emerald-600 shrink-0" />
            : <AlertCircle size={22} className="text-amber-500 shrink-0" />}
          <div>
            <p className={`font-semibold text-sm ${done ? 'text-emerald-800' : 'text-amber-800'}`}>
              {done ? "All set — Second Brain is live!" : `${doneCount} of ${required.length} required steps done`}
            </p>
            {done && (
              <Link href="/" className="text-xs text-emerald-700 underline mt-0.5 inline-block">Go to dashboard →</Link>
            )}
          </div>
        </div>
      )}

      {/* Step 1 — Anthropic API key */}
      <section className="mb-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Step 1 — Get your Anthropic API key</h2>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
            <li>Open <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline">console.anthropic.com</a></li>
            <li>Sign up (free) → API Keys → Create Key → copy it</li>
            <li>Paste it as <CopyButton text="ANTHROPIC_API_KEY" /> in Vercel (Step 3)</li>
          </ol>
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 w-full justify-center bg-[#d97706] text-white rounded-xl py-2.5 text-sm font-semibold">
            Open Anthropic Console <ExternalLink size={14} />
          </a>
        </div>
      </section>

      {/* Step 2 — Deploy */}
      <section className="mb-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Step 2 — Deploy to Vercel + provision database</h2>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
            <li>Open <a href="https://vercel.com/new" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline">vercel.com/new</a> → Import <CopyButton text="parikshithkulkarni/sample" /></li>
            <li>Add 3 env vars (tap to copy each name below)</li>
            <li>Click <strong>Deploy</strong></li>
            <li>In your project: <strong>Storage → Create → Postgres</strong> — Vercel sets <CopyButton text="DATABASE_URL" /> automatically</li>
            <li>Redeploy once (Deployments → … → Redeploy)</li>
          </ol>
          <p className="text-xs text-gray-400">Every future push auto-deploys. No more manual steps ever.</p>
          <a href="https://vercel.com/new" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 w-full justify-center bg-black text-white rounded-xl py-2.5 text-sm font-semibold">
            Open Vercel <ExternalLink size={14} />
          </a>
        </div>
      </section>

      {/* Env vars checklist */}
      <section className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Environment Variables</h2>
          <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs text-sky-600">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div className="space-y-2">
          {required.map((v) => (
            <div key={v.key} className={`bg-white rounded-2xl px-4 py-3 shadow-sm border flex items-start gap-3 ${v.ok ? 'border-emerald-100' : 'border-gray-100'}`}>
              {v.ok ? <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5" /> : <XCircle size={18} className="text-red-400 shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CopyButton text={v.key} />
                  {v.link && !v.ok && (
                    <a href={v.link} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-sky-600 flex items-center gap-0.5 font-medium">
                      Get it <ExternalLink size={10} />
                    </a>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">{v.hint}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Optional */}
        {optional.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-gray-400 mb-2">Optional</p>
            {optional.map((v) => (
              <div key={v.key} className={`bg-white rounded-2xl px-4 py-3 shadow-sm border flex items-start gap-3 ${v.ok ? 'border-emerald-100' : 'border-gray-100'}`}>
                {v.ok ? <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5" /> : <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-300 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CopyButton text={v.key} />
                    {v.link && !v.ok && (
                      <a href={v.link} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-sky-600 flex items-center gap-0.5 font-medium">
                        Get it <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{v.hint}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Auto-handled note */}
        <div className="mt-3 bg-gray-50 border border-gray-100 rounded-2xl p-3 space-y-1">
          <p className="text-xs font-semibold text-gray-600">Handled automatically — nothing to set:</p>
          <p className="text-xs text-gray-500">✓ <span className="font-mono">NEXTAUTH_SECRET</span> — derived from your password</p>
          <p className="text-xs text-gray-500">✓ <span className="font-mono">NEXTAUTH_URL</span> — set by Vercel to your deployment URL</p>
          <p className="text-xs text-gray-500">✓ Database schema — created on first startup</p>
          <p className="text-xs text-gray-500">✓ Tax deadlines — pre-loaded (US + India)</p>
        </div>
      </section>

      {/* DB status */}
      {status?.dbError && (
        <div className={`mb-5 bg-white rounded-2xl p-4 shadow-sm border flex items-start gap-3 ${status.dbReady ? 'border-emerald-100' : 'border-amber-100'}`}>
          {status.dbReady ? <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5" /> : <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />}
          <p className="text-xs text-gray-600 mt-0.5">{status.dbError}</p>
        </div>
      )}

      {done ? (
        <Link href="/" className="flex items-center justify-center gap-2 w-full bg-sky-600 text-white rounded-2xl py-4 text-sm font-semibold">
          Open Second Brain <ArrowRight size={16} />
        </Link>
      ) : (
        <button onClick={load} disabled={loading} className="flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-600 rounded-2xl py-4 text-sm font-medium">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Check status
        </button>
      )}
    </div>
  );
}
