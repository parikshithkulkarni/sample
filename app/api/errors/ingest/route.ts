import { z } from 'zod';
import { computeFingerprint } from '@/lib/error-reporter';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

const ingestSchema = z.object({
  source: z.enum(['fe', 'be', 'db', 'browser', 'network']),
  severity: z.enum(['critical', 'error', 'warning', 'info']),
  message: z.string().min(1).max(4000),
  stack: z.string().max(8000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  // Rate limit by IP: 60 errors per minute per client
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(`error-ingest:${ip}`, 60, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed' }, { status: 400 });
  }

  const { source, severity, message, stack, context } = parsed.data;

  // Fire-and-forget persist — return 202 immediately
  persistError({ source, severity, message, stack, context }).catch(() => {});

  return new Response(null, { status: 202 });
}

async function persistError(data: z.infer<typeof ingestSchema>) {
  const { sql } = await import('@/lib/db');
  const fingerprint = computeFingerprint(data.source, data.message, data.stack);

  const groups = await sql`
    INSERT INTO error_groups (fingerprint, source, severity, message, sample_stack)
    VALUES (${fingerprint}, ${data.source}, ${data.severity}, ${data.message.slice(0, 2000)}, ${data.stack?.slice(0, 4000) ?? null})
    ON CONFLICT (fingerprint) DO UPDATE SET
      occurrence_count = error_groups.occurrence_count + 1,
      last_seen = now(),
      severity = CASE
        WHEN ${data.severity} = 'critical' THEN 'critical'
        ELSE error_groups.severity
      END
    RETURNING id, occurrence_count
  `;

  const group = groups[0] as { id: string; occurrence_count: number };

  // Store individual events sparingly to avoid flooding
  if (group.occurrence_count <= 1 || group.occurrence_count % 10 === 0) {
    await sql`
      INSERT INTO error_events (fingerprint, group_id, source, severity, message, stack_trace, context)
      VALUES (${fingerprint}, ${group.id}, ${data.source}, ${data.severity},
              ${data.message.slice(0, 2000)}, ${data.stack?.slice(0, 4000) ?? null},
              ${JSON.stringify(data.context ?? {})})
    `;
  }
}
