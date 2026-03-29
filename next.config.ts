import type { NextConfig } from 'next';

// Auto-detect NEXTAUTH_URL from Vercel's system env vars so the user never
// has to set it manually. VERCEL_PROJECT_PRODUCTION_URL is the stable
// production domain (e.g. brain-seven-eta.vercel.app). Falls back to
// VERCEL_URL (deployment URL) for previews, then localhost for dev.
const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse'],
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? productionUrl,
  },
};

export default nextConfig;
