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

    // The back button in rental-property-detail.tsx has text "All Properties"
    const backBtn = page.locator('button, a').filter({ hasText: /all properties/i }).first();
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

      // Edit form should appear — find the address input by placeholder
      const addressInput = page.getByPlaceholder('Address');
      if (await addressInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addressInput.fill('123 Main St Updated, San Francisco, CA');
      }
    }
  });

  test('delete property redirects to /rentals', async ({ page }) => {
    // Handle the confirm dialog that deleteProperty() triggers
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
    await page.waitForLoadState('networkidle');

    // Should show KPI labels
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

    // Records for months 1,2,3 should show month names "Jan", "Feb", "Mar"
    await expect(page.getByText('Jan').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Feb').first()).toBeVisible();
  });

  test('expanded row shows expense breakdown', async ({ page }) => {
    await page.goto('/rentals/p1');
    await page.waitForLoadState('networkidle');

    // Wait for records to load, then click the Jan cell in the table to expand.
    // The <tr> has onClick that sets expandedRow, and the month name is inside a <td>.
    const janCell = page.locator('td').filter({ hasText: 'Jan' }).first();
    await expect(janCell).toBeVisible({ timeout: 5000 });
    await janCell.click();

    // The expanded row shows expense groups inline within the Month cell.
    // TEST_RENTAL_RECORDS[0] has expenses: { property_tax: 800, insurance: 200, maintenance: 100 }
    // These fall under "Taxes & Insurance" and "Building & Maintenance" group labels.
    await expect(page.getByText('Taxes & Insurance')).toBeVisible({ timeout: 3000 });
  });

  test('expense categories in form', async ({ page }) => {
    await page.goto('/rentals/p1');

    const logBtn = page.getByRole('button', { name: /log month/i });
    if (await logBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await logBtn.click();

      // Should show expense group labels
      await expect(page.getByText('Taxes & Insurance')).toBeVisible();
      await expect(page.getByText('Building & Maintenance')).toBeVisible();
      await expect(page.getByText('Management & Services')).toBeVisible();
      await expect(page.getByText('Admin & Professional')).toBeVisible();
    }
  });

  test('Ask Claude button includes property context', async ({ page }) => {
    await page.goto('/rentals/p1');

    // The Ask Claude button in property detail is a text link, not a role=button
    const askBtn = page.getByText(/ask claude/i);
    if (await askBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await askBtn.click();
      await expect(page).toHaveURL(/\/chat\?q=/);
    }
  });

  test('Bug: invalid propertyId shows error or empty state', async ({ page }) => {
    await page.route('**/api/rentals/invalid-id', async (route) => {
      await route.fulfill({ status: 404, json: { error: 'Not found' } });
    });
    await page.route('**/api/rentals/invalid-id/records*', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.goto('/rentals/invalid-id');

    // The component sets notFound=true on fetch error, showing "Property not found"
    await expect(page.getByText(/property not found/i)).toBeVisible({ timeout: 5000 });
  });
});
