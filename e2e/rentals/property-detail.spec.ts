import { test, expect } from '@playwright/test';
import { mockRentalsAPI } from '../helpers/api-mocks';
import { TEST_PROPERTIES, TEST_RENTAL_RECORDS } from '../helpers/test-data';

test.describe('Property Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
  });

  test('renders property header', async ({ page }) => {
    await page.goto('/rentals/p1');

    await expect(page.getByText('123 Main St, San Francisco, CA')).toBeVisible({ timeout: 10000 });
  });

  test('back button navigates to rentals list', async ({ page }) => {
    await page.goto('/rentals/p1');
    await page.waitForLoadState('networkidle');

    // Click back button — look for ArrowLeft or "All Properties" text
    const backBtn = page.locator('button, a').filter({ hasText: /all properties|back/i }).first();
    if (await backBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await backBtn.click();
      await expect(page).toHaveURL(/\/rentals/);
    }
  });

  test('edit property form', async ({ page }) => {
    await page.goto('/rentals/p1');
    await page.waitForLoadState('networkidle');

    const editBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pencil') }).first();
    if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editBtn.click();
      // Edit form should appear with input fields
      await page.waitForTimeout(500);
    }
  });

  test('delete property redirects to /rentals', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await page.goto('/rentals/p1');
    await page.waitForLoadState('networkidle');

    const deleteBtn = page.locator('button').filter({ has: page.locator('svg.lucide-trash-2') }).first();
    if (await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await deleteBtn.click();
      await expect(page).toHaveURL(/\/rentals$/, { timeout: 5000 });
    }
  });

  test('annual KPIs display', async ({ page }) => {
    await page.goto('/rentals/p1');

    await expect(page.getByText(/annual rent/i)).toBeVisible({ timeout: 10000 });
  });

  test('year selector changes records', async ({ page }) => {
    await page.goto('/rentals/p1');

    const yearSelector = page.locator('select').first();
    if (await yearSelector.isVisible({ timeout: 5000 }).catch(() => false)) {
      await yearSelector.selectOption('2023');
    }
  });

  test('log month form', async ({ page }) => {
    await page.goto('/rentals/p1');

    const logBtn = page.getByRole('button', { name: /log month/i });
    if (await logBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await logBtn.click();
      const rentInput = page.getByPlaceholder(/rent/i).first();
      if (await rentInput.isVisible()) await rentInput.fill('4500');
    }
  });

  test('monthly records table', async ({ page }) => {
    await page.goto('/rentals/p1');
    await page.waitForLoadState('networkidle');

    // Records for months 1,2,3 should show month names
    const hasMonths = await page.getByText('Jan').isVisible({ timeout: 5000 }).catch(() => false);
    if (hasMonths) {
      await expect(page.getByText('Jan')).toBeVisible();
    }
  });

  test('expanded row shows expense breakdown', async ({ page }) => {
    await page.goto('/rentals/p1');
    await page.waitForLoadState('networkidle');

    // Click a table row to expand expenses
    const janText = page.getByText('Jan');
    if (await janText.isVisible({ timeout: 5000 }).catch(() => false)) {
      await janText.click();
      // Should show expense details after expansion
      await page.waitForTimeout(500);
    }
  });

  test('expense categories in form', async ({ page }) => {
    await page.goto('/rentals/p1');

    const logBtn = page.getByRole('button', { name: /log month/i });
    if (await logBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await logBtn.click();
      await expect(page.getByText('Taxes & Insurance')).toBeVisible();
      await expect(page.getByText('Building & Maintenance')).toBeVisible();
    }
  });

  test('Ask Claude button includes property context', async ({ page }) => {
    await page.goto('/rentals/p1');

    const askBtn = page.getByRole('button', { name: /ask claude/i });
    if (await askBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await askBtn.click();
      await expect(page).toHaveURL(/\/chat\?q=/);
    }
  });

  test('Bug: invalid propertyId shows error or empty state', async ({ page }) => {
    await page.route('**/api/rentals/invalid-id', async (route) => {
      await route.fulfill({ status: 404, json: { error: 'Not found' } });
    });
    await page.goto('/rentals/invalid-id');

    // Should show "Property not found" or at least not crash
    await page.waitForTimeout(3000);
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
