import { logger } from '@/lib/logger';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  label?: string;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  timeoutMs: 30_000,
  label: 'operation',
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff and optional timeout.
 * Aborts and throws on timeout or after exhausting all attempts.
 *
 * @param fn - The async function to execute; receives an AbortSignal for timeout cancellation
 * @param opts - Optional retry configuration (maxAttempts, baseDelayMs, timeoutMs, label)
 * @returns The resolved value from `fn` on the first successful attempt
 */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const { maxAttempts, baseDelayMs, timeoutMs, label } = { ...DEFAULT_OPTIONS, ...opts };

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await fn(controller.signal);
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;

      const isLastAttempt = attempt === maxAttempts;
      const isAbort = err instanceof DOMException && err.name === 'AbortError';

      if (isLastAttempt || isAbort) {
        logger.error(`${label} failed after ${attempt} attempt(s)`, err);
        throw err;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`${label} attempt ${attempt} failed, retrying in ${delayMs}ms`, {
        error: err instanceof Error ? err.message : String(err),
      });
      await sleep(delayMs);
    }
  }

  throw lastError;
}
