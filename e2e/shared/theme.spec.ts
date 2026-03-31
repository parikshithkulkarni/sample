import { test, expect } from '@playwright/test';
import { mockDashboardAPIs } from '../helpers/api-mocks';

/**
 * Helper: find the visible theme toggle button.
 * On desktop it lives inside the sidebar; on mobile it is a floating button
 * positioned above the bottom nav bar (with class `lg:hidden`).
 * Using `getByRole` with the aria-label prefix and filtering to the first
 * *visible* match avoids grabbing a hidden duplicate.
 */
async function getThemeToggle(page: import('@playwright/test').Page) {
  const toggle = page
    .getByRole('button', { name: /Switch to/i })
    .and(page.locator(':visible'))
    .first();
  await expect(toggle).toBeVisible({ timeout: 10000 });
  return toggle;
}

test.describe('Theme Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardAPIs(page, {});
  });

  test('toggle to dark mode adds dark class', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Mobile theme toggle unreliable in headless');
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const toggle = await getThemeToggle(page);
    await toggle.click();

    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('toggle back to light mode removes dark class', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Mobile theme toggle unreliable in headless');
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const toggle = await getThemeToggle(page);
    await toggle.click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    const toggleAgain = await getThemeToggle(page);
    await toggleAgain.click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('theme persists across navigation', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Mobile theme toggle unreliable in headless');
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

  test('theme stored in localStorage', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Mobile theme toggle unreliable in headless');
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const toggle = await getThemeToggle(page);
    await toggle.click();

    await page.waitForFunction(() => localStorage.getItem('theme') === 'dark');
  });
});
