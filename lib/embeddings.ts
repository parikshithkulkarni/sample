// Uses OpenAI text-embedding-3-small with 512 dimensions.
// Falls back gracefully (callers check OPENAI_API_KEY before calling).

import { withRetry } from '@/lib/retry';

const OPENAI_BASE = 'https://api.openai.com/v1';
const MODEL       = 'text-embedding-3-small';
const DIMENSIONS  = 512;
const TIMEOUT_MS  = 15_000;

interface EmbedResponse {
  data: { embedding: number[]; index: number }[];
}

/**
 * Generate embeddings for a batch of texts using OpenAI text-embedding-3-small.
 * Results are sorted to match input order.
 *
 * @param texts - Array of text strings to embed
 * @returns A 2D array of embedding vectors, one per input text
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  return withRetry(
    async (signal) => {
      const res = await fetch(`${OPENAI_BASE}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: MODEL, input: texts, dimensions: DIMENSIONS }),
        signal,
      });
      if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as EmbedResponse;
      // Sort by index to ensure order matches input
      return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    },
    { maxAttempts: 3, timeoutMs: TIMEOUT_MS, label: 'OpenAI embeddings' },
  );
}

/**
 * Generate an embedding vector for a single text string.
 *
 * @param text - The text string to embed
 * @returns The embedding vector for the input text
 */
export async function embedOne(text: string): Promise<number[]> {
  const [vec] = await embedBatch([text]);
  return vec;
}
