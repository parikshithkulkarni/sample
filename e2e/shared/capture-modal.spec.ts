import { test, expect } from '@playwright/test';
import { mockDashboardAPIs, mockCaptureAPI } from '../helpers/api-mocks';

test.describe('Capture Modal', () => {
  test.beforeEach(async ({ page }) => {
    await mockDashboardAPIs(page, {});
    await mockCaptureAPI(page);
  });

  test('FAB button visible with aria-label', async ({ page }) => {
    await page.goto('/');

    const fab = page.locator('button[aria-label="Quick capture"]');
    await expect(fab).toBeVisible();
  });

  test('opens modal on click', async ({ page }) => {
    await page.goto('/');

    await page.locator('button[aria-label="Quick capture"]').click();

    // Modal should open with dialog role
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('[aria-modal="true"]')).toBeVisible();
    await expect(page.getByText('Quick Capture')).toBeVisible();
  });

  test('closes on backdrop click', async ({ page }) => {
    await page.goto('/');

    await page.locator('button[aria-label="Quick capture"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Click backdrop (the overlay div outside the dialog sheet)
    await page.locator('.bg-black\\/40').click({ position: { x: 10, y: 10 } });

    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('closes on X button', async ({ page }) => {
    await page.goto('/');

    await page.locator('button[aria-label="Quick capture"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Click X button
    await page.locator('[role="dialog"] button').filter({ has: page.locator('svg.lucide-x') }).click();

    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('submit capture with text and tags', async ({ page }) => {
    await page.goto('/');

    await page.locator('button[aria-label="Quick capture"]').click();

    await page.locator('[role="dialog"] textarea').fill('This is a test capture note');
    await page.locator('[role="dialog"] input').fill('test, capture');
    await page.getByRole('button', { name: /save to brain/i }).click();

    // Should show success toast
    await expect(page.getByText('Saved to Brain!')).toBeVisible({ timeout: 5000 });

    // Modal should close
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('submit button disabled when textarea is empty', async ({ page }) => {
    await page.goto('/');

    await page.locator('button[aria-label="Quick capture"]').click();

    const saveBtn = page.getByRole('button', { name: /save to brain/i });
    await expect(saveBtn).toBeDisabled();

    // Fill text - should enable
    await page.locator('[role="dialog"] textarea').fill('Some text');
    await expect(saveBtn).toBeEnabled();
  });

  test('focus trap keeps focus within modal', async ({ page }) => {
    await page.goto('/');

    await page.locator('button[aria-label="Quick capture"]').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Tab through elements - focus should stay within the dialog
    // The textarea should have autoFocus
    const textarea = page.locator('[role="dialog"] textarea');
    await expect(textarea).toBeFocused();

    // Tab through all elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Focus should still be within the dialog
    const activeElement = await page.evaluate(() => {
      const el = document.activeElement;
      const dialog = document.querySelector('[role="dialog"]');
      return dialog?.contains(el) ?? false;
    });
    expect(activeElement).toBe(true);
  });

  test('error toast on API failure', async ({ page }) => {
    await page.route('**/api/capture', async (route) => {
      await route.abort('connectionrefused');
    });
    await page.goto('/');

    await page.locator('button[aria-label="Quick capture"]').click();
    await page.locator('[role="dialog"] textarea').fill('Some text');
    await page.getByRole('button', { name: /save to brain/i }).click();

    await expect(page.getByText('Failed to save')).toBeVisible({ timeout: 5000 });
  });
});
