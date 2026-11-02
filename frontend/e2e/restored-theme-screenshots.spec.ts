import { test, expect } from '@playwright/test';
import * as path from 'path';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';

test.describe('Restored Editorial Theme Verification', () => {

  test('Capture Landing Page in Restored Theme (1440px & 390px)', async ({ page }) => {
    // 1440px Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'restored_landing_1440.png'),
      fullPage: false,
    });

    // 390px Mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:5173/');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'restored_landing_390.png'),
      fullPage: false,
    });
  });

  test('Capture Auth Login Page in Restored Theme (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1, h2, h3').filter({ hasText: /candidate sign in/i })).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'restored_login_1440.png'),
      fullPage: false,
    });
  });

  test('Capture Dashboard & Setup in Restored Theme (1440px)', async ({ page }) => {
    const uid = Date.now();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/register');
    await page.waitForLoadState('networkidle');

    await page.fill('input[type="text"]', `Candidate ${uid}`);
    await page.fill('input[type="email"]', `cand_${uid}@example.com`);
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/app/dashboard', { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'restored_dashboard_1440.png'),
      fullPage: false,
    });

    // Proceed to setup
    await page.click('button:has-text("Start Live Interview")');
    await page.waitForTimeout(500);

    // Consent
    await page.locator('input[type="checkbox"]').check({ force: true });
    await page.click('button:has-text("Continue to Device Check")');
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'restored_setup_1440.png'),
      fullPage: false,
    });
  });

  test('Capture Scorecard in Restored Theme (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/?scorecard=true');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'restored_scorecard_1440.png'),
      fullPage: false,
    });
  });
});

