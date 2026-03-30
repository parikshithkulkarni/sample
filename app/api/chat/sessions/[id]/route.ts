import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

// GET /api/chat/sessions/[id] — fetch session with all messages
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;

  const [sessionRow] = await sql`SELECT id, title, created_at, updated_at FROM chat_sessions WHERE id = ${id}`;
  if (!sessionRow) return Response.json({ error: 'Not found' }, { status: 404 });

  const messages = await sql`
    SELECT id, role, content, created_at FROM chat_messages
    WHERE session_id = ${id} ORDER BY created_at ASC
  `;

  return Response.json({ ...sessionRow, messages });
}

// PATCH /api/chat/sessions/[id] — update session title
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const { title } = await req.json() as { title: string };

  const [row] = await sql`
    UPDATE chat_sessions SET title = ${title}, updated_at = now()
    WHERE id = ${id} RETURNING id, title, updated_at
  `;
  return Response.json(row);
}

// DELETE /api/chat/sessions/[id] — delete session and all messages
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  await sql`DELETE FROM chat_sessions WHERE id = ${id}`;
  return new Response(null, { status: 204 });
}
