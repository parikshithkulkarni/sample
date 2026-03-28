export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runMigrations, seedDeadlines } = await import('@/lib/db');
    await runMigrations();
    await seedDeadlines();
  }
}
