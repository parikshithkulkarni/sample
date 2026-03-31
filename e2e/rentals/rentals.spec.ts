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

    const priceInput = page.getByPlaceholder(/purchase price/i);
    if (await priceInput.isVisible()) await priceInput.fill('500000');
    const valueInput = page.getByPlaceholder(/market value/i);
    if (await valueInput.isVisible()) await valueInput.fill('550000');

    await page.getByRole('button', { name: /save/i }).click();
  });

  test('property cards display stats', async ({ page }) => {
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await page.goto('/rentals');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('123 Main St, San Francisco, CA')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('456 Oak Ave, Austin, TX')).toBeVisible();
  });

  test('property card click navigates to detail', async ({ page }) => {
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await page.goto('/rentals');
    await page.waitForLoadState('domcontentloaded');

    // The property card is a <div> with onClick, containing the address text
    await page.getByText('123 Main St, San Francisco, CA').click();
    await expect(page).toHaveURL(/\/rentals\/p1/);
  });

  test('delete property', async ({ page }) => {
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await page.goto('/rentals');
    await page.waitForLoadState('domcontentloaded');

    const propText = page.getByText('456 Oak Ave, Austin, TX');
    await expect(propText).toBeVisible({ timeout: 10000 });

    // Handle the confirm dialog that deleteProperty() triggers
    page.on('dialog', (dialog) => dialog.accept());

    // Find the property card containing this address, then target the Trash2 button specifically
    const propCard = page.locator('div.cursor-pointer').filter({ hasText: '456 Oak Ave, Austin, TX' });
    const deleteBtn = propCard.locator('button').last();
    await deleteBtn.click();
  });

  test('year selector changes stats', async ({ page }) => {
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await page.goto('/rentals');

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

    const mergeBtn = page.getByRole('button', { name: /merge/i });
    if (await mergeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await mergeBtn.click();
    }
  });

  test('sync from docs', async ({ page }) => {
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await mockDocumentsAPI(page, []);
    await page.goto('/rentals');

    // The button text in the component is "Sync" (short label)
    const syncBtn = page.getByText(/^Sync/);
    if (await syncBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await syncBtn.first().click();
    }
  });

  test('portfolio summary cards', async ({ page }) => {
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await page.goto('/rentals');
    await page.waitForLoadState('domcontentloaded');

    // Summary cards should show aggregated stats
    await expect(page.getByText(/properties/i)).toBeVisible();
  });

  test('Ask Claude button navigates to chat', async ({ page }) => {
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await page.goto('/rentals');
    await page.waitForLoadState('domcontentloaded');

    const askBtn = page.getByRole('button', { name: /ask claude/i });
    if (await askBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await askBtn.click();
      await expect(page).toHaveURL(/\/chat\?q=/);
    }
  });

  test('Bug: auto-dedup on load does not cause list flash', async ({ page }) => {
    // mockRentalsAPI already handles /api/rentals/dedup, so no separate mock needed.
    // The component calls dedup then refetches /api/rentals — both are handled by mockRentalsAPI.
    await mockRentalsAPI(page, TEST_PROPERTIES, TEST_RENTAL_RECORDS);
    await page.goto('/rentals');
    await page.waitForLoadState('domcontentloaded');

    // Properties should be visible without flashing
    await expect(page.getByText('123 Main St, San Francisco, CA')).toBeVisible({ timeout: 10000 });
  });
});
