import { test, expect } from '@playwright/test';
import * as path from 'path';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';

test.describe('N2 Authentication Exposure Fixes UI Verification', () => {

  test('Capture Auth Login Page (1440px & 390px)', async ({ page }) => {
    // 1440px Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1, h2, h3').filter({ hasText: /candidate sign in/i })).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n2_auth_login_1440.png'),
      fullPage: false,
    });

    // 390px Mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n2_auth_login_390.png'),
      fullPage: false,
    });
  });

  test('Capture Dashboard Page (1440px & 390px)', async ({ page }) => {
    const uid = Date.now();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/register');
    await page.waitForLoadState('networkidle');

    // Register a fresh candidate
    await page.fill('input[autoComplete="name"], input[placeholder*="Alex"]', `Candidate ${uid}`);
    await page.fill('input[type="email"]', `cand_${uid}@example.com`);
    await page.fill('input[type="password"]', 'InterviewReady2026!');

    const submitBtn = page.getByRole('button', { name: /create candidate account/i });
    await submitBtn.click();

    // Wait for Dashboard to load
    await page.waitForURL('**/app/dashboard', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Verify "Verified Candidate" status badge is present and raw token/cand ID are NOT present
    await expect(page.getByText('Verified Candidate')).toBeVisible();
    await expect(page.getByText('Active Access Token')).not.toBeVisible();

    // 1440px Desktop Dashboard
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n2_dashboard_1440.png'),
      fullPage: false,
    });

    // 390px Mobile Dashboard
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n2_dashboard_390.png'),
      fullPage: false,
    });
  });

});
