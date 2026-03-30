import { describe, it, expect, vi } from 'vitest';

// lib/retrieval.ts imports @/lib/db at module level
vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
}));

import { formatContext } from '@/lib/retrieval';
import type { RetrievedChunk } from '@/lib/retrieval';

const makeChunk = (partial: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  documentId: 'doc-1',
  documentName: 'test.pdf',
  chunkIndex: 0,
  content: 'Some document content.',
  rank: 0.9,
  ...partial,
});

describe('formatContext', () => {
  it('returns empty string for empty array', () => {
    expect(formatContext([])).toBe('');
  });

  it('wraps output in <context> tags', () => {
    const result = formatContext([makeChunk()]);
    expect(result).toMatch(/^<context>/);
    expect(result).toMatch(/<\/context>$/);
  });

  it('includes document name and content', () => {
    const chunk = makeChunk({ documentName: 'W2-2024.pdf', content: 'Wages: $120,000' });
    const result = formatContext([chunk]);
    expect(result).toContain('[doc: W2-2024.pdf]');
    expect(result).toContain('Wages: $120,000');
  });

  it('separates multiple chunks with ---', () => {
    const chunks = [
      makeChunk({ documentName: 'a.pdf', content: 'Content A', chunkIndex: 0 }),
      makeChunk({ documentName: 'b.pdf', content: 'Content B', chunkIndex: 1 }),
    ];
    const result = formatContext(chunks);
    expect(result).toContain('---');
    expect(result).toContain('[doc: a.pdf]');
    expect(result).toContain('[doc: b.pdf]');
    expect(result).toContain('Content A');
    expect(result).toContain('Content B');
  });

  it('handles chunks from the same document', () => {
    const chunks = [
      makeChunk({ documentName: 'same.pdf', content: 'Part 1', chunkIndex: 0 }),
      makeChunk({ documentName: 'same.pdf', content: 'Part 2', chunkIndex: 1 }),
    ];
    const result = formatContext(chunks);
    expect(result.match(/\[doc: same\.pdf\]/g)).toHaveLength(2);
  });

  it('handles special characters in document names', () => {
    const chunk = makeChunk({ documentName: 'My 2024 Tax Return & W-2.pdf' });
    const result = formatContext([chunk]);
    expect(result).toContain('[doc: My 2024 Tax Return & W-2.pdf]');
  });

  it('produces correct structure with separator count', () => {
    const n = 5;
    const chunks = Array.from({ length: n }, (_, i) => makeChunk({ chunkIndex: i, content: `chunk ${i}` }));
    const result = formatContext(chunks);
    // n chunks → n-1 separators
    const separators = result.match(/---/g) ?? [];
    expect(separators).toHaveLength(n - 1);
  });
});
