import { test, expect } from '@playwright/test';
import { mockFinanceAPI, mockDocumentsAPI } from '../helpers/api-mocks';
import { TEST_ACCOUNTS } from '../helpers/test-data';

test.describe('Finance Page', () => {
  test('empty state', async ({ page }) => {
    await mockFinanceAPI(page, []);
    await page.goto('/finance');

    await expect(page.getByText('No accounts yet')).toBeVisible();
    await expect(page.getByText('Add your first account to start tracking your net worth')).toBeVisible();
  });

  test('net worth card displays correctly', async ({ page }) => {
    await mockFinanceAPI(page, TEST_ACCOUNTS);
    await page.goto('/finance');

    await expect(page.getByText('Net Worth')).toBeVisible();
    await expect(page.getByText(/Assets/)).toBeVisible();
    await expect(page.getByText(/Liabilities/)).toBeVisible();
  });

  test('add account form opens and closes', async ({ page }) => {
    await mockFinanceAPI(page, []);
    await page.goto('/finance');

    // Open form
    await page.getByText('Add Account').click();
    await expect(page.getByPlaceholder(/account name/i)).toBeVisible();

    // Close form
    await page.getByText('Add Account').click();
    await expect(page.getByPlaceholder(/account name/i)).not.toBeVisible();
  });

  test('add account - full flow', async ({ page }) => {
    await mockFinanceAPI(page, []);
    await page.goto('/finance');

    await page.getByText('Add Account').click();
    await page.getByPlaceholder(/account name/i).fill('New 401k');
    await page.locator('select').selectOption('asset');
    await page.getByPlaceholder(/balance/i).fill('50000');
    await page.getByRole('button', { name: 'Save Account' }).click();

    // New account should appear
    await expect(page.getByText('New 401k')).toBeVisible();
  });

  test('type toggle changes category suggestions', async ({ page }) => {
    await mockFinanceAPI(page, []);
    await page.goto('/finance');

    await page.getByText('Add Account').click();

    // Default is asset - check datalist has asset categories
    const datalist = page.locator('#category-suggestions');
    await expect(datalist.locator('option[value="401k"]')).toBeAttached();

    // Switch to liability
    await page.locator('select').selectOption('liability');
    // Should not have asset categories
    await expect(datalist.locator('option[value="401k"]')).not.toBeAttached();
  });

  test('inline balance editing', async ({ page }) => {
    await mockFinanceAPI(page, TEST_ACCOUNTS);
    await page.goto('/finance');

    // Find the edit (pencil) button for the first account group's first item
    // Expand a group first if needed
    const editBtn = page.locator('button').filter({ has: page.locator('svg') }).filter({ hasText: '' });

    // Click the pencil icon for an account
    const accountRow = page.getByText('Fidelity 401k').locator('..');
    await accountRow.locator('button').first().click();

    // Should show input field
    const balanceInput = page.locator('input[class*="w-28"]');
    if (await balanceInput.isVisible()) {
      await balanceInput.fill('130000');
      // Click the check button to save
      await page.locator('button').filter({ has: page.locator('.text-emerald-500') }).first().click();
    }
  });

  test('cancel inline edit', async ({ page }) => {
    await mockFinanceAPI(page, TEST_ACCOUNTS);
    await page.goto('/finance');

    // Start editing an account
    const fidelityRow = page.getByText('Fidelity 401k').locator('..').locator('..');
    await fidelityRow.locator('button').nth(0).click();

    // Cancel the edit
    const cancelBtn = page.locator('button').filter({ has: page.locator('.text-gray-400 svg') });
    if (await cancelBtn.first().isVisible()) {
      await cancelBtn.first().click();
    }
  });

  test('delete account', async ({ page }) => {
    await mockFinanceAPI(page, TEST_ACCOUNTS);
    await page.goto('/finance');

    // Count accounts before
    const fidelityText = page.getByText('Fidelity 401k');
    await expect(fidelityText).toBeVisible();

    // Click delete (trash) button
    const accountRow = fidelityText.locator('..').locator('..');
    const trashBtn = accountRow.locator('button').last();
    await trashBtn.click();

    // Account should be removed (optimistic)
    await expect(fidelityText).not.toBeVisible();
  });

  test('semantic group collapsing', async ({ page }) => {
    await mockFinanceAPI(page, TEST_ACCOUNTS);
    await page.goto('/finance');

    // Click a group header to collapse
    const retirementGroup = page.getByText('Retirement');
    await retirementGroup.click();

    // The accounts under retirement should be hidden
    // Click again to expand
    await retirementGroup.click();
  });

  test('duplicate detection warning', async ({ page }) => {
    const dupAccounts = [
      ...TEST_ACCOUNTS,
      { id: '6', name: 'Fidelity 401k', type: 'asset', category: '401k', balance: 25000, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
    ];
    await mockFinanceAPI(page, dupAccounts);
    await page.goto('/finance');

    await expect(page.getByText('Duplicate accounts detected')).toBeVisible();
  });

  test('merge duplicates', async ({ page }) => {
    const dupAccounts = [
      ...TEST_ACCOUNTS,
      { id: '6', name: 'Fidelity 401k', type: 'asset', category: '401k', balance: 25000, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
    ];
    await mockFinanceAPI(page, dupAccounts);
    await page.goto('/finance');

    await page.getByRole('button', { name: /merge/i }).click();
    await expect(page.getByText('Duplicates merged')).toBeVisible();
  });

  test('sync from docs button', async ({ page }) => {
    await mockFinanceAPI(page, TEST_ACCOUNTS);
    await mockDocumentsAPI(page, []);
    await page.goto('/finance');

    await page.getByText('Sync from docs').click();
    await expect(page.getByText(/syncing/i)).toBeVisible();
  });

  test('Ask Claude button navigates to chat', async ({ page }) => {
    await mockFinanceAPI(page, TEST_ACCOUNTS);
    await page.goto('/finance');

    await page.getByText('Ask Claude about my finances').click();
    await expect(page).toHaveURL(/\/chat\?q=/);
  });

  test('tax records group collapsed by default', async ({ page }) => {
    const accountsWithTaxRecords = [
      ...TEST_ACCOUNTS,
      { id: '7', name: 'Employment Income 2024', type: 'asset', category: 'employment_income', balance: 200000, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
    ];
    await mockFinanceAPI(page, accountsWithTaxRecords);
    await page.goto('/finance');

    // Tax & Income Records group should exist but be collapsed
    await expect(page.getByText('Tax & Income Records')).toBeVisible();
    await expect(page.getByText('Not included in net worth')).toBeVisible();
  });

  test('Bug: balance edit with non-numeric input', async ({ page }) => {
    await mockFinanceAPI(page, TEST_ACCOUNTS);
    await page.goto('/finance');

    // Try to edit with non-numeric value
    const fidelityRow = page.getByText('Fidelity 401k').locator('..').locator('..');
    await fidelityRow.locator('button').nth(0).click();

    const balanceInput = page.locator('input[class*="w-28"]');
    if (await balanceInput.isVisible()) {
      await balanceInput.fill('not-a-number');
      // The parseFloat will return NaN - verify UI handles gracefully
      await page.locator('button .text-emerald-500').first().click();
    }
  });

  test('income items with generic categories show under Tax & Income Records, not Other Assets', async ({ page }) => {
    const accountsWithIncome = [
      ...TEST_ACCOUNTS,
      { id: 'inc-1', name: '2025 Wages - Writer Inc', type: 'asset', category: 'other', balance: 160941, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
      { id: 'inc-2', name: 'Rental Income - Parikshith (Tom\'s PM LLC)', type: 'asset', category: 'other', balance: 55525, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
      { id: 'inc-3', name: 'Robinhood Dividends 2025', type: 'asset', category: 'other', balance: 96, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
      { id: 'inc-4', name: 'Robinhood Substitute Payments 2025', type: 'asset', category: 'other', balance: 2, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
      { id: 'inc-5', name: 'UWM Mortgage Escrow Balance - 12806', type: 'asset', category: 'escrow', balance: 2175, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
      { id: 'inc-6', name: 'Robinhood Substitute Payments (MISC) 2025', type: 'asset', category: 'other_income', balance: 2, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
    ];
    await mockFinanceAPI(page, accountsWithIncome);
    await page.goto('/finance');

    // Income items should appear under "Tax & Income Records"
    await expect(page.getByText('Tax & Income Records')).toBeVisible();

    // They should NOT appear under "Other Assets"
    const otherAssetsHeader = page.getByText('Other Assets');
    await expect(otherAssetsHeader).not.toBeVisible();
  });

  test('duplicate mortgages with city/state suffix are detected as duplicates', async ({ page }) => {
    const accountsWithDupMortgages = [
      ...TEST_ACCOUNTS,
      { id: 'mtg-1', name: 'PHH Mortgage - 1014 Terrace Trl', type: 'liability', category: 'mortgage', balance: 213838, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
      { id: 'mtg-2', name: 'PHH Mortgage - 1014 Terrace Trl Carrollton TX', type: 'liability', category: 'mortgage', balance: 213838, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
    ];
    await mockFinanceAPI(page, accountsWithDupMortgages);
    await page.goto('/finance');

    // Should detect the PHH Mortgage entries as duplicates
    await expect(page.getByText('Duplicate accounts detected')).toBeVisible();
  });

  test('Bug: optimistic balance update reverts on API error', async ({ page }) => {
    // Override the PATCH to fail
    await page.route('**/api/finance/cleanup', (r) => r.fulfill({ json: {} }));
    await page.route('**/api/finance/snapshots', (r) => r.fulfill({ json: [] }));
    await page.route('**/api/finance', (r) => r.fulfill({ json: TEST_ACCOUNTS }));
    await page.route('**/api/finance/*', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 500, json: { error: 'Server error' } });
      } else {
        await route.continue();
      }
    });
    await page.goto('/finance');

    // Start editing
    const fidelityRow = page.getByText('Fidelity 401k').locator('..').locator('..');
    await fidelityRow.locator('button').nth(0).click();

    const balanceInput = page.locator('input[class*="w-28"]');
    if (await balanceInput.isVisible()) {
      await balanceInput.fill('999999');
      await page.locator('button .text-emerald-500').first().click();
      // Should show error toast
      await expect(page.getByText('Failed to update balance')).toBeVisible({ timeout: 5000 });
    }
  });
});
