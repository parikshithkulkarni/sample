import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

// POST /api/rentals/merge
// Body: { keepId: string, deleteIds: string[] }
// Merges duplicate properties: copies non-null fields from deleted rows into keep row, then deletes them.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { keepId, deleteIds } = (await req.json()) as { keepId: string; deleteIds: string[] };
  if (!keepId || !deleteIds?.length) return Response.json({ error: 'keepId and deleteIds required' }, { status: 400 });

  // Fetch all rows
  const ids = [keepId, ...deleteIds];
  const rows = await sql`SELECT * FROM properties WHERE id = ANY(${ids}::uuid[])` as {
    id: string; address: string; purchase_price: number | null; purchase_date: string | null;
    market_value: number | null; mortgage_balance: number | null; notes: string | null;
  }[];

  const keep = rows.find(r => r.id === keepId);
  if (!keep) return Response.json({ error: 'keepId not found' }, { status: 404 });

  // Merge non-null fields from deleted rows into keep row
  for (const row of rows.filter(r => r.id !== keepId)) {
    if (!keep.purchase_price && row.purchase_price) keep.purchase_price = row.purchase_price;
    if (!keep.purchase_date && row.purchase_date) keep.purchase_date = row.purchase_date;
    if (!keep.market_value && row.market_value) keep.market_value = row.market_value;
    if (!keep.mortgage_balance && row.mortgage_balance) keep.mortgage_balance = row.mortgage_balance;
    if (!keep.notes && row.notes) keep.notes = row.notes;
  }

  // Update keep row with merged data
  await sql`
    UPDATE properties SET
      purchase_price   = ${keep.purchase_price},
      purchase_date    = ${keep.purchase_date},
      market_value     = ${keep.market_value},
      mortgage_balance = ${keep.mortgage_balance},
      notes            = ${keep.notes}
    WHERE id = ${keepId}
  `;

  // Re-parent rental records from deleted properties to keep property
  for (const delId of deleteIds) {
    await sql`UPDATE rental_records SET property_id = ${keepId} WHERE property_id = ${delId}`;
    await sql`DELETE FROM properties WHERE id = ${delId}`;
  }

  const [updated] = await sql`SELECT * FROM properties WHERE id = ${keepId}`;
  return Response.json(updated);
}
