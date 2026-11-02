# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: frontend\e2e\l6-interview-scorecard.spec.ts >> L6: Live Interview Stage & Executive Scorecard Restyling >> L6.2: Executive Scorecard (1440px desktop & 390px mobile)
- Location: frontend\e2e\l6-interview-scorecard.spec.ts:59:3

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/?scorecard=true", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import path from 'path';
  3   | 
  4   | const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';
  5   | 
  6   | test.describe('L6: Live Interview Stage & Executive Scorecard Restyling', () => {
  7   |   test('L6.1: Live Interview Stage (1440px desktop & 390px mobile)', async ({ page }) => {
  8   |     // 1440px Desktop
  9   |     await page.setViewportSize({ width: 1440, height: 900 });
  10  |     await page.goto('/?live=true');
  11  | 
  12  |     // Verify top bar
  13  |     await expect(page.locator('header')).toBeVisible();
  14  |     await expect(page.locator('text=AdaptiveMock')).toBeVisible();
  15  |     await expect(page.locator('text=LIVE STAGE')).toBeVisible();
  16  |     await expect(page.locator('text=Senior Full Stack Engineer')).toBeVisible();
  17  |     await expect(page.locator('text=Camera & mic active: monitoring posture & eye contact')).toBeVisible();
  18  | 
  19  |     // Verify central orb & question caption
  20  |     await expect(page.locator('[aria-label^="AI Interviewer"]')).toBeVisible();
  21  |     await expect(page.locator('[role="region"][aria-label="Interview Question"]')).toBeVisible();
  22  |     await expect(page.locator('text=CURRENT QUESTION')).toBeVisible();
  23  | 
  24  |     // Verify translucent live transcript panel
  25  |     await expect(page.locator('[data-testid="candidate-live-transcript"]')).toBeVisible();
  26  | 
  27  |     // Verify bottom quiet controls
  28  |     await expect(page.locator('button:has-text("Show Self-View")')).toBeVisible();
  29  |     await expect(page.locator('button:has-text("Transcript")')).toBeVisible();
  30  |     await expect(page.locator('button:has-text("Pause")')).toBeVisible();
  31  |     await expect(page.locator('button:has-text("Having trouble?")')).toBeVisible();
  32  | 
  33  |     // Capture 1440px screenshot
  34  |     await page.screenshot({
  35  |       path: path.join(ARTIFACT_DIR, 'l6_live_stage_1440.png'),
  36  |       fullPage: true,
  37  |     });
  38  | 
  39  |     // 390px Mobile Viewport
  40  |     await page.setViewportSize({ width: 390, height: 844 });
  41  |     await page.goto('/?live=true');
  42  | 
  43  |     await expect(page.locator('[aria-label^="AI Interviewer"]')).toBeVisible();
  44  |     await expect(page.locator('[role="region"][aria-label="Interview Question"]')).toBeVisible();
  45  |     await expect(page.locator('[data-testid="candidate-live-transcript"]')).toBeVisible();
  46  | 
  47  |     // Verify no horizontal overflow on mobile
  48  |     const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  49  |     const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  50  |     expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  51  | 
  52  |     // Capture 390px screenshot
  53  |     await page.screenshot({
  54  |       path: path.join(ARTIFACT_DIR, 'l6_live_stage_390.png'),
  55  |       fullPage: true,
  56  |     });
  57  |   });
  58  | 
  59  |   test('L6.2: Executive Scorecard (1440px desktop & 390px mobile)', async ({ page }) => {
  60  |     // 1440px Desktop
  61  |     await page.setViewportSize({ width: 1440, height: 900 });
> 62  |     await page.goto('/?scorecard=true');
      |                ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  63  | 
  64  |     // Title and overall score
  65  |     await expect(page.locator('text=Interview Completed: Executive Scorecard')).toBeVisible();
  66  |     await expect(page.locator('text=Overall Score')).toBeVisible();
  67  |     await expect(page.locator('text=86')).toBeVisible();
  68  |     await expect(page.locator('text=Recommendation')).toBeVisible();
  69  |     await expect(page.locator('text=Strong Hire')).toBeVisible();
  70  | 
  71  |     // Category breakdown
  72  |     await expect(page.locator('text=Technical Depth (60%)')).toBeVisible();
  73  |     await expect(page.locator('text=88%')).toBeVisible();
  74  |     await expect(page.locator('text=Communication (25%)')).toBeVisible();
  75  |     await expect(page.locator('text=85%')).toBeVisible();
  76  |     await expect(page.locator('text=Biometric Composure (15%)')).toBeVisible();
  77  |     await expect(page.locator('text=82%')).toBeVisible();
  78  | 
  79  |     // Key Strengths & Growth Areas
  80  |     await expect(page.locator('text=Key Strengths')).toBeVisible();
  81  |     await expect(page.locator('text=Growth Opportunities')).toBeVisible();
  82  |     await expect(page.locator('text=Executive Summary:')).toBeVisible();
  83  | 
  84  |     // Camera Integrity & Biometric Verification
  85  |     await expect(page.locator('text=Physical Camera Integrity & Biometric Verification (§7)')).toBeVisible();
  86  |     await expect(page.locator('text=Verdict: Verified')).toBeVisible();
  87  |     await expect(page.locator('text=Integrity Score')).toBeVisible();
  88  |     await expect(page.locator('text=98/100')).toBeVisible();
  89  | 
  90  |     // Actions
  91  |     await expect(page.locator('button:has-text("Download PDF Report")').first()).toBeVisible();
  92  |     await expect(page.locator('button:has-text("Return to Dashboard")')).toBeVisible();
  93  | 
  94  |     // Capture 1440px screenshot
  95  |     await page.screenshot({
  96  |       path: path.join(ARTIFACT_DIR, 'l6_scorecard_1440.png'),
  97  |       fullPage: true,
  98  |     });
  99  | 
  100 |     // 390px Mobile Viewport
  101 |     await page.setViewportSize({ width: 390, height: 844 });
  102 |     await page.goto('/?scorecard=true');
  103 | 
  104 |     await expect(page.locator('text=Interview Completed: Executive Scorecard')).toBeVisible();
  105 |     await expect(page.locator('text=Overall Score')).toBeVisible();
  106 |     await expect(page.locator('button:has-text("Return to Dashboard")')).toBeVisible();
  107 | 
  108 |     // Verify mobile responsive fit
  109 |     const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  110 |     const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  111 |     expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  112 | 
  113 |     // Capture 390px screenshot
  114 |     await page.screenshot({
  115 |       path: path.join(ARTIFACT_DIR, 'l6_scorecard_390.png'),
  116 |       fullPage: true,
  117 |     });
  118 |   });
  119 | 
  120 |   test('L6.3: Modals and Dialogs (FaceLost, CameraLost, HelpDrawer)', async ({ page }) => {
  121 |     await page.setViewportSize({ width: 1440, height: 900 });
  122 | 
  123 |     // Face Lost Modal
  124 |     await page.goto('/?face_lost=true');
  125 |     await expect(page.locator('text=Please Return to Camera View')).toBeVisible();
  126 |     await expect(page.locator('text=We lost sight of you for a moment.')).toBeVisible();
  127 |     await expect(page.locator('text=Auto-abort countdown')).toBeVisible();
  128 | 
  129 |     // Camera Lost Modal
  130 |     await page.goto('/?camera_lost=true');
  131 |     await expect(page.locator('text=Please Restore Your Camera')).toBeVisible();
  132 |     await expect(page.locator('text=Recovery Grace Window')).toBeVisible();
  133 |     await expect(page.locator('button:has-text("Restore Camera Feed")')).toBeVisible();
  134 | 
  135 |     // Complete Screen
  136 |     await page.goto('/?complete=true');
  137 |     await expect(page.locator('h1:has-text("Interview Complete")')).toBeVisible();
  138 |     await expect(page.locator('button:has-text("View Executive Report")')).toBeVisible();
  139 | 
  140 |     // Aborted Screen
  141 |     await page.goto('/?aborted=true');
  142 |     await expect(page.locator('h1:has-text("Interview Ended")')).toBeVisible();
  143 |     await expect(page.locator('button:has-text("Back to Dashboard")')).toBeVisible();
  144 |   });
  145 | });
  146 | 
```