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
  const body = (await req.json()) as Record<string, unknown>;

  if ('is_done' in body) {
    const [row] = await sql`
      UPDATE deadlines SET is_done = ${body.is_done as boolean} WHERE id = ${id} RETURNING *
    `;
    return Response.json(row);
  }

  return Response.json({ error: 'Nothing to update' }, { status: 400 });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  await sql`DELETE FROM deadlines WHERE id = ${id}`;
  return new Response(null, { status: 204 });
}
