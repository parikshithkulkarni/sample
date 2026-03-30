import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSecret } from '@/lib/auth';

// Security headers applied to all responses
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-DNS-Prefetch-Control': 'off',
};

function addSecurityHeaders(response: NextResponse) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  // HSTS only in production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return response;
}

const authMiddleware = withAuth({
  secret: getSecret(),
});

export default async function middleware(req: NextRequest) {
  // Apply security headers to all responses
  const response = NextResponse.next();
  addSecurityHeaders(response);

  // Auth middleware only applies to page routes (not API, static, etc.)
  const { pathname } = req.nextUrl;
  const isProtectedPage = !/^\/(?:api|setup|login|_next\/static|_next\/image|favicon\.ico)/.test(pathname);

  if (isProtectedPage) {
    // Run NextAuth middleware for protected pages
    const authResponse = await (authMiddleware as Function)(req, { } as any);
    if (authResponse) {
      // Copy security headers to auth response
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        authResponse.headers.set(key, value);
      }
      return authResponse;
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
