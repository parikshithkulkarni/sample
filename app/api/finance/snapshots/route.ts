import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

// GET /api/finance/snapshots — return historical net worth snapshots (last 365 days)
export async function GET(_req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const rows = await sql`
    SELECT
      snapshot_date,
      net_worth::float     AS net_worth,
      total_assets::float  AS total_assets,
      total_liabs::float   AS total_liabs
    FROM net_worth_snapshots
    ORDER BY snapshot_date ASC
    LIMIT 365
  `;
  return Response.json(rows);
}
