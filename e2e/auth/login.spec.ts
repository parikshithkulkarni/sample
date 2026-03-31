import { test, expect } from '@playwright/test';
import { mockSetupAPI } from '../helpers/api-mocks';

// Login page tests run WITHOUT auth storage state
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login Page', () => {
  test('renders login form when admin exists', async ({ page }) => {
    await mockSetupAPI(page, { adminExists: true });
    await page.goto('/login');

    await expect(page.getByText('Second Brain')).toBeVisible();
    await expect(page.getByText('Your private AI dashboard')).toBeVisible();
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('redirects to /setup when no admin', async ({ page }) => {
    await mockSetupAPI(page, { adminExists: false });
    await page.goto('/login');

    await expect(page).toHaveURL(/\/setup/, { timeout: 5000 });
  });

  test('show/hide password toggle', async ({ page }) => {
    await mockSetupAPI(page, { adminExists: true });
    await page.goto('/login');

    const passwordInput = page.getByLabel('Password');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click the eye toggle - target the button inside the password field's .relative wrapper
    await page.locator('form .relative button[type="button"]').click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click again to hide
    await page.locator('form .relative button[type="button"]').click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('error message on invalid credentials', async ({ page }) => {
    await mockSetupAPI(page, { adminExists: true });
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Username').fill('wronguser');
    await page.getByLabel('Password').fill('wrongpass');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText('Invalid username or password')).toBeVisible({ timeout: 15000 });
  });

  test('shows setup done banner from query param', async ({ page }) => {
    await mockSetupAPI(page, { adminExists: true });
    await page.goto('/login?setup=done');

    await expect(page.getByText('Account created! Sign in below.')).toBeVisible();
  });

  test('sign-in button disabled when fields empty', async ({ page }) => {
    await mockSetupAPI(page, { adminExists: true });
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    const signInBtn = page.getByRole('button', { name: /sign in/i });
    await expect(signInBtn).toBeDisabled();

    // Fill only username - should still be disabled
    await page.getByLabel('Username').fill('admin');
    await expect(signInBtn).toBeDisabled();

    // Fill password too - should be enabled
    await page.getByLabel('Password').fill('password');
    await expect(signInBtn).toBeEnabled();
  });

  test('loading spinner during sign-in', async ({ page }) => {
    await mockSetupAPI(page, { adminExists: true });
    // Delay the auth response
    await page.route('**/api/auth/**', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText('Signing in')).toBeVisible();
  });

  test('Set up your account link', async ({ page }) => {
    await mockSetupAPI(page, { adminExists: true });
    await page.goto('/login');

    const setupLink = page.getByRole('link', { name: /set up your account/i });
    await expect(setupLink).toBeVisible();
    await expect(setupLink).toHaveAttribute('href', '/setup');
  });

  test('Bug: /api/setup network failure still shows login form', async ({ page }) => {
    // When /api/setup fails, the catch sets adminExists: true as fallback
    await page.route('**/api/setup', async (route) => {
      await route.abort('connectionrefused');
    });
    await page.goto('/login');

    // Form should still render (fallback behavior)
    await expect(page.getByLabel('Username')).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel('Password')).toBeVisible();
  });
});
