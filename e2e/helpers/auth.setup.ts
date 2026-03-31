import { test as setup, expect } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  // Intercept ALL API calls to prevent any DB connection attempts.
  // This must happen before page.goto() so the browser never hits the real server APIs.
  await page.route(/\/api\//, async (route) => {
    const url = route.request().url();

    if (url.includes('/api/setup')) {
      return route.fulfill({
        json: { adminExists: true, dbReady: true, ready: true, vars: [], dbError: '', allRequired: true },
      });
    }
    if (url.includes('/api/auth/')) {
      // Let NextAuth requests pass through to the real server (env-var auth works)
      return route.continue();
    }
    // Mock everything else to prevent DB hangs
    return route.fulfill({ json: [] });
  });

  await page.goto('/login');

  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? 'password123';

  // Wait for the form to appear (spinner should clear once /api/setup is mocked)
  await page.getByLabel('Username').waitFor({ timeout: 15000 });
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for redirect to dashboard (env-var auth)
  await expect(page).toHaveURL('/', { timeout: 15000 });

  // Save storage state for authenticated tests
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
