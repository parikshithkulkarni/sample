// Voyage AI — voyage-3-lite produces 512-dimensional embeddings
// Docs: https://docs.voyageai.com/docs/embeddings

interface VoyageEmbedResponse {
  data: Array<{ embedding: number[] }>;
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: texts,
      model: 'voyage-3-lite',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Voyage AI error ${response.status}: ${body}`);
  }

  const json = (await response.json()) as VoyageEmbedResponse;
  return json.data.map((d) => d.embedding);
}

export async function embedOne(text: string): Promise<number[]> {
  const [embedding] = await embed([text]);
  return embedding;
}
