import { test, expect } from '@playwright/test';
import { mockAuditAPI } from '../helpers/api-mocks';
import { TEST_AUDIT_DATA } from '../helpers/test-data';

test.describe('Audit Page', () => {
  test('loading state shows spinner', async ({ page }) => {
    await page.route('**/api/audit', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({ json: TEST_AUDIT_DATA });
    });
    await page.goto('/audit');

    await expect(page.locator('.animate-spin').first()).toBeVisible();
  });

  test('summary cards display counts', async ({ page }) => {
    await mockAuditAPI(page, TEST_AUDIT_DATA);
    await page.goto('/audit');

    const accountsCard = page.locator('.rounded-xl').filter({ hasText: 'Accounts' }).first();
    await expect(accountsCard).toBeVisible();
    await expect(accountsCard.getByText('5')).toBeVisible(); // totalAccounts

    const propertiesCard = page.locator('.rounded-xl').filter({ hasText: 'Properties' }).first();
    await expect(propertiesCard).toBeVisible();
    await expect(propertiesCard.getByText('2')).toBeVisible(); // totalProperties
  });

  test('issues grouped by severity', async ({ page }) => {
    await mockAuditAPI(page, TEST_AUDIT_DATA);
    await page.goto('/audit');

    // Should show errors section
    await expect(page.getByText(/errors.*\(1\)/i)).toBeVisible();
    await expect(page.getByText('Duplicate account: Fidelity 401k')).toBeVisible();

    // Should show warnings section
    await expect(page.getByText(/warnings.*\(1\)/i)).toBeVisible();
    await expect(page.getByText(/document not yet extracted/i)).toBeVisible();
  });

  test('all clean state with zero issues', async ({ page }) => {
    const cleanData = {
      ...TEST_AUDIT_DATA,
      issues: [],
      summary: { ...TEST_AUDIT_DATA.summary, autoFixableCount: 0, issuesByType: {} },
    };
    await mockAuditAPI(page, cleanData);
    await page.goto('/audit');

    await expect(page.getByText('All clean!')).toBeVisible();
    await expect(page.getByText('No data quality issues found')).toBeVisible();
  });

  test('auto-fix button visible when fixable issues exist', async ({ page }) => {
    await mockAuditAPI(page, TEST_AUDIT_DATA);
    await page.goto('/audit');

    await expect(page.getByRole('button', { name: /fix all/i })).toBeVisible();
  });

  test('auto-fix button hidden when nothing fixable', async ({ page }) => {
    const noFixData = {
      ...TEST_AUDIT_DATA,
      summary: { ...TEST_AUDIT_DATA.summary, autoFixableCount: 0 },
    };
    await mockAuditAPI(page, noFixData);
    await page.goto('/audit');

    await expect(page.getByRole('button', { name: /fix all/i })).not.toBeVisible();
  });

  test('fix result message after auto-fix', async ({ page }) => {
    await mockAuditAPI(page, TEST_AUDIT_DATA);
    await page.goto('/audit');

    await page.getByRole('button', { name: /fix all/i }).click();

    await expect(page.getByText(/cleaned/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/junk accounts deleted/i)).toBeVisible();
  });

  test('refresh button reloads data', async ({ page }) => {
    let callCount = 0;
    await page.route('**/api/audit', async (route) => {
      callCount++;
      await route.fulfill({ json: TEST_AUDIT_DATA });
    });
    await page.goto('/audit');
    await page.waitForTimeout(500);

    const initialCalls = callCount;
    await page.getByRole('button', { name: /refresh/i }).click();
    await page.waitForTimeout(500);

    expect(callCount).toBeGreaterThan(initialCalls);
  });

  test('raw data tables render', async ({ page }) => {
    await mockAuditAPI(page, TEST_AUDIT_DATA);
    await page.goto('/audit');

    await expect(page.getByText(/all accounts.*\(5\)/i)).toBeVisible();
    await expect(page.getByText(/all properties.*\(2\)/i)).toBeVisible();
    await expect(page.getByText(/documents.*\(2\)/i)).toBeVisible();
  });

  test('account table - liabilities shown in red', async ({ page }) => {
    await mockAuditAPI(page, TEST_AUDIT_DATA);
    await page.goto('/audit');

    // Liabilities should have text-red-500
    const liabilityCell = page.locator('td.text-red-500');
    await expect(liabilityCell.first()).toBeVisible();
  });

  test('Bug: API error shows error message', async ({ page }) => {
    await page.route('**/api/audit', async (route) => {
      await route.fulfill({ status: 500, body: 'Internal Server Error' });
    });
    await page.goto('/audit');

    await expect(page.getByText(/failed to load audit data/i)).toBeVisible({ timeout: 5000 });
  });
});
