import { withAuth } from 'next-auth/middleware';

export default withAuth({
  secret:
    process.env.NEXTAUTH_SECRET ??
    process.env.ADMIN_PASSWORD ??
    process.env.ANTHROPIC_API_KEY ??
    'fallback-needs-anthropic-key',
});

export const config = {
  matcher: [
    '/((?!api/auth|api/setup|api/ping|setup|login|_next/static|_next/image|favicon.ico).*)',
  ],
};
