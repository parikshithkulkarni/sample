import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { propertySchema, paginationSchema, parseBody, parseQuery } from '@/lib/validators';

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

  const [countRow] = await sql`SELECT count(*)::int AS total FROM properties`;
  const total = (countRow as { total: number }).total;
  const rows = await sql`
    SELECT id, address, purchase_price, purchase_date, market_value, mortgage_balance, notes, created_at
    FROM properties
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return Response.json({ data: rows, total });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const parsed = await parseBody(req, propertySchema);
  if (parsed instanceof Response) return parsed;
  const { address, purchase_price, purchase_date, market_value, mortgage_balance, notes } = parsed;

  const [row] = await sql`
    INSERT INTO properties (address, purchase_price, purchase_date, market_value, mortgage_balance, notes)
    VALUES (
      ${address},
      ${purchase_price ?? null},
      ${purchase_date ?? null},
      ${market_value ?? null},
      ${mortgage_balance ?? null},
      ${notes ?? null}
    )
    RETURNING *
  `;
  return Response.json(row, { status: 201 });
}
