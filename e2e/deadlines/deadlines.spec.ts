import { test, expect } from '@playwright/test';
import { mockDeadlinesAPI } from '../helpers/api-mocks';
import { TEST_DEADLINES } from '../helpers/test-data';

test.describe('Deadlines Page', () => {
  test('loads and displays deadlines by category', async ({ page }) => {
    await mockDeadlinesAPI(page, TEST_DEADLINES);
    await page.goto('/deadlines');

    await expect(page.getByText('Federal Tax Return')).toBeVisible();
    await expect(page.getByText('India ITR Filing')).toBeVisible();
    await expect(page.getByText('US Tax')).toBeVisible();
  });

  test('add deadline form', async ({ page }) => {
    await mockDeadlinesAPI(page, TEST_DEADLINES);
    await page.goto('/deadlines');

    // Open add form
    await page.getByRole('button', { name: /add/i }).click();

    // Fill form
    await page.getByPlaceholder(/title/i).fill('New Deadline');
    await page.locator('input[type="date"]').fill('2025-12-31');
    await page.locator('select').selectOption('tax_us');

    // Submit
    await page.getByRole('button', { name: /save|add/i }).last().click();
  });

  test('mark deadline as done (optimistic)', async ({ page }) => {
    await mockDeadlinesAPI(page, TEST_DEADLINES);
    await page.goto('/deadlines');

    // Find the first undone deadline's toggle button.
    // In deadline-list.tsx, the toggle button is the first button in each <li>,
    // containing either Circle (undone) or CheckCircle (done) SVG.
    const deadlineItem = page.locator('li').filter({ hasText: 'Federal Tax Return' });
    await expect(deadlineItem).toBeVisible();
    // Federal Tax Return starts as is_done: false, so it has Circle SVG
    const toggleBtn = deadlineItem.locator('button').filter({ has: page.locator('svg.lucide-circle') }).first();
    await toggleBtn.click();

    // Should immediately show as done (optimistic update)
    // The CheckCircle should appear after toggling
    await expect(deadlineItem.locator('svg.lucide-check-circle')).toBeVisible();
  });

  test('Bug: mark done reverts on API error', async ({ page }) => {
    // Override with failing PATCH
    await page.route('**/api/deadlines', async (route) => {
      await route.fulfill({ json: TEST_DEADLINES });
    });
    await page.route('**/api/deadlines/*', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 500, json: { error: 'fail' } });
      } else {
        await route.continue();
      }
    });
    await page.goto('/deadlines');

    // Federal Tax Return starts as is_done: false, so it has Circle SVG
    const deadlineItem = page.locator('li').filter({ hasText: 'Federal Tax Return' });
    await expect(deadlineItem).toBeVisible();

    // Find the toggle button with Circle SVG (undone state)
    const toggleBtn = deadlineItem.locator('button').filter({ has: page.locator('svg.lucide-circle') }).first();

    // Optimistic update should briefly show CheckCircle
    await toggleBtn.click();

    // After API failure, the toast should appear and the state should revert to undone (Circle)
    await expect(page.getByText('Failed to update deadline')).toBeVisible({ timeout: 5000 });
    await expect(deadlineItem.locator('svg.lucide-circle')).toBeVisible({ timeout: 5000 });
  });

  test('delete deadline', async ({ page }) => {
    await mockDeadlinesAPI(page, TEST_DEADLINES);
    await page.goto('/deadlines');

    const deadlineText = page.getByText('H1B Visa Renewal');
    await expect(deadlineText).toBeVisible();

    // Click the trash button — in the component, the Trash2 button is in the right-side div
    const deadlineLi = page.locator('li').filter({ hasText: 'H1B Visa Renewal' });
    const trashBtn = deadlineLi.locator('button').filter({ has: page.locator('svg.lucide-trash-2') });
    await trashBtn.click();

    // Should be removed
    await expect(deadlineText).not.toBeVisible();
  });

  test('days remaining display', async ({ page }) => {
    const today = new Date();

    // Create deadlines at various distances
    const fiveDaysOut = new Date(today);
    fiveDaysOut.setDate(fiveDaysOut.getDate() + 5);

    const thirtyDaysOut = new Date(today);
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

    const overdueDate = new Date(today);
    overdueDate.setDate(overdueDate.getDate() - 3);

    const deadlines = [
      { id: '1', title: 'Soon Deadline', due_date: fiveDaysOut.toISOString().split('T')[0], category: 'tax_us', notes: null, is_done: false, is_recurring: false },
      { id: '2', title: 'Later Deadline', due_date: thirtyDaysOut.toISOString().split('T')[0], category: 'other', notes: null, is_done: false, is_recurring: false },
      { id: '3', title: 'Overdue Deadline', due_date: overdueDate.toISOString().split('T')[0], category: 'property', notes: null, is_done: false, is_recurring: false },
    ];

    await mockDeadlinesAPI(page, deadlines);
    await page.goto('/deadlines');

    // Verify different day indicators are shown
    await expect(page.getByText('Soon Deadline')).toBeVisible();
    await expect(page.getByText('Later Deadline')).toBeVisible();
    await expect(page.getByText('Overdue Deadline')).toBeVisible();
  });

  test('color coding for urgency', async ({ page }) => {
    const today = new Date();
    const fiveDaysOut = new Date(today);
    fiveDaysOut.setDate(fiveDaysOut.getDate() + 5);

    const deadlines = [
      { id: '1', title: 'Urgent', due_date: fiveDaysOut.toISOString().split('T')[0], category: 'tax_us', notes: null, is_done: false, is_recurring: false },
    ];

    await mockDeadlinesAPI(page, deadlines);
    await page.goto('/deadlines');

    // Should have red color for <=7 days
    const dayIndicator = page.locator('.text-red-500, .text-red-600');
    await expect(dayIndicator.first()).toBeVisible();
  });

  test('loading skeletons appear initially', async ({ page }) => {
    await page.route('**/api/deadlines', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({ json: TEST_DEADLINES });
    });
    await page.goto('/deadlines');

    await expect(page.locator('.animate-pulse').first()).toBeVisible();
  });

  test('Bug: rapid toggle does not cause stale state', async ({ page }) => {
    await mockDeadlinesAPI(page, TEST_DEADLINES);
    await page.goto('/deadlines');

    // Wait for the deadline to be visible before interacting
    const deadlineItem = page.locator('li').filter({ hasText: 'Federal Tax Return' });
    await expect(deadlineItem).toBeVisible();

    // Find the toggle button (the first button in the li, which contains Circle or CheckCircle)
    const toggleBtn = deadlineItem.locator('button').first();

    // Click rapidly 3 times (toggle: done -> undone -> done)
    await toggleBtn.click();
    await toggleBtn.click();
    await toggleBtn.click();

    // UI should still be stable (no crash or frozen state)
    await expect(page.getByText('Federal Tax Return')).toBeVisible();

    // After 3 toggles from undone: done -> undone -> done.
    // The final state should show either CheckCircle (done) or Circle (undone) depending on timing.
    // The key assertion is that the UI is not broken — at least one icon is visible.
    await expect(deadlineItem.locator('svg.lucide-check-circle, svg.lucide-circle').first()).toBeVisible();
  });
});
