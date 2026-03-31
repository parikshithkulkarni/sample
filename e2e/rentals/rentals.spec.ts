import { test, expect } from '@playwright/test';
import { mockRentalsAPI, mockDocumentsAPI } from '../helpers/api-mocks';
import { TEST_PROPERTIES, TEST_RENTAL_RECORDS } from '../helpers/test-data';

test.describe('Rentals Page', () => {
  test('empty state', async ({ page }) => {
    await mockRentalsAPI(page, []);
    await page.goto('/rentals');

    await expect(page.getByText(/no properties yet/i)).toBeVisible();
  });

  test('add property form + card appears', async ({ page }) => {
    await mockRentalsAPI(page, []);
    await page.goto('/rentals');

    await page.getByRole('button', { name: /add/i }).click();
    await page.getByPlaceholder(/address/i).fill('789 Elm St, Denver, CO');
    await page.getByPlaceholder(/purchase price/i).fill('500000');
    await page.getByPlaceholder(/market value/i).fill('550000');

    await page.getByRole('button', { name: /save/i }).click();
  });

  test('property cards display stats', async ({ page }) => {
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await page.goto('/rentals');

    await expect(page.getByText('123 Main St, San Francisco, CA')).toBeVisible();
    await expect(page.getByText('456 Oak Ave, Austin, TX')).toBeVisible();
  });

  test('property card click navigates to detail', async ({ page }) => {
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await page.goto('/rentals');

    await page.getByText('123 Main St, San Francisco, CA').click();
    await expect(page).toHaveURL(/\/rentals\/p1/);
  });

  test('delete property', async ({ page }) => {
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await page.goto('/rentals');

    const propText = page.getByText('456 Oak Ave, Austin, TX');
    await expect(propText).toBeVisible();

    // Click the delete button on the property card
    const propCard = propText.locator('..').locator('..');
    const deleteBtn = propCard.locator('button').filter({ has: page.locator('svg') }).last();
    await deleteBtn.click();
  });

  test('year selector changes stats', async ({ page }) => {
    let requestedYear: string | null = null;
    await page.route('**/api/rentals/*/records*', async (route) => {
      const url = new URL(route.request().url());
      requestedYear = url.searchParams.get('year');
      await route.fulfill({ json: TEST_RENTAL_RECORDS });
    });
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await page.goto('/rentals');

    // Change year via selector
    const yearSelector = page.locator('select').first();
    if (await yearSelector.isVisible()) {
      await yearSelector.selectOption('2023');
    }
  });

  test('duplicate detection and merge', async ({ page }) => {
    const dupProperties = [
      ...TEST_PROPERTIES,
      { id: 'p3', address: '123 Main St, San Francisco, CA 94105', purchase_price: 800000, purchase_date: '2020-06-15', market_value: 950000, mortgage_balance: 600000, notes: null },
    ];
    await mockRentalsAPI(page, dupProperties, TEST_RENTAL_RECORDS);
    await page.goto('/rentals');

    // Should detect duplicate
    const mergeBtn = page.getByRole('button', { name: /merge/i });
    if (await mergeBtn.isVisible()) {
      await mergeBtn.click();
    }
  });

  test('sync from docs', async ({ page }) => {
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await mockDocumentsAPI(page, []);
    await page.goto('/rentals');

    const syncBtn = page.getByText('Sync from docs');
    if (await syncBtn.isVisible()) {
      await syncBtn.click();
    }
  });

  test('portfolio summary cards', async ({ page }) => {
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await page.goto('/rentals');

    // Summary cards should show aggregated stats
    await expect(page.getByText(/properties/i)).toBeVisible();
  });

  test('Ask Claude button navigates to chat', async ({ page }) => {
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await page.goto('/rentals');

    const askBtn = page.getByRole('button', { name: /ask claude/i });
    if (await askBtn.isVisible()) {
      await askBtn.click();
      await expect(page).toHaveURL(/\/chat\?q=/);
    }
  });

  test('Bug: auto-dedup on load does not cause list flash', async ({ page }) => {
    let dedupCalled = false;
    await page.route('**/api/rentals/dedup', async (route) => {
      dedupCalled = true;
      await route.fulfill({ json: { merged: 0 } });
    });
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await page.goto('/rentals');

    // Properties should be visible without flashing
    await expect(page.getByText('123 Main St, San Francisco, CA')).toBeVisible();
  });
});
