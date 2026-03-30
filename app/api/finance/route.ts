import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { accountSchema, paginationSchema, parseBody, parseQuery } from '@/lib/validators';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const { runMigrations } = await import('@/lib/db');
    await runMigrations();
  } catch { /* non-fatal */ }

  const { searchParams } = new URL(req.url);
  const pagination = parseQuery(searchParams, paginationSchema);
  if (pagination instanceof Response) return pagination;
  const { limit, offset } = pagination;

  const [countRow] = await sql`SELECT count(*)::int AS total FROM accounts`;
  const total = (countRow as { total: number }).total;
  const rows = await sql`
    SELECT id, name, type, category, balance, currency, notes, updated_at
    FROM accounts
    ORDER BY type DESC, category, name
    LIMIT ${limit} OFFSET ${offset}
  `;
  return Response.json({ data: rows, total });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const parsed = await parseBody(req, accountSchema);
  if (parsed instanceof Response) return parsed;
  const { name, type, category, balance, currency, notes } = parsed;

  const [row] = await sql`
    INSERT INTO accounts (name, type, category, balance, currency, notes)
    VALUES (${name}, ${type}, ${category}, ${balance}, ${currency}, ${notes ?? null})
    RETURNING *
  `;
  // Update today's net worth snapshot
  const { takeNetWorthSnapshot } = await import('@/lib/snapshots');
  takeNetWorthSnapshot().catch(() => {});

  return Response.json(row, { status: 201 });
}
