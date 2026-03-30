import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { normalizeAddress, addressesMatch } from '@/lib/extract';

// POST /api/rentals/dedup
// Automatically detects and merges all duplicate properties (by normalized address).
// Keeps the oldest property; merges non-null fields and re-parents rental records.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const properties = await sql`SELECT id, address, purchase_price, purchase_date, market_value, mortgage_balance, notes, created_at FROM properties ORDER BY created_at ASC` as {
    id: string; address: string; purchase_price: number | null; purchase_date: string | null;
    market_value: number | null; mortgage_balance: number | null; notes: string | null; created_at: string;
  }[];

  // Group by normalized address
  const visited = new Set<string>();
  const groups: (typeof properties)[] = [];

  for (let i = 0; i < properties.length; i++) {
    if (visited.has(properties[i].id)) continue;
    const group = [properties[i]];
    for (let j = i + 1; j < properties.length; j++) {
      if (!visited.has(properties[j].id) && addressesMatch(properties[i].address, properties[j].address)) {
        group.push(properties[j]);
        visited.add(properties[j].id);
      }
    }
    if (group.length > 1) {
      visited.add(properties[i].id);
      groups.push(group);
    }
  }

  let mergedCount = 0;
  let deletedCount = 0;

  for (const group of groups) {
    // Keep the first (oldest) property
    const keep = group[0];
    const deleteIds = group.slice(1).map(p => p.id);

    // Merge non-null fields from duplicates into the kept one
    const best = {
      purchase_price: keep.purchase_price,
      purchase_date: keep.purchase_date,
      market_value: keep.market_value,
      mortgage_balance: keep.mortgage_balance,
      notes: keep.notes,
    };
    for (const dup of group.slice(1)) {
      if (best.purchase_price == null && dup.purchase_price != null) best.purchase_price = dup.purchase_price;
      if (best.purchase_date == null && dup.purchase_date != null) best.purchase_date = dup.purchase_date;
      if (best.market_value == null && dup.market_value != null) best.market_value = dup.market_value;
      if (best.mortgage_balance == null && dup.mortgage_balance != null) best.mortgage_balance = dup.mortgage_balance;
      if (best.notes == null && dup.notes != null) best.notes = dup.notes;
    }

    // Re-parent rental records
    await sql`UPDATE rental_records SET property_id = ${keep.id} WHERE property_id = ANY(${deleteIds}::uuid[])`;
    // Delete duplicates
    await sql`DELETE FROM properties WHERE id = ANY(${deleteIds}::uuid[])`;
    // Update kept property with merged fields
    await sql`UPDATE properties SET
      purchase_price = ${best.purchase_price}, purchase_date = ${best.purchase_date},
      market_value = ${best.market_value}, mortgage_balance = ${best.mortgage_balance},
      notes = ${best.notes}
    WHERE id = ${keep.id}`;

    deletedCount += deleteIds.length;
    mergedCount++;
  }

  return Response.json({ merged: mergedCount, deleted: deletedCount });
}
