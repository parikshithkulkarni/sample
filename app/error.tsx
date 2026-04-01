'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to error monitoring
    try {
      const payload = {
        source: 'fe',
        severity: 'critical',
        message: error.message || 'React render error',
        stack: error.stack,
        context: {
          digest: error.digest,
          url: typeof window !== 'undefined' ? window.location.href : undefined,
        },
      };
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(
          '/api/errors/ingest',
          new Blob([JSON.stringify(payload)], { type: 'application/json' }),
        );
      } else {
        fetch('/api/errors/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {});
      }
    } catch {
      // Monitoring must never make things worse
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-red-200 dark:border-red-800 p-6 max-w-lg w-full space-y-4">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle size={20} />
          <h2 className="text-base font-semibold">Something went wrong</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          An unexpected error occurred. This has been automatically reported to our monitoring system.
        </p>
        <pre className="text-xs bg-red-50 dark:bg-red-950/30 rounded-xl p-3 overflow-auto whitespace-pre-wrap text-red-800 dark:text-red-300 max-h-40">
          {error.message}
        </pre>
        <button
          onClick={reset}
          className="w-full bg-sky-600 hover:bg-sky-700 text-white rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <RefreshCw size={14} />
          Try again
        </button>
      </div>
    </div>
  );
}
