import { test, expect } from '@playwright/test';
import { mockDashboardAPIs } from '../helpers/api-mocks';

test.describe('Theme Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardAPIs(page, {});
  });

  test('toggle to dark mode adds dark class', async ({ page }) => {
    await page.goto('/');

    // Find and click theme toggle
    const toggle = page.locator('button[aria-label*="Switch to"]').first();
    await toggle.click();

    // Verify dark class on <html>
    const htmlClass = await page.locator('html').getAttribute('class');
    expect(htmlClass).toContain('dark');
  });

  test('toggle back to light mode removes dark class', async ({ page }) => {
    await page.goto('/');

    const toggle = page.locator('button[aria-label*="Switch to"]').first();
    // Toggle to dark
    await toggle.click();
    expect(await page.locator('html').getAttribute('class')).toContain('dark');

    // Toggle back to light
    await toggle.click();
    const htmlClass = await page.locator('html').getAttribute('class');
    expect(htmlClass ?? '').not.toContain('dark');
  });

  test('theme persists across navigation', async ({ page }) => {
    // Mock other page APIs
    await page.route('**/api/finance/cleanup', (r) => r.fulfill({ json: {} }));
    await page.route('**/api/finance/snapshots', (r) => r.fulfill({ json: [] }));
    await page.goto('/');

    // Set dark mode
    const toggle = page.locator('button[aria-label*="Switch to"]').first();
    await toggle.click();
    expect(await page.locator('html').getAttribute('class')).toContain('dark');

    // Navigate to another page
    await page.getByRole('link', { name: /finance/i }).click();
    await page.waitForURL('/finance');

    // Should still be dark
    expect(await page.locator('html').getAttribute('class')).toContain('dark');
  });

  test('theme stored in localStorage', async ({ page }) => {
    await page.goto('/');

    const toggle = page.locator('button[aria-label*="Switch to"]').first();
    await toggle.click();

    const stored = await page.evaluate(() => localStorage.getItem('theme'));
    expect(stored).toBe('dark');
  });
});
