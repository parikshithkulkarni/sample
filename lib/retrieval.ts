import { sql } from '@/lib/db';
import { embedOne } from '@/lib/embeddings';

export interface RetrievedChunk {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  distance: number;
}

/**
 * Embed the query and return the top-k most semantically similar chunks.
 */
export async function searchChunks(
  query: string,
  topK = 12,
): Promise<RetrievedChunk[]> {
  const embedding = await embedOne(query);
  const embeddingStr = `[${embedding.join(',')}]`;

  const rows = await sql`
    SELECT
      c.document_id   AS "documentId",
      d.name          AS "documentName",
      c.chunk_index   AS "chunkIndex",
      c.content,
      (c.embedding <=> ${embeddingStr}::vector) AS distance
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    ORDER BY c.embedding <=> ${embeddingStr}::vector
    LIMIT ${topK}
  `;

  return rows as RetrievedChunk[];
}

/** Format retrieved chunks into a context block for the system prompt. */
export function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '';
  const lines = chunks.map(
    (c) => `[doc: ${c.documentName}]\n${c.content}`,
  );
  return `<context>\n${lines.join('\n\n---\n\n')}\n</context>`;
}
