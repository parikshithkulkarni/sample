import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { accountSchema, paginationSchema, parseBody, parseQuery } from '@/lib/validators';
import { accountNamesMatch } from '@/lib/extract';

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

  // Check for existing account with similar name (fuzzy normalized match)
  const existing = await sql`SELECT id, name, balance FROM accounts` as { id: string; name: string; balance: number }[];
  const match = existing.find(a => accountNamesMatch(a.name, name));

  if (match) {
    // Update existing account instead of creating duplicate
    const [updated] = await sql`
      UPDATE accounts SET balance = ${balance}, type = ${type}, category = ${category},
        currency = ${currency}, notes = ${notes ?? null}, updated_at = NOW()
      WHERE id = ${match.id}
      RETURNING *
    `;
    const { takeNetWorthSnapshot } = await import('@/lib/snapshots');
    takeNetWorthSnapshot().catch(() => {});
    return Response.json(updated);
  }

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
