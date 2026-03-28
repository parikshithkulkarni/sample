import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { propertyId } = await params;
  const [row] = await sql`SELECT * FROM properties WHERE id = ${propertyId}`;
  if (!row) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(row);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { propertyId } = await params;
  const { market_value, mortgage_balance, notes } = (await req.json()) as {
    market_value?: number;
    mortgage_balance?: number;
    notes?: string;
  };

  const [row] = await sql`
    UPDATE properties
    SET
      market_value     = COALESCE(${market_value ?? null}, market_value),
      mortgage_balance = COALESCE(${mortgage_balance ?? null}, mortgage_balance),
      notes            = COALESCE(${notes ?? null}, notes)
    WHERE id = ${propertyId}
    RETURNING *
  `;
  return Response.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { propertyId } = await params;
  await sql`DELETE FROM properties WHERE id = ${propertyId}`;
  return new Response(null, { status: 204 });
}
