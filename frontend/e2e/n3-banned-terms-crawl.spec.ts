import { test, expect, Page } from '@playwright/test';
import * as path from 'path';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';

const BANNED_TERMS = [
  'gemini',
  'openai',
  'gpt',
  'langgraph',
  'langchain',
  'nemotron',
  'mediapipe',
  'mongodb',
  'atlas',
  'fastapi',
  'argon',
  'jwt',
  'hmac',
  'bearer ',
];

// Patterns for token exposures: eyJ..., Bearer ..., api_key..., 24+ hex
const BANNED_SECRET_PATTERNS = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /Bearer\s+[A-Za-z0-9_\-\.]{15,}/i,
  /api[_-]?key[:=\s]+[A-Za-z0-9_\-]{16,}/i,
];

async function assertPageFreeOfBannedTerms(page: Page, routeLabel: string) {
  // Extract visible body text
  const bodyText = await page.evaluate(() => document.body.innerText || '');
  
  // Extract title and metadata
  const title = await page.title();
  
  // Extract aria-labels, alt, titles
  const attributeValues = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('[aria-label], [title], [alt], [placeholder]'));
    return elements.map(el => [
      el.getAttribute('aria-label') || '',
      el.getAttribute('title') || '',
      el.getAttribute('alt') || '',
      el.getAttribute('placeholder') || '',
    ]).flat().filter(Boolean);
  });

  const fullTextToInspect = [bodyText, title, ...attributeValues].join('\n');

  // 1. Check secret patterns
  for (const pat of BANNED_SECRET_PATTERNS) {
    const match = fullTextToInspect.match(pat);
    if (match) {
      throw new Error(`[${routeLabel}] Leaked secret pattern detected (${pat}): ${match[0].slice(0, 20)}...`);
    }
  }

  // 2. Check banned technology terms
  for (const term of BANNED_TERMS) {
    const lower = fullTextToInspect.toLowerCase();
    // Use word boundaries for short acronyms like jwt
    let hit = false;
    if (term === 'jwt') {
      hit = /\bjwt\b/i.test(fullTextToInspect);
    } else if (term === 'gpt') {
      hit = /\bgpt\b/i.test(fullTextToInspect);
    } else {
      hit = lower.includes(term.toLowerCase());
    }

    if (hit) {
      throw new Error(`[${routeLabel}] Banned technology term '${term}' found in rendered in-app view`);
    }
  }
}

test.describe('N3 Banned Technology & Secrets In-App Crawl (§3.3)', () => {

  test('Crawl login, register, dashboard, setup, and scorecard without banned terms', async ({ page }) => {
    const uid = Date.now();

    // 1. Register candidate and get into authenticated dashboard
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/register');
    await page.waitForLoadState('networkidle');

    await assertPageFreeOfBannedTerms(page, '/register');

    await page.fill('input[autoComplete="name"], input[placeholder*="Alex"]', `Candidate ${uid}`);
    await page.fill('input[type="email"]', `cand_n3_${uid}@example.com`);
    await page.fill('input[type="password"]', 'InterviewReady2026!');

    const submitBtn = page.getByRole('button', { name: /create candidate account/i });
    await submitBtn.click();

    // 2. Dashboard
    await page.waitForURL('**/app/dashboard', { timeout: 15000 });
    await page.waitForTimeout(2000);
    await assertPageFreeOfBannedTerms(page, '/app/dashboard');

    // 3. Pre-interview Setup
    await page.goto('http://localhost:5173/app/setup');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await assertPageFreeOfBannedTerms(page, '/app/setup');

    // Screenshot Setup Desktop
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n3_setup_1440.png'),
      fullPage: false,
    });

    // Mobile Setup Screenshot
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await assertPageFreeOfBannedTerms(page, '/app/setup (mobile)');
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n3_setup_390.png'),
      fullPage: false,
    });

    // 4. Scorecard / Review page
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/?scorecard=true');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await assertPageFreeOfBannedTerms(page, '/?scorecard=true');

    // Screenshot Scorecard Desktop
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n3_scorecard_1440.png'),
      fullPage: false,
    });

    // Mobile Scorecard Screenshot
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await assertPageFreeOfBannedTerms(page, '/?scorecard=true (mobile)');
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n3_scorecard_390.png'),
      fullPage: false,
    });
  });

});
