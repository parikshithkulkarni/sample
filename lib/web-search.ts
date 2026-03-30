import { withRetry } from '@/lib/retry';

export interface WebResult {
  title: string;
  url: string;
  content: string;
}

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface TavilyResponse {
  results: TavilySearchResult[];
}

const TIMEOUT_MS = 10_000;

/**
 * Search the web via Tavily and return top results.
 */
export async function webSearch(query: string, maxResults = 5): Promise<WebResult[]> {
  return withRetry(
    async (signal) => {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query,
          max_results: maxResults,
          search_depth: 'basic',
          include_answer: false,
        }),
        signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Tavily error ${response.status}: ${body}`);
      }

      const json = (await response.json()) as TavilyResponse;
      return json.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
      }));
    },
    { maxAttempts: 2, timeoutMs: TIMEOUT_MS, label: 'Tavily web search' },
  );
}

export function formatWebResults(results: WebResult[]): string {
  if (results.length === 0) return '';
  const lines = results.map((r) => `[web: ${r.url}]\nTitle: ${r.title}\n${r.content}`);
  return `<web_results>\n${lines.join('\n\n---\n\n')}\n</web_results>`;
}
