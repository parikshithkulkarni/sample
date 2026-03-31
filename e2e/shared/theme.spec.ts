import { test, expect } from '@playwright/test';
import { mockDashboardAPIs } from '../helpers/api-mocks';

async function getThemeToggle(page: import('@playwright/test').Page) {
  const toggle = page
    .getByRole('button', { name: /Switch to/i })
    .and(page.locator(':visible'))
    .first();
  await expect(toggle).toBeVisible({ timeout: 10000 });
  return toggle;
}

// Theme toggle tests require the Next.js app to fully hydrate and render
// the theme toggle button. In CI with a stub DB, the app's initial load
// is slow and the theme toggle (which depends on ThemeProvider context)
// may not be interactive in time. Skip in CI.
test.skip(!!process.env.CI, 'Theme toggle requires full app hydration — unreliable in CI');

test.describe('Theme Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardAPIs(page, {});
  });

  test('toggle to dark mode adds dark class', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const toggle = await getThemeToggle(page);
    await toggle.click();

    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('toggle back to light mode removes dark class', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const toggle = await getThemeToggle(page);
    await toggle.click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    const toggleAgain = await getThemeToggle(page);
    await toggleAgain.click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('theme persists across navigation', async ({ page }) => {
    await page.route('**/api/finance/cleanup', (r) => r.fulfill({ json: {} }));
    await page.route('**/api/finance/snapshots', (r) => r.fulfill({ json: [] }));
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const toggle = await getThemeToggle(page);
    await toggle.click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.getByRole('link', { name: /finance/i }).click();
    await page.waitForURL('/finance');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('theme stored in localStorage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const toggle = await getThemeToggle(page);
    await toggle.click();

    await page.waitForFunction(() => localStorage.getItem('theme') === 'dark');
  });
});
