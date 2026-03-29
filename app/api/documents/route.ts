import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { ingestFile } from '@/lib/ingestion';

export const maxDuration = 60;

// GET /api/documents — list all documents
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  if (!process.env.DATABASE_URL) {
    return Response.json({ error: 'DATABASE_URL not set — connect a Postgres database in Vercel Storage' }, { status: 503 });
  }

  try {
    // Ensure schema exists (idempotent — safe to call on every request)
    const { runMigrations, seedDeadlines } = await import('@/lib/db');
    await runMigrations();
    await seedDeadlines();

    const rows = await sql`
      SELECT id, name, tags, summary, insights, added_at
      FROM documents
      ORDER BY added_at DESC
    `;
    return Response.json(rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

// POST /api/documents — upload + ingest a document
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const { runMigrations } = await import('@/lib/db');
    await runMigrations();
  } catch { /* non-fatal */ }

  let file: File | null = null;
  let tags: string[] = [];
  let buffer: Buffer;

  try {
    const formData = await req.formData();
    file = formData.get('file') as File | null;
    const tagsRaw = (formData.get('tags') as string | null) ?? '';
    tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);

    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

    buffer = Buffer.from(await file.arrayBuffer());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `Failed to read upload: ${msg}` }, { status: 400 });
  }

  let documentId: string;
  let chunkCount: number;
  try {
    ({ documentId, chunkCount } = await ingestFile(buffer, file.name, file.type, tags));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `Ingestion failed: ${msg}` }, { status: 500 });
  }

  const [doc] = await sql`
    SELECT id, name, tags, summary, insights, added_at FROM documents WHERE id = ${documentId}
  `;
  return Response.json({ ...doc, chunkCount });
}
