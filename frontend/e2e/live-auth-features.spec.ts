import { test, expect } from '@playwright/test';

test.describe('Live Full-Stack Integration: Auth & Working Features', () => {
  const uniqueId = Date.now();
  const testEmail = `candidate_${uniqueId}@example.com`;
  const testPassword = 'Password123!';
  const testName = `Alex Candidate ${uniqueId}`;

  test('Step 1: Register new account in UI and verify redirect to /app/dashboard', async ({ page }) => {
    // Navigate to register page
    await page.goto('http://localhost:5173/register');
    await page.waitForLoadState('networkidle');

    // Verify form elements
    await expect(page.locator('h1, h2, h3').filter({ hasText: /create candidate account/i })).toBeVisible();

    // Fill registration form
    await page.fill('input[type="text"]', testName);
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);

    // Submit form
    await page.click('button[type="submit"]');

    // Expect navigation to dashboard
    await page.waitForURL('**/app/dashboard', { timeout: 10000 });
    expect(page.url()).toContain('/app/dashboard');

    // Verify user name and dashboard sections are rendered
    await expect(page.getByRole('heading', { name: testName })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('01 // RESUME & ROLE GROUNDING')).toBeVisible();
    await expect(page.getByText('02 // RUNTIME PARAMETERS')).toBeVisible();

    // Click Sign Out in the dashboard header
    const signOutBtn = page.getByRole('button', { name: /sign out/i }).first();
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    // Verify redirect back to landing page or login
    await page.waitForTimeout(500);
    const token = await page.evaluate(() => localStorage.getItem('access_token'));
    expect(token).toBeNull();
  });

  test('Step 2: Log back in, configure interview, and proceed to Setup', async ({ page }) => {
    // Navigate to login page
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1, h2, h3').filter({ hasText: /candidate sign in/i })).toBeVisible();

    // Fill login form with the user created in Step 1
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);

    // Submit login
    await page.click('button[type="submit"]');

    // Expect redirect to /app/dashboard
    await page.waitForURL('**/app/dashboard', { timeout: 10000 });
    expect(page.url()).toContain('/app/dashboard');
    await expect(page.getByRole('heading', { name: testName })).toBeVisible({ timeout: 5000 });

    // Select role and seniority
    const fullStackBtn = page.getByRole('button', { name: 'Full Stack Engineer' });
    if (await fullStackBtn.isVisible()) {
      await fullStackBtn.click();
    }

    // Verify Start Live Interview button is visible
    const startBtn = page.getByRole('button', { name: /start live interview/i });
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // Verify Welcome Orientation screen
    await expect(page.getByText('Welcome to Your Technical Interview')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('01 // WHAT TO EXPECT')).toBeVisible();

    // Consent gating checkbox
    const consentCheckbox = page.locator('input[type="checkbox"]');
    await consentCheckbox.check({ force: true });

    // Click Continue to Device Check
    const continueBtn = page.getByRole('button', { name: /continue to device check/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Verify transition to Pre-Interview Setup screen
    await expect(page.getByText('Adaptive Live Interview Setup')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Pre-Flight Hardware Check')).toBeVisible();
    await expect(page.getByText('01 // MACHINE-VERIFIED PRE-FLIGHT')).toBeVisible();
  });
});
