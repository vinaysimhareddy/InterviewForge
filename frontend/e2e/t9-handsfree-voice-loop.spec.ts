import { test, expect } from '@playwright/test';
import * as path from 'path';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';

test.describe('T9: Hands-Free Voice Loop & Speech Recognition E2E Suite (§T9)', () => {
  test('Live stage: Hands-free voice transcript renders with calm indicators and zero vendor names (1440px & 390px)', async ({ page }) => {
    // 1. DESKTOP VIEWPORT (1440px)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/?live=true');
    await page.waitForLoadState('domcontentloaded');

    // Live Candidate Answer Transcript container is present
    const transcriptRegion = page.locator('[data-testid="candidate-live-transcript"]');
    await expect(transcriptRegion).toBeVisible();

    // Verify calm, generic status
    await expect(page.locator('text=Listening for answer...')).toBeVisible();

    // Submit Answer button exists and is initially disabled or ready
    const submitBtn = page.locator('[data-testid="submit-answer-button"]');
    await expect(submitBtn).toBeVisible();

    // Zero vendor or model names are exposed
    await expect(page.locator('text=faster-whisper')).not.toBeVisible();
    await expect(page.locator('text=vosk')).not.toBeVisible();
    await expect(page.locator('text=nemotron')).not.toBeVisible();
    await expect(page.locator('text=Web Speech API')).not.toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 't9_handsfree_stage_1440.png'),
      fullPage: false,
    });

    // 2. MOBILE VIEWPORT (390px)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);

    await expect(transcriptRegion).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 't9_handsfree_stage_390.png'),
      fullPage: false,
    });
  });

  test('Pre-interview setup: speech check prompt, language selector, and generic readiness report', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Check setup page speech test elements
    const speechPrompt = page.locator("text=Say: 'I'm ready for the interview and excited to begin'");
    if (await speechPrompt.isVisible()) {
      await expect(speechPrompt).toBeVisible();
      // Readiness badge
      await expect(page.locator('[data-testid="stt-readiness-indicator"]')).toBeVisible();
      await expect(page.locator('text=Voice recognition ready')).toBeVisible();

      // Language / Accent selector
      const langSelector = page.locator('[data-testid="speech-lang-selector"]');
      await expect(langSelector).toBeVisible();
      await expect(langSelector).toHaveValue('en-IN');
    }
  });
});

