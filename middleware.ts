export { default } from 'next-auth/middleware';

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - /api/auth (NextAuth endpoints)
     * - /_next (Next.js internals)
     * - /favicon.ico
     * - static files
     */
    '/((?!api/auth|api/setup|setup|_next/static|_next/image|favicon.ico).*)',
  ],
};
