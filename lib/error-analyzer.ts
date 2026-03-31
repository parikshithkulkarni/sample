import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface AnalysisResult {
  rootCause: string;
  impact: string;
  suggestedFix: string;
  affectedArea: string;
  confidence: 'high' | 'medium' | 'low';
}

interface ErrorGroup {
  id: string;
  fingerprint: string;
  source: string;
  severity: string;
  message: string;
  sample_stack: string | null;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
}

/**
 * Use Claude to analyze an error group and determine root cause + suggested fix.
 */
export async function analyzeErrorGroup(group: ErrorGroup): Promise<AnalysisResult> {
  // Fetch recent events for richer context
  const events = await sql`
    SELECT message, stack_trace, context, created_at
    FROM error_events
    WHERE group_id = ${group.id}
    ORDER BY created_at DESC
    LIMIT 5
  ` as { message: string; stack_trace: string | null; context: Record<string, unknown>; created_at: string }[];

  const client = new Anthropic();

  const prompt = `You are an expert software engineer analyzing errors from a Next.js 15 application deployed on Vercel with PostgreSQL (Neon serverless).

## Error Group
- Source: ${group.source} (fe=frontend React, be=backend API, db=database, browser=JS runtime, network=fetch failures)
- Severity: ${group.severity}
- Message: ${group.message}
- Stack trace: ${group.sample_stack ?? 'Not available'}
- Occurrences: ${group.occurrence_count}
- First seen: ${group.first_seen}
- Last seen: ${group.last_seen}

## Recent Events
${events.map((e, i) => `### Event ${i + 1} (${e.created_at})
Message: ${e.message}
Stack: ${e.stack_trace ?? 'N/A'}
Context: ${JSON.stringify(e.context).slice(0, 500)}`).join('\n\n')}

## Instructions
Analyze this error and provide:
1. Root cause - What is likely causing this error
2. Impact - How this affects users/system
3. Suggested fix - Specific code changes or configuration fixes
4. Affected area - Which part of the system is affected
5. Confidence - How confident you are in this analysis (high/medium/low)

Respond in JSON format only:
{
  "rootCause": "...",
  "impact": "...",
  "suggestedFix": "...",
  "affectedArea": "...",
  "confidence": "high|medium|low"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Extract JSON from response (handles markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse analysis response');
  }

  const analysis: AnalysisResult = JSON.parse(jsonMatch[0]);

  // Persist analysis to DB
  await sql`
    UPDATE error_groups
    SET analysis = ${JSON.stringify(analysis)},
        proposed_fix = ${analysis.suggestedFix},
        status = 'fix_proposed'
    WHERE id = ${group.id}
  `;

  return analysis;
}

/**
 * Process unanalyzed error groups. Called by the cron endpoint.
 * Returns the number of groups analyzed.
 */
export async function processNewErrors(): Promise<number> {
  const groups = await sql`
    SELECT id, fingerprint, source, severity, message, sample_stack,
           occurrence_count, first_seen, last_seen
    FROM error_groups
    WHERE status = 'new'
    ORDER BY
      CASE severity WHEN 'critical' THEN 0 WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
      occurrence_count DESC
    LIMIT 5
  ` as ErrorGroup[];

  if (groups.length === 0) return 0;

  // Mark as analyzing
  const ids = groups.map(g => g.id);
  await sql`UPDATE error_groups SET status = 'analyzing' WHERE id = ANY(${ids})`;

  let analyzed = 0;
  for (const group of groups) {
    try {
      await analyzeErrorGroup(group);
      analyzed++;
    } catch (err) {
      logger.error('Failed to analyze error group', err, { groupId: group.id });
      // Reset status so it can be retried
      await sql`UPDATE error_groups SET status = 'new' WHERE id = ${group.id}`;
    }
  }

  return analyzed;
}
