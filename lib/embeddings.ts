// Uses OpenAI text-embedding-3-small with 512 dimensions.
// Falls back gracefully (callers check OPENAI_API_KEY before calling).

const OPENAI_BASE = 'https://api.openai.com/v1';
const MODEL       = 'text-embedding-3-small';
const DIMENSIONS  = 512;

interface EmbedResponse {
  data: { embedding: number[]; index: number }[];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, input: texts, dimensions: DIMENSIONS }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as EmbedResponse;
  // Sort by index to ensure order matches input
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedOne(text: string): Promise<number[]> {
  const [vec] = await embedBatch([text]);
  return vec;
}
