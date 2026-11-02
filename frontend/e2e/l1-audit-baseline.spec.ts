import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';

test.describe('L1: Audit Baseline Screenshots', () => {
  test('Baseline at 1440px (Desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l1_baseline_1440.png'),
      fullPage: true,
    });
  });

  test('Baseline at 390px (Mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:5173/');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l1_baseline_390.png'),
      fullPage: true,
    });
  });
});
