import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { runMigrations } from '@/lib/db';

// GET /api/chat/sessions — list all sessions ordered by most recent
export async function GET(_req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  await runMigrations().catch(() => {});

  const rows = await sql`
    SELECT
      s.id,
      s.title,
      s.created_at,
      s.updated_at,
      COUNT(m.id)::int AS message_count
    FROM chat_sessions s
    LEFT JOIN chat_messages m ON m.session_id = s.id
    GROUP BY s.id
    ORDER BY s.updated_at DESC
    LIMIT 50
  `;
  return Response.json(rows);
}

// POST /api/chat/sessions — create a new session
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { title = 'New Chat' } = await req.json().catch(() => ({})) as { title?: string };

  const [row] = await sql`
    INSERT INTO chat_sessions (title) VALUES (${title}) RETURNING id, title, created_at, updated_at
  `;
  return Response.json(row, { status: 201 });
}
