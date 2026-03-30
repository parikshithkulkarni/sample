import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { mergeSchema, parseBody } from '@/lib/validators';

// POST /api/finance/merge
// Body: { keepId: string, deleteIds: string[] }
// Merges duplicate accounts: sums balances into keepId, deletes the rest.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const parsed = await parseBody(req, mergeSchema);
  if (parsed instanceof Response) return parsed;
  const { keepId, deleteIds } = parsed;

  const ids = [keepId, ...deleteIds];
  const rows = await sql`SELECT * FROM accounts WHERE id = ANY(${ids}::uuid[])` as {
    id: string; name: string; type: string; category: string; balance: number; notes: string | null;
  }[];

  const keep = rows.find(r => r.id === keepId);
  if (!keep) return Response.json({ error: 'keepId not found' }, { status: 404 });

  // Sum all balances into the kept account; merge non-null notes
  const totalBalance = rows.reduce((s, r) => s + Number(r.balance), 0);
  const mergedNotes = rows.map(r => r.notes).filter(Boolean).join('; ') || keep.notes;

  const deleteIdsOnly = deleteIds.filter(id => id !== keepId);
  if (deleteIdsOnly.length > 0) {
    await sql`DELETE FROM accounts WHERE id = ANY(${deleteIdsOnly}::uuid[])`;
  }
  await sql`UPDATE accounts SET balance = ${totalBalance}, notes = ${mergedNotes} WHERE id = ${keepId}`;

  const { takeNetWorthSnapshot } = await import('@/lib/snapshots');
  takeNetWorthSnapshot().catch((err: unknown) => {
    console.error('[finance/merge] Failed to take net worth snapshot:', err);
  });

  const [updated] = await sql`SELECT * FROM accounts WHERE id = ${keepId}`;
  return Response.json(updated);
}
