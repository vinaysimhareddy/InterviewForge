import { test, expect } from '@playwright/test';
import * as path from 'path';

const ARTIFACT_DIR = 'C:/Users/pvina/.gemini/antigravity/brain/ba572b47-fc46-4a67-bd82-24f6e40abbf3';

test.describe('N5 Brand Asset Pipeline & Derivative Verification', () => {

  test('Verify Brand Assets and capture visual rendering at 1440px and 390px', async ({ page }) => {
    // 1. Visit landing page or direct brand assets
    await page.setViewportSize({ width: 1440, height: 900 });

    // Open a visual verification container for all brand derivatives
    await page.setContent(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <base href="http://localhost:5173/">
        <title>InterviewForge Brand Asset Verification</title>
        <link rel="icon" href="/brand/favicon.ico">
        <style>
          body {
            margin: 0;
            padding: 40px 24px;
            background-color: #0d1117;
            color: #f0f6fc;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
          }
          h1 {
            font-size: 28px;
            font-weight: 700;
            letter-spacing: -0.02em;
            margin-bottom: 8px;
            color: #ffffff;
          }
          .subtitle {
            color: #8b949e;
            font-size: 14px;
            margin-bottom: 32px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 32px;
          }
          .card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 12px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
          }
          .card.light {
            background: #ffffff;
            color: #0d1117;
            border-color: #e1e4e8;
          }
          .card-title {
            font-size: 13px;
            font-weight: 600;
            margin-top: 14px;
            color: #8b949e;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .card.light .card-title {
            color: #57606a;
          }
          .preview-box {
            min-height: 120px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          img {
            max-width: 100%;
            height: auto;
            object-fit: contain;
          }
          .social-preview {
            width: 100%;
            border-radius: 10px;
            border: 1px solid #30363d;
            overflow: hidden;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>InterviewForge · Brand Master & Derivative Suite</h1>
          <div class="subtitle">Section 5 Rebranding Verification: Master Logo, Mark, Wordmark, Derivatives, and Multi-resolution Favicons</div>
          
          <div class="grid">
            <div class="card">
              <div class="preview-box">
                <img src="/brand/logo-full-dark.png" alt="Full Logo Dark" style="height: 64px;" />
              </div>
              <div class="card-title">Full Logo (Dark Theme · WCAG AAA)</div>
            </div>

            <div class="card light">
              <div class="preview-box">
                <img src="/brand/logo-full-light.png" alt="Full Logo Light" style="height: 64px;" />
              </div>
              <div class="card-title">Full Logo (Light Theme · WCAG AAA)</div>
            </div>

            <div class="card">
              <div class="preview-box">
                <img src="/brand/logo-mark-128.png" alt="Mark Icon" style="height: 72px;" />
              </div>
              <div class="card-title">Logo Mark (Tree & Swing Symbol)</div>
            </div>

            <div class="card">
              <div class="preview-box">
                <div style="display: flex; gap: 16px; align-items: center;">
                  <img src="/brand/favicon-48x48.png" alt="Favicon 48" style="height: 48px;" />
                  <img src="/brand/favicon-32x32.png" alt="Favicon 32" style="height: 32px;" />
                  <img src="/brand/favicon-16x16.png" alt="Favicon 16" style="height: 16px;" />
                </div>
              </div>
              <div class="card-title">Multi-size Favicons (16 / 32 / 48 px)</div>
            </div>

            <div class="card">
              <div class="preview-box">
                <img src="/brand/apple-touch-icon.png" alt="Apple Touch Icon" style="height: 80px; border-radius: 16px;" />
              </div>
              <div class="card-title">Apple Touch Icon (180x180)</div>
            </div>

            <div class="card">
              <div class="preview-box">
                <img src="/brand/android-chrome-192x192.png" alt="Android Icon" style="height: 80px;" />
              </div>
              <div class="card-title">Android Chrome (192x192 / 512x512)</div>
            </div>
          </div>

          <div class="card" style="padding: 24px; align-items: flex-start; text-align: left;">
            <div class="card-title" style="margin-top: 0; margin-bottom: 12px;">Social OpenGraph Preview (1200x630 · og:image.png)</div>
            <div class="social-preview">
              <img src="/brand/og-image.png" alt="Social Preview Card" style="width: 100%; display: block;" />
            </div>
          </div>
        </div>
      </body>
      </html>
    `, { waitUntil: 'load' });

    await page.waitForTimeout(1000);

    // Capture 1440px Desktop Screenshot
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n5_brand_1440.png'),
      fullPage: false,
    });

    // Capture 390px Mobile Viewport Screenshot
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'n5_brand_390.png'),
      fullPage: false,
    });
  });
});
