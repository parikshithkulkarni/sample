import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { scryptSync, timingSafeEqual } from 'crypto';

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

// Derive a secret from whatever the user has configured, in priority order.
// This means NEXTAUTH_SECRET never needs to be set manually.
export function getSecret(): string {
  return (
    process.env.NEXTAUTH_SECRET ??
    process.env.ADMIN_PASSWORD ??
    process.env.ANTHROPIC_API_KEY ??
    'fallback-needs-anthropic-key'
  );
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
            credentials.username === process.env.ADMIN_USERNAME &&
            credentials.password === process.env.ADMIN_PASSWORD
          ) {
            return { id: '1', name: credentials.username };
          }
          return null;
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
