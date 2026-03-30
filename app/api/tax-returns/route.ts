import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { US_DEFAULT, INDIA_DEFAULT } from '@/lib/tax-returns';

export const maxDuration = 30;

// Deep-merge defaults into stored data so missing nested fields are always present
function mergeWithDefaults(stored: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(stored)) {
    if (stored[key] !== null && typeof stored[key] === 'object' && !Array.isArray(stored[key]) &&
        typeof defaults[key] === 'object' && defaults[key] !== null) {
      out[key] = mergeWithDefaults(stored[key] as Record<string, unknown>, defaults[key] as Record<string, unknown>);
    } else if (stored[key] !== undefined) {
      out[key] = stored[key];
    }
  }
  return out;
}

// GET /api/tax-returns?year=2024&country=US
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear() - 1));
  const country = searchParams.get('country') ?? 'US';
  const defaults = country === 'US' ? US_DEFAULT : INDIA_DEFAULT;

  try {
    const { runMigrations } = await import('@/lib/db');
    await runMigrations();
  } catch { /* non-fatal */ }

  try {
    const rows = await sql`
      SELECT id, tax_year, country, data, updated_at
      FROM tax_returns
      WHERE tax_year = ${year} AND country = ${country}
    ` as { id: string; tax_year: number; country: string; data: Record<string, unknown>; updated_at: string }[];

    if (rows.length === 0) {
      return Response.json({ id: null, tax_year: year, country, data: defaults, updated_at: null });
    }

    // Always merge stored data with defaults so missing nested objects are filled in
    const merged = mergeWithDefaults(rows[0].data, defaults as unknown as Record<string, unknown>);
    return Response.json({ ...rows[0], data: merged });
  } catch {
    return Response.json({ id: null, tax_year: year, country, data: defaults, updated_at: null });
  }
}

// POST /api/tax-returns — create/sync for a given year+country
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { year, country } = await req.json() as { year: number; country: 'US' | 'India' };
  const defaults = country === 'US' ? US_DEFAULT : INDIA_DEFAULT;

  const { syncTaxReturnsFromAccounts } = await import('@/lib/tax-returns');
  await syncTaxReturnsFromAccounts(year);

  const rows = await sql`
    SELECT id, tax_year, country, data, updated_at
    FROM tax_returns WHERE tax_year = ${year} AND country = ${country}
  ` as { id: string; tax_year: number; country: string; data: Record<string, unknown>; updated_at: string }[];

  if (rows.length === 0) {
    return Response.json({ id: null, tax_year: year, country, data: defaults, updated_at: null });
  }
  const merged = mergeWithDefaults(rows[0].data, defaults as unknown as Record<string, unknown>);
  return Response.json({ ...rows[0], data: merged });
}

