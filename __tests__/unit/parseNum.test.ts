import { describe, it, expect, vi } from 'vitest';

// lib/extract.ts imports @/lib/db and @anthropic-ai/sdk at module level — mock both
vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
  runMigrations: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: vi.fn() }; },
}));

import { parseNum } from '@/lib/extract';

describe('parseNum', () => {
  it('returns null for null and undefined', () => {
    expect(parseNum(null)).toBeNull();
    expect(parseNum(undefined)).toBeNull();
  });

  it('returns plain numbers as-is', () => {
    expect(parseNum(450000)).toBe(450000);
    expect(parseNum(0)).toBe(0);
    expect(parseNum(3.14)).toBe(3.14);
  });

  it('returns null for NaN', () => {
    expect(parseNum(NaN)).toBeNull();
  });

  it('strips dollar signs and commas from strings', () => {
    expect(parseNum('$450,000')).toBe(450000);
    expect(parseNum('$1,234,567')).toBe(1234567);
    expect(parseNum('450,000')).toBe(450000);
  });

  it('handles k suffix (thousands)', () => {
    expect(parseNum('450k')).toBe(450000);
    expect(parseNum('1.5k')).toBe(1500);
    expect(parseNum('$200k')).toBe(200000);
  });

  it('handles m suffix (millions)', () => {
    expect(parseNum('1.2m')).toBe(1_200_000);
    expect(parseNum('$2m')).toBe(2_000_000);
  });

  it('handles plain numeric strings', () => {
    expect(parseNum('450000')).toBe(450000);
    expect(parseNum('3.14')).toBe(3.14);
  });

  it('returns null for sentinel strings', () => {
    expect(parseNum('null')).toBeNull();
    expect(parseNum('n/a')).toBeNull();
    expect(parseNum('unknown')).toBeNull();
    expect(parseNum('')).toBeNull();
  });

  it('returns null for non-numeric strings', () => {
    expect(parseNum('not a number')).toBeNull();
    expect(parseNum('abc')).toBeNull();
  });

  it('handles whitespace in strings', () => {
    expect(parseNum(' $450,000 ')).toBe(450000);
  });

  it('handles case-insensitive k/m suffixes', () => {
    // The implementation uses toLowerCase() so K → k
    expect(parseNum('450K')).toBe(450000);
    expect(parseNum('1M')).toBe(1_000_000);
  });
});
