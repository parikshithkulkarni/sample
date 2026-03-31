import { test, expect } from '@playwright/test';
import { mockSetupAPI } from '../helpers/api-mocks';
import { TEST_SETUP_STATUS } from '../helpers/test-data';

// Setup page tests run WITHOUT auth storage state
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Setup Page', () => {
  test('displays environment status checklist', async ({ page }) => {
    await mockSetupAPI(page, TEST_SETUP_STATUS);
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    // Verify checklist items render
    await expect(page.getByText('Anthropic API Key')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Database URL')).toBeVisible();
    await expect(page.getByText('Database schema')).toBeVisible();
    await expect(page.getByText('Admin account')).toBeVisible();
  });

  test('shows DB not connected warning with Check again button', async ({ page }) => {
    await mockSetupAPI(page, { ...TEST_SETUP_STATUS, dbReady: false, dbError: 'Connection refused' });
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Database not connected')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Check again')).toBeVisible();
  });

  test('shows account creation form when DB ready but no admin', async ({ page }) => {
    await mockSetupAPI(page, { ...TEST_SETUP_STATUS, dbReady: true, adminExists: false });
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Create your account')).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByLabel('Confirm password')).toBeVisible();
  });

  test('password validation - too short', async ({ page }) => {
    await mockSetupAPI(page, { ...TEST_SETUP_STATUS, dbReady: true, adminExists: false });
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Username').waitFor({ timeout: 15000 });
    await page.getByLabel('Username').fill('testadmin');
    await page.getByLabel('Password').fill('short');
    await page.getByLabel('Confirm password').fill('short');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
  });

  test('password validation - mismatch', async ({ page }) => {
    await mockSetupAPI(page, { ...TEST_SETUP_STATUS, dbReady: true, adminExists: false });
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Username').waitFor({ timeout: 15000 });
    await page.getByLabel('Username').fill('testadmin');
    await page.getByLabel('Password').fill('validpassword1');
    await page.getByLabel('Confirm password').fill('validpassword2');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });

  test('successful account creation redirects to login', async ({ page }) => {
    await mockSetupAPI(page, { ...TEST_SETUP_STATUS, dbReady: true, adminExists: false });
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Username').waitFor({ timeout: 15000 });
    await page.getByLabel('Username').fill('testadmin');
    await page.getByLabel('Password').fill('validpassword123');
    await page.getByLabel('Confirm password').fill('validpassword123');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/login\?setup=done/);
  });

  test('shows ready state when admin exists', async ({ page }) => {
    await mockSetupAPI(page, { ...TEST_SETUP_STATUS, adminExists: true, ready: true });
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Second Brain is ready')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('link', { name: /open dashboard/i })).toBeVisible();
  });

  test('show/hide password toggle', async ({ page }) => {
    await mockSetupAPI(page, { ...TEST_SETUP_STATUS, dbReady: true, adminExists: false });
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    const passwordInput = page.getByLabel('Password');
    await passwordInput.waitFor({ timeout: 15000 });
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click the eye icon button - target the toggle inside the password field's .relative wrapper
    await page.locator('.relative button[type="button"]').first().click();

    // After toggle, should be visible
    await expect(passwordInput).toHaveAttribute('type', 'text');
  });

  test('form submit button disabled when fields empty', async ({ page }) => {
    await mockSetupAPI(page, { ...TEST_SETUP_STATUS, dbReady: true, adminExists: false });
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    const submitBtn = page.getByRole('button', { name: /create account/i });
    await submitBtn.waitFor({ timeout: 15000 });
    await expect(submitBtn).toBeDisabled();
  });

  test('Bug: network error on POST shows error message', async ({ page }) => {
    await page.route('**/api/setup', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { ...TEST_SETUP_STATUS, dbReady: true, adminExists: false } });
      } else {
        // Use fulfill with status 500 to reliably trigger the catch handler
        await route.fulfill({ status: 500, json: { error: 'network error' } });
      }
    });
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Username').waitFor({ timeout: 15000 });
    await page.getByLabel('Username').fill('testadmin');
    await page.getByLabel('Password').fill('validpassword123');
    await page.getByLabel('Confirm password').fill('validpassword123');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/network error/i)).toBeVisible({ timeout: 10000 });
  });

  test('Refresh status button works', async ({ page }) => {
    let callCount = 0;
    await page.route('**/api/setup', async (route) => {
      callCount++;
      await route.fulfill({ json: TEST_SETUP_STATUS });
    });
    await page.goto('/setup');
    await page.waitForLoadState('networkidle');

    const refreshBtn = page.getByRole('button', { name: /refresh status/i });
    await refreshBtn.waitFor({ timeout: 15000 });

    const initialCalls = callCount;
    await refreshBtn.click();
    await page.waitForLoadState('networkidle');

    expect(callCount).toBeGreaterThan(initialCalls);
  });
});
