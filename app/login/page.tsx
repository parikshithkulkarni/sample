'use client';

import { Suspense, useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [setupDone, setSetupDone] = useState(false);

  // Show success message if arriving from /setup
  useEffect(() => {
    if (params.get('setup') === 'done') setSetupDone(true);
  }, [params]);

  // Check if admin is configured; if not, redirect to /setup
  useEffect(() => {
    fetch('/api/setup')
      .then((r) => r.json())
      .then((data) => {
        if (!data.adminExists) {
          router.replace('/setup');
        } else {
          setAdminExists(true);
        }
      })
      .catch(() => setAdminExists(true)); // if check fails, show form anyway
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false,
      });
      if (result?.ok) {
        router.push(params.get('callbackUrl') ?? '/');
      } else {
        setError('Invalid username or password');
      }
    } catch {
      setError('Something went wrong — please try again');
    } finally {
      setLoading(false);
    }
  }

  if (adminExists === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-4 pt-16 max-w-sm mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Second Brain</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Your private AI dashboard</p>
      </div>

      {setupDone && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl px-4 py-3 mb-4 text-sm text-emerald-700 dark:text-emerald-300 font-medium">
          Account created! Sign in below.
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoCapitalize="none"
            autoCorrect="off"
            className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-sky-500"
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

        {error && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full bg-sky-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <RefreshCw size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-xs text-gray-400 mt-4">
        First time?{' '}
        <a href="/setup" className="text-sky-600 underline">Set up your account</a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw size={20} className="animate-spin text-gray-400" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
