import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

/**
 * GET /api/errors — List error groups with optional filters
 * Query params: source, severity, status, limit, offset
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source');
  const severity = searchParams.get('severity');
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10) || 0;

  // Build dynamic query with filters
  const groups = await sql`
    SELECT id, fingerprint, source, severity, message, sample_stack,
           occurrence_count, first_seen, last_seen, status, analysis,
           proposed_fix, github_issue_url, created_at
    FROM error_groups
    WHERE (${source}::text IS NULL OR source = ${source})
      AND (${severity}::text IS NULL OR severity = ${severity})
      AND (${status}::text IS NULL OR status = ${status})
    ORDER BY
      CASE status WHEN 'new' THEN 0 WHEN 'analyzing' THEN 1 WHEN 'fix_proposed' THEN 2 ELSE 3 END,
      last_seen DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Get summary stats
  const stats = await sql`
    SELECT
      count(*)::int as total,
      count(*) FILTER (WHERE status = 'new')::int as new_count,
      count(*) FILTER (WHERE severity = 'critical')::int as critical_count,
      count(*) FILTER (WHERE status = 'resolved')::int as resolved_count,
      count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int as last_24h
    FROM error_groups
  `;

  return Response.json({
    data: groups,
    stats: stats[0],
  });
}
