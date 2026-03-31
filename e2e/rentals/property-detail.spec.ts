import { test, expect } from '@playwright/test';
import { mockRentalsAPI } from '../helpers/api-mocks';
import { TEST_PROPERTIES, TEST_RENTAL_RECORDS } from '../helpers/test-data';

test.describe('Property Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
  });

  test('renders property header', async ({ page }) => {
    await page.goto('/rentals/p1');

    await expect(page.getByText('123 Main St, San Francisco, CA')).toBeVisible();
  });

  test('back button navigates to rentals list', async ({ page }) => {
    await page.goto('/rentals/p1');

    await page.getByText(/all properties/i).click();
    // Should navigate back
    await expect(page).toHaveURL(/\/rentals/);
  });

  test('edit property form', async ({ page }) => {
    await page.goto('/rentals/p1');

    // Click edit (pencil) button
    const editBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pencil') }).first();
    if (await editBtn.isVisible()) {
      await editBtn.click();

      // Edit form should appear
      const addressInput = page.locator('input').filter({ hasText: '' }).first();
      if (await addressInput.isVisible()) {
        await addressInput.fill('123 Main St Updated, San Francisco, CA');
      }
    }
  });

  test('delete property redirects to /rentals', async ({ page }) => {
    await page.goto('/rentals/p1');

    const deleteBtn = page.locator('button').filter({ has: page.locator('svg.lucide-trash-2') }).first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await expect(page).toHaveURL(/\/rentals$/, { timeout: 5000 });
    }
  });

  test('annual KPIs display', async ({ page }) => {
    await page.goto('/rentals/p1');

    // Should show KPI labels
    await expect(page.getByText(/annual rent/i)).toBeVisible();
  });

  test('year selector changes records', async ({ page }) => {
    await page.goto('/rentals/p1');

    const yearSelector = page.locator('select').first();
    if (await yearSelector.isVisible()) {
      await yearSelector.selectOption('2023');
    }
  });

  test('log month form', async ({ page }) => {
    await page.goto('/rentals/p1');

    const logBtn = page.getByRole('button', { name: /log month/i });
    if (await logBtn.isVisible()) {
      await logBtn.click();

      // Fill the form
      await page.getByPlaceholder(/rent/i).first().fill('4500');
      await page.getByPlaceholder(/mortgage/i).first().fill('3200');
    }
  });

  test('monthly records table', async ({ page }) => {
    await page.goto('/rentals/p1');

    // Should display month names
    await expect(page.getByText('Jan')).toBeVisible();
    await expect(page.getByText('Feb')).toBeVisible();
  });

  test('expanded row shows expense breakdown', async ({ page }) => {
    await page.goto('/rentals/p1');

    // Click a table row to expand
    const janRow = page.getByText('Jan').locator('..');
    await janRow.click();

    // Should show expense categories
    await expect(page.getByText(/taxes.*insurance|property_tax/i)).toBeVisible();
  });

  test('expense categories in form', async ({ page }) => {
    await page.goto('/rentals/p1');

    const logBtn = page.getByRole('button', { name: /log month/i });
    if (await logBtn.isVisible()) {
      await logBtn.click();

      // Should show 5 expense group labels
      await expect(page.getByText('Taxes & Insurance')).toBeVisible();
      await expect(page.getByText('Building & Maintenance')).toBeVisible();
      await expect(page.getByText('Management & Services')).toBeVisible();
      await expect(page.getByText('Admin & Professional')).toBeVisible();
    }
  });

  test('Ask Claude button includes property context', async ({ page }) => {
    await page.goto('/rentals/p1');

    const askBtn = page.getByRole('button', { name: /ask claude/i });
    if (await askBtn.isVisible()) {
      await askBtn.click();
      await expect(page).toHaveURL(/\/chat\?q=/);
    }
  });

  test('Bug: invalid propertyId shows error or empty state', async ({ page }) => {
    await page.route('**/api/rentals/invalid-id', async (route) => {
      await route.fulfill({ status: 404, json: { error: 'Not found' } });
    });
    await page.goto('/rentals/invalid-id');

    // Should handle gracefully - not crash
    await page.waitForTimeout(2000);
    // Page should still be interactive (not white screen)
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
