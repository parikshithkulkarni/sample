// Simple in-memory sliding window rate limiter.
// Suitable for single-instance deployments (Vercel serverless).
// For multi-instance, replace with Redis-based limiter.

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries periodically to prevent memory leaks
const CLEANUP_INTERVAL = 60_000; // 1 minute
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * Check whether a request is allowed under the sliding window rate limit.
 * Records the request timestamp if allowed.
 *
 * @param key - Unique identifier for the rate limit bucket (e.g. IP address or user ID)
 * @param maxRequests - Maximum number of requests allowed within the window
 * @param windowMs - Sliding window duration in milliseconds
 * @returns A result indicating whether the request is allowed, remaining quota, and reset time
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  cleanup(windowMs);

  const entry = store.get(key) ?? { timestamps: [] };
  const cutoff = now - windowMs;
  entry.timestamps = entry.timestamps.filter(t => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    return {
      allowed: false,
      remaining: 0,
      resetMs: oldestInWindow + windowMs - now,
    };
  }

  entry.timestamps.push(now);
  store.set(key, entry);

  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    resetMs: windowMs,
  };
}

/**
 * Build a 429 Too Many Requests response with Retry-After and rate limit headers.
 *
 * @param result - The rate limit check result containing resetMs and remaining count
 * @returns A 429 JSON Response with appropriate headers
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil(result.resetMs / 1000)),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    },
  );
}
