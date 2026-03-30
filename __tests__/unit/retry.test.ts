import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '@/lib/retry';

// Mock the logger to suppress output
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn(async () => 'success');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('retries on failure and eventually succeeds', async () => {
    let attempt = 0;
    const fn = vi.fn(async () => {
      attempt++;
      if (attempt < 3) throw new Error(`attempt ${attempt}`);
      return 'success';
    });
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after max attempts exhausted', async () => {
    const fn = vi.fn(async () => {
      throw new Error('always fails');
    });
    await expect(
      withRetry(fn, { maxAttempts: 2, baseDelayMs: 10 }),
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('passes abort signal to function', async () => {
    const fn = vi.fn(async (signal: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return 'ok';
    });
    await withRetry(fn, { maxAttempts: 1, timeoutMs: 5000 });
    expect(fn).toHaveBeenCalledOnce();
  });

  it('does not retry on abort', async () => {
    const fn = vi.fn(async () => {
      const err = new DOMException('Aborted', 'AbortError');
      throw err;
    });
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 }),
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledOnce();
  });
});
