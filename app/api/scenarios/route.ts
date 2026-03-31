import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { SCENARIO_SYSTEM_PROMPT, buildScenarioPrompt } from '@/lib/prompts';
import { scenarioSchema, parseBody } from '@/lib/validators';

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const parsed = await parseBody(req, scenarioSchema);
  if (parsed instanceof Response) return parsed;
  const { type, params } = parsed;

  const userPrompt = buildScenarioPrompt(type, params);

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: SCENARIO_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return result.toDataStreamResponse();
}
