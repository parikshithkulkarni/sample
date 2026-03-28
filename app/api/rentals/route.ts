import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function GET(_req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const rows = await sql`
    SELECT id, address, purchase_price, purchase_date, market_value, mortgage_balance, notes, created_at
    FROM properties
    ORDER BY created_at DESC
  `;
  return Response.json(rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { address, purchase_price, purchase_date, market_value, mortgage_balance, notes } =
    (await req.json()) as {
      address: string;
      purchase_price?: number;
      purchase_date?: string;
      market_value?: number;
      mortgage_balance?: number;
      notes?: string;
    };

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
