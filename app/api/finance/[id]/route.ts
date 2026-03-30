import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { accountPatchSchema, parseBody } from '@/lib/validators';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const parsed = await parseBody(req, accountPatchSchema);
  if (parsed instanceof Response) return parsed;
  const { balance, notes } = parsed;

  const [row] = await sql`
    UPDATE accounts
    SET
      balance    = COALESCE(${balance ?? null}, balance),
      notes      = COALESCE(${notes ?? null}, notes),
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  const { takeNetWorthSnapshot } = await import('@/lib/snapshots');
  takeNetWorthSnapshot().catch(() => {});
  return Response.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  await sql`DELETE FROM accounts WHERE id = ${id}`;
  const { takeNetWorthSnapshot } = await import('@/lib/snapshots');
  takeNetWorthSnapshot().catch(() => {});
  return new Response(null, { status: 204 });
}
