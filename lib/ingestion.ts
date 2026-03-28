import { sql } from '@/lib/db';
import { embed } from '@/lib/embeddings';
import { splitText } from '@/lib/chunker';
import { extractText } from '@/lib/pdf';

export interface IngestResult {
  documentId: string;
  chunkCount: number;
}

/**
 * Parse a file buffer, chunk it, embed the chunks, and store everything in Postgres.
 * Returns the new document ID and chunk count.
 */
export async function ingestFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  tags: string[] = [],
): Promise<IngestResult> {
  // 1. Extract text
  let text: string;
  if (mimeType === 'application/pdf') {
    text = await extractText(buffer);
  } else {
    // Plain text / markdown
    text = buffer.toString('utf-8');
  }

  // 2. Chunk
  const chunks = splitText(text);
  if (chunks.length === 0) throw new Error('No text content found in file');

  // 3. Create document record
  const docRows = await sql`
    INSERT INTO documents (name, tags)
    VALUES (${filename}, ${tags})
    RETURNING id
  `;
  const documentId = (docRows[0] as { id: string }).id;

  // 4. Embed in batches of 96 (Voyage AI limit)
  const BATCH = 96;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const embeddings = await embed(batch);
    for (let j = 0; j < batch.length; j++) {
      const chunkIndex = i + j;
      const embeddingStr = `[${embeddings[j].join(',')}]`;
      await sql`
        INSERT INTO chunks (document_id, chunk_index, content, embedding)
        VALUES (${documentId}, ${chunkIndex}, ${batch[j]}, ${embeddingStr}::vector)
      `;
    }
  }

  return { documentId, chunkCount: chunks.length };
}
