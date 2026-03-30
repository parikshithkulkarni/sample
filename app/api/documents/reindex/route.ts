import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { sql } from '@/lib/db';

export const maxDuration = 60;

// POST /api/documents/reindex
// Backfills embeddings for all chunks that have embedding IS NULL.
// Safe to call multiple times — idempotent (filters WHERE embedding IS NULL).
export async function POST(_req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: 'OPENAI_API_KEY is not set — semantic search unavailable.' }, { status: 503 });
  }

  const rows = await sql`
    SELECT id, content FROM chunks WHERE embedding IS NULL ORDER BY id LIMIT 500
  ` as { id: string; content: string }[];

  if (rows.length === 0) {
    return Response.json({ reindexed: 0, remaining: 0, message: 'All chunks already indexed.' });
  }

  const { embedBatch } = await import('@/lib/embeddings');
  let reindexed = 0;
  const BATCH = 96;

  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const vectors = await embedBatch(slice.map((c) => c.content));
    for (let j = 0; j < slice.length; j++) {
      await sql`UPDATE chunks SET embedding = ${`[${vectors[j].join(',')}]`}::vector WHERE id = ${slice[j].id}`;
    }
    reindexed += slice.length;
  }

  const [{ remaining }] = await sql`SELECT COUNT(*)::int AS remaining FROM chunks WHERE embedding IS NULL` as { remaining: number }[];

  return Response.json({ reindexed, remaining, message: remaining > 0 ? `${remaining} chunks still need indexing — call again.` : 'All chunks indexed.' });
}
