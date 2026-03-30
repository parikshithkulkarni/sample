import { sql } from '@/lib/db';
import { splitText } from '@/lib/chunker';

export interface IngestResult {
  documentId: string;
  chunkCount: number;
}

/**
 * Parse a file buffer, chunk it, and store in Postgres.
 * PostgreSQL auto-generates the tsvector from content — no embedding API needed.
 *
 * @param buffer - The raw file content as a Buffer
 * @param filename - The original filename (used as the document name)
 * @param mimeType - The MIME type of the file (e.g. 'application/pdf', 'text/plain')
 * @param tags - Optional array of string tags to associate with the document
 * @returns An object containing the new document's UUID and the number of chunks created
 */
export async function ingestFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  tags: string[] = [],
): Promise<IngestResult> {
  // 1. Extract text (lazy-load pdf parser only when needed)
  let text: string;
  if (mimeType === 'application/pdf') {
    const { extractText } = await import('@/lib/pdf');
    text = await extractText(buffer);
  } else {
    text = buffer.toString('utf-8');
  }

  // 2. Chunk
  const chunks = splitText(text);
  if (chunks.length === 0) throw new Error('No text content found in file');

  // 3. Insert document record
  const docRows = await sql`
    INSERT INTO documents (name, tags)
    VALUES (${filename}, ${tags})
    RETURNING id
  `;
  const documentId = (docRows[0] as { id: string }).id;

  // 4. Insert all chunks in one query via unnest — avoids N round-trips
  const indices = chunks.map((_, i) => i);
  await sql`
    INSERT INTO chunks (document_id, chunk_index, content)
    SELECT ${documentId}, idx, content
    FROM unnest(
      ${indices}::int[],
      ${chunks}::text[]
    ) AS t(idx, content)
  `;

  return { documentId, chunkCount: chunks.length };
}
