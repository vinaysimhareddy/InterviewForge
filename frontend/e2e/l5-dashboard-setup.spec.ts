import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';

test.describe('L5: App Shell, Dashboard & Pre-Interview Setup', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure default light editorial theme
    await page.addInitScript(() => {
      localStorage.setItem('ai_interviewer_theme', 'light');
    });

    // Intercept API calls so tests run deterministically in isolation without backend dependency
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-jwt-token-candidate-alex',
          token_type: 'bearer',
          expires_in: 3600,
        }),
      });
    });

    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'candidate-uuid-9876',
          email: 'alex.morgan@example.com',
          full_name: 'Alex Morgan',
          created_at: new Date().toISOString(),
          role: 'candidate',
        }),
      });
    });

    await page.route('**/api/v1/resumes', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'resume-1',
            filename: 'alex_morgan_senior_swe.pdf',
            file_size: 24576,
            parsed_data: {
              skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker'],
              summary: 'Senior Software Engineer with 7 years of full stack distributed systems experience.',
            },
            created_at: new Date().toISOString(),
          },
        ]),
      });
    });

    await page.route('**/api/v1/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'session-prev-101',
            user_id: 'candidate-uuid-9876',
            role: 'Full Stack Engineer',
            seniority: 'Senior',
            difficulty: 'Adaptive',
            status: 'COMPLETED',
            created_at: new Date().toISOString(),
          },
        ]),
      });
    });
  });

  test('Dashboard page at 1440px (Desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');

    // Click demo credentials and sign in
    await page.getByRole('button', { name: 'Fill Demo Candidate Credentials' }).click();
    await page.getByRole('button', { name: 'Sign In to Dashboard' }).click();

    // Verify redirected to dashboard
    await expect(page).toHaveURL(/.*\/app\/dashboard/, { timeout: 10000 });
    await expect(page.locator('text=CANDIDATE WORKSPACE')).toBeVisible();

    // Verify candidate profile info
    await expect(page.getByRole('heading', { name: 'Alex Morgan' })).toBeVisible();

    // Verify editorial styling on dashboard
    await expect(page.locator('text=01 // RESUME & ROLE GROUNDING')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Interview Preparation & Grounding' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Interview Configuration' })).toBeVisible();
    await expect(page.locator('text=Drop your resume PDF here or browse')).toBeVisible();
    await expect(page.locator('text=Target Role & Specialization')).toBeVisible();
    await expect(page.locator('text=Security & Token Inspector Sandbox')).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l5_dashboard_1440.png'),
      fullPage: true,
    });
  });

  test('Dashboard page at 390px (Mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Fill Demo Candidate Credentials' }).click();
    await page.getByRole('button', { name: 'Sign In to Dashboard' }).click();
    await expect(page).toHaveURL(/.*\/app\/dashboard/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Alex Morgan' })).toBeVisible();

    // Verify mobile responsive layout without horizontal scroll overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l5_dashboard_390.png'),
      fullPage: true,
    });
  });

  test('Pre-Interview Setup page at 1440px (Desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:5173/?setup=true');
    await page.waitForLoadState('networkidle');

    // Verify setup headings and cards
    await expect(page.getByRole('heading', { name: 'Adaptive Live Interview Setup' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=01 // MACHINE-VERIFIED PRE-FLIGHT')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Interview Duration' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pre-Flight Hardware Check' })).toBeVisible();
    await expect(page.locator('text=1. Real Physical Camera')).toBeVisible();
    await expect(page.locator('text=2. Microphone Audio')).toBeVisible();
    await expect(page.locator('text=3. Speaker / Audio Output')).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l5_setup_1440.png'),
      fullPage: true,
    });
  });

  test('Pre-Interview Setup page at 390px (Mobile)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:5173/?setup=true');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Adaptive Live Interview Setup' })).toBeVisible({ timeout: 10000 });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'l5_setup_390.png'),
      fullPage: true,
    });
  });
});
