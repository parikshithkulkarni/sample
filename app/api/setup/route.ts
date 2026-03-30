import { sql } from '@/lib/db';
import { scryptSync, randomBytes } from 'crypto';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function countAdmins(): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  try {
    const rows = await sql`SELECT count(*)::int AS n FROM admin_users`;
    return (rows[0] as { n: number }).n;
  } catch (err) {
    // Table may not exist yet during first setup — that's fine (0 admins).
    // Re-throw unexpected errors to prevent duplicate admin creation.
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('does not exist') || message.includes('relation')) return 0;
    throw err;
  }
}

// Public route — no auth so it works before credentials are set
export async function GET() {
  // Check if an admin account exists (env-var or DB)
  const envAdmin = !!(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);
  const dbAdminCount = await countAdmins();
  const adminExists = envAdmin || dbAdminCount > 0;

  const vars = [
    {
      key: 'ANTHROPIC_API_KEY',
      label: 'Anthropic API Key',
      hint: 'Get free credits at console.anthropic.com → API Keys',
      link: 'https://console.anthropic.com/settings/keys',
      ok: !!process.env.ANTHROPIC_API_KEY,
      required: true,
    },
    {
      key: 'DATABASE_URL',
      label: 'Postgres Database',
      hint: 'Connect Vercel Postgres Storage to this project — DATABASE_URL is set automatically.',
      link: 'https://vercel.com/dashboard',
      ok: !!process.env.DATABASE_URL,
      required: true,
    },
  ];

  // Check DB connectivity + schema
  let dbReady = false;
  let dbError = '';
  if (process.env.DATABASE_URL) {
    try {
      await sql`SELECT 1`;
      const tables = await sql`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN ('documents','chunks','deadlines','properties','accounts','admin_users')
      `;
      dbReady = (tables as { tablename: string }[]).length >= 6;
      if (!dbReady) dbError = 'Connected — schema will be created on first request.';
    } catch (e) {
      dbError = e instanceof Error ? e.message : 'Connection failed';
    }
  }

  const allRequired = vars.filter((v) => v.required).every((v) => v.ok);

  return Response.json({
    vars,
    dbReady,
    dbError,
    allRequired,
    adminExists,
    ready: allRequired && dbReady && adminExists,
  });
}

// Create first admin account — only allowed when no admin exists yet
export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: 'Database not configured' }, { status: 503 });
  }

  // Block if env-var admin is already set
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    return Response.json({ error: 'Admin already configured via environment variables' }, { status: 409 });
  }

  const existing = await countAdmins();
  if (existing > 0) {
    return Response.json({ error: 'Admin account already exists' }, { status: 409 });
  }

  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { username, password } = body;
  if (!username || username.trim().length < 2) {
    return Response.json({ error: 'Username must be at least 2 characters' }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  try {
    const { runMigrations } = await import('@/lib/db');
    await runMigrations(); // ensure admin_users table exists
    await sql`
      INSERT INTO admin_users (username, password_hash)
      VALUES (${username.trim()}, ${hashPassword(password)})
    `;
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[setup] Admin account creation failed:', e);
    return Response.json(
      { error: 'Failed to create admin account' },
      { status: 500 },
    );
  }
}
