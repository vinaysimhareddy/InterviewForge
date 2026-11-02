import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';

test.describe('L4: Auth Pages & Route Protection', () => {
  test('Login page at 1440px (Desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');

    // Verify editorial card, badge, tabs, inputs
    await expect(page.getByRole('heading', { name: 'Candidate Sign In' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=ARGON2ID + JWT')).toBeVisible();
    await expect(page.locator('text=01 // CANDIDATE ACCESS')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fill Demo Candidate Credentials' })).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l4_login_1440.png'),
      fullPage: true,
    });
  });

  test('Login page at 390px (Mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Candidate Sign In' })).toBeVisible({ timeout: 10000 });

    // Verify mobile layout without horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l4_login_390.png'),
      fullPage: true,
    });
  });

  test('Register route and Protected Route redirect', async ({ page }) => {
    // 1. Visit /register
    await page.goto('http://localhost:5173/register');
    await expect(page.getByRole('heading', { name: 'Create Candidate Account' })).toBeVisible();
    await expect(page.locator('label:has-text("Full Name")')).toBeVisible();

    // 2. Unauthenticated visit to protected /app/setup redirects to /login?redirect=...
    await page.goto('http://localhost:5173/app/setup');
    await expect(page).toHaveURL(/.*\/login\?redirect=.*/);
    await expect(page.getByRole('heading', { name: 'Candidate Sign In' })).toBeVisible();
  });
});
