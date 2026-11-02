import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';

test.describe('L2: Design Tokens, Typography & Component Showcase', () => {
  test('Design system page at 1440px (Desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/?design-system=true');
    await page.waitForLoadState('networkidle');

    // Verify key editorial headings
    await expect(page.locator('text=Design Tokens &')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=01 // COLOR TOKEN SYSTEM')).toBeVisible();
    await expect(page.locator('text=02 // TYPOGRAPHY HIERARCHY')).toBeVisible();
    await expect(page.locator('text=03 // BUTTONS & ACTION CONTROLS')).toBeVisible();
    await expect(page.locator('text=04 // ICON TILES & BADGES')).toBeVisible();
    await expect(page.locator('text=05 // DEEP FOREST-GREEN GRADIENT BAND')).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l2_design_system_1440.png'),
      fullPage: true,
    });
  });

  test('Design system page at 390px (Mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:5173/?design-system=true');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Design Tokens &')).toBeVisible({ timeout: 10000 });

    // Verify no horizontal overflow on mobile
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l2_design_system_390.png'),
      fullPage: true,
    });
  });
});

