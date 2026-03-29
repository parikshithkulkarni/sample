import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

export async function GET(_req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const { runMigrations, seedDeadlines } = await import('@/lib/db');
    await runMigrations();
    await seedDeadlines();
  } catch { /* non-fatal */ }

  const rows = await sql`
    SELECT id, title, due_date, category, notes, is_done, is_recurring
    FROM deadlines
    ORDER BY due_date ASC
  `;
  return Response.json(rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { title, due_date, category, notes, is_recurring = false } =
    (await req.json()) as {
      title: string;
      due_date: string;
      category: string;
      notes?: string;
      is_recurring?: boolean;
    };

  const [row] = await sql`
    INSERT INTO deadlines (title, due_date, category, notes, is_recurring)
    VALUES (${title}, ${due_date}, ${category}, ${notes ?? null}, ${is_recurring})
    RETURNING *
  `;
  return Response.json(row, { status: 201 });
}
