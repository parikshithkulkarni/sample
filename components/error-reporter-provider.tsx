'use client';

import { useEffect, useRef } from 'react';

/** Client-side fingerprint for dedup (simple hash) */
function clientFingerprint(source: string, message: string): string {
  let hash = 0;
  const str = `${source}:${message}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

// Keep a reference to the original fetch before we monkey-patch it,
// so sendError never goes through the interceptor (avoids infinite loops).
const _nativeFetch = typeof window !== 'undefined' ? window.fetch.bind(window) : undefined;

function sendError(payload: {
  source: 'fe' | 'browser' | 'network';
  severity: 'critical' | 'error' | 'warning';
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}) {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/errors/ingest', new Blob([body], { type: 'application/json' }));
    } else if (_nativeFetch) {
      _nativeFetch('/api/errors/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Monitoring must never crash the app
  }
}

export default function ErrorReporterProvider({ children }: { children: React.ReactNode }) {
  const dedupMap = useRef<Map<string, number>>(new Map());
  const DEDUP_WINDOW_MS = 30_000;

  function shouldReport(source: string, message: string): boolean {
    const fp = clientFingerprint(source, message);
    const now = Date.now();
    const lastReported = dedupMap.current.get(fp);
    if (lastReported && now - lastReported < DEDUP_WINDOW_MS) return false;
    dedupMap.current.set(fp, now);
    // Cleanup old entries
    if (dedupMap.current.size > 100) {
      for (const [key, ts] of dedupMap.current) {
        if (now - ts > DEDUP_WINDOW_MS) dedupMap.current.delete(key);
      }
    }
    return true;
  }

  useEffect(() => {
    // Catch uncaught JS errors
    function onError(event: ErrorEvent) {
      const message = event.message || 'Unknown error';
      if (!shouldReport('browser', message)) return;
      sendError({
        source: 'browser',
        severity: 'error',
        message,
        stack: event.error?.stack,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          url: window.location.href,
          userAgent: navigator.userAgent,
        },
      });
    }

    // Catch unhandled promise rejections
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const message = event.reason instanceof Error
        ? event.reason.message
        : String(event.reason ?? 'Unhandled promise rejection');
      if (!shouldReport('browser', message)) return;
      sendError({
        source: 'browser',
        severity: 'error',
        message,
        stack: event.reason instanceof Error ? event.reason.stack : undefined,
        context: { url: window.location.href },
      });
    }

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    // Intercept fetch to detect API failures
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      try {
        const response = await originalFetch.apply(this, args);
        // Report server errors (5xx) on our own API
        if (response.status >= 500) {
          const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : '';
          // Only monitor our own API routes, skip the ingest endpoint to avoid loops
          if (url.startsWith('/api/') && !url.includes('/api/errors/')) {
            const message = `API ${response.status}: ${url}`;
            if (shouldReport('network', message)) {
              sendError({
                source: 'network',
                severity: response.status >= 500 ? 'error' : 'warning',
                message,
                context: { url, status: response.status, method: (args[1] as RequestInit)?.method ?? 'GET' },
              });
            }
          }
        }
        return response;
      } catch (err) {
        // Network error (offline, DNS failure, etc.)
        const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : '';
        if (url.startsWith('/api/') && !url.includes('/api/errors/')) {
          const message = `Network error: ${url}`;
          if (shouldReport('network', message)) {
            sendError({
              source: 'network',
              severity: 'error',
              message: err instanceof Error ? `${message} - ${err.message}` : message,
              context: { url },
            });
          }
        }
        throw err;
      }
    };

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.fetch = originalFetch;
    };
  }, []);

  return <>{children}</>;
}
