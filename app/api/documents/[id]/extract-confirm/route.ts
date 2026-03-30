import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { runMigrations } from '@/lib/migrate';

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

  const { accounts, properties } = (await req.json()) as {
    accounts: { name: string; type: string; category: string; balance: number | null; currency: string; notes?: string }[];
    properties: { address: string; purchase_price: number | null; purchase_date: string | null; market_value: number | null; mortgage_balance: number | null; monthly_rent: number | null; notes?: string }[];
  };

  const assetCategories = new Set(['401k','roth_ira','brokerage','rsu','espp','real_estate','savings','checking','crypto','other']);
  const liabilityCategories = new Set(['mortgage','auto_loan','credit_card','student_loan','other']);

  const savedAccounts: string[] = [];
  const savedProperties: string[] = [];

  for (const acct of accounts ?? []) {
    if (!acct.name || !acct.type) continue;
    const validCats = acct.type === 'asset' ? assetCategories : liabilityCategories;
    const category = validCats.has(acct.category) ? acct.category : 'other';
    const balance = typeof acct.balance === 'number' && !isNaN(acct.balance) ? acct.balance : 0;

    const existing = await sql`SELECT id FROM accounts WHERE lower(name) = lower(${acct.name})`;
    if ((existing as unknown[]).length > 0) {
      // Update existing
      await sql`
        UPDATE accounts SET
          type     = ${acct.type},
          category = ${category},
          balance  = ${balance},
          currency = ${acct.currency ?? 'USD'},
          notes    = ${acct.notes ?? null}
        WHERE lower(name) = lower(${acct.name})
      `;
      savedAccounts.push(`${acct.name} (updated)`);
    } else {
      await sql`
        INSERT INTO accounts (name, type, category, balance, currency, notes)
        VALUES (${acct.name}, ${acct.type}, ${category}, ${balance}, ${acct.currency ?? 'USD'}, ${acct.notes ?? null})
      `;
      savedAccounts.push(acct.name);
    }
  }

  for (const prop of properties ?? []) {
    if (!prop.address) continue;
    const purchase_price   = typeof prop.purchase_price === 'number'   ? prop.purchase_price   : null;
    const market_value     = typeof prop.market_value === 'number'     ? prop.market_value     : null;
    const mortgage_balance = typeof prop.mortgage_balance === 'number' ? prop.mortgage_balance : null;
    const monthly_rent     = typeof prop.monthly_rent === 'number'     ? prop.monthly_rent     : null;

    const existing = await sql`SELECT id FROM properties WHERE lower(address) = lower(${prop.address})` as { id: string }[];
    if (existing.length > 0) {
      await sql`
        UPDATE properties SET
          purchase_price   = ${purchase_price},
          purchase_date    = ${prop.purchase_date ?? null},
          market_value     = ${market_value},
          mortgage_balance = ${mortgage_balance},
          notes            = ${prop.notes ?? null}
        WHERE id = ${existing[0].id}
      `;
      savedProperties.push(`${prop.address} (updated)`);
    } else {
      await sql`
        INSERT INTO properties (address, purchase_price, purchase_date, market_value, mortgage_balance, notes)
        VALUES (${prop.address}, ${purchase_price}, ${prop.purchase_date ?? null}, ${market_value}, ${mortgage_balance}, ${prop.notes ?? null})
      `;
      savedProperties.push(prop.address);
    }
  }

  // Mark document as extracted
  await sql`UPDATE documents SET extracted_at = NOW() WHERE id = ${id}`.catch(() => {});

  return Response.json({ saved: { accounts: savedAccounts, properties: savedProperties } });
}
