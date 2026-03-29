// Public diagnostic + migration trigger endpoint — no auth, safe to expose
export async function GET() {
  const dbUrl = process.env.DATABASE_URL;
  const result: Record<string, unknown> = {
    ok: true,
    hasDb: !!dbUrl,
    dbPrefix: dbUrl ? dbUrl.slice(0, 25) + '...' : null,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    tables: [] as string[],
    migrationsError: null as string | null,
  };

  if (dbUrl) {
    try {
      const { sql, runMigrations } = await import('@/lib/db');
      await runMigrations();
      const rows = await sql`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `;
      result.tables = (rows as { tablename: string }[]).map((r) => r.tablename);
    } catch (e) {
      result.migrationsError = e instanceof Error ? e.message : String(e);
    }
  }

  return Response.json(result);
}
