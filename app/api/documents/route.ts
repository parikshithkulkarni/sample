import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';
import { documentUploadSchema, paginationSchema, parseBody, parseQuery } from '@/lib/validators';
import { logger } from '@/lib/logger';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const maxDuration = 60;

// GET /api/documents — list documents with pagination
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  if (!process.env.DATABASE_URL) {
    return Response.json({ error: 'DATABASE_URL not set' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const pagination = parseQuery(searchParams, paginationSchema);
  if (pagination instanceof Response) return pagination;
  const { limit, offset } = pagination;

  try {
    const { runMigrations, seedDeadlines } = await import('@/lib/db');
    await runMigrations();
    await seedDeadlines();
    const [countRow] = await sql`SELECT count(*)::int AS total FROM documents`;
    const total = (countRow as { total: number }).total;
    const rows = await sql`
      SELECT id, name, tags, summary, insights, added_at, extracted_at
      FROM documents ORDER BY added_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return Response.json({ data: rows, total });
  } catch (e) {
    logger.error('Failed to list documents', e);
    return Response.json({ error: 'Failed to list documents' }, { status: 500 });
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

  const rl = checkRateLimit(`upload:${session.user?.email ?? 'anon'}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const parsed = await parseBody(req, documentUploadSchema);
    if (parsed instanceof Response) return parsed;
    const body = parsed;

    const fileName = body.fileName;
    const tags: string[] = Array.isArray(body.tags)
      ? body.tags
      : (body.tags ?? '').split(',').map((t: string) => t.trim()).filter(Boolean);

    let chunks: string[];

    const { MAX_PDF_SIZE_BYTES: MAX_PDF_SIZE } = await import('@/lib/constants');

    if (body.chunks) {
      // Text path: chunks already split client-side
      chunks = body.chunks;
    } else if (body.base64) {
      // Binary path: PDF — extract text server-side
      const buffer = Buffer.from(body.base64, 'base64');
      if (buffer.length > MAX_PDF_SIZE) {
        return Response.json(
          { error: `File too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Max ${(MAX_PDF_SIZE / 1024 / 1024).toFixed(1)} MB.` },
          { status: 413 },
        );
      }
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
      // Zod refine above ensures one of base64/chunks is present, but handle edge case
      return Response.json({ error: 'Provide either base64 or chunks' }, { status: 400 });
    }

    chunks = chunks.filter(c => c.trim().length > 0);
    if (chunks.length === 0) return Response.json({ error: 'No text content found in the uploaded file' }, { status: 400 });

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

    // Generate and store embeddings in the background (non-blocking, with retry)
    if (process.env.OPENAI_API_KEY) {
      (async () => {
        try {
          const { withRetry } = await import('@/lib/retry');
          const { embedBatch } = await import('@/lib/embeddings');
          const rows = await sql`SELECT id, content FROM chunks WHERE document_id = ${documentId} ORDER BY chunk_index` as { id: string; content: string }[];
          const BATCH = 96;
          for (let i = 0; i < rows.length; i += BATCH) {
            const slice = rows.slice(i, i + BATCH);
            const vectors = await withRetry(() => embedBatch(slice.map((c) => c.content)), { maxAttempts: 3, label: 'embed-batch' });
            for (let j = 0; j < slice.length; j++) {
              await sql`UPDATE chunks SET embedding = ${`[${vectors[j].join(',')}]`}::vector WHERE id = ${slice[j].id}`;
            }
          }
          logger.info(`Embeddings generated for document ${documentId} (${rows.length} chunks)`);
        } catch (err) { logger.error(`Embedding generation failed for document ${documentId} — reindex via /api/documents/reindex`, err); }
      })();
    }

    return Response.json({ ...doc, chunkCount: chunks.length });
  } catch (e) {
    logger.error('Document upload failed', e);
    return Response.json({ error: 'Document upload failed' }, { status: 500 });
  }
}
