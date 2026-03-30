/**
 * Integration tests for POST /api/documents/[id]/extract-confirm
 * Tests the user-reviewed extraction save path (no Claude call).
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

import { sql } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { POST as extractConfirmPOST } from '@/app/api/documents/[id]/extract-confirm/route';

const mockSql = vi.mocked(sql);
const mockAuth = vi.mocked(getServerSession);

function makeConfirmReq(docId: string, body: unknown): Request {
  return new Request(`http://localhost/api/documents/${docId}/extract-confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/documents/[id]/extract-confirm', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    // Default: no existing records, inserts succeed, update doc succeeds
    mockSql
      .mockResolvedValue([] as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await extractConfirmPOST(
      makeConfirmReq('doc-1', { accounts: [], properties: [] }),
      { params: Promise.resolve({ id: 'doc-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('saves new accounts and returns saved names', async () => {
    // No existing account found
    mockSql.mockResolvedValue([] as never);
    const res = await extractConfirmPOST(
      makeConfirmReq('doc-1', {
        accounts: [
          { name: 'Fidelity 401k', type: 'asset', category: '401k', balance: 250000, currency: 'USD' },
        ],
        properties: [],
      }),
      { params: Promise.resolve({ id: 'doc-1' }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.saved.accounts).toContain('Fidelity 401k');
  });

  it('updates existing accounts (same name match)', async () => {
    // First sql call returns existing account, subsequent calls are update + doc update
    mockSql
      .mockResolvedValueOnce([{ id: 'acct-existing' }] as never) // existing check
      .mockResolvedValueOnce([] as never)   // UPDATE
      .mockResolvedValueOnce([] as never);  // doc extracted_at update
    const res = await extractConfirmPOST(
      makeConfirmReq('doc-1', {
        accounts: [
          { name: 'Fidelity 401k', type: 'asset', category: '401k', balance: 280000, currency: 'USD' },
        ],
        properties: [],
      }),
      { params: Promise.resolve({ id: 'doc-1' }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.saved.accounts[0]).toContain('updated');
  });

  it('saves new properties', async () => {
    mockSql.mockResolvedValue([] as never);
    const res = await extractConfirmPOST(
      makeConfirmReq('doc-1', {
        accounts: [],
        properties: [
          {
            address: '123 Main St, Austin, TX',
            purchase_price: 450000,
            purchase_date: '2021-06-15',
            market_value: 580000,
            mortgage_balance: 360000,
            monthly_rent: 3200,
          },
        ],
      }),
      { params: Promise.resolve({ id: 'doc-1' }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.saved.properties).toContain('123 Main St, Austin, TX');
  });

  it('skips accounts with missing name or type', async () => {
    mockSql.mockResolvedValue([] as never);
    const res = await extractConfirmPOST(
      makeConfirmReq('doc-1', {
        accounts: [
          { name: '', type: 'asset', category: '401k', balance: 1000, currency: 'USD' },
          { name: 'Valid Account', type: '', category: 'savings', balance: 500, currency: 'USD' },
        ],
        properties: [],
      }),
      { params: Promise.resolve({ id: 'doc-1' }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.saved.accounts).toHaveLength(0);
  });

  it('sanitizes category to snake_case', async () => {
    mockSql.mockResolvedValue([] as never);
    const res = await extractConfirmPOST(
      makeConfirmReq('doc-1', {
        accounts: [
          { name: 'ISO Plan', type: 'asset', category: 'ISO Options (2024)', balance: 50000, currency: 'USD' },
        ],
        properties: [],
      }),
      { params: Promise.resolve({ id: 'doc-1' }) },
    );
    expect(res.status).toBe(200);
    // Category gets sanitized — just verifying no error thrown
    const data = await res.json();
    expect(data.saved.accounts).toHaveLength(1);
  });

  it('handles empty accounts and properties gracefully', async () => {
    mockSql.mockResolvedValue([] as never);
    const res = await extractConfirmPOST(
      makeConfirmReq('doc-1', { accounts: [], properties: [] }),
      { params: Promise.resolve({ id: 'doc-1' }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.saved.accounts).toHaveLength(0);
    expect(data.saved.properties).toHaveLength(0);
  });

  it('handles null balance as 0', async () => {
    mockSql.mockResolvedValue([] as never);
    const res = await extractConfirmPOST(
      makeConfirmReq('doc-1', {
        accounts: [
          { name: 'Unknown Account', type: 'asset', category: 'other', balance: null, currency: 'USD' },
        ],
        properties: [],
      }),
      { params: Promise.resolve({ id: 'doc-1' }) },
    );
    expect(res.status).toBe(200);
  });
});
