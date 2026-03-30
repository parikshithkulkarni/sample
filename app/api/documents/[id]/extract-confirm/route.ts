import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { runMigrations } from '@/lib/db';
import { extractConfirmSchema, parseBody } from '@/lib/validators';
import { logger } from '@/lib/logger';
import { accountNamesMatch, addressesMatch } from '@/lib/extract';

export const maxDuration = 30;

// POST /api/documents/[id]/extract-confirm
// Saves user-reviewed extraction data to DB (no Claude call — data already reviewed)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  await runMigrations();
  const { id } = await params;

  const parsed = await parseBody(req, extractConfirmSchema);
  if (parsed instanceof Response) return parsed;
  const { accounts, properties } = parsed;

  const savedAccounts: string[] = [];
  const savedProperties: string[] = [];

  // Load all existing accounts for smart dedup
  const allAccounts = await sql`SELECT id, name FROM accounts` as { id: string; name: string }[];

  for (const acct of accounts ?? []) {
    if (!acct.name || !acct.type) continue;
    const category = acct.category ? acct.category.toLowerCase().replace(/[^a-z0-9_]/g, '_') || 'other' : 'other';
    const balance = typeof acct.balance === 'number' && !isNaN(acct.balance) ? acct.balance : 0;

    const match = allAccounts.find(a => accountNamesMatch(a.name, acct.name));
    if (match) {
      // Update existing
      await sql`
        UPDATE accounts SET
          type     = ${acct.type},
          category = ${category},
          balance  = ${balance},
          currency = ${acct.currency ?? 'USD'},
          notes    = ${acct.notes ?? null}
        WHERE id = ${match.id}
      `;
      savedAccounts.push(`${acct.name} (updated)`);
    } else {
      await sql`
        INSERT INTO accounts (name, type, category, balance, currency, notes)
        VALUES (${acct.name}, ${acct.type}, ${category}, ${balance}, ${acct.currency ?? 'USD'}, ${acct.notes ?? null})
      `;
      allAccounts.push({ id: 'new', name: acct.name }); // prevent dupes within same batch
      savedAccounts.push(acct.name);
    }
  }

  // Load all existing properties for smart dedup
  const allProperties = await sql`SELECT id, address FROM properties` as { id: string; address: string }[];

  for (const prop of properties ?? []) {
    if (!prop.address) continue;
    const purchase_price   = typeof prop.purchase_price === 'number'   ? prop.purchase_price   : null;
    const market_value     = typeof prop.market_value === 'number'     ? prop.market_value     : null;
    const mortgage_balance = typeof prop.mortgage_balance === 'number' ? prop.mortgage_balance : null;

    const match = allProperties.find(p => addressesMatch(p.address, prop.address));
    if (match) {
      await sql`
        UPDATE properties SET
          purchase_price   = COALESCE(${purchase_price}, purchase_price),
          purchase_date    = COALESCE(${prop.purchase_date ?? null}, purchase_date),
          market_value     = COALESCE(${market_value}, market_value),
          mortgage_balance = COALESCE(${mortgage_balance}, mortgage_balance),
          notes            = COALESCE(${prop.notes ?? null}, notes)
        WHERE id = ${match.id}
      `;
      savedProperties.push(`${prop.address} (updated)`);
    } else {
      await sql`
        INSERT INTO properties (address, purchase_price, purchase_date, market_value, mortgage_balance, notes)
        VALUES (${prop.address}, ${purchase_price}, ${prop.purchase_date ?? null}, ${market_value}, ${mortgage_balance}, ${prop.notes ?? null})
      `;
      allProperties.push({ id: 'new', address: prop.address }); // prevent dupes within same batch
      savedProperties.push(prop.address);
    }
  }

  // Mark document as extracted
  await sql`UPDATE documents SET extracted_at = NOW() WHERE id = ${id}`.catch(
    (err: unknown) => logger.error('Failed to mark document as extracted', err, { documentId: id }),
  );

  // Auto-sync tax returns from the newly saved accounts (fire-and-forget)
  import('@/lib/tax-returns').then(({ syncTaxReturnsFromAccounts }) => {
    syncTaxReturnsFromAccounts().catch((err: unknown) => logger.error('Failed to sync tax returns', err));
  }).catch((err: unknown) => logger.error('Failed to import tax-returns module', err));

  return Response.json({ saved: { accounts: savedAccounts, properties: savedProperties } });
}
