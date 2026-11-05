import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3/responsive_audit';
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

const WIDTHS = [360, 390, 768, 1024];

function setupRoutes(page: any) {
  return Promise.all([
    page.route('**/api/v1/auth/login', (route: any) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-jwt-token-candidate-alex',
          token_type: 'bearer',
          expires_in: 3600,
        }),
      })
    ),
    page.route('**/api/v1/auth/me', (route: any) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'candidate-uuid-9876',
          email: 'alex.morgan@example.com',
          full_name: 'Alex Morgan',
          created_at: new Date().toISOString(),
          role: 'candidate',
        }),
      })
    ),
    page.route('**/api/v1/resumes', (route: any) =>
      route.fulfill({
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
      })
    ),
    page.route('**/api/v1/sessions', (route: any) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'session-demo-84920',
            user_id: 'candidate-uuid-9876',
            role: 'Full Stack Engineer',
            seniority: 'Senior',
            difficulty: 'Adaptive',
            status: 'COMPLETED',
            duration_minutes: 15,
            created_at: new Date(Date.now() - 86400000).toISOString(),
            final_score: 86,
          },
        ]),
      })
    ),
  ]);
}

test.describe('Responsive Audit Across 360, 390, 768, 1024 px', () => {
  for (const width of WIDTHS) {
    const height = width >= 768 ? (width === 768 ? 1024 : 768) : 844;

    test(`Landing page at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('http://localhost:5173/');
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }));
      console.log(`[Landing ${width}px] scrollWidth: ${overflow.scrollWidth}, clientWidth: ${overflow.clientWidth}`);
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `landing_${width}px.png`),
        fullPage: true,
      });

      // If mobile view, test opening the hamburger menu
      if (width < 768) {
        const menuBtn = page.locator('button[aria-label="Toggle navigation menu"]');
        if (await menuBtn.isVisible()) {
          await menuBtn.click();
          await page.waitForTimeout(300);
          await page.screenshot({
            path: path.join(ARTIFACT_DIR, `landing_mobile_menu_${width}px.png`),
          });
          await menuBtn.click(); // close menu
        }
      }
    });

    test(`Login & Register at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('http://localhost:5173/login');
      await page.waitForLoadState('networkidle');

      const loginOverflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      console.log(`[Login ${width}px] scrollWidth: ${loginOverflow.scrollWidth}, clientWidth: ${loginOverflow.clientWidth}`);
      expect(loginOverflow.scrollWidth).toBeLessThanOrEqual(loginOverflow.clientWidth);

      await page.screenshot({ path: path.join(ARTIFACT_DIR, `login_${width}px.png`) });

      await page.goto('http://localhost:5173/register');
      await page.waitForLoadState('networkidle');

      const regOverflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(regOverflow.scrollWidth).toBeLessThanOrEqual(regOverflow.clientWidth);

      await page.screenshot({ path: path.join(ARTIFACT_DIR, `register_${width}px.png`) });
    });

    test(`Dashboard at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await setupRoutes(page);
      await page.addInitScript(() => {
        localStorage.setItem('access_token', 'mock-jwt-token-candidate-alex');
      });
      await page.goto('http://localhost:5173/app/dashboard');
      await page.waitForLoadState('networkidle');

      const dashOverflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      console.log(`[Dashboard ${width}px] scrollWidth: ${dashOverflow.scrollWidth}, clientWidth: ${dashOverflow.clientWidth}`);
      expect(dashOverflow.scrollWidth).toBeLessThanOrEqual(dashOverflow.clientWidth);

      await page.screenshot({ path: path.join(ARTIFACT_DIR, `dashboard_${width}px.png`), fullPage: true });

      // If tablet/mobile (< 1024px), test the workspace drawer
      if (width < 1024) {
        const drawerBtn = page.locator('button[aria-label="Open workspace menu"]');
        if (await drawerBtn.isVisible()) {
          await drawerBtn.click();
          await page.waitForTimeout(300);
          await page.screenshot({
            path: path.join(ARTIFACT_DIR, `dashboard_workspace_drawer_${width}px.png`),
          });
          const closeDrawer = page.locator('button[aria-label="Close workspace menu"]');
          if (await closeDrawer.isVisible()) {
            await closeDrawer.click();
          }
        }
      }
    });

    test(`Device Setup at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('http://localhost:5173/?setup=true');
      await page.waitForLoadState('networkidle');

      const setupOverflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      console.log(`[Setup ${width}px] scrollWidth: ${setupOverflow.scrollWidth}, clientWidth: ${setupOverflow.clientWidth}`);
      expect(setupOverflow.scrollWidth).toBeLessThanOrEqual(setupOverflow.clientWidth);

      await page.screenshot({ path: path.join(ARTIFACT_DIR, `setup_${width}px.png`), fullPage: true });
    });

    test(`Live Stage at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('http://localhost:5173/?live=true');
      await page.waitForLoadState('networkidle');

      const liveOverflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      console.log(`[LiveStage ${width}px] scrollWidth: ${liveOverflow.scrollWidth}, clientWidth: ${liveOverflow.clientWidth}`);
      expect(liveOverflow.scrollWidth).toBeLessThanOrEqual(liveOverflow.clientWidth);

      await page.screenshot({ path: path.join(ARTIFACT_DIR, `live_stage_${width}px.png`) });

      // Test help drawer directly via ?help=true
      await page.goto('http://localhost:5173/?help=true');
      await page.waitForLoadState('networkidle');

      const helpOverflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(helpOverflow.scrollWidth).toBeLessThanOrEqual(helpOverflow.clientWidth);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `help_drawer_${width}px.png`) });
    });

    test(`Scorecard Review at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('http://localhost:5173/?scorecard=true');
      await page.waitForLoadState('networkidle');

      const scorecardOverflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      console.log(`[Scorecard ${width}px] scrollWidth: ${scorecardOverflow.scrollWidth}, clientWidth: ${scorecardOverflow.clientWidth}`);
      expect(scorecardOverflow.scrollWidth).toBeLessThanOrEqual(scorecardOverflow.clientWidth);

      await page.screenshot({ path: path.join(ARTIFACT_DIR, `scorecard_${width}px.png`), fullPage: true });
    });

    test(`Modals at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('http://localhost:5173/?face_lost=true');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `face_lost_${width}px.png`) });

      await page.goto('http://localhost:5173/?camera_lost=true');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `camera_lost_${width}px.png`) });

      await page.goto('http://localhost:5173/?complete=true');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `complete_${width}px.png`) });

      await page.goto('http://localhost:5173/?aborted=true');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `aborted_${width}px.png`) });
    });
  }
});
