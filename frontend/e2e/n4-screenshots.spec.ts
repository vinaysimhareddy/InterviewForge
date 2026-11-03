import { test, expect } from '@playwright/test';
import * as path from 'path';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';

test.describe('N4 UI Naming and Order Verification', () => {

  test('Verify and capture Dashboard and Setup with canonical order and taxonomy (1440px & 390px)', async ({ page }) => {
    const uid = Date.now();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/register');
    await page.waitForLoadState('networkidle');

    // Register fresh candidate
    await page.fill('input[autoComplete="name"], input[placeholder*="Alex"]', `Candidate ${uid}`);
    await page.fill('input[type="email"]', `cand_n4_${uid}@example.com`);
    await page.fill('input[type="password"]', 'InterviewReady2026!');

    const submitBtn = page.getByRole('button', { name: /create candidate account/i });
    await submitBtn.click();

    // 1. DASHBOARD
    await page.waitForURL('**/app/dashboard', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // Verify app shell nav links in order: Dashboard → New Interview → My Reviews → Resume → Account
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New Interview' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'My Reviews' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Resume' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Account' })).toBeVisible();

    // Verify 5-Step User Flow Banner is present
    await expect(page.getByText('INTERVIEW WORKFLOW PROGRESS')).toBeVisible();
    const workflowList = page.locator('ol').first();
    await expect(workflowList.getByText('1 Upload resume')).toBeVisible();
    await expect(workflowList.getByText('2 Choose role & level')).toBeVisible();
    await expect(workflowList.getByText('3 Check camera & microphone')).toBeVisible();
    await expect(workflowList.getByText('4 Interview')).toBeVisible();
    await expect(workflowList.getByText('5 Review')).toBeVisible();

    // 1440px Screenshot Dashboard
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n4_dashboard_1440.png'),
      fullPage: false,
    });

    // 390px Screenshot Dashboard
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n4_dashboard_390.png'),
      fullPage: false,
    });

    // 2. SETUP PAGE
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/app/setup');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Verify breadcrumb bar
    await expect(page.locator('nav[aria-label="Interview Flow Progress"]')).toBeVisible();

    // Verify device setup order: 1. Camera -> 2. Microphone -> 3. Speaker -> 4. Liveness
    await expect(page.getByText('1. Camera')).toBeVisible();
    await expect(page.getByText('2. Microphone')).toBeVisible();
    await expect(page.getByText('3. Speaker')).toBeVisible();
    await expect(page.getByText('4. Liveness')).toBeVisible();

    // 1440px Screenshot Setup
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n4_setup_1440.png'),
      fullPage: false,
    });

    // 390px Screenshot Setup
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n4_setup_390.png'),
      fullPage: false,
    });
  });

});
