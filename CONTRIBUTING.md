# Contributing to Second Brain

Thanks for your interest in contributing! This guide will help you get started.

## Local Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or a [Neon](https://neon.tech) serverless database)
- An [Anthropic API key](https://console.anthropic.com/settings/keys)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/parikshithkulkarni/sample.git
cd sample

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your values (see README for details)

# Start the development server
npm run dev
```

Visit `http://localhost:3000/setup` to verify everything is configured correctly.

## Development Workflow

### Branch Naming

- `feature/<description>` for new features
- `fix/<description>` for bug fixes
- `docs/<description>` for documentation changes

### Making Changes

1. Create a branch from `master`
2. Make your changes
3. Run tests: `npm test`
4. Run type check: `npx tsc --noEmit`
5. Run build: `npm run build`
6. Commit with a clear message (see below)
7. Open a pull request

### Commit Messages

Use concise, descriptive commit messages:

```
Add net worth CSV export endpoint
Fix duplicate account detection for hyphenated names
Update API docs for finance endpoints
```

Prefix with the area of change when helpful: `Fix`, `Add`, `Update`, `Remove`, `Refactor`.

## Code Style

- **TypeScript strict mode** is enabled — no `any` types, handle all cases
- **Zod validation** on all API route request bodies and query params
- **Parameterized SQL** only — never concatenate user input into queries
- **Error handling** — use `logger.error()` with context, return appropriate HTTP status codes
- **Imports** — use `@/` path alias for project imports

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage report
npm run test:coverage
```

- Unit tests go in `__tests__/unit/`
- Integration tests go in `__tests__/integration/`
- Tests use Vitest with mocked database calls — see `vitest.setup.ts` for the test environment setup
- All API routes should have integration tests
- All `lib/` utility functions should have unit tests

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a description of what changed and why
- Ensure all tests pass and the build succeeds
- Add tests for new functionality
- Update documentation if the API surface changes
