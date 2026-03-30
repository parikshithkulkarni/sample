import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { taxReturnPatchSchema, parseBody } from '@/lib/validators';

export const maxDuration = 30;

// PATCH /api/tax-returns/[id] — merge partial data update
// Body: { year, country, data: Partial<UsData | IndiaData> }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const parsed = await parseBody(req, taxReturnPatchSchema);
  if (parsed instanceof Response) return parsed;
  const { year, country, data: patch } = parsed;

  // id='new' means we're creating for the first time
  if (id === 'new') {
    const { US_DEFAULT, INDIA_DEFAULT } = await import('@/lib/tax-returns');
    const base = country === 'US' ? { ...US_DEFAULT } : { ...INDIA_DEFAULT };
    const merged = deepMerge(base as Record<string, unknown>, patch);
    const [row] = await sql`
      INSERT INTO tax_returns (tax_year, country, data)
      VALUES (${year}, ${country}, ${JSON.stringify(merged)})
      ON CONFLICT (tax_year, country) DO UPDATE
        SET data = ${JSON.stringify(merged)}, updated_at = now()
      RETURNING id, tax_year, country, data, updated_at
    ` as { id: string; tax_year: number; country: string; data: Record<string, unknown>; updated_at: string }[];
    return Response.json(row);
  }

  // Merge patch into existing
  const rows = await sql`SELECT data FROM tax_returns WHERE id = ${id}` as { data: Record<string, unknown> }[];
  if (!rows.length) return Response.json({ error: 'Not found' }, { status: 404 });

  const merged = deepMerge(rows[0].data, patch);
  const [updated] = await sql`
    UPDATE tax_returns SET data = ${JSON.stringify(merged)}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, tax_year, country, data, updated_at
  ` as { id: string; tax_year: number; country: string; data: Record<string, unknown>; updated_at: string }[];
  return Response.json(updated);
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key]) && typeof out[key] === 'object' && out[key] !== null) {
      out[key] = deepMerge(out[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}
