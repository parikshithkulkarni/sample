import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':');
    const hashBuf = Buffer.from(hash, 'hex');
    const inputHash = scryptSync(password, salt, 64);
    return timingSafeEqual(hashBuf, inputHash);
  } catch {
    return false;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Compare against self to burn constant time, then return false
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

// Resolve the JWT secret. Must match middleware.ts (which runs in Edge and
// can only read env vars directly — no Node.js crypto).
let _generatedSecret: string | undefined;
export function getSecret(): string {
  if (process.env.NEXTAUTH_SECRET) return process.env.NEXTAUTH_SECRET;
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  // Last resort: generate an ephemeral secret (sessions won't survive restarts)
  if (!_generatedSecret) {
    _generatedSecret = randomBytes(32).toString('hex');
    console.warn('[auth] No NEXTAUTH_SECRET or ADMIN_PASSWORD set. Using ephemeral secret — sessions will not survive restarts. Set NEXTAUTH_SECRET in production.');
  }
  return _generatedSecret;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text', placeholder: 'your username' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        // ── Env-var auth (backwards compat / override) ─────────────────────────
        if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
          if (
            constantTimeEquals(credentials.username, process.env.ADMIN_USERNAME) &&
            constantTimeEquals(credentials.password, process.env.ADMIN_PASSWORD)
          ) {
            return { id: '1', name: credentials.username };
          }
          // Fall through to DB auth if env-var credentials don't match
        }

        // ── DB auth ────────────────────────────────────────────────────────────
        if (process.env.DATABASE_URL) {
          try {
            const { sql } = await import('@/lib/db');
            const rows = await sql`
              SELECT id, username, password_hash
              FROM admin_users
              WHERE username = ${credentials.username}
              LIMIT 1
            `;
            const user = rows[0] as { id: string; username: string; password_hash: string } | undefined;
            if (user && verifyPassword(credentials.password, user.password_hash)) {
              return { id: user.id, name: user.username };
            }
          } catch {
            // DB unavailable — fall through to null
          }
        }

        return null;
      },
    }),
  ],
  session: { strategy: 'jwt' },
  secret: getSecret(),
  pages: { signIn: '/login' },
};
