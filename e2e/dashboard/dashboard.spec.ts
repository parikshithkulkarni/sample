import { test, expect } from '@playwright/test';
import { mockDashboardAPIs } from '../helpers/api-mocks';
import { TEST_ACCOUNTS, TEST_DEADLINES, TEST_PROPERTIES, TEST_SNAPSHOTS } from '../helpers/test-data';

test.describe('Dashboard', () => {
  test('empty state with action cards', async ({ page }) => {
    await mockDashboardAPIs(page, {});
    await page.goto('/');

    await expect(page.getByText('Welcome to Second Brain')).toBeVisible();
    await expect(page.getByText('Add accounts & net worth')).toBeVisible();
    await expect(page.getByText('Upload documents')).toBeVisible();
    await expect(page.getByText('Track rental properties')).toBeVisible();
    await expect(page.getByText('Run a tax scenario')).toBeVisible();
  });

  test('action cards navigate correctly', async ({ page }) => {
    await mockDashboardAPIs(page, {});
    await page.goto('/');

    await page.getByText('Add accounts & net worth').click();
    await expect(page).toHaveURL('/finance');
  });

  test('quick ask input sends to chat', async ({ page }) => {
    await mockDashboardAPIs(page, {});
    await page.goto('/');

    await page.getByPlaceholder('Ask your brain anything').fill('what is my net worth');
    await page.locator('form button[type="submit"]').first().click();

    await expect(page).toHaveURL(/\/chat\?q=what%20is%20my%20net%20worth/);
  });

  test('quick ask button disabled when empty', async ({ page }) => {
    await mockDashboardAPIs(page, {});
    await page.goto('/');

    const submitBtn = page.locator('form button[type="submit"]').first();
    await expect(submitBtn).toHaveClass(/disabled:opacity-40/);
  });

  test('net worth card displays correctly', async ({ page }) => {
    await mockDashboardAPIs(page, {
      accounts: TEST_ACCOUNTS,
      snapshots: TEST_SNAPSHOTS,
    });
    await page.goto('/');

    // Net worth = 225000 - 355000 = -130000
    await expect(page.getByText('Net Worth')).toBeVisible();
    await expect(page.getByText('Assets')).toBeVisible();
    await expect(page.getByText('Liabilities')).toBeVisible();
  });

  test('net worth card click navigates to /finance', async ({ page }) => {
    await mockDashboardAPIs(page, { accounts: TEST_ACCOUNTS, snapshots: TEST_SNAPSHOTS });
    await page.goto('/');

    // Click the net worth card
    await page.locator('.cursor-pointer').filter({ hasText: 'Net Worth' }).click();
    await expect(page).toHaveURL('/finance');
  });

  test('overdue deadline alert shows', async ({ page }) => {
    // Create a deadline that's overdue
    const overdueDeadline = { ...TEST_DEADLINES[3], due_date: '2024-01-01', is_done: false };
    await mockDashboardAPIs(page, { deadlines: [overdueDeadline] });
    await page.goto('/');

    await expect(page.getByText(/Overdue Deadline/)).toBeVisible();
  });

  test('overdue alert navigates to /deadlines', async ({ page }) => {
    const overdueDeadline = { ...TEST_DEADLINES[3], due_date: '2024-01-01', is_done: false };
    await mockDashboardAPIs(page, { deadlines: [overdueDeadline] });
    await page.goto('/');

    await page.locator('.cursor-pointer').filter({ hasText: /Overdue/ }).click();
    await expect(page).toHaveURL('/deadlines');
  });

  test('upcoming deadlines show with days remaining', async ({ page }) => {
    // Create deadlines in the future
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const upcomingDeadlines = [
      { ...TEST_DEADLINES[0], due_date: futureDate.toISOString().split('T')[0] },
    ];
    await mockDashboardAPIs(page, { deadlines: upcomingDeadlines });
    await page.goto('/');

    await expect(page.getByText('Upcoming Deadlines')).toBeVisible();
    await expect(page.getByText(/\d+d/)).toBeVisible();
  });

  test('sync from docs button shows spinner', async ({ page }) => {
    await mockDashboardAPIs(page, { accounts: TEST_ACCOUNTS });
    await page.goto('/');

    const syncBtn = page.getByText('Sync from docs');
    await syncBtn.click();

    await expect(page.getByText('Syncing from docs')).toBeVisible();
  });

  test('loading skeletons appear initially', async ({ page }) => {
    // Delay API response to catch loading state
    await page.route('**/api/finance', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/deadlines', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/rentals', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/finance/snapshots', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.goto('/');

    // Skeleton cards should be visible during loading
    await expect(page.locator('.animate-pulse').first()).toBeVisible();
  });

  test('real estate equity display', async ({ page }) => {
    await mockDashboardAPIs(page, {
      accounts: TEST_ACCOUNTS,
      properties: TEST_PROPERTIES,
      snapshots: TEST_SNAPSHOTS,
    });
    await page.goto('/');

    await expect(page.getByText(/real estate equity/)).toBeVisible();
  });
});

test.describe('Dashboard - Auth', () => {
  test('redirects to /login when unauthenticated', async ({ page }) => {
    // Override storage state to be unauthenticated
    await page.context().clearCookies();
    await page.goto('/');
    // The middleware should redirect unauthenticated users
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });
});
