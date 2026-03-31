import { test, expect } from '@playwright/test';
import { mockDashboardAPIs } from '../helpers/api-mocks';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Mock all dashboard APIs to prevent errors
    await mockDashboardAPIs(page, {});
    // Mock other page APIs
    await page.route('**/api/finance/cleanup', (r) => r.fulfill({ json: {} }));
    await page.route('**/api/documents', (r) => r.fulfill({ json: [] }));
    await page.route('**/api/audit', (r) => r.fulfill({ json: { summary: { totalAccounts: 0, totalProperties: 0, totalDocuments: 0, documentsExtracted: 0, documentsNotExtracted: 0, totalRentalRecords: 0, issuesByType: {}, autoFixableCount: 0 }, issues: [], accounts: [], properties: [], documents: [] } }));
    await page.route('**/api/tax-returns*', (r) => r.fulfill({ json: { id: null, tax_year: 2024, country: 'US', data: {}, sources: {}, updated_at: null } }));
    await page.route('**/api/chat/sessions', (r) => r.fulfill({ json: [] }));
  });

  test('shows all navigation links', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('link', { name: /home/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /chat/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /docs/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /finance/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /rentals/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /taxes/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /audit/i })).toBeVisible();
  });

  test('active state highlighting on current route', async ({ page }) => {
    await page.goto('/');

    const homeLink = page.getByRole('link', { name: /home/i });
    await expect(homeLink).toHaveClass(/text-sky-600|text-sky-400/);
  });

  test('navigation between pages works', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: /finance/i }).click();
    await expect(page).toHaveURL('/finance');

    await page.getByRole('link', { name: /chat/i }).click();
    await expect(page).toHaveURL('/chat');

    await page.getByRole('link', { name: /docs/i }).click();
    await expect(page).toHaveURL('/documents');

    await page.getByRole('link', { name: /rentals/i }).click();
    await expect(page).toHaveURL('/rentals');

    await page.getByRole('link', { name: /home/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('desktop sidebar shows app title', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'Desktop only test');
    await page.goto('/');

    await expect(page.locator('nav').getByText('Second Brain')).toBeVisible();
  });

  test('theme toggle has correct aria-label', async ({ page }) => {
    await page.goto('/');

    const toggle = page.locator('button[aria-label*="Switch to"]');
    await expect(toggle.first()).toBeVisible();
  });
});
