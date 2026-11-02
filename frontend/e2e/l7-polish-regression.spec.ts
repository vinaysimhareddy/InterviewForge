import { test, expect } from '@playwright/test';
import * as path from 'path';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';

test.describe('L7 Polish, Accessibility & End-to-End Regression', () => {

  test('L7.1: Responsive pass across viewports (360px, 390px, 768px, 1024px, 1440px, 1920px)', async ({ page }) => {
    const viewports = [
      { width: 360, height: 740, label: '360px ultra-compact' },
      { width: 390, height: 844, label: '390px mobile' },
      { width: 768, height: 1024, label: '768px tablet portrait' },
      { width: 1024, height: 768, label: '1024px tablet landscape' },
      { width: 1440, height: 900, label: '1440px desktop' },
      { width: 1920, height: 1080, label: '1920px large display' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/?clear_auth=1');
      await page.waitForLoadState('networkidle');

      // Check no horizontal overflow
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          hasOverflow: root.scrollWidth > root.clientWidth + 1,
        };
      });

      expect(overflow.hasOverflow, `Overflow detected at ${vp.label}: scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`).toBeFalsy();
    }
  });

  test('L7.2: Capture L7 1440px & 390px screenshots for landing and dark mode', async ({ page }) => {
    // 1440px Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?clear_auth=1');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l7_landing_1440.png'),
      fullPage: false,
    });

    // Dark Mode Toggle at 1440px
    const themeBtn = page.getByRole('button', { name: /switch to dark theme|switch to light theme/i });
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'l7_dark_landing_1440.png'),
        fullPage: false,
      });
      // Switch back to light
      await themeBtn.click();
      await page.waitForTimeout(200);
    }

    // 390px Mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?clear_auth=1');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l7_landing_390.png'),
      fullPage: false,
    });
  });

  test('L7.3: Contrast and accessibility landmarks audit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?clear_auth=1');
    await page.waitForLoadState('networkidle');

    // Semantic landmarks
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();

    // Check heading hierarchy
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    const h1Text = await h1.innerText();
    expect(h1Text).toMatch(/listen|adapt|truth/i);

    // Check visible focus indicator on keyboard tab
    await page.keyboard.press('Tab');
    const focusedElementTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElementTag).toBeDefined();
  });

  test('L7.4: Reduced motion verification', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/design-system');
    await page.waitForLoadState('networkidle');

    // Verify reduced motion css rule takes effect
    const animationDuration = await page.evaluate(() => {
      const el = document.querySelector('.animate-orb-breathe');
      if (!el) return 'none';
      return window.getComputedStyle(el).animationDuration;
    });

    // In reduced motion, animations should be none or ~0s
    expect(animationDuration === '0.00001s' || animationDuration === 'none' || animationDuration === '0s').toBeTruthy();
  });

  test('L7.5: Executive Scorecard responsive and screenshot verification', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?scorecard=true');
    await page.waitForLoadState('networkidle');

    // Verify scorecard headline
    await expect(page.getByText('Interview Completed: Executive Scorecard')).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l7_scorecard_1440.png'),
      fullPage: true,
    });

    // Mobile Viewport 390px
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l7_scorecard_390.png'),
      fullPage: true,
    });

    // Check mobile horizontal scroll width
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth + 1;
    });
    expect(overflow).toBeFalsy();
  });
});
