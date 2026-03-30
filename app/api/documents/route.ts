import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

export const maxDuration = 60;

// GET /api/documents — list all documents
export async function GET(_req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  if (!process.env.DATABASE_URL) {
    return Response.json({ error: 'DATABASE_URL not set' }, { status: 503 });
  }

  try {
    const { runMigrations, seedDeadlines } = await import('@/lib/db');
    await runMigrations();
    await seedDeadlines();
    const rows = await sql`
      SELECT id, name, tags, summary, insights, added_at, extracted_at
      FROM documents ORDER BY added_at DESC
    `;
    return Response.json(rows);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// POST /api/documents
// Accepts two shapes:
//   { fileName, mimeType: 'application/pdf', base64, tags }  — PDF binary (max ~3 MB)
//   { fileName, chunks: string[], tags }                      — pre-split text chunks (txt/md)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  try {
    const { runMigrations } = await import('@/lib/db');
    await runMigrations();
  } catch { /* non-fatal */ }

  try {
    const body = await req.json() as {
      fileName: string;
      mimeType?: string;
      base64?: string;
      chunks?: string[];
      tags?: string | string[];
    };

    const fileName = body.fileName;
    const tags: string[] = Array.isArray(body.tags)
      ? body.tags
      : (body.tags ?? '').split(',').map((t: string) => t.trim()).filter(Boolean);

    let chunks: string[];

    if (body.chunks) {
      // Text path: chunks already split client-side
      chunks = body.chunks;
    } else if (body.base64) {
      // Binary path: PDF — extract text server-side
      const buffer = Buffer.from(body.base64, 'base64');
      const mimeType = body.mimeType ?? 'application/pdf';
      let text: string;
      if (mimeType === 'application/pdf') {
        const { extractText } = await import('@/lib/pdf');
        text = await extractText(buffer);
      } else {
        text = buffer.toString('utf-8');
      }
      const { splitText } = await import('@/lib/chunker');
      chunks = splitText(text);
    } else {
      return Response.json({ error: 'Provide either base64 or chunks' }, { status: 400 });
    }

    if (chunks.length === 0) return Response.json({ error: 'No text content found' }, { status: 400 });

    // Insert document
    const [docRow] = await sql`INSERT INTO documents (name, tags) VALUES (${fileName}, ${tags}) RETURNING id`;
    const documentId = (docRow as { id: string }).id;

    // Batch insert all chunks in one query
    const indices = chunks.map((_, i) => i);
    await sql`
      INSERT INTO chunks (document_id, chunk_index, content)
      SELECT ${documentId}, idx, content
      FROM unnest(${indices}::int[], ${chunks}::text[]) AS t(idx, content)
    `;

    const [doc] = await sql`SELECT id, name, tags, summary, insights, added_at FROM documents WHERE id = ${documentId}`;

    // Generate and store embeddings in the background (non-blocking)
    if (process.env.OPENAI_API_KEY) {
      (async () => {
        try {
          const { embedBatch } = await import('@/lib/embeddings');
          const rows = await sql`SELECT id, content FROM chunks WHERE document_id = ${documentId} ORDER BY chunk_index` as { id: string; content: string }[];
          const BATCH = 96;
          for (let i = 0; i < rows.length; i += BATCH) {
            const slice = rows.slice(i, i + BATCH);
            const vectors = await embedBatch(slice.map((c) => c.content));
            for (let j = 0; j < slice.length; j++) {
              await sql`UPDATE chunks SET embedding = ${`[${vectors[j].join(',')}]`}::vector WHERE id = ${slice[j].id}`;
            }
          }
        } catch { /* non-fatal — search falls back to FTS */ }
      })();
    }

    return Response.json({ ...doc, chunkCount: chunks.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
