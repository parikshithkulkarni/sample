/**
 * Integration tests for POST /api/documents/[id]/extract-preview
 * Mocks Anthropic SDK to avoid real API calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  sql: vi.fn(),
  runMigrations: vi.fn().mockResolvedValue(undefined),
  seedDeadlines: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

// vi.hoisted ensures mockCreate is defined before the vi.mock factory runs
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

import { sql } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { POST as previewPOST } from '@/app/api/documents/[id]/extract-preview/route';

const mockSql = vi.mocked(sql);
const mockAuth = vi.mocked(getServerSession);

const VALID_EXTRACTION = {
  accounts: [{ name: 'Chase Checking', type: 'asset', category: 'checking', balance: 15000, currency: 'USD', notes: '' }],
  properties: [],
};

function mockClaudeResponse(text: string) {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text }],
  });
}

function makePreviewReq(docId: string): Request {
  return new Request(`http://localhost/api/documents/${docId}/extract-preview`, {
    method: 'POST',
  });
}

describe('POST /api/documents/[id]/extract-preview', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    // Doc name + chunks
    mockSql
      .mockResolvedValueOnce([{ content: 'Bank statement showing balance of $15,000', chunk_index: 0 }] as never)
      .mockResolvedValueOnce([{ name: 'bank-statement.pdf' }] as never)
      .mockResolvedValueOnce([] as never) // existing accounts
      .mockResolvedValueOnce([] as never); // existing properties
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await previewPOST(makePreviewReq('doc-1'), { params: Promise.resolve({ id: 'doc-1' }) });
    expect(res.status).toBe(401);
  });

  it('returns empty result when no chunks found', async () => {
    mockSql.mockReset();
    mockSql.mockResolvedValue([] as never); // no chunks
    const res = await previewPOST(makePreviewReq('doc-1'), { params: Promise.resolve({ id: 'doc-1' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.accounts).toEqual([]);
    expect(data.properties).toEqual([]);
  });

  it('parses clean JSON response from Claude', async () => {
    mockSql.mockReset();
    mockSql
      .mockResolvedValueOnce([{ content: 'Chase bank statement', chunk_index: 0 }] as never)
      .mockResolvedValueOnce([{ name: 'chase.pdf' }] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    mockClaudeResponse(JSON.stringify(VALID_EXTRACTION));

    const res = await previewPOST(makePreviewReq('doc-1'), { params: Promise.resolve({ id: 'doc-1' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.accounts).toHaveLength(1);
    expect(data.accounts[0].name).toBe('Chase Checking');
  });

  it('strips prose preamble before JSON', async () => {
    mockSql.mockReset();
    mockSql
      .mockResolvedValueOnce([{ content: 'Bank statement content', chunk_index: 0 }] as never)
      .mockResolvedValueOnce([{ name: 'stmt.pdf' }] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    // Claude adds prose before the JSON
    mockClaudeResponse(`Looking at this document, I found the following accounts:\n\n${JSON.stringify(VALID_EXTRACTION)}`);

    const res = await previewPOST(makePreviewReq('doc-1'), { params: Promise.resolve({ id: 'doc-1' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.accounts[0].name).toBe('Chase Checking');
  });

  it('strips markdown code fences from response', async () => {
    mockSql.mockReset();
    mockSql
      .mockResolvedValueOnce([{ content: 'Statement', chunk_index: 0 }] as never)
      .mockResolvedValueOnce([{ name: 'stmt.pdf' }] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    mockClaudeResponse(`\`\`\`json\n${JSON.stringify(VALID_EXTRACTION)}\n\`\`\``);

    const res = await previewPOST(makePreviewReq('doc-1'), { params: Promise.resolve({ id: 'doc-1' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.accounts[0].name).toBe('Chase Checking');
  });

  it('returns 500 when Claude returns no JSON object', async () => {
    mockSql.mockReset();
    mockSql
      .mockResolvedValueOnce([{ content: 'Some doc', chunk_index: 0 }] as never)
      .mockResolvedValueOnce([{ name: 'doc.pdf' }] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    mockClaudeResponse('I cannot extract any financial data from this document.');

    const res = await previewPOST(makePreviewReq('doc-1'), { params: Promise.resolve({ id: 'doc-1' }) });
    expect(res.status).toBe(500);
  });

  it('correctly uses {"accounts": anchor for JSON extraction', async () => {
    mockSql.mockReset();
    mockSql
      .mockResolvedValueOnce([{ content: 'Document content', chunk_index: 0 }] as never)
      .mockResolvedValueOnce([{ name: 'doc.pdf' }] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    // Real-world case: document content has a JSON snippet, then Claude's actual JSON
    const fakeDocJson = '{"someKey": "someValue"}';
    const claudeActualJson = JSON.stringify(VALID_EXTRACTION);
    mockClaudeResponse(`The document contains ${fakeDocJson} configuration. Here is the extraction:\n${claudeActualJson}`);

    const res = await previewPOST(makePreviewReq('doc-1'), { params: Promise.resolve({ id: 'doc-1' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    // Should parse the VALID_EXTRACTION, not the fakeDocJson
    expect(data.accounts).toHaveLength(1);
    expect(data.accounts[0].name).toBe('Chase Checking');
  });
});
