import { streamText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { searchChunks, formatContext } from '@/lib/retrieval';
import { webSearch, formatWebResults } from '@/lib/web-search';
import { SYSTEM_PROMPT } from '@/lib/prompts';

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { messages } = await req.json();
  const lastUser = [...messages].reverse().find((m: { role: string }) => m.role === 'user');
  const query: string = lastUser?.content ?? '';

  // Pre-retrieve relevant doc chunks
  let contextBlock = '';
  try {
    const chunks = await searchChunks(query, 12);
    contextBlock = formatContext(chunks);
  } catch {
    // If vector search fails (e.g. no chunks yet), continue without it
  }

  const systemWithContext = contextBlock
    ? `${SYSTEM_PROMPT}\n\n${contextBlock}`
    : SYSTEM_PROMPT;

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: systemWithContext,
    messages,
    tools: {
      searchWeb: tool({
        description:
          'Search the internet for current information such as recent tax law changes, visa processing times, real estate market rates, court decisions, or any topic that may have changed recently.',
        parameters: z.object({
          query: z.string().describe('The search query'),
        }),
        execute: async ({ query: q }) => {
          const results = await webSearch(q, 5);
          return formatWebResults(results);
        },
      }),
    },
    maxSteps: 4,
  });

  return result.toDataStreamResponse();
}
