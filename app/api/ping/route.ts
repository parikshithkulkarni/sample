// Health check endpoint — no auth, safe to expose
export async function GET() {
  const checks: Record<string, { status: 'ok' | 'error'; detail?: string }> = {};
  let overallStatus: 'ok' | 'degraded' | 'error' = 'ok';

  // Database check
  if (process.env.DATABASE_URL) {
    try {
      const { sql, runMigrations } = await import('@/lib/db');
      await sql`SELECT 1`;
      checks.database = { status: 'ok' };

      // Check schema
      try {
        await runMigrations();
        const rows = await sql`
          SELECT tablename FROM pg_tables
          WHERE schemaname = 'public'
          ORDER BY tablename
        `;
        const tables = (rows as { tablename: string }[]).map((r) => r.tablename);
        checks.schema = { status: 'ok', detail: `${tables.length} tables` };
      } catch (e) {
        checks.schema = { status: 'error', detail: e instanceof Error ? e.message : 'Migration failed' };
        overallStatus = 'degraded';
      }
    } catch (e) {
      checks.database = { status: 'error', detail: 'Connection failed' };
      overallStatus = 'error';
    }
  } else {
    checks.database = { status: 'error', detail: 'DATABASE_URL not configured' };
    overallStatus = 'error';
  }

  // API keys check
  checks.anthropic = process.env.ANTHROPIC_API_KEY
    ? { status: 'ok' }
    : { status: 'error', detail: 'ANTHROPIC_API_KEY not set' };

  if (!process.env.ANTHROPIC_API_KEY) overallStatus = 'error';

  checks.embeddings = process.env.OPENAI_API_KEY
    ? { status: 'ok' }
    : { status: 'ok', detail: 'OPENAI_API_KEY not set (using FTS fallback)' };

  checks.webSearch = process.env.TAVILY_API_KEY
    ? { status: 'ok' }
    : { status: 'ok', detail: 'TAVILY_API_KEY not set (web search disabled)' };

  return Response.json({
    status: overallStatus,
    checks,
    timestamp: new Date().toISOString(),
  });
}
