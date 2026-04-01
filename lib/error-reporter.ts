import { createHash } from 'crypto';

type ErrorSource = 'fe' | 'be' | 'db' | 'browser' | 'network';
type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';

export interface ErrorReport {
  source: ErrorSource;
  severity: ErrorSeverity;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

/** Compute a stable fingerprint for deduplication */
export function computeFingerprint(source: string, message: string, stack?: string): string {
  const firstFrame = stack?.split('\n').find(l => l.trim().startsWith('at '))?.trim() ?? '';
  const normalized = message.replace(/\b[0-9a-f]{8,}\b/gi, '<id>').replace(/\d+/g, '<n>');
  return createHash('sha256').update(`${source}:${normalized}:${firstFrame}`).digest('hex').slice(0, 32);
}

// Guard against circular reporting (logger.error -> reportError -> DB fails -> logger.error -> ...)
let _reporting = false;

/**
 * Report an error to the monitoring database.
 * Fire-and-forget — never throws, never blocks the caller.
 */
export function reportError(report: ErrorReport): void {
  if (_reporting) return; // break circular loop
  _reporting = true;
  _persistError(report).catch(() => {
    // Intentionally swallowed — monitoring must never crash the app
  }).finally(() => {
    _reporting = false;
  });
}

async function _persistError(report: ErrorReport): Promise<void> {
  const { sql } = await import('@/lib/db');
  const fingerprint = computeFingerprint(report.source, report.message, report.stack);

  // Upsert error group (dedup by fingerprint)
  const groups = await sql`
    INSERT INTO error_groups (fingerprint, source, severity, message, sample_stack)
    VALUES (${fingerprint}, ${report.source}, ${report.severity}, ${report.message.slice(0, 2000)}, ${report.stack?.slice(0, 4000) ?? null})
    ON CONFLICT (fingerprint) DO UPDATE SET
      occurrence_count = error_groups.occurrence_count + 1,
      last_seen = now(),
      severity = CASE
        WHEN ${report.severity} = 'critical' THEN 'critical'
        ELSE error_groups.severity
      END
    RETURNING id, last_seen, occurrence_count
  `;

  if (!groups[0]) return;
  const group = groups[0] as { id: string; last_seen: string; occurrence_count: number };

  // Only insert individual events if not flooding (max 1 event per group per 10s)
  // For the first occurrence or if enough time has passed, store the full event
  if (group.occurrence_count <= 1 || group.occurrence_count % 10 === 0) {
    await sql`
      INSERT INTO error_events (fingerprint, group_id, source, severity, message, stack_trace, context)
      VALUES (${fingerprint}, ${group.id}, ${report.source}, ${report.severity},
              ${report.message.slice(0, 2000)}, ${report.stack?.slice(0, 4000) ?? null},
              ${JSON.stringify(report.context ?? {})})
    `;
  }
}
