import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { deadlineSchema, paginationSchema, parseBody, parseQuery } from '@/lib/validators';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const { runMigrations, seedDeadlines } = await import('@/lib/db');
    await runMigrations();
    await seedDeadlines();
  } catch { /* non-fatal */ }

  const { searchParams } = new URL(req.url);
  const pagination = parseQuery(searchParams, paginationSchema);
  if (pagination instanceof Response) return pagination;
  const { limit, offset } = pagination;

  const [countRow] = await sql`SELECT count(*)::int AS total FROM deadlines`;
  const total = (countRow as { total: number }).total;
  const rows = await sql`
    SELECT id, title, due_date, category, notes, is_done, is_recurring
    FROM deadlines
    ORDER BY due_date ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return Response.json({ data: rows, total });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const parsed = await parseBody(req, deadlineSchema);
  if (parsed instanceof Response) return parsed;
  const { title, due_date, category, notes, is_recurring } = parsed;

  const [row] = await sql`
    INSERT INTO deadlines (title, due_date, category, notes, is_recurring)
    VALUES (${title}, ${due_date}, ${category}, ${notes ?? null}, ${is_recurring})
    RETURNING *
  `;
  return Response.json(row, { status: 201 });
}
