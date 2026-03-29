import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { ingestFile } from '@/lib/ingestion';
import { sql } from '@/lib/db';

// POST /api/capture — quick note capture
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { text, tags = [] } = (await req.json()) as { text: string; tags?: string[] };
  if (!text?.trim()) return Response.json({ error: 'text is required' }, { status: 400 });

  try {
    const { runMigrations } = await import('@/lib/db');
    await runMigrations();
  } catch { /* non-fatal */ }

  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const filename = `capture-${timestamp}.txt`;
  const buffer = Buffer.from(text, 'utf-8');

  const { documentId } = await ingestFile(buffer, filename, 'text/plain', ['capture', ...tags]);

  const [doc] = await sql`
    SELECT id, name, tags, added_at FROM documents WHERE id = ${documentId}
  `;
  return Response.json(doc, { status: 201 });
}
