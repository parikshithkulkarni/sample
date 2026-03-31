import { test, expect } from '@playwright/test';
import { mockChatAPI, mockDocumentsAPI } from '../helpers/api-mocks';
import { TEST_DOCUMENTS, TEST_CHAT_SESSIONS } from '../helpers/test-data';

test.describe('Chat Page', () => {
  test.beforeEach(async ({ page }) => {
    await mockChatAPI(page);
    await mockDocumentsAPI(page, TEST_DOCUMENTS);
  });

  test('empty state shows tips', async ({ page }) => {
    await page.goto('/chat');

    await expect(page.getByText('Ask anything about your finances')).toBeVisible();
    await expect(page.getByText(/type.*@.*to attach a document/i)).toBeVisible();
  });

  test('send message and receive response', async ({ page }) => {
    await page.goto('/chat');

    await page.getByPlaceholder(/ask anything/i).fill('What is my net worth?');
    await page.locator('form button[type="submit"]').click();

    // User message should appear
    await expect(page.getByText('What is my net worth?')).toBeVisible({ timeout: 10000 });
  });

  test('send button disabled when empty', async ({ page }) => {
    await page.goto('/chat');

    const sendBtn = page.locator('form button[type="submit"]');
    await expect(sendBtn).toBeDisabled();
  });

  test('typing indicator during loading', async ({ page }) => {
    // Delay the chat response
    await page.route('**/api/chat', async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Session-Id': 'test-1' },
        body: '0:"Response"\n',
      });
    });
    await page.goto('/chat');

    await page.getByPlaceholder(/ask anything/i).fill('Hello');
    await page.locator('form button[type="submit"]').click();

    // Typing indicator (bouncing dots) should appear
    await page.locator('.animate-bounce').first().waitFor({ timeout: 5000 });
    await expect(page.locator('.animate-bounce').first()).toBeVisible();
  });

  test('auto-send from ?q= query param', async ({ page }) => {
    await page.goto('/chat?q=Hello%20World');

    // The message should be auto-sent
    await expect(page.getByText('Hello World')).toBeVisible();
  });

  test('@mention opens document picker', async ({ page }) => {
    await page.goto('/chat');

    const input = page.getByPlaceholder(/ask anything/i);
    await input.fill('@');

    // Picker should open with listbox role
    await expect(page.locator('[role="listbox"]')).toBeVisible();
    // Should show document names
    await expect(page.getByText('W2-2024.pdf')).toBeVisible();
  });

  test('@mention keyboard navigation', async ({ page }) => {
    await page.goto('/chat');

    const input = page.getByPlaceholder(/ask anything/i);
    await input.fill('@');

    await expect(page.locator('[role="listbox"]')).toBeVisible();

    // Arrow down should change selection
    await input.press('ArrowDown');
    const secondOption = page.locator('[role="option"]').nth(1);
    await expect(secondOption).toHaveAttribute('aria-selected', 'true');

    // Arrow up should go back
    await input.press('ArrowUp');
    const firstOption = page.locator('[role="option"]').nth(0);
    await expect(firstOption).toHaveAttribute('aria-selected', 'true');

    // Enter should select
    await input.press('Enter');
    // Picker should close
    await expect(page.locator('[role="listbox"]')).not.toBeVisible();
  });

  test('@mention adds chip and removes @ from input', async ({ page }) => {
    await page.goto('/chat');

    const input = page.getByPlaceholder(/ask anything/i);
    await input.fill('@');

    await expect(page.locator('[role="listbox"]')).toBeVisible();

    // Select first document
    await input.press('Enter');

    // Wait for picker to close (chip selection complete)
    await expect(page.locator('[role="listbox"]')).not.toBeVisible();

    // Chip should appear — the doc chip is a span with bg-sky-100 and rounded-full
    const chip = page.getByText('W2-2024.pdf').first();
    await expect(chip).toBeVisible({ timeout: 5000 });

    // Input should not contain @
    const inputVal = await input.inputValue();
    expect(inputVal).not.toContain('@');
  });

  test('remove mentioned doc chip', async ({ page }) => {
    await page.goto('/chat');

    const input = page.getByPlaceholder(/ask anything/i);
    await input.fill('@');
    await input.press('Enter');

    // Chip should exist
    const chip = page.locator('.rounded-full').filter({ hasText: 'W2-2024.pdf' });
    await expect(chip).toBeVisible();

    // Click X on chip to remove
    await chip.locator('button').click();
    await expect(chip).not.toBeVisible();
  });

  test('@mention search filters docs', async ({ page }) => {
    await page.goto('/chat');

    const input = page.getByPlaceholder(/ask anything/i);
    await input.fill('@W2');

    // Should only show W2 document, not Bank Statement
    await expect(page.getByText('W2-2024.pdf')).toBeVisible();
    await expect(page.locator('[role="option"]').filter({ hasText: 'Bank-Statement' })).not.toBeVisible();
  });

  test('chat history panel opens and closes', async ({ page }) => {
    await page.route('**/api/chat/sessions', async (route) => {
      await route.fulfill({ json: TEST_CHAT_SESSIONS });
    });
    await page.goto('/chat');

    // Open history
    await page.getByText('History').click();
    await expect(page.getByText('Chat History')).toBeVisible();
    await expect(page.getByText('Tax planning discussion')).toBeVisible();

    // Close history — the close button is the last button in the history panel header
    await page.getByText('Chat History').locator('..').locator('..').locator('button').last().click();
    await expect(page.getByText('Chat History')).not.toBeVisible();
  });

  test('load past session', async ({ page }) => {
    await page.route('**/api/chat/sessions', async (route) => {
      await route.fulfill({ json: TEST_CHAT_SESSIONS });
    });
    await page.goto('/chat');

    await page.getByText('History').click();
    await page.getByText('Tax planning discussion').click();

    // Should load messages from the session
    await expect(page.getByText('What is my net worth?')).toBeVisible();
    await expect(page.getByText(/your net worth is/i)).toBeVisible();
  });

  test('Escape closes picker', async ({ page }) => {
    await page.goto('/chat');

    const input = page.getByPlaceholder(/ask anything/i);
    await input.fill('@');
    await expect(page.locator('[role="listbox"]')).toBeVisible();

    await input.press('Escape');
    await expect(page.locator('[role="listbox"]')).not.toBeVisible();
  });

  test('Bug: @ followed by space closes picker', async ({ page }) => {
    await page.goto('/chat');

    const input = page.getByPlaceholder(/ask anything/i);
    await input.fill('@');
    await expect(page.locator('[role="listbox"]')).toBeVisible();

    // Type a space after @ - should close picker per chat-interface.tsx:97-99
    await input.press('Space');
    await expect(page.locator('[role="listbox"]')).not.toBeVisible();
  });

  test('Bug: ?q= rapid navigation does not duplicate messages', async ({ page }) => {
    await page.goto('/chat?q=Hello');
    await expect(page.getByText('Hello')).toBeVisible();

    // Navigate again with same query
    await page.goto('/chat?q=Hello');

    // Should not have duplicate messages
    const userMessages = page.locator('.justify-end .bg-sky-600');
    const count = await userMessages.count();
    expect(count).toBeLessThanOrEqual(1);
  });
});
