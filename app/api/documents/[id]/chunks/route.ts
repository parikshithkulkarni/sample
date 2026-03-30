import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

export const maxDuration = 60;

// POST /api/documents/[id]/chunks — append more text chunks to an existing document
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;

  try {
    const { chunks, startIndex } = await req.json() as { chunks: string[]; startIndex: number };

    const indices = chunks.map((_, i) => startIndex + i);
    await sql`
      INSERT INTO chunks (document_id, chunk_index, content)
      SELECT ${id}, idx, content
      FROM unnest(${indices}::int[], ${chunks}::text[]) AS t(idx, content)
    `;

    // Generate embeddings for appended chunks in background
    if (process.env.OPENAI_API_KEY) {
      (async () => {
        try {
          const { embedBatch } = await import('@/lib/embeddings');
          const rows = await sql`SELECT c.id, c.content FROM chunks c WHERE c.document_id = ${id} AND c.embedding IS NULL ORDER BY c.chunk_index` as { id: string; content: string }[];
          const BATCH = 96;
          for (let i = 0; i < rows.length; i += BATCH) {
            const slice = rows.slice(i, i + BATCH);
            const vectors = await embedBatch(slice.map((c) => c.content));
            for (let j = 0; j < slice.length; j++) {
              await sql`UPDATE chunks SET embedding = ${`[${vectors[j].join(',')}]`}::vector WHERE id = ${slice[j].id}`;
            }
          }
        } catch { /* non-fatal */ }
      })();
    }

    return Response.json({ ok: true, added: chunks.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
