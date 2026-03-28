import { sql } from '@/lib/db';

export interface RetrievedChunk {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  rank: number;
}

/**
 * Full-text search over chunks using PostgreSQL tsvector — no embedding API needed.
 * Uses websearch_to_tsquery so natural language queries like "RNOR tax strategy" work.
 */
export async function searchChunks(
  query: string,
  topK = 12,
): Promise<RetrievedChunk[]> {
  if (!query.trim()) return [];

  try {
    const rows = await sql`
      SELECT
        c.document_id   AS "documentId",
        d.name          AS "documentName",
        c.chunk_index   AS "chunkIndex",
        c.content,
        ts_rank(c.tsv, websearch_to_tsquery('english', ${query})) AS rank
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE c.tsv @@ websearch_to_tsquery('english', ${query})
      ORDER BY rank DESC
      LIMIT ${topK}
    `;
    return rows as RetrievedChunk[];
  } catch {
    return [];
  }
}

/** Format retrieved chunks into a context block injected into the system prompt. */
export function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '';
  const lines = chunks.map((c) => `[doc: ${c.documentName}]\n${c.content}`);
  return `<context>\n${lines.join('\n\n---\n\n')}\n</context>`;
}
