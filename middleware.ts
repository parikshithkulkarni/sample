import { withAuth } from 'next-auth/middleware';

export default withAuth({
  // Falls back to ADMIN_PASSWORD so NEXTAUTH_SECRET is not a required env var
  secret: process.env.NEXTAUTH_SECRET ?? process.env.ADMIN_PASSWORD,
});

export const config = {
  matcher: [
    '/((?!api/auth|api/setup|setup|_next/static|_next/image|favicon.ico).*)',
  ],
};
