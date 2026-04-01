import { sql } from '@/lib/db';
import { reportError } from '@/lib/error-reporter';

/**
 * Wrapper around the Neon `sql` tagged template that reports query failures
 * to the error monitoring system. Re-throws the original error so callers
 * still handle it normally.
 *
 * Usage: replace `import { sql } from '@/lib/db'` with
 *        `import { monitoredSql as sql } from '@/lib/monitored-sql'`
 */
export async function monitoredSql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<unknown[]> {
  try {
    return await sql(strings, ...values);
  } catch (err) {
    // Only log the SQL template (static parts), never interpolated values
    const queryPreview = strings[0]?.slice(0, 200) ?? 'unknown query';
    reportError({
      source: 'db',
      severity: 'error',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      context: { query: queryPreview },
    });
    throw err;
  }
}
