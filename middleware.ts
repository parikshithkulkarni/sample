import { withAuth } from 'next-auth/middleware';

export default withAuth({
  secret:
    process.env.NEXTAUTH_SECRET ??
    process.env.ADMIN_PASSWORD ??
    process.env.ANTHROPIC_API_KEY ??
    'fallback-needs-anthropic-key',
});

export const config = {
  // Exclude all /api/* routes — they handle auth themselves via getServerSession
  // Only protect page routes through middleware
  matcher: [
    '/((?!api|setup|login|_next/static|_next/image|favicon.ico).*)',
  ],
};
