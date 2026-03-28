'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle, XCircle, AlertCircle, RefreshCw,
  ExternalLink, ArrowRight, Copy, Check,
} from 'lucide-react';
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

function CopyChip({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 font-mono text-xs bg-gray-100 hover:bg-gray-200 active:bg-gray-300 px-2 py-0.5 rounded transition-colors"
      title="Tap to copy"
    >
      {copied
        ? <Check size={10} className="text-emerald-600 shrink-0" />
        : <Copy size={10} className="text-gray-400 shrink-0" />}
      <span className={copied ? 'text-emerald-600' : 'text-gray-700'}>
        {copied ? 'Copied!' : text}
      </span>
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
        <p className="text-sm text-gray-500 mt-1">Two actions total — one signup, one button</p>
      </div>

      {/* Status banner */}
      {status && (
        <div className={`rounded-2xl p-4 mb-6 flex items-center gap-3 ${done ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
          {done
            ? <CheckCircle size={22} className="text-emerald-600 shrink-0" />
            : <AlertCircle size={22} className="text-amber-500 shrink-0" />}
          <div>
            <p className={`font-semibold text-sm ${done ? 'text-emerald-800' : 'text-amber-800'}`}>
              {done
                ? "You're live — Second Brain is ready!"
                : `${doneCount} of ${required.length} required items configured`}
            </p>
            {done && (
              <Link href="/" className="text-xs text-emerald-700 underline mt-0.5 inline-block">
                Go to dashboard →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Action 1 */}
      <section className="mb-4">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Action 1 — Get your Anthropic API key
        </h2>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <p className="text-sm text-gray-600">
            Sign up at <strong>console.anthropic.com</strong> → API Keys → Create Key → copy it.
            Free tier included.
          </p>
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 w-full justify-center bg-[#d97706] text-white rounded-xl py-2.5 text-sm font-semibold"
          >
            Open Anthropic Console <ExternalLink size={14} />
          </a>
        </div>
      </section>

      {/* Action 2 */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Action 2 — Click Deploy
        </h2>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <p className="text-sm text-gray-600">
            The button below opens Vercel. It will clone this repo, provision a Postgres database,
            and ask for <strong>3 values</strong>:
          </p>
          <div className="space-y-2">
            {[
              { name: 'ANTHROPIC_API_KEY', desc: 'Paste the key from Action 1' },
              { name: 'ADMIN_USERNAME',    desc: 'Your login username (e.g. "admin")' },
              { name: 'ADMIN_PASSWORD',    desc: 'Your login password' },
            ].map((v) => (
              <div key={v.name} className="flex items-start gap-2">
                <CopyChip text={v.name} />
                <span className="text-xs text-gray-500 mt-0.5">{v.desc}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            Database, schema, secret, and tax deadlines are all set up automatically.
          </p>
          <a
            href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fparikshithkulkarni%2Fsample&stores=%5B%7B%22type%22%3A%22postgres%22%7D%5D&env=ANTHROPIC_API_KEY%2CADMIN_USERNAME%2CADMIN_PASSWORD&envDescription=ANTHROPIC_API_KEY%3A%20get%20at%20console.anthropic.com%20%E2%80%94%20ADMIN_USERNAME%2FADMIN_PASSWORD%3A%20your%20login&envLink=https%3A%2F%2Fconsole.anthropic.com%2Fsettings%2Fkeys&project-name=second-brain&repository-name=second-brain"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 w-full justify-center bg-black text-white rounded-xl py-2.5 text-sm font-semibold"
          >
            Deploy with Vercel <ExternalLink size={14} />
          </a>
        </div>
      </section>

      {/* Status checklist — shown after deploy */}
      {status && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</h2>
            <button onClick={load} disabled={loading} className="flex items-center gap-1 text-xs text-sky-600">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          <div className="space-y-2">
            {required.map((v) => (
              <div key={v.key} className={`bg-white rounded-2xl px-4 py-3 shadow-sm border flex items-center gap-3 ${v.ok ? 'border-emerald-100' : 'border-gray-100'}`}>
                {v.ok
                  ? <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                  : <XCircle size={18} className="text-red-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-700">{v.label}</p>
                  {!v.ok && <p className="text-xs text-gray-400 mt-0.5">{v.hint}</p>}
                </div>
              </div>
            ))}

            {/* DB schema */}
            <div className={`bg-white rounded-2xl px-4 py-3 shadow-sm border flex items-center gap-3 ${status.dbReady ? 'border-emerald-100' : 'border-gray-100'}`}>
              {status.dbReady
                ? <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                : <AlertCircle size={18} className="text-amber-400 shrink-0" />}
              <div>
                <p className="text-xs font-semibold text-gray-700">Database schema</p>
                {status.dbError && <p className="text-xs text-gray-400 mt-0.5">{status.dbError}</p>}
              </div>
            </div>
          </div>

          {/* Optional */}
          {optional.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-gray-400 mb-2">Optional</p>
              {optional.map((v) => (
                <div key={v.key} className={`bg-white rounded-2xl px-4 py-3 shadow-sm border flex items-center gap-3 ${v.ok ? 'border-emerald-100' : 'border-gray-100'}`}>
                  {v.ok
                    ? <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                    : <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-300 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-700">{v.label}</p>
                    {!v.ok && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-400">{v.hint}</p>
                        {v.link && (
                          <a href={v.link} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 flex items-center gap-0.5 shrink-0">
                            Get it <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Auto-handled */}
          <div className="mt-3 bg-gray-50 border border-gray-100 rounded-2xl p-3 space-y-1">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Handled automatically</p>
            {[
              ['NEXTAUTH_SECRET', 'derived from your password'],
              ['NEXTAUTH_URL', 'set by Vercel to your deployment URL'],
              ['Database schema', 'created on first startup'],
              ['Tax deadlines', '7 US + India dates pre-loaded'],
            ].map(([k, v]) => (
              <p key={k} className="text-xs text-gray-400">
                <span className="text-emerald-600">✓</span> <span className="font-mono">{k}</span> — {v}
              </p>
            ))}
          </div>
        </section>
      )}

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
