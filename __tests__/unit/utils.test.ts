import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fmt, daysUntil, cn } from '@/lib/utils';

describe('fmt', () => {
  it('formats positive integers as USD with no decimals', () => {
    expect(fmt(1000)).toBe('$1,000');
    expect(fmt(1500000)).toBe('$1,500,000');
    expect(fmt(0)).toBe('$0');
  });

  it('formats negative values', () => {
    expect(fmt(-5000)).toBe('-$5,000');
  });

  it('rounds decimals and omits cents', () => {
    expect(fmt(1234.99)).toBe('$1,235');
    expect(fmt(1234.01)).toBe('$1,234');
  });

  it('handles non-USD currency', () => {
    const result = fmt(100000, 'EUR');
    expect(result).toContain('100,000');
    expect(result).toMatch(/€|EUR/);
  });

  it('formats large values correctly', () => {
    expect(fmt(1_000_000)).toBe('$1,000,000');
    expect(fmt(999)).toBe('$999');
  });
});

describe('daysUntil', () => {
  beforeEach(() => {
    // Pin "today" to 2026-03-30
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T00:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 for today', () => {
    expect(daysUntil('2026-03-30')).toBe(0);
  });

  it('returns positive days for future dates', () => {
    expect(daysUntil('2026-04-15')).toBe(16);
    expect(daysUntil('2026-03-31')).toBe(1);
  });

  it('returns negative days for past dates', () => {
    expect(daysUntil('2026-03-29')).toBe(-1);
    expect(daysUntil('2026-01-01')).toBe(-88);
  });

  it('handles end-of-year boundaries', () => {
    expect(daysUntil('2026-12-31')).toBe(276);
  });
});

describe('cn', () => {
  it('merges class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('deduplicates conflicting tailwind classes (last wins)', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'skipped', 'applied')).toBe('base applied');
    expect(cn('base', true && 'included')).toBe('base included');
  });

  it('handles undefined and null gracefully', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar');
  });

  it('handles arrays', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });

  it('returns empty string for no args', () => {
    expect(cn()).toBe('');
  });
});
