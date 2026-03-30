import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { normalizeAccountName } from '@/lib/extract';

// POST /api/finance/dedup
// Automatically detects and merges all duplicate accounts (by normalized name).
// Keeps the account with the highest balance; sums all balances into it.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const accounts = await sql`SELECT id, name, type, category, balance, notes FROM accounts` as {
    id: string; name: string; type: string; category: string; balance: number; notes: string | null;
  }[];

  // Group by normalized name
  const groups = new Map<string, typeof accounts>();
  for (const acct of accounts) {
    const key = normalizeAccountName(acct.name);
    const group = groups.get(key) ?? [];
    group.push(acct);
    groups.set(key, group);
  }

  let mergedCount = 0;
  let deletedCount = 0;

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
      deletedCount += deleteIds.length;
      mergedCount++;
    }
  }

  if (mergedCount > 0) {
    const { takeNetWorthSnapshot } = await import('@/lib/snapshots');
    takeNetWorthSnapshot().catch(() => {});
  }

  return Response.json({ merged: mergedCount, deleted: deletedCount });
}
