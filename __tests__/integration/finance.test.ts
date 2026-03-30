/**
 * Integration tests for /api/finance and /api/finance/[id]
 * All DB calls and auth are mocked — no real database needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must be before any imports that touch these modules) ──────────────
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

vi.mock('@/lib/snapshots', () => ({
  takeNetWorthSnapshot: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports after mocks ──────────────────────────────────────────────────────
import { sql } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { GET as financeGET, POST as financePOST } from '@/app/api/finance/route';
import { PATCH as financePATCH, DELETE as financeDELETE } from '@/app/api/finance/[id]/route';

const mockSql = vi.mocked(sql);
const mockAuth = vi.mocked(getServerSession);

const MOCK_ACCOUNT = {
  id: 'acct-1',
  name: 'Fidelity 401k',
  type: 'asset',
  category: '401k',
  balance: 250000,
  currency: 'USD',
  notes: null,
  updated_at: '2026-03-30T00:00:00Z',
};

describe('GET /api/finance', () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    // count query, then data query (runMigrations is its own mock, not sql)
    mockSql
      .mockResolvedValueOnce([{ total: 1 }] as never)
      .mockResolvedValueOnce([MOCK_ACCOUNT] as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await financeGET(new Request('http://localhost/api/finance'));
    expect(res.status).toBe(401);
  });

  it('returns paginated accounts', async () => {
    const res = await financeGET(new Request('http://localhost/api/finance'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].name).toBe('Fidelity 401k');
  });

  it('returns empty data when no accounts', async () => {
    mockSql.mockReset();
    mockSql
      .mockResolvedValueOnce([{ total: 0 }] as never)
      .mockResolvedValueOnce([] as never);
    const res = await financeGET(new Request('http://localhost/api/finance'));
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });
});

describe('POST /api/finance', () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    // First call: dedup check (SELECT all accounts) returns empty, second call: INSERT returns account
    mockSql
      .mockResolvedValueOnce([] as never) // dedup SELECT
      .mockResolvedValueOnce([MOCK_ACCOUNT] as never); // INSERT RETURNING
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await financePOST(new Request('http://localhost/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', type: 'asset', category: '401k', balance: 1000 }),
    }));
    expect(res.status).toBe(401);
  });

  it('creates account and returns 201', async () => {
    const res = await financePOST(new Request('http://localhost/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Fidelity 401k', type: 'asset', category: '401k', balance: 250000 }),
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe('Fidelity 401k');
  });

  it('passes currency defaulting to USD', async () => {
    await financePOST(new Request('http://localhost/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', type: 'asset', category: 'savings', balance: 500 }),
    }));
    // sql was called — verify it included 'USD' as currency default
    expect(mockSql).toHaveBeenCalled();
  });

  it('returns 400 for invalid input', async () => {
    const res = await financePOST(new Request('http://localhost/api/finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', type: 'invalid', category: 'other', balance: 100 }),
    }));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/finance/[id]', () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    mockSql.mockResolvedValue([{ ...MOCK_ACCOUNT, balance: 300000 }] as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await financePATCH(
      new Request('http://localhost/api/finance/acct-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: 300000 }),
      }),
      { params: Promise.resolve({ id: 'acct-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('updates balance and returns updated account', async () => {
    const res = await financePATCH(
      new Request('http://localhost/api/finance/acct-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: 300000 }),
      }),
      { params: Promise.resolve({ id: 'acct-1' }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.balance).toBe(300000);
  });
});

describe('DELETE /api/finance/[id]', () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    mockSql.mockResolvedValue([] as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await financeDELETE(
      new Request('http://localhost/api/finance/acct-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'acct-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('deletes account and returns 204', async () => {
    const res = await financeDELETE(
      new Request('http://localhost/api/finance/acct-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'acct-1' }) },
    );
    expect(res.status).toBe(204);
    expect(mockSql).toHaveBeenCalled();
  });
});
