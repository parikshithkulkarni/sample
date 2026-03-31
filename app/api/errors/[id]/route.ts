import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { analyzeErrorGroup } from '@/lib/error-analyzer';
import { createErrorIssue } from '@/lib/error-github';
import { logger } from '@/lib/logger';

/**
 * GET /api/errors/:id — Get error group detail with recent events
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;

  const groups = await sql`
    SELECT * FROM error_groups WHERE id = ${id}
  `;
  if (groups.length === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const events = await sql`
    SELECT id, source, severity, message, stack_trace, context, created_at
    FROM error_events
    WHERE group_id = ${id}
    ORDER BY created_at DESC
    LIMIT 20
  `;

  return Response.json({
    group: groups[0],
    events,
  });
}

/**
 * PATCH /api/errors/:id — Update status (resolve, ignore, re-analyze)
 * Body: { action: 'resolve' | 'ignore' | 'reanalyze' | 'create_issue' }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;

  let body: { action: string };
  try {
    body = await req.json() as { action: string };
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action } = body;

  const groups = await sql`SELECT * FROM error_groups WHERE id = ${id}`;
  if (groups.length === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const group = groups[0] as Record<string, unknown>;

  switch (action) {
    case 'resolve':
      await sql`UPDATE error_groups SET status = 'resolved' WHERE id = ${id}`;
      return Response.json({ status: 'resolved' });

    case 'ignore':
      await sql`UPDATE error_groups SET status = 'ignored' WHERE id = ${id}`;
      return Response.json({ status: 'ignored' });

    case 'reanalyze':
      try {
        await sql`UPDATE error_groups SET status = 'analyzing' WHERE id = ${id}`;
        const analysis = await analyzeErrorGroup(group as unknown as Parameters<typeof analyzeErrorGroup>[0]);
        return Response.json({ status: 'fix_proposed', analysis });
      } catch (err) {
        logger.error('Re-analysis failed', err, { groupId: id });
        await sql`UPDATE error_groups SET status = 'new' WHERE id = ${id}`;
        return Response.json({ error: 'Analysis failed' }, { status: 500 });
      }

    case 'create_issue':
      try {
        const issueUrl = await createErrorIssue(group as unknown as Parameters<typeof createErrorIssue>[0]);
        if (!issueUrl) {
          return Response.json({ error: 'GitHub integration not configured' }, { status: 400 });
        }
        return Response.json({ status: 'issue_created', github_issue_url: issueUrl });
      } catch (err) {
        logger.error('Issue creation failed', err, { groupId: id });
        return Response.json({ error: 'Failed to create issue' }, { status: 500 });
      }

    default:
      return Response.json({ error: 'Invalid action' }, { status: 400 });
  }
}
