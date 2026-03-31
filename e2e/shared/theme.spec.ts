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
  // Skip on mobile-safari — the floating theme button is absolute-positioned
  // and Playwright's :visible pseudo-class doesn't reliably match it
  test.skip(({ browserName }, testInfo) => testInfo.project.name === 'mobile-safari',
    'Theme toggle positioning unreliable on mobile-safari');

  test.beforeEach(async ({ page }) => {
    await mockDashboardAPIs(page, {});
  });

  test('toggle to dark mode adds dark class', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Find and click theme toggle (works on both desktop and mobile)
    const toggle = await getThemeToggle(page);
    await toggle.click();

    // Verify dark class on <html> using auto-retrying assertion
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('toggle back to light mode removes dark class', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const toggle = await getThemeToggle(page);

    // Toggle to dark
    await toggle.click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Toggle back to light
    const toggleAgain = await getThemeToggle(page);
    await toggleAgain.click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('theme persists across navigation', async ({ page }) => {
    // Mock other page APIs
    await page.route('**/api/finance/cleanup', (r) => r.fulfill({ json: {} }));
    await page.route('**/api/finance/snapshots', (r) => r.fulfill({ json: [] }));
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Set dark mode
    const toggle = await getThemeToggle(page);
    await toggle.click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Navigate to another page
    await page.getByRole('link', { name: /finance/i }).click();
    await page.waitForURL('/finance');
    await page.waitForLoadState('domcontentloaded');

    // Should still be dark (auto-retrying)
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('theme stored in localStorage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const toggle = await getThemeToggle(page);
    await toggle.click();

    // Use waitForFunction which retries until the condition is true
    await page.waitForFunction(() => localStorage.getItem('theme') === 'dark');
  });
});
