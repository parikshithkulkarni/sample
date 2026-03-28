import { sql } from '@/lib/db';

interface Check {
  key: string;
  label: string;
  hint: string;
  link?: string;
  ok: boolean;
  required: boolean;
}

// Public route — no auth so it works before credentials are set
export async function GET() {
  const vars: Check[] = [
    {
      key: 'ANTHROPIC_API_KEY',
      label: 'Anthropic API Key',
      hint: 'Get free credits at console.anthropic.com → API Keys',
      link: 'https://console.anthropic.com/settings/keys',
      ok: !!process.env.ANTHROPIC_API_KEY,
      required: true,
    },
    {
      key: 'ADMIN_USERNAME',
      label: 'Admin Username',
      hint: 'Your login username — set to anything (e.g. "admin")',
      ok: !!process.env.ADMIN_USERNAME,
      required: true,
    },
    {
      key: 'ADMIN_PASSWORD',
      label: 'Admin Password',
      hint: 'Your login password — choose something strong',
      ok: !!process.env.ADMIN_PASSWORD,
      required: true,
    },
    {
      key: 'DATABASE_URL',
      label: 'Postgres Database',
      hint: 'Add via Vercel Dashboard → Storage → Create → Postgres. Sets DATABASE_URL automatically.',
      link: 'https://vercel.com/dashboard',
      ok: !!process.env.DATABASE_URL,
      required: true,
    },
    {
      key: 'TAVILY_API_KEY',
      label: 'Tavily Web Search (optional)',
      hint: 'Free 1000 searches/month at app.tavily.com — enables live web search in chat',
      link: 'https://app.tavily.com',
      ok: !!process.env.TAVILY_API_KEY,
      required: false,
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
        AND tablename IN ('documents','chunks','deadlines','properties','accounts')
      `;
      dbReady = (tables as { tablename: string }[]).length >= 5;
      if (!dbReady) dbError = 'Connected — schema will be created on first request.';
    } catch (e) {
      dbError = e instanceof Error ? e.message : 'Connection failed';
    }
  }

  const allRequired = vars.filter((v) => v.required).every((v) => v.ok);

  return Response.json({ vars, dbReady, dbError, allRequired, ready: allRequired && dbReady });
}
