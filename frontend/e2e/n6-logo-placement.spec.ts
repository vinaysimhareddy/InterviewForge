import { test, expect } from '@playwright/test';
import * as path from 'path';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';

test.describe('N6 Logo Placement Verification Across All In-App Views', () => {

  test('Verify and capture Logo across Auth, Nav, Setup, Stage, Scorecard, and 404 (1440px & 390px)', async ({ page }) => {
    const uid = Date.now();

    // 1. AUTH PAGE (Centered size lg)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('domcontentloaded');

    // Verify Auth Logo
    const authLogo = page.locator('img[alt="InterviewForge"]').first();
    await expect(authLogo).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n6_auth_1440.png'),
      fullPage: false,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n6_auth_390.png'),
      fullPage: false,
    });

    // 2. REGISTER & NAVIGATE TO DASHBOARD
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/register');
    await page.waitForLoadState('domcontentloaded');

    await page.fill('input[autoComplete="name"], input[placeholder*="Alex"]', `User ${uid}`);
    await page.fill('input[type="email"]', `user_n6_${uid}@example.com`);
    await page.fill('input[type="password"]', 'InterviewReady2026!');

    const submitBtn = page.getByRole('button', { name: /create candidate account/i });
    await submitBtn.click();

    await page.waitForURL('**/app/dashboard', { timeout: 15000 });
    await page.waitForTimeout(1500);

    // Verify Dashboard Top Nav Logo
    const navLogo = page.locator('header').locator('img[alt="InterviewForge"]').first();
    await expect(navLogo).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n6_nav_dashboard_1440.png'),
      fullPage: false,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n6_nav_dashboard_390.png'),
      fullPage: false,
    });

    // 3. SETUP PAGE (Header compact mark + InterviewForge)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/app/setup');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n6_setup_1440.png'),
      fullPage: false,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n6_setup_390.png'),
      fullPage: false,
    });

    // 4. LIVE INTERVIEW STAGE DEMO
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/?stage_demo=true');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n6_stage_1440.png'),
      fullPage: false,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n6_stage_390.png'),
      fullPage: false,
    });

    // 5. REVIEW / SCORECARD
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/?scorecard=true');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n6_scorecard_1440.png'),
      fullPage: false,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n6_scorecard_390.png'),
      fullPage: false,
    });

    // 6. 404 NOT FOUND PAGE
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/non-existent-page-test');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    await expect(page.getByText('Page Not Found')).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n6_notfound_1440.png'),
      fullPage: false,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n6_notfound_390.png'),
      fullPage: false,
    });
  });
});

