import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { normalizeAccountName } from '@/lib/extract';

// Income/tax categories that should NOT be in the accounts table.
// These are income statement items, not balance sheet items.
const INCOME_TAX_CATEGORIES = new Set([
  'employment_income', 'self_employment_income', 'partnership_income',
  'interest_income', 'dividend_income', 'capital_gains', 'rental_income',
  'tax_prepayment', 'retirement_distribution',
]);

// POST /api/finance/cleanup
// 1. Syncs income/tax "accounts" to tax_returns (so data isn't lost)
// 2. Deletes those fake accounts from the accounts table
// 3. Deduplicates remaining real accounts by normalized name
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  // Step 1: Sync income data to tax returns before deleting
  const { syncTaxReturnsFromAccounts } = await import('@/lib/tax-returns');
  await syncTaxReturnsFromAccounts();

  // Step 2: Delete all income/tax "accounts" — they don't belong on the balance sheet
  const allAccounts = await sql`SELECT id, name, type, category, balance, notes FROM accounts` as {
    id: string; name: string; type: string; category: string; balance: number; notes: string | null;
  }[];

  const incomeIds = allAccounts
    .filter(a => INCOME_TAX_CATEGORIES.has(a.category.toLowerCase()))
    .map(a => a.id);

  let deletedIncome = 0;
  if (incomeIds.length > 0) {
    await sql`DELETE FROM accounts WHERE id = ANY(${incomeIds}::uuid[])`;
    deletedIncome = incomeIds.length;
  }

  // Step 3: Deduplicate remaining real accounts
  const remaining = allAccounts.filter(a => !INCOME_TAX_CATEGORIES.has(a.category.toLowerCase()));
  const groups = new Map<string, typeof remaining>();
  for (const acct of remaining) {
    const key = normalizeAccountName(acct.name);
    const group = groups.get(key) ?? [];
    group.push(acct);
    groups.set(key, group);
  }

  let mergedCount = 0;
  let deletedDups = 0;
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    // Keep the one with the highest balance
    const keep = group.reduce((best, a) => Number(a.balance) > Number(best.balance) ? a : best);
    const totalBalance = group.reduce((s, a) => s + Number(a.balance), 0);
    const mergedNotes = group.map(a => a.notes).filter(Boolean).join('; ') || keep.notes;
    const deleteIds = group.filter(a => a.id !== keep.id).map(a => a.id);
    if (deleteIds.length > 0) {
      await sql`DELETE FROM accounts WHERE id = ANY(${deleteIds}::uuid[])`;
      await sql`UPDATE accounts SET balance = ${totalBalance}, notes = ${mergedNotes} WHERE id = ${keep.id}`;
      deletedDups += deleteIds.length;
      mergedCount++;
    }
  }

  // Snapshot after cleanup
  const { takeNetWorthSnapshot } = await import('@/lib/snapshots');
  takeNetWorthSnapshot().catch(() => {});

  return Response.json({
    incomeRecordsRemoved: deletedIncome,
    duplicatesMerged: mergedCount,
    duplicatesRemoved: deletedDups,
    remainingAccounts: remaining.length - deletedDups,
  });
}
