import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function GET(_req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const rows = await sql`
    SELECT id, name, type, category, balance, currency, notes, updated_at
    FROM accounts
    ORDER BY type DESC, category, name
  `;
  return Response.json(rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { name, type, category, balance, currency = 'USD', notes } =
    (await req.json()) as {
      name: string;
      type: 'asset' | 'liability';
      category: string;
      balance: number;
      currency?: string;
      notes?: string;
    };

  const [row] = await sql`
    INSERT INTO accounts (name, type, category, balance, currency, notes)
    VALUES (${name}, ${type}, ${category}, ${balance}, ${currency}, ${notes ?? null})
    RETURNING *
  `;
  return Response.json(row, { status: 201 });
}
