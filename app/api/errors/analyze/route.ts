import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { processNewErrors } from '@/lib/error-analyzer';
import { logger } from '@/lib/logger';

/**
 * GET /api/errors/analyze
 * Triggered by Vercel Cron (every 5 minutes) or manually from the dashboard.
 * Analyzes unprocessed error groups using Claude.
 */
export async function GET(req: Request) {
  // Allow Vercel Cron (Authorization: Bearer <CRON_SECRET>) or authenticated users
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const session = await getServerSession(authOptions);
    if (!session) return new Response('Unauthorized', { status: 401 });
  }

  try {
    const analyzed = await processNewErrors();
    return Response.json({
      analyzed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Error analysis cron failed', err);
    return Response.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
