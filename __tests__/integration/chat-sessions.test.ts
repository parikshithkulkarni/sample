/**
 * Integration tests for /api/chat/sessions and /api/chat/sessions/[id]
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
import { GET as sessionsGET, POST as sessionsPOST } from '@/app/api/chat/sessions/route';
import { GET as sessionGET, DELETE as sessionDELETE } from '@/app/api/chat/sessions/[id]/route';

const mockSql = vi.mocked(sql);
const mockAuth = vi.mocked(getServerSession);

const MOCK_SESSION = {
  id: 'sess-1',
  title: 'Analyzing my 401k',
  created_at: '2026-03-30T10:00:00Z',
  updated_at: '2026-03-30T10:05:00Z',
  message_count: 4,
};

describe('GET /api/chat/sessions', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    mockSql.mockResolvedValue([MOCK_SESSION] as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await sessionsGET(new Request('http://localhost/api/chat/sessions'));
    expect(res.status).toBe(401);
  });

  it('returns list of sessions as JSON', async () => {
    const res = await sessionsGET(new Request('http://localhost/api/chat/sessions'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].title).toBe('Analyzing my 401k');
    expect(data[0].message_count).toBe(4);
  });

  it('returns empty array when no sessions exist', async () => {
    mockSql.mockResolvedValue([] as never);
    const res = await sessionsGET(new Request('http://localhost/api/chat/sessions'));
    expect(await res.json()).toEqual([]);
  });
});

describe('POST /api/chat/sessions', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    mockSql.mockResolvedValue([MOCK_SESSION] as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await sessionsPOST(new Request('http://localhost/api/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Chat' }),
    }));
    expect(res.status).toBe(401);
  });

  it('creates session with provided title and returns 201', async () => {
    const res = await sessionsPOST(new Request('http://localhost/api/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Analyzing my 401k' }),
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe('sess-1');
  });

  it('defaults title to "New Chat" if not provided', async () => {
    mockSql.mockResolvedValue([{ ...MOCK_SESSION, title: 'New Chat' }] as never);
    const res = await sessionsPOST(new Request('http://localhost/api/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }));
    expect(res.status).toBe(201);
  });

  it('handles empty body gracefully', async () => {
    mockSql.mockResolvedValue([{ ...MOCK_SESSION, title: 'New Chat' }] as never);
    const res = await sessionsPOST(new Request('http://localhost/api/chat/sessions', {
      method: 'POST',
    }));
    expect(res.status).toBe(201);
  });
});

describe('GET /api/chat/sessions/[id]', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    // First sql call returns session, second returns messages
    mockSql
      .mockResolvedValueOnce([MOCK_SESSION] as never)
      .mockResolvedValueOnce([
        { id: 'msg-1', role: 'user', content: 'Hello', created_at: '2026-03-30T10:00:00Z' },
        { id: 'msg-2', role: 'assistant', content: 'Hi!', created_at: '2026-03-30T10:00:01Z' },
      ] as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await sessionGET(
      new Request('http://localhost/api/chat/sessions/sess-1'),
      { params: Promise.resolve({ id: 'sess-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns session with messages', async () => {
    const res = await sessionGET(
      new Request('http://localhost/api/chat/sessions/sess-1'),
      { params: Promise.resolve({ id: 'sess-1' }) },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    // Response spreads sessionRow fields directly + messages array
    expect(data.id).toBe('sess-1');
    expect(Array.isArray(data.messages)).toBe(true);
    expect(data.messages).toHaveLength(2);
  });

  it('returns 404 when session not found', async () => {
    // Reset queued once-values from beforeEach, then set empty result
    mockSql.mockReset();
    mockSql.mockResolvedValueOnce([] as never);
    const res = await sessionGET(
      new Request('http://localhost/api/chat/sessions/missing'),
      { params: Promise.resolve({ id: 'missing' }) },
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/chat/sessions/[id]', () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { name: 'Test' } } as never);
    mockSql.mockResolvedValue([] as never);
  });

  it('returns 401 when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await sessionDELETE(
      new Request('http://localhost/api/chat/sessions/sess-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'sess-1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('deletes session and returns 204', async () => {
    const res = await sessionDELETE(
      new Request('http://localhost/api/chat/sessions/sess-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'sess-1' }) },
    );
    expect(res.status).toBe(204);
    expect(mockSql).toHaveBeenCalled();
  });
});
