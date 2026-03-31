import { test, expect } from '@playwright/test';
import { mockDashboardAPIs, mockSetupAPI } from '../helpers/api-mocks';

test.describe('Accessibility', () => {
  test('skip to main content link works', async ({ page }) => {
    await mockDashboardAPIs(page, {});
    await page.goto('/');

    // Tab to the skip link (it's sr-only by default)
    await page.keyboard.press('Tab');

    // The skip link should be focused and visible when focused
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeFocused();

    // Click it - focus should move to main content
    await skipLink.click();
    await expect(page.locator('#main-content')).toBeVisible();
  });

  test('form inputs have associated labels', async ({ page }) => {
    // Test login form labels
    await mockSetupAPI(page, { adminExists: true });
    await page.goto('/login');

    // getByLabel should find inputs via their label elements
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('toast container has aria-live attribute', async ({ page }) => {
    await mockDashboardAPIs(page, {});
    await page.goto('/');

    // Toast container should have aria-live for screen readers
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
    await expect(page.locator('[role="listbox"]')).toBeVisible();
    await expect(page.locator('[role="option"]').first()).toBeVisible();

    // Options should have aria-selected
    await expect(page.locator('[role="option"]').first()).toHaveAttribute('aria-selected', 'true');
  });

  test('theme toggle buttons have aria-labels', async ({ page }) => {
    await mockDashboardAPIs(page, {});
    await page.goto('/');

    const toggles = page.locator('button[aria-label*="Switch to"]');
    const count = await toggles.count();
    expect(count).toBeGreaterThan(0);

    // Verify the label contains the target mode
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

    // The title element should exist
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

    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByLabel('Confirm password')).toBeVisible();
  });
});
