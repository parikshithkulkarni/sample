import { sql } from '@/lib/db';

export interface RetrievedChunk {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  rank: number;
}

/** PostgreSQL full-text search — always available, no API key needed. */
async function searchChunksFTS(query: string, topK: number): Promise<RetrievedChunk[]> {
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
}

/** Vector cosine similarity search — requires OPENAI_API_KEY + pgvector. */
async function searchChunksVector(query: string, topK: number): Promise<RetrievedChunk[]> {
  const { embedOne } = await import('@/lib/embeddings');
  const embedding = await embedOne(query);
  const vecLiteral = `[${embedding.join(',')}]`;

  const rows = await sql`
    SELECT
      c.document_id   AS "documentId",
      d.name          AS "documentName",
      c.chunk_index   AS "chunkIndex",
      c.content,
      (1 - (c.embedding <=> ${vecLiteral}::vector))::float AS rank
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${vecLiteral}::vector
    LIMIT ${topK}
  `;
  return rows as RetrievedChunk[];
}

/**
 * Hybrid search: uses semantic vector similarity when OPENAI_API_KEY is set,
 * falls back to PostgreSQL full-text search otherwise.
 *
 * @param query - The search query string to match against document chunks
 * @param topK - Maximum number of chunks to return (default: 12)
 * @returns An array of matching chunks ranked by relevance
 */
export async function searchChunks(query: string, topK = 12): Promise<RetrievedChunk[]> {
  if (!query.trim()) return [];
  try {
    if (process.env.OPENAI_API_KEY) {
      const results = await searchChunksVector(query, topK);
      // If no indexed chunks yet, fall through to FTS
      if (results.length > 0) return results;
    }
    return await searchChunksFTS(query, topK);
  } catch {
    try { return await searchChunksFTS(query, topK); } catch { return []; }
  }
}

/**
 * Format retrieved chunks into an XML context block for injection into the system prompt.
 *
 * @param chunks - The retrieved document chunks to format
 * @returns A formatted string wrapped in `<context>` tags, or empty string if no chunks
 */
export function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '';
  const lines = chunks.map((c) => `[doc: ${c.documentName}]\n${c.content}`);
  return `<context>\n${lines.join('\n\n---\n\n')}\n</context>`;
}
