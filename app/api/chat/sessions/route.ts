import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { runMigrations } from '@/lib/db';
import { paginationSchema, parseQuery } from '@/lib/validators';

// GET /api/chat/sessions — list sessions with pagination
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  await runMigrations().catch(() => {});

  const { searchParams } = new URL(req.url);
  const pagination = parseQuery(searchParams, paginationSchema);
  if (pagination instanceof Response) return pagination;
  const { limit, offset } = pagination;

  const [countRow] = await sql`SELECT count(*)::int AS total FROM chat_sessions`;
  const total = (countRow as { total: number }).total;

  const rows = await sql`
    SELECT
      s.id,
      s.title,
      s.summary,
      s.created_at,
      s.updated_at,
      COUNT(m.id)::int AS message_count
    FROM chat_sessions s
    LEFT JOIN chat_messages m ON m.session_id = s.id
    GROUP BY s.id
    ORDER BY s.updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return Response.json({ data: rows, total });
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
