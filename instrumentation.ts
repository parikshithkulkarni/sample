export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // NextAuth v4 reads NEXTAUTH_SECRET directly from env in addition to
    // authOptions.secret. Derive it so the user never needs to set a separate
    // NEXTAUTH_SECRET env var.
    if (!process.env.NEXTAUTH_SECRET) {
      const { getSecret } = await import('@/lib/auth');
      process.env.NEXTAUTH_SECRET = getSecret();
    }
    // Same for NEXTAUTH_URL — use the Vercel production domain if not set.
    if (!process.env.NEXTAUTH_URL) {
      if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
        process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
      } else if (process.env.VERCEL_URL) {
        process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`;
      }
    }
    if (process.env.DATABASE_URL) {
      try {
        const { runMigrations, seedDeadlines } = await import('@/lib/db');
        await runMigrations();
        await seedDeadlines();
      } catch (err) {
        console.error('[instrumentation] DB init failed (non-fatal):', err);
      }
    }
  }
}
