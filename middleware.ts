import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import type { NextRequestWithAuth } from 'next-auth/middleware';

// Security headers applied to all responses
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-DNS-Prefetch-Control': 'off',
};

export default withAuth(
  function middleware(req: NextRequestWithAuth) {
    const response = NextResponse.next();
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(key, value);
    }
    if (process.env.NODE_ENV === 'production') {
      response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    return response;
  },
  {
    secret:
      process.env.NEXTAUTH_SECRET ??
      process.env.ADMIN_PASSWORD ??
      process.env.ANTHROPIC_API_KEY ??
      '',
  },
);

export const config = {
  matcher: [
    '/((?!api|setup|login|_next/static|_next/image|favicon.ico).*)',
  ],
};
