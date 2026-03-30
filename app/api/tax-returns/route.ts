import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { US_DEFAULT, INDIA_DEFAULT } from '@/lib/tax-returns';

export const maxDuration = 30;

// GET /api/tax-returns?year=2024&country=US
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear() - 1));
  const country = searchParams.get('country') ?? 'US';

  try {
    const { runMigrations } = await import('@/lib/db');
    await runMigrations();
  } catch { /* non-fatal */ }

  const rows = await sql`
    SELECT id, tax_year, country, data, updated_at
    FROM tax_returns
    WHERE tax_year = ${year} AND country = ${country}
  ` as { id: string; tax_year: number; country: string; data: Record<string, unknown>; updated_at: string }[];

  if (rows.length === 0) {
    // Return empty default — do not write yet
    return Response.json({
      id: null,
      tax_year: year,
      country,
      data: country === 'US' ? US_DEFAULT : INDIA_DEFAULT,
      updated_at: null,
    });
  }

  return Response.json(rows[0]);
}

// POST /api/tax-returns — create/sync for a given year+country
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { year, country } = await req.json() as { year: number; country: 'US' | 'India' };

  const { syncTaxReturnsFromAccounts } = await import('@/lib/tax-returns');
  await syncTaxReturnsFromAccounts(year);

  const rows = await sql`
    SELECT id, tax_year, country, data, updated_at
    FROM tax_returns WHERE tax_year = ${year} AND country = ${country}
  ` as { id: string; tax_year: number; country: string; data: Record<string, unknown>; updated_at: string }[];

  return Response.json(rows[0] ?? { id: null, tax_year: year, country, data: country === 'US' ? US_DEFAULT : INDIA_DEFAULT, updated_at: null });
}
