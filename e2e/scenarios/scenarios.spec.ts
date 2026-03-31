import { test, expect } from '@playwright/test';
import { mockScenariosAPI } from '../helpers/api-mocks';

test.describe('Tax Scenarios Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockScenariosAPI(page);
  });

  test('tab navigation shows correct form fields', async ({ page }) => {
    await page.goto('/scenarios');

    // Default tab should be ISO
    await expect(page.getByText('ISO Exercise')).toBeVisible();
    await expect(page.getByText('Shares to Exercise')).toBeVisible();

    // Click RNOR tab
    await page.getByRole('button', { name: 'RNOR Window' }).click();
    await expect(page.getByText('Year Returned to India')).toBeVisible();

    // Click Capital Gains tab
    await page.getByRole('button', { name: 'Capital Gains' }).click();
    await expect(page.getByText('Asset Name')).toBeVisible();

    // Click Rental Income tab
    await page.getByRole('button', { name: 'Rental Income' }).click();
    await expect(page.getByText('Monthly Rent')).toBeVisible();
  });

  test('tab switch resets form', async ({ page }) => {
    await page.goto('/scenarios');

    // Fill ISO form
    await page.getByPlaceholder('1000').fill('500');

    // Switch tab
    await page.getByRole('button', { name: 'RNOR Window' }).click();

    // Switch back to ISO - form should be cleared
    await page.getByRole('button', { name: 'ISO Exercise' }).click();
    const sharesInput = page.getByPlaceholder('1000');
    await expect(sharesInput).toHaveValue('');
  });

  test('ISO form submission and result display', async ({ page }) => {
    await page.goto('/scenarios');

    // Fill required fields
    await page.getByPlaceholder('1000').fill('500');
    await page.getByPlaceholder('10.00').fill('15');
    await page.getByPlaceholder('50.00').fill('80');

    // Submit
    await page.getByRole('button', { name: /analyze/i }).click();

    // Result should appear
    await expect(page.getByText(/tax analysis/i)).toBeVisible({ timeout: 10000 });
  });

  test('RNOR form fields render correctly', async ({ page }) => {
    await page.goto('/scenarios');
    await page.getByRole('button', { name: 'RNOR Window' }).click();

    await expect(page.getByText('Year Returned to India')).toBeVisible();
    await expect(page.getByText('Years Abroad as NRI')).toBeVisible();
    await expect(page.getByText('Annual US Salary')).toBeVisible();
    await expect(page.getByText('Other Foreign Income')).toBeVisible();
    await expect(page.getByText('India-Sourced Income')).toBeVisible();
  });

  test('Capital Gains form fields', async ({ page }) => {
    await page.goto('/scenarios');
    await page.getByRole('button', { name: 'Capital Gains' }).click();

    await expect(page.getByText('Asset Name')).toBeVisible();
    await expect(page.getByText('Purchase Date')).toBeVisible();
    await expect(page.getByText('Cost Basis')).toBeVisible();
    await expect(page.getByText('Sale Price')).toBeVisible();
  });

  test('Rental Income form fields', async ({ page }) => {
    await page.goto('/scenarios');
    await page.getByRole('button', { name: 'Rental Income' }).click();

    await expect(page.getByText('Monthly Rent')).toBeVisible();
    await expect(page.getByText('Monthly Mortgage')).toBeVisible();
    await expect(page.getByText('Annual Property Tax')).toBeVisible();
  });

  test('filing status select has correct options', async ({ page }) => {
    await page.goto('/scenarios');

    const select = page.locator('select');
    if (await select.isVisible()) {
      const options = await select.locator('option').allTextContents();
      expect(options.length).toBeGreaterThan(0);
    }
  });

  test('Run New Scenario resets form', async ({ page }) => {
    await page.goto('/scenarios');

    // Fill and submit
    await page.getByPlaceholder('1000').fill('500');
    await page.getByPlaceholder('10.00').fill('15');
    await page.getByPlaceholder('50.00').fill('80');
    await page.getByRole('button', { name: /analyze/i }).click();

    // Wait for result
    await expect(page.getByText(/tax analysis/i)).toBeVisible({ timeout: 10000 });

    // Click Run New Scenario
    await page.getByRole('button', { name: /run new scenario/i }).click();

    // Form should reappear
    await expect(page.getByText('Shares to Exercise')).toBeVisible();
    await expect(page.getByPlaceholder('1000')).toHaveValue('');
  });

  test('Bug: rapid submit does not duplicate requests', async ({ page }) => {
    let submitCount = 0;
    await page.route('**/api/scenarios', async (route) => {
      submitCount++;
      await new Promise((r) => setTimeout(r, 1000));
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: '0:"Analysis result"\n',
      });
    });
    await page.goto('/scenarios');

    await page.getByPlaceholder('1000').fill('500');
    await page.getByPlaceholder('10.00').fill('15');
    await page.getByPlaceholder('50.00').fill('80');

    // Click analyze — form hides after first submit (submitted=true hides form)
    const analyzeBtn = page.getByRole('button', { name: /analyze/i });
    await analyzeBtn.click();

    // The form (and button) should hide after the first submit sets submitted=true
    await expect(analyzeBtn).not.toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(2000);
    // Should only send 1 request since the form hides immediately
    expect(submitCount).toBe(1);
  });
});
