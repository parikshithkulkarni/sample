import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { deadlinePatchSchema, parseBody } from '@/lib/validators';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const parsed = await parseBody(req, deadlinePatchSchema);
  if (parsed instanceof Response) return parsed;

  const [row] = await sql`
    UPDATE deadlines SET is_done = ${parsed.is_done} WHERE id = ${id} RETURNING *
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
  await sql`DELETE FROM deadlines WHERE id = ${id}`;
  return new Response(null, { status: 204 });
}
