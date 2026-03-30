# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email the maintainer directly or use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
3. Include a description of the vulnerability, steps to reproduce, and potential impact
4. Allow reasonable time for a fix before public disclosure

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Security Practices

This project implements the following security measures:

### Authentication & Secrets
- **Password hashing** — scrypt with 16-byte random salt (256-bit security)
- **Timing-safe comparison** — constant-time string comparison for credential verification
- **JWT sessions** — NextAuth with configurable secret, auto-derived from admin password if not set
- **No plaintext secrets** — all credentials stored as hashes; API keys managed via environment variables

### API Security
- **Parameterized queries** — all SQL uses parameterized queries via Neon client (no string concatenation)
- **Input validation** — Zod schemas validate all API request bodies and query parameters
- **Rate limiting** — sliding window rate limiter on expensive endpoints (chat, upload, extraction)
- **Authentication middleware** — all routes except `/api/ping`, `/api/setup`, and `/login` require a valid session

### HTTP Security Headers
- `Strict-Transport-Security` — HSTS enabled in production
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — camera, microphone, and geolocation disabled
- `X-DNS-Prefetch-Control: off`

### Data Handling
- **File size limits** — PDF uploads capped at 3.5 MB
- **No client-side secrets** — API keys and database credentials are server-side only
- **Single-tenant** — designed for personal use with a single admin account
