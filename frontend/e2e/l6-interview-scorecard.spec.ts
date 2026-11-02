import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';
const BASE_URL = 'http://localhost:5173';

test.describe('L6: Live Interview Stage & Executive Scorecard Restyling', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ai_interviewer_theme', 'light');
    });
  });

  test('L6.1: Live Interview Stage (1440px desktop & 390px mobile)', async ({ page }) => {
    // 1440px Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/?live=true`);

    // Verify top bar
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('text=AdaptiveMock')).toBeVisible();
    await expect(page.locator('text=LIVE STAGE')).toBeVisible();
    await expect(page.locator('text=Senior Full Stack Engineer')).toBeVisible();
    await expect(page.locator('text=Camera & mic active: monitoring posture & eye contact')).toBeVisible();

    // Verify central orb & question caption
    await expect(page.locator('[aria-label^="AI Interviewer"]')).toBeVisible();
    await expect(page.locator('[role="region"][aria-label="Interview Question"]')).toBeVisible();
    await expect(page.locator('text=CURRENT QUESTION')).toBeVisible();

    // Verify translucent live transcript panel
    await expect(page.locator('[data-testid="candidate-live-transcript"]')).toBeVisible();

    // Verify bottom quiet controls
    await expect(page.locator('button:has-text("Show Self-View")')).toBeVisible();
    await expect(page.locator('button:has-text("Transcript")')).toBeVisible();
    await expect(page.locator('button:has-text("Pause")')).toBeVisible();
    await expect(page.locator('button:has-text("Having trouble?")')).toBeVisible();

    // Capture 1440px screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l6_live_stage_1440.png'),
      fullPage: true,
    });

    // 390px Mobile Viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/?live=true`);

    await expect(page.locator('[aria-label^="AI Interviewer"]')).toBeVisible();
    await expect(page.locator('[role="region"][aria-label="Interview Question"]')).toBeVisible();
    await expect(page.locator('[data-testid="candidate-live-transcript"]')).toBeVisible();

    // Verify no horizontal overflow on mobile
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

    // Capture 390px screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l6_live_stage_390.png'),
      fullPage: true,
    });
  });

  test('L6.2: Executive Scorecard (1440px desktop & 390px mobile)', async ({ page }) => {
    // 1440px Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/?scorecard=true`);

    // Title and overall score
    await expect(page.locator('text=Interview Completed: Executive Scorecard')).toBeVisible();
    await expect(page.locator('text=Overall Score')).toBeVisible();
    await expect(page.locator('text=86')).toBeVisible();
    await expect(page.locator('text=Recommendation')).toBeVisible();
    await expect(page.locator('text=Strong Hire')).toBeVisible();

    // Category breakdown
    await expect(page.locator('text=Technical Depth (60%)')).toBeVisible();
    await expect(page.locator('text=88%')).toBeVisible();
    await expect(page.locator('text=Communication (25%)')).toBeVisible();
    await expect(page.locator('text=85%')).toBeVisible();
    await expect(page.locator('text=Biometric Composure (15%)')).toBeVisible();
    await expect(page.locator('text=82%')).toBeVisible();

    // Key Strengths & Growth Areas
    await expect(page.locator('text=Key Strengths')).toBeVisible();
    await expect(page.locator('text=Growth Opportunities')).toBeVisible();
    await expect(page.locator('text=Executive Summary:')).toBeVisible();

    // Camera Integrity & Biometric Verification
    await expect(page.locator('text=Physical Camera Integrity & Biometric Verification (§7)')).toBeVisible();
    await expect(page.locator('text=Verdict: Verified')).toBeVisible();
    await expect(page.locator('text=Integrity Score')).toBeVisible();
    await expect(page.locator('text=98/100')).toBeVisible();

    // Actions
    await expect(page.locator('button:has-text("Download PDF Report")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Return to Dashboard")')).toBeVisible();

    // Capture 1440px screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l6_scorecard_1440.png'),
      fullPage: true,
    });

    // 390px Mobile Viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/?scorecard=true`);

    await expect(page.locator('text=Interview Completed: Executive Scorecard')).toBeVisible();
    await expect(page.locator('text=Overall Score')).toBeVisible();
    await expect(page.locator('button:has-text("Return to Dashboard")')).toBeVisible();

    // Verify mobile responsive fit
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

    // Capture 390px screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l6_scorecard_390.png'),
      fullPage: true,
    });
  });

  test('L6.3: Modals and Dialogs (FaceLost, CameraLost, Complete, Aborted)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Face Lost Modal
    await page.goto(`${BASE_URL}/?face_lost=true`);
    await expect(page.locator('text=Please Return to Camera View')).toBeVisible();
    await expect(page.locator('text=We lost sight of you for a moment.')).toBeVisible();
    await expect(page.locator('text=Auto-abort countdown')).toBeVisible();

    // Camera Lost Modal
    await page.goto(`${BASE_URL}/?camera_lost=true`);
    await expect(page.locator('text=Please Restore Your Camera')).toBeVisible();
    await expect(page.locator('text=Recovery Grace Window')).toBeVisible();
    await expect(page.locator('button:has-text("Restore Camera Feed")')).toBeVisible();

    // Complete Screen
    await page.goto(`${BASE_URL}/?complete=true`);
    await expect(page.locator('h1:has-text("Interview Complete")')).toBeVisible();
    await expect(page.locator('button:has-text("View Executive Report")')).toBeVisible();

    // Aborted Screen
    await page.goto(`${BASE_URL}/?aborted=true`);
    await expect(page.locator('h1:has-text("Interview Ended")')).toBeVisible();
    await expect(page.locator('button:has-text("Back to Dashboard")')).toBeVisible();
  });
});
