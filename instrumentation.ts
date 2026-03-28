export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { seedDeadlines } = await import('@/lib/db');
    await seedDeadlines();
  }
}
