import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

// POST /api/finance/merge
// Body: { keepId: string, deleteIds: string[] }
// Merges duplicate accounts: sums balances into keepId, deletes the rest.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { keepId, deleteIds } = (await req.json()) as { keepId: string; deleteIds: string[] };
  if (!keepId || !deleteIds?.length) return Response.json({ error: 'keepId and deleteIds required' }, { status: 400 });

  const ids = [keepId, ...deleteIds];
  const rows = await sql`SELECT * FROM accounts WHERE id = ANY(${ids}::uuid[])` as {
    id: string; name: string; type: string; category: string; balance: number; notes: string | null;
  }[];

  const keep = rows.find(r => r.id === keepId);
  if (!keep) return Response.json({ error: 'keepId not found' }, { status: 404 });

  // Sum all balances into the kept account; merge non-null notes
  const totalBalance = rows.reduce((s, r) => s + Number(r.balance), 0);
  const mergedNotes = rows.map(r => r.notes).filter(Boolean).join('; ') || keep.notes;

  await sql`UPDATE accounts SET balance = ${totalBalance}, notes = ${mergedNotes} WHERE id = ${keepId}`;
  for (const delId of deleteIds) {
    await sql`DELETE FROM accounts WHERE id = ${delId}`;
  }

  const { takeNetWorthSnapshot } = await import('@/lib/snapshots');
  takeNetWorthSnapshot().catch(() => {});

  const [updated] = await sql`SELECT * FROM accounts WHERE id = ${keepId}`;
  return Response.json(updated);
}
