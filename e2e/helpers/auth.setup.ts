import { test as setup, expect } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  // Mock /api/setup — the login page calls this to check if admin exists.
  // Without this mock, the request hangs trying to connect to the stub DB.
  await page.route('**/api/setup', async (route) => {
    await route.fulfill({
      json: { adminExists: true, dbReady: true, ready: true, vars: [], dbError: '', allRequired: true },
    });
  });

  // Mock dashboard APIs so the redirect to / doesn't hang
  await page.route('**/api/deadlines', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/finance**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/rentals**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/insights', (r) => r.fulfill({ json: { insights: [] } }));

  await page.goto('/login');

  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? 'password123';

  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for redirect to dashboard (env-var auth should work in CI)
  await expect(page).toHaveURL('/', { timeout: 15000 });

  // Save storage state for authenticated tests
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
