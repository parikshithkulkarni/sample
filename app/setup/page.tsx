'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle, XCircle, AlertCircle, RefreshCw, ArrowRight, Eye, EyeOff,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface SetupStatus {
  vars: { key: string; label: string; hint: string; ok: boolean; required: boolean }[];
  dbReady: boolean;
  dbError: string;
  allRequired: boolean;
  adminExists: boolean;
  ready: boolean;
}

export default function SetupPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Account creation form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/setup');
      setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? 'Failed to create account');
        return;
      }
      // Success — go to login
      router.push('/login?setup=done');
    } catch {
      setFormError('Network error — please try again');
    } finally {
      setCreating(false);
    }
  }

  // If admin already exists, redirect to login
  if (status?.adminExists && status?.ready) {
    return (
      <div className="p-4 pt-10 max-w-lg mx-auto text-center">
        <CheckCircle size={48} className="text-emerald-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">Second Brain is ready</h1>
        <p className="text-sm text-gray-500 mb-6">Your account is configured and the database is connected.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-sky-600 text-white rounded-2xl px-6 py-3 text-sm font-semibold"
        >
          Open Dashboard <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  // Show account creation form if DB is ready but no admin yet
  const needsAccount = status && !status.adminExists && status.dbReady;
  const needsDb = status && !status.dbReady;

  return (
    <div className="p-4 pt-6 pb-24 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">First-time Setup</h1>
        <p className="text-sm text-gray-500 mt-1">One-time configuration — never needed again</p>
      </div>

      {/* Status checklist */}
      {status && (
        <div className="space-y-2 mb-6">
          {status.vars.map((v) => (
            <div
              key={v.key}
              className={`bg-white rounded-2xl px-4 py-3 shadow-sm border flex items-center gap-3 ${v.ok ? 'border-emerald-100' : 'border-gray-100'}`}
            >
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
          <div
            className={`bg-white rounded-2xl px-4 py-3 shadow-sm border flex items-center gap-3 ${status.dbReady ? 'border-emerald-100' : 'border-gray-100'}`}
          >
            {status.dbReady
              ? <CheckCircle size={18} className="text-emerald-500 shrink-0" />
              : <AlertCircle size={18} className="text-amber-400 shrink-0" />}
            <div>
              <p className="text-xs font-semibold text-gray-700">Database schema</p>
              {status.dbError && <p className="text-xs text-gray-400 mt-0.5">{status.dbError}</p>}
            </div>
          </div>

          {/* Admin account */}
          <div
            className={`bg-white rounded-2xl px-4 py-3 shadow-sm border flex items-center gap-3 ${status.adminExists ? 'border-emerald-100' : 'border-gray-100'}`}
          >
            {status.adminExists
              ? <CheckCircle size={18} className="text-emerald-500 shrink-0" />
              : <XCircle size={18} className="text-red-400 shrink-0" />}
            <div>
              <p className="text-xs font-semibold text-gray-700">Admin account</p>
              {!status.adminExists && (
                <p className="text-xs text-gray-400 mt-0.5">Create your account below</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DB not ready yet */}
      {needsDb && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-center">
          <AlertCircle size={24} className="text-amber-500 mx-auto mb-2" />
          <p className="text-sm font-semibold text-amber-800">Database not connected</p>
          <p className="text-xs text-amber-600 mt-1">
            Go to your Vercel project → Storage → Connect a Postgres database.
            The DATABASE_URL is set automatically.
          </p>
          <button
            onClick={load}
            disabled={loading}
            className="mt-3 flex items-center gap-1 text-xs text-amber-700 mx-auto"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Check again
          </button>
        </div>
      )}

      {/* Account creation form */}
      {needsAccount && (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
          <h2 className="text-sm font-bold text-gray-800 mb-1">Create your account</h2>
          <p className="text-xs text-gray-500 mb-4">Choose your username and password. You only do this once.</p>

          <form onSubmit={createAccount} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin"
                required
                minLength={2}
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  minLength={8}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Confirm password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                required
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            {formError && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <XCircle size={12} /> {formError}
              </p>
            )}
            <button
              type="submit"
              disabled={creating || !username || !password || !confirmPassword}
              className="w-full bg-sky-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {creating ? <RefreshCw size={15} className="animate-spin" /> : <ArrowRight size={15} />}
              {creating ? 'Creating…' : 'Create account & go to login'}
            </button>
          </form>
        </section>
      )}

      {/* Handled automatically */}
      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 space-y-1">
        <p className="text-xs font-semibold text-gray-500 mb-1.5">Handled automatically</p>
        {[
          ['NEXTAUTH_SECRET', 'derived from your Anthropic API key'],
          ['NEXTAUTH_URL', 'set by Vercel to your deployment URL'],
          ['Database schema', 'created on first startup'],
          ['Tax deadlines', '7 US + India dates pre-loaded'],
        ].map(([k, v]) => (
          <p key={k} className="text-xs text-gray-400">
            <span className="text-emerald-600">✓</span>{' '}
            <span className="font-mono">{k}</span> — {v}
          </p>
        ))}
      </div>

      <button
        onClick={load}
        disabled={loading}
        className="mt-4 flex items-center justify-center gap-2 w-full bg-gray-100 text-gray-600 rounded-2xl py-3 text-sm font-medium"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        Refresh status
      </button>
    </div>
  );
}
