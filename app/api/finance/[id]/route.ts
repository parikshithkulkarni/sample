import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const { balance, notes } = (await req.json()) as { balance?: number; notes?: string };

  const [row] = await sql`
    UPDATE accounts
    SET
      balance    = COALESCE(${balance ?? null}, balance),
      notes      = COALESCE(${notes ?? null}, notes),
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
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
  return new Response(null, { status: 204 });
}
