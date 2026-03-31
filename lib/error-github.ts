import { logger } from '@/lib/logger';
import { withRetry } from '@/lib/retry';

interface ErrorGroupForIssue {
  id: string;
  source: string;
  severity: string;
  message: string;
  sample_stack: string | null;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
  analysis?: {
    rootCause: string;
    impact: string;
    suggestedFix: string;
    affectedArea: string;
    confidence: string;
  } | null;
}

/**
 * Create a GitHub issue for an error group with Claude's analysis.
 * Requires GITHUB_TOKEN and GITHUB_REPO env vars.
 */
export async function createErrorIssue(group: ErrorGroupForIssue): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // e.g., "owner/repo"

  if (!token || !repo) {
    logger.warn('GitHub integration not configured (GITHUB_TOKEN or GITHUB_REPO missing)');
    return null;
  }

  const severityEmoji: Record<string, string> = {
    critical: '🔴',
    error: '🟠',
    warning: '🟡',
    info: '🔵',
  };

  const title = `${severityEmoji[group.severity] ?? '⚪'} [${group.source.toUpperCase()}] ${group.message.slice(0, 80)}`;

  const analysis = group.analysis;
  const body = `## Auto-Detected Error

| Field | Value |
|-------|-------|
| **Source** | \`${group.source}\` |
| **Severity** | \`${group.severity}\` |
| **Occurrences** | ${group.occurrence_count} |
| **First Seen** | ${group.first_seen} |
| **Last Seen** | ${group.last_seen} |

### Error Message
\`\`\`
${group.message}
\`\`\`

${group.sample_stack ? `### Stack Trace\n\`\`\`\n${group.sample_stack.slice(0, 2000)}\n\`\`\`` : ''}

${analysis ? `## AI Analysis

### Root Cause
${analysis.rootCause}

### Impact
${analysis.impact}

### Suggested Fix
${analysis.suggestedFix}

### Affected Area
${analysis.affectedArea}

### Confidence: \`${analysis.confidence}\`
` : '*Analysis pending...*'}

---
*Auto-created by Error Monitoring Agent*
*Error Group ID: \`${group.id}\`*`;

  const labels = ['auto-detected', `severity:${group.severity}`, `source:${group.source}`];

  try {
    const issueUrl = await withRetry(
      async () => {
        const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title, body, labels }),
        });

        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`GitHub API ${res.status}: ${errBody}`);
        }

        const data = await res.json() as { html_url: string };
        return data.html_url;
      },
      { maxAttempts: 2, label: 'create-github-issue' },
    );

    // Update the error group with the issue URL
    const { sql } = await import('@/lib/db');
    await sql`
      UPDATE error_groups
      SET github_issue_url = ${issueUrl}
      WHERE id = ${group.id}
    `;

    return issueUrl;
  } catch (err) {
    logger.error('Failed to create GitHub issue', err, { groupId: group.id });
    return null;
  }
}
