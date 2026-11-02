import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';

test.describe('L3: Public Landing Page & Routing', () => {
  test('Landing page at 1440px (Desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/');
    await page.waitForLoadState('networkidle');

    // Verify Hero
    await expect(page.locator('text=Practice interviews that listen, adapt')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Voice-to-voice conversational AI')).toBeVisible();

    // Verify Sample Product Preview Card
    await expect(page.locator('text=SAMPLE DATA PREVIEW')).toBeVisible();
    await expect(page.locator('text=EXECUTIVE SCORECARD')).toBeVisible();

    // Verify Sections
    await expect(page.locator('text=01 // CORE ARCHITECTURE')).toBeVisible();
    await expect(page.locator('text=02 // HOW IT WORKS')).toBeVisible();
    await expect(page.locator('text=03 // INTERVIEW EXPERIENCE')).toBeVisible();
    await expect(page.locator('text=04 // TRANSPARENCY & DATA PRIVACY')).toBeVisible();
    await expect(page.locator('text=06 // FREQUENTLY ASKED QUESTIONS')).toBeVisible();
    await expect(page.locator('text=07 // PRACTICE WITH INTEGRITY')).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l3_landing_page_1440.png'),
      fullPage: true,
    });
  });

  test('Landing page at 390px (Mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:5173/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Practice interviews that listen, adapt')).toBeVisible({ timeout: 10000 });

    // Verify mobile layout without horizontal overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l3_landing_page_390.png'),
      fullPage: true,
    });
  });

  test('Public legal routes: /privacy and /terms', async ({ page }) => {
    await page.goto('http://localhost:5173/privacy');
    await expect(page.locator('text=Privacy Policy & Data Architecture')).toBeVisible();

    await page.goto('http://localhost:5173/terms');
    await expect(page.locator('text=Terms of Use & Disclaimer')).toBeVisible();
  });
});

