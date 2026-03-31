import { test, expect } from '@playwright/test';
import { mockDashboardAPIs, mockSetupAPI } from '../helpers/api-mocks';

test.describe('Accessibility', () => {
  test('skip to main content link works', async ({ page }) => {
    await mockDashboardAPIs(page, {});
    await page.goto('/');

    // Tab to the skip link (it's sr-only by default)
    await page.keyboard.press('Tab');

    // The skip link should exist
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();

    // Click it - should navigate to main content
    await skipLink.click({ force: true });
    await expect(page.locator('#main-content')).toBeVisible();
  });

  test('form inputs have associated labels', async ({ page }) => {
    // Test login form labels — need to mock /api/setup first
    await mockSetupAPI(page, { adminExists: true });
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // Wait for form to render (adminExists check resolves)
    await expect(page.getByLabel('Username')).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('toast container has aria-live attribute', async ({ page }) => {
    await mockDashboardAPIs(page, {});
    await page.goto('/');

    const toastContainer = page.locator('[aria-live]');
    await expect(toastContainer.first()).toBeAttached();
  });

  test('document mention picker has role=listbox', async ({ page }) => {
    await page.route('**/api/documents', async (route) => {
      await route.fulfill({ json: [{ id: 'd1', name: 'Test.pdf', tags: [] }] });
    });
    await page.route('**/api/chat/sessions', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.goto('/chat');

    const input = page.getByPlaceholder(/ask anything/i);
    await input.fill('@');

    // Picker should have correct ARIA roles
    await expect(page.locator('[role="listbox"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[role="option"]').first()).toBeVisible();

    // First option should have aria-selected
    await expect(page.locator('[role="option"]').first()).toHaveAttribute('aria-selected', 'true');
  });

  test('theme toggle buttons have aria-labels', async ({ page }) => {
    await mockDashboardAPIs(page, {});
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const toggles = page.locator('button[aria-label*="Switch to"]');
    await expect(toggles.first()).toBeAttached();

    const label = await toggles.first().getAttribute('aria-label');
    expect(label).toMatch(/Switch to (light|dark) mode/);
  });

  test('capture modal has correct ARIA attributes', async ({ page }) => {
    await mockDashboardAPIs(page, {});
    await page.goto('/');

    await page.locator('button[aria-label="Quick capture"]').click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-labelledby', 'capture-title');

    await expect(page.locator('#capture-title')).toHaveText('Quick Capture');
  });
});

test.describe('Accessibility - Unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('setup page form labels', async ({ page }) => {
    await mockSetupAPI(page, {
      vars: [], dbReady: true, dbError: '', allRequired: true, adminExists: false, ready: false,
    });
    await page.goto('/setup');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByLabel('Username')).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByLabel('Confirm password')).toBeVisible();
  });
});
