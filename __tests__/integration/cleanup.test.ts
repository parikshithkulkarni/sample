/**
 * Integration tests for /api/finance/cleanup
 * Verifies income items are removed and duplicate mortgages are merged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
  runMigrations: vi.fn().mockResolvedValue(undefined),
  seedDeadlines: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/snapshots', () => ({
  takeNetWorthSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/tax-returns', () => ({
  syncTaxReturnsFromAccounts: vi.fn().mockResolvedValue(undefined),
}));

import { sql } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { POST as cleanupPOST } from '@/app/api/finance/cleanup/route';

const mockSql = vi.mocked(sql);
const mockAuth = vi.mocked(getServerSession);

// Accounts matching the user's screenshot
const SCREENSHOT_ACCOUNTS = [
  // Income items that should be deleted as junk
  { id: 'inc-1', name: '2025 Wages - Writer Inc', type: 'asset', category: 'other', balance: 160941, notes: null },
  { id: 'inc-2', name: '2025 Wages - DB Spectra Inc', type: 'asset', category: 'other', balance: 104857, notes: null },
  { id: 'inc-3', name: 'Rental Income - Parikshith (Tom\'s PM LLC)', type: 'asset', category: 'other', balance: 55525, notes: null },
  { id: 'inc-4', name: 'Rental Income - Pallavi Dallas Condo (TX)', type: 'asset', category: 'other', balance: 5458, notes: null },
  { id: 'inc-5', name: 'Tom\'s PM LLC Rental Income 2025 - Dallas', type: 'asset', category: 'other', balance: 5458, notes: null },
  { id: 'inc-6', name: 'UWM Mortgage Escrow Balance - 12806', type: 'asset', category: 'escrow', balance: 2175, notes: null },
  { id: 'inc-7', name: 'UWM Mortgage Hazard Insurance Paid 2025', type: 'asset', category: 'escrow_disbursement', balance: 1443, notes: null },
  { id: 'inc-8', name: 'Robinhood Dividends 2025', type: 'asset', category: 'other', balance: 96, notes: null },
  { id: 'inc-9', name: 'Robinhood Substitute Payments 2025', type: 'asset', category: 'other', balance: 2, notes: null },
  { id: 'inc-10', name: 'Robinhood Substitute Payments (MISC) 2025', type: 'asset', category: 'other_income', balance: 2, notes: null },
  // Duplicate mortgages that should be merged
  { id: 'mtg-1', name: 'PHH Mortgage - 1014 Terrace Trl', type: 'liability', category: 'mortgage', balance: 213838, notes: null },
  { id: 'mtg-2', name: 'PHH Mortgage - 1014 Terrace Trl Carrollton TX', type: 'liability', category: 'mortgage', balance: 213838, notes: null },
  // Unique accounts that should stay
  { id: 'mtg-3', name: 'PNC Mortgage - 5537 Meadowoak Sq', type: 'liability', category: 'mortgage', balance: 194583, notes: null },
  { id: 'mtg-4', name: 'United Wholesale Mortgage - 12806', type: 'liability', category: 'mortgage', balance: 134337, notes: null },
  { id: 'mtg-5', name: 'Amegy Bank HELOC - 1014 Terrace Trl', type: 'liability', category: 'mortgage', balance: 44460, notes: null },
];

describe('POST /api/finance/cleanup', () => {
  let sqlCallIndex: number;
  let deletedIdsByStep: { junk: string[]; dedup: string[]; zero: string[] };
  let updatedAccounts: { id: string; balance: number }[];

  beforeEach(() => {
    mockSql.mockReset();
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    sqlCallIndex = 0;
    deletedIdsByStep = { junk: [], dedup: [], zero: [] };
    updatedAccounts = [];

    // Track which step we're in based on SQL call order
    mockSql.mockImplementation(((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('?');
      sqlCallIndex++;

      // Call 1: SELECT all accounts
      if (sqlCallIndex === 1 && query.includes('SELECT') && query.includes('FROM accounts')) {
        return Promise.resolve(SCREENSHOT_ACCOUNTS);
      }
      // Call 2: DELETE junk accounts
      if (query.includes('DELETE') && query.includes('ANY') && deletedIdsByStep.junk.length === 0 && deletedIdsByStep.dedup.length === 0) {
        deletedIdsByStep.junk = [...(values[0] as string[])];
        return Promise.resolve([]);
      }
      // Calls 3+: Dedup DELETE and UPDATE pairs
      if (query.includes('DELETE') && query.includes('ANY') && deletedIdsByStep.junk.length > 0 && !query.includes('balance')) {
        deletedIdsByStep.dedup.push(...(values[0] as string[]));
        return Promise.resolve([]);
      }
      if (query.includes('UPDATE')) {
        updatedAccounts.push({ id: values[values.length - 1] as string, balance: values[0] as number });
        return Promise.resolve([]);
      }
      // Zero balance SELECT - return empty (no zero balance accounts after cleanup)
      if (query.includes('SELECT') && query.includes('balance')) {
        return Promise.resolve([]);
      }
      // Zero balance DELETE
      if (query.includes('DELETE') && query.includes('ANY')) {
        deletedIdsByStep.zero = [...(values[0] as string[])];
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }) as never);
  });

  it('deletes all 10 income items from screenshot as junk', async () => {
    const res = await cleanupPOST();
    const body = await res.json();

    const incomeIds = ['inc-1', 'inc-2', 'inc-3', 'inc-4', 'inc-5', 'inc-6', 'inc-7', 'inc-8', 'inc-9', 'inc-10'];
    for (const id of incomeIds) {
      expect(deletedIdsByStep.junk, `Expected ${id} to be in junk deletions`).toContain(id);
    }
    expect(deletedIdsByStep.junk.length).toBe(10);
    expect(body.junkRemoved).toBe(10);

    // Mortgage accounts should NOT be deleted as junk
    for (const id of ['mtg-1', 'mtg-2', 'mtg-3', 'mtg-4', 'mtg-5']) {
      expect(deletedIdsByStep.junk).not.toContain(id);
    }
  });

  it('merges duplicate PHH Mortgage entries (keeps one, deletes other)', async () => {
    await cleanupPOST();

    // Exactly one of the PHH mortgages should be dedup-deleted
    const phh1InDedup = deletedIdsByStep.dedup.includes('mtg-1');
    const phh2InDedup = deletedIdsByStep.dedup.includes('mtg-2');
    expect(phh1InDedup || phh2InDedup).toBe(true);
    expect(phh1InDedup && phh2InDedup).toBe(false);

    // The kept one should be updated
    expect(updatedAccounts.length).toBeGreaterThanOrEqual(1);
    const keptId = phh2InDedup ? 'mtg-1' : 'mtg-2';
    expect(updatedAccounts.some(u => u.id === keptId)).toBe(true);
  });

  it('does NOT merge distinct mortgage accounts', async () => {
    await cleanupPOST();

    // PNC, United Wholesale, Amegy should not be dedup-deleted
    expect(deletedIdsByStep.dedup).not.toContain('mtg-3');
    expect(deletedIdsByStep.dedup).not.toContain('mtg-4');
    expect(deletedIdsByStep.dedup).not.toContain('mtg-5');
  });
});
