'use client';

import { useEffect } from 'react';

export default function TaxesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[TaxesError]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6 max-w-lg w-full space-y-4">
        <h2 className="text-base font-semibold text-red-600">Error loading tax returns</h2>
        <pre className="text-xs bg-red-50 rounded-xl p-3 overflow-auto whitespace-pre-wrap text-red-800">
          {error.message}
          {error.stack ? '\n\n' + error.stack : ''}
        </pre>
        <button
          onClick={reset}
          className="w-full bg-sky-600 text-white rounded-xl py-2.5 text-sm font-medium"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
