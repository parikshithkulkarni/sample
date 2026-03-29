'use client';

import { useEffect } from 'react';

// Silently calls /api/ping on every app load to trigger DB migrations
// and warm the connection pool. Renders nothing.
export default function DbWarmer() {
  useEffect(() => {
    fetch('/api/ping').catch(() => {/* ignore */});
  }, []);
  return null;
}
