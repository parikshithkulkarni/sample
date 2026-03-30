import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

// More aggressive address normalization for dedup
function normalizeAddr(addr: string): string {
  return addr
    .toLowerCase()
    // Strip unit/apt/suite numbers for matching
    .replace(/\b(apt|suite|ste|unit|#)\s*\w+/gi, '')
    // Strip zip codes
    .replace(/\b\d{5}(-\d{4})?\b/g, '')
    // Standardize street suffixes
    .replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave').replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bdrive\b/g, 'dr').replace(/\broad\b/g, 'rd').replace(/\bcourt\b/g, 'ct')
    .replace(/\blane\b/g, 'ln').replace(/\bplace\b/g, 'pl').replace(/\bcircle\b/g, 'cir')
    .replace(/\bterrace\b/g, 'trl').replace(/\bparkway\b/g, 'pkwy').replace(/\bhighway\b/g, 'hwy')
    // Strip state names
    .replace(/\b(texas|california|new york|florida|illinois|georgia|ohio|virginia|washington)\b/gi, '')
    // Strip common abbreviations
    .replace(/\b(tx|ca|ny|fl|il|ga|oh|va|wa|nc|nj|pa|az|co|tn|md|mn|wi|or|sc|al|la|ky|ok|ct|ia|ms|ar|ks|nv|nm|ne|wv|id|hi|me|nh|ri|mt|de|sd|nd|ak|vt|wy|dc)\b/gi, '')
    .replace(/[,\.#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addrMatch(a: string, b: string): boolean {
  const na = normalizeAddr(a);
  const nb = normalizeAddr(b);
  if (!na || !nb) return false;
  return na === nb || na.startsWith(nb + ' ') || nb.startsWith(na + ' ') || na.includes(nb) || nb.includes(na);
}

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
      if (!visited.has(properties[j].id) && addrMatch(properties[i].address, properties[j].address)) {
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
    // Keep the property with the most complete data (most non-null fields)
    const keep = group.reduce((best, p) => {
      const score = (p2: typeof p) => [p2.purchase_price, p2.purchase_date, p2.market_value, p2.mortgage_balance, p2.notes].filter(Boolean).length;
      return score(p) > score(best) ? p : best;
    });
    const deleteIds = group.filter(p => p.id !== keep.id).map(p => p.id);

    // Merge: take best non-null value from all duplicates
    const best = {
      address: group.reduce((a, p) => p.address.length > a.length ? p.address : a, keep.address),
      purchase_price: keep.purchase_price,
      purchase_date: keep.purchase_date,
      market_value: keep.market_value,
      mortgage_balance: keep.mortgage_balance,
      notes: keep.notes,
    };
    for (const dup of group) {
      if (dup.id === keep.id) continue;
      if (best.purchase_price == null && dup.purchase_price != null) best.purchase_price = dup.purchase_price;
      if (best.purchase_date == null && dup.purchase_date != null) best.purchase_date = dup.purchase_date;
      if (best.market_value == null && dup.market_value != null) best.market_value = dup.market_value;
      if (best.mortgage_balance == null && dup.mortgage_balance != null) best.mortgage_balance = dup.mortgage_balance;
      if (!best.notes && dup.notes) best.notes = dup.notes;
    }

    // Re-parent rental records
    await sql`UPDATE rental_records SET property_id = ${keep.id} WHERE property_id = ANY(${deleteIds}::uuid[])`;
    // Delete duplicates
    await sql`DELETE FROM properties WHERE id = ANY(${deleteIds}::uuid[])`;
    // Update kept property with merged fields (use best address too)
    await sql`UPDATE properties SET
      address = ${best.address},
      purchase_price = ${best.purchase_price}, purchase_date = ${best.purchase_date},
      market_value = ${best.market_value}, mortgage_balance = ${best.mortgage_balance},
      notes = ${best.notes}
    WHERE id = ${keep.id}`;

    deletedCount += deleteIds.length;
    mergedCount++;
  }

  return Response.json({ merged: mergedCount, deleted: deletedCount });
}
