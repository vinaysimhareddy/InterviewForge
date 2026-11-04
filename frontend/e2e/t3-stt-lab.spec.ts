import { test, expect } from '@playwright/test';
import * as path from 'path';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';

test.describe('T3: Speech-to-Text Benchmark Lab Page Verification', () => {
  test('Verify /dev/stt-lab renders with curated 20-answer test script and audio harness (1440px & 390px)', async ({ page }) => {
    // 1. DESKTOP VIEWPORT (1440px)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/dev/stt-lab');
    await page.waitForLoadState('domcontentloaded');

    // Header checks
    await expect(page.locator('text=Speech-to-Text Benchmark Lab')).toBeVisible();
    await expect(page.locator('text=Step T3')).toBeVisible();

    // Check script list presence
    await expect(page.locator('text=Curated Answers')).toBeVisible();

    // Check recording buttons
    await expect(page.locator('button:has-text("Start Recording")')).toBeVisible();

    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 't3_stt_lab_1440.png'),
      fullPage: false,
    });

    // 2. MOBILE VIEWPORT (390px)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 't3_stt_lab_390.png'),
      fullPage: false,
    });
  });
});

