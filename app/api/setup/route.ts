import { sql } from '@/lib/db';

interface Check {
  key: string;
  label: string;
  hint: string;
  ok: boolean;
}

// Public route — no auth so it works before credentials are set
export async function GET() {
  const vars: Check[] = [
    {
      key: 'ANTHROPIC_API_KEY',
      label: 'Anthropic API Key',
      hint: 'Get free credits at console.anthropic.com → API Keys',
      ok: !!process.env.ANTHROPIC_API_KEY,
    },
    {
      key: 'VOYAGE_API_KEY',
      label: 'Voyage AI API Key',
      hint: 'Free tier at dash.voyageai.com — needed for document embeddings',
      ok: !!process.env.VOYAGE_API_KEY,
    },
    {
      key: 'DATABASE_URL',
      label: 'Neon Postgres URL',
      hint: 'Free at neon.tech → New Project → Connection string. Enable pgvector: Settings → Extensions.',
      ok: !!process.env.DATABASE_URL,
    },
    {
      key: 'NEXTAUTH_SECRET',
      label: 'NextAuth Secret',
      hint: 'Any random string — generate with: openssl rand -base64 32',
      ok: !!process.env.NEXTAUTH_SECRET,
    },
    {
      key: 'ADMIN_USERNAME',
      label: 'Admin Username',
      hint: 'Your login username (e.g. "admin")',
      ok: !!process.env.ADMIN_USERNAME,
    },
    {
      key: 'ADMIN_PASSWORD',
      label: 'Admin Password',
      hint: 'Your login password — choose something strong',
      ok: !!process.env.ADMIN_PASSWORD,
    },
    {
      key: 'TAVILY_API_KEY',
      label: 'Tavily API Key (optional)',
      hint: 'Free 1000 searches/month at tavily.com — enables live web search in chat',
      ok: !!process.env.TAVILY_API_KEY,
    },
  ];

  // Check DB connectivity + schema
  let dbReady = false;
  let dbError = '';
  if (process.env.DATABASE_URL) {
    try {
      await sql`SELECT 1`;
      // Check if tables exist
      const tables = await sql`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN ('documents','chunks','deadlines','properties','accounts')
      `;
      dbReady = (tables as { tablename: string }[]).length >= 5;
      if (!dbReady) dbError = 'Connected but schema not migrated yet — will auto-run on first request.';
    } catch (e) {
      dbError = e instanceof Error ? e.message : 'Connection failed';
    }
  }

  const allRequired = vars.slice(0, 6).every((v) => v.ok);

  return Response.json({ vars, dbReady, dbError, allRequired, ready: allRequired && dbReady });
}
