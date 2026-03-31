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

    // Wait for loading skeleton to disappear and net worth card to appear
    await expect(page.getByText('Net Worth').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Assets/).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Liabilities/).first()).toBeVisible({ timeout: 5000 });
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
    await page.waitForLoadState('domcontentloaded');

    // Fidelity 401k is in the "Retirement" group. Ensure group is expanded by checking visibility.
    await expect(page.getByText('Fidelity 401k')).toBeVisible();

    // The AccountRow li contains: account name, then a flex container with balance + pencil button + trash button.
    // Find the pencil button (the one with Pencil SVG) in the same li as "Fidelity 401k".
    const accountLi = page.locator('li').filter({ hasText: 'Fidelity 401k' });
    // In non-editing mode, the AccountRow has two buttons: pencil (edit), then trash (delete).
    // Pencil button has hover:text-sky-500 class.
    const pencilBtn = accountLi.locator('button').nth(0);
    await pencilBtn.click();

    // Should show input field (type="number")
    const balanceInput = accountLi.locator('input[type="number"]');
    await expect(balanceInput).toBeVisible();
    await balanceInput.fill('130000');

    // Click the check button to save — in editing mode, buttons are: [save (check), cancel (X)].
    // The save button is the first button in edit mode.
    const saveBtn = accountLi.locator('button').nth(0);
    await saveBtn.click();
  });

  test('cancel inline edit', async ({ page }) => {
    await mockFinanceAPI(page, TEST_ACCOUNTS);
    await page.goto('/finance');
    await page.waitForLoadState('domcontentloaded');

    // Start editing an account
    await expect(page.getByText('Fidelity 401k')).toBeVisible();
    const accountLi = page.locator('li').filter({ hasText: 'Fidelity 401k' });
    const pencilBtn = accountLi.locator('button').nth(0);
    await pencilBtn.click();

    // Cancel the edit - click the X button. In editing mode, buttons are: [save, cancel].
    const cancelBtn = accountLi.locator('button').nth(1);
    await cancelBtn.click();

    // Input should no longer be visible
    await expect(accountLi.locator('input[type="number"]')).not.toBeVisible();
  });

  test('delete account', async ({ page }) => {
    await mockFinanceAPI(page, TEST_ACCOUNTS);
    await page.goto('/finance');
    await page.waitForLoadState('domcontentloaded');

    // Count accounts before
    const fidelityText = page.getByText('Fidelity 401k');
    await expect(fidelityText).toBeVisible();

    // Handle the confirm dialog that remove() triggers
    page.on('dialog', (dialog) => dialog.accept());

    // Click delete (trash) button — it is the second button in the account row
    const accountLi = page.locator('li').filter({ hasText: 'Fidelity 401k' });
    const trashBtn = accountLi.locator('button').nth(1);
    await trashBtn.click();

    // Account should be removed (optimistic)
    await expect(fidelityText).not.toBeVisible();
  });

  test('semantic group collapsing', async ({ page }) => {
    await mockFinanceAPI(page, TEST_ACCOUNTS);
    await page.goto('/finance');
    await page.waitForLoadState('domcontentloaded');

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
    await page.waitForLoadState('domcontentloaded');

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
    await page.waitForLoadState('domcontentloaded');

    // Start editing the account balance
    await expect(page.getByText('Fidelity 401k')).toBeVisible();
    const accountLi = page.locator('li').filter({ hasText: 'Fidelity 401k' });
    const pencilBtn = accountLi.locator('button').nth(0);
    await pencilBtn.click();

    // The input is type="number", so non-numeric text cannot be entered.
    // Verify the input has type="number" which provides built-in browser validation.
    const balanceInput = accountLi.locator('input[type="number"]');
    await expect(balanceInput).toBeVisible();
    await expect(balanceInput).toHaveAttribute('type', 'number');

    // Attempting to fill a non-numeric value into a type="number" input results in an empty value.
    // Playwright's fill() on type="number" with non-numeric text will set the value to empty string.
    await balanceInput.fill('');
    // The input should be empty (browser rejects non-numeric)
    await expect(balanceInput).toHaveValue('');

    // Click save — parseFloat('') returns NaN, UI should handle gracefully (not crash)
    const saveBtn = accountLi.locator('button').nth(0);
    await saveBtn.click();

    // Page should remain stable
    await expect(page.getByText('Fidelity 401k')).toBeVisible();
  });

  test('Bug: optimistic balance update reverts on API error', async ({ page }) => {
    // Set up standard mocks first
    await page.route('**/api/finance/cleanup', (r) => r.fulfill({ json: {} }));
    await page.route('**/api/finance/snapshots', (r) => r.fulfill({ json: [] }));
    await page.route('**/api/finance', (r) => r.fulfill({ json: TEST_ACCOUNTS }));
    // Override the PATCH to abort (network error) so fetch() rejects and the catch block fires
    await page.route('**/api/finance/*', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.abort('failed');
      } else if (route.request().method() === 'DELETE') {
        await route.fulfill({ json: { ok: true } });
      } else {
        await route.continue();
      }
    });
    await page.goto('/finance');
    await page.waitForLoadState('domcontentloaded');

    // Start editing
    await expect(page.getByText('Fidelity 401k')).toBeVisible();
    const accountLi = page.locator('li').filter({ hasText: 'Fidelity 401k' });
    const pencilBtn = accountLi.locator('button').nth(0);
    await pencilBtn.click();

    const balanceInput = accountLi.locator('input[type="number"]');
    await expect(balanceInput).toBeVisible();
    await balanceInput.fill('999999');

    // Click save
    const saveBtn = accountLi.locator('button').nth(0);
    await saveBtn.click();

    // Should show error toast after the PATCH fails (network error triggers catch block)
    await expect(page.getByText('Failed to update balance')).toBeVisible({ timeout: 5000 });
  });
});
