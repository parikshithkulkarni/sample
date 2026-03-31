import { test, expect } from '@playwright/test';
import { mockDashboardAPIs } from '../helpers/api-mocks';

test.describe('Theme Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardAPIs(page, {});
  });

  test('toggle to dark mode adds dark class', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find and click theme toggle
    const toggle = page.locator('button[aria-label*="Switch to"]').first();
    await expect(toggle).toBeVisible();
    await toggle.click();

    // Verify dark class on <html> using auto-retrying assertion
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('toggle back to light mode removes dark class', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const toggle = page.locator('button[aria-label*="Switch to"]').first();
    await expect(toggle).toBeVisible();

    // Toggle to dark
    await toggle.click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Toggle back to light
    await toggle.click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('theme persists across navigation', async ({ page }) => {
    // Mock other page APIs
    await page.route('**/api/finance/cleanup', (r) => r.fulfill({ json: {} }));
    await page.route('**/api/finance/snapshots', (r) => r.fulfill({ json: [] }));
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set dark mode
    const toggle = page.locator('button[aria-label*="Switch to"]').first();
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    // Navigate to another page
    await page.getByRole('link', { name: /finance/i }).click();
    await page.waitForURL('/finance');

    // Should still be dark (auto-retrying)
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('theme stored in localStorage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const toggle = page.locator('button[aria-label*="Switch to"]').first();
    await expect(toggle).toBeVisible();
    await toggle.click();

    // Use waitForFunction which retries until the condition is true
    await page.waitForFunction(() => localStorage.getItem('theme') === 'dark');
  });
});
