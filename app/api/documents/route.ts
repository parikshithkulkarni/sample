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

  let fileName: string;
  let mimeType: string;
  let buffer: Buffer;
  let tags: string[];

  try {
    const body = await req.json() as { fileName: string; mimeType: string; base64: string; tags: string };
    fileName = body.fileName;
    mimeType = body.mimeType ?? 'text/plain';
    tags = Array.isArray(body.tags)
      ? body.tags
      : (body.tags ?? '').split(',').map((t: string) => t.trim()).filter(Boolean);
    buffer = Buffer.from(body.base64, 'base64');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `Failed to parse request: ${msg}` }, { status: 400 });
  }

  let documentId: string;
  let chunkCount: number;
  try {
    ({ documentId, chunkCount } = await ingestFile(buffer, fileName, mimeType, tags));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `Ingestion failed: ${msg}` }, { status: 500 });
  }

  const [doc] = await sql`
    SELECT id, name, tags, summary, insights, added_at FROM documents WHERE id = ${documentId}
  `;
  return Response.json({ ...doc, chunkCount });
}
