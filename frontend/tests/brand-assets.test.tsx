import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Logo } from '../src/components/common/Logo';

// Helper to inspect PNG dimensions and alpha channel from binary header
function inspectPng(filePath: string): { width: number; height: number; hasAlpha: boolean } {
  const buf = fs.readFileSync(filePath);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  expect(buf[0]).toBe(0x89);
  expect(buf[1]).toBe(0x50);
  expect(buf[2]).toBe(0x4e);
  expect(buf[3]).toBe(0x47);

  // IHDR chunk is at offset 8 (length 4, 'IHDR' 4, data...)
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf[25]; // 6 = RGBA (with alpha), 4 = Gray+Alpha, 2 = RGB

  return {
    width,
    height,
    hasAlpha: colorType === 6 || colorType === 4,
  };
}

describe('Brand Asset Pipeline Verification (§5.1 & §5.2)', () => {
  const root = path.resolve(__dirname, '../..');
  const designBrandDir = path.join(root, 'design-reference/brand');
  const publicBrandDir = path.join(root, 'frontend/public/brand');
  const srcAssetsBrandDir = path.join(root, 'frontend/src/assets/brand');
  const publicRootDir = path.join(root, 'frontend/public');

  it('verifies all master brand assets exist in design-reference/brand/', () => {
    const requiredMasterFiles = [
      'interviewforge-logo.png',
      'interviewforge-mark.png',
      'interviewforge-wordmark.png',
      'interviewforge-logo-light.png',
      'interviewforge-logo-dark.png',
      'interviewforge-logo-mono-white.png',
      'interviewforge-logo-mono-dark.png',
    ];

    for (const file of requiredMasterFiles) {
      const fullPath = path.join(designBrandDir, file);
      expect(fs.existsSync(fullPath), `Missing master asset: ${file}`).toBe(true);
      const stat = fs.statSync(fullPath);
      expect(stat.size, `File empty: ${file}`).toBeGreaterThan(100);
    }
  });

  it('verifies master logo and mark have alpha transparency', () => {
    const logoPng = inspectPng(path.join(designBrandDir, 'interviewforge-logo.png'));
    expect(logoPng.hasAlpha).toBe(true);

    const markPng = inspectPng(path.join(designBrandDir, 'interviewforge-mark.png'));
    expect(markPng.hasAlpha).toBe(true);
  });

  it('verifies all required derivative files exist in frontend/public/brand/', () => {
    const requiredDerivatives = [
      'favicon.ico',
      'favicon-16x16.png',
      'favicon-32x32.png',
      'favicon-48x48.png',
      'apple-touch-icon.png',
      'android-chrome-192x192.png',
      'android-chrome-512x512.png',
      'og-image.png',
      'logo-full.png',
      'logo-full.webp',
      'logo-full-light.png',
      'logo-full-dark.png',
      'logo-mark.png',
      'logo-mark.svg',
      'logo-mark-32.png',
      'logo-mark-64.png',
      'logo-mark-128.png',
      'logo-wordmark.png',
      'manifest.webmanifest',
    ];

    for (const file of requiredDerivatives) {
      const publicPath = path.join(publicBrandDir, file);
      expect(fs.existsSync(publicPath), `Missing public derivative: ${file}`).toBe(true);

      const srcAssetPath = path.join(srcAssetsBrandDir, file);
      expect(fs.existsSync(srcAssetPath), `Missing src asset derivative: ${file}`).toBe(true);
    }
  });

  it('verifies dimensions of generated icon and social assets', () => {
    expect(inspectPng(path.join(publicBrandDir, 'favicon-16x16.png'))).toMatchObject({
      width: 16,
      height: 16,
      hasAlpha: true,
    });

    expect(inspectPng(path.join(publicBrandDir, 'favicon-32x32.png'))).toMatchObject({
      width: 32,
      height: 32,
      hasAlpha: true,
    });

    expect(inspectPng(path.join(publicBrandDir, 'favicon-48x48.png'))).toMatchObject({
      width: 48,
      height: 48,
      hasAlpha: true,
    });

    expect(inspectPng(path.join(publicBrandDir, 'apple-touch-icon.png'))).toMatchObject({
      width: 180,
      height: 180,
    });

    expect(inspectPng(path.join(publicBrandDir, 'android-chrome-192x192.png'))).toMatchObject({
      width: 192,
      height: 192,
      hasAlpha: true,
    });

    expect(inspectPng(path.join(publicBrandDir, 'android-chrome-512x512.png'))).toMatchObject({
      width: 512,
      height: 512,
      hasAlpha: true,
    });

    expect(inspectPng(path.join(publicBrandDir, 'og-image.png'))).toMatchObject({
      width: 1200,
      height: 630,
    });
  });

  it('verifies multi-size favicon.ico format and presence at public root', () => {
    const icoPath = path.join(publicRootDir, 'favicon.ico');
    expect(fs.existsSync(icoPath)).toBe(true);

    const buf = fs.readFileSync(icoPath);
    expect(buf.readUInt16LE(0)).toBe(0); // reserved
    expect(buf.readUInt16LE(2)).toBe(1); // ICO type
    const count = buf.readUInt16LE(4);
    expect(count).toBe(3); // 16, 32, 48
  });

  it('verifies manifest.webmanifest schema and fields', () => {
    const manifestPath = path.join(publicBrandDir, 'manifest.webmanifest');
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(content.name).toBe('InterviewForge');
    expect(content.short_name).toBe('InterviewForge');
    expect(content.start_url).toBe('/');
    expect(Array.isArray(content.icons)).toBe(true);
    expect(content.icons.length).toBeGreaterThanOrEqual(2);
    expect(content.theme_color).toBe('#0d1117');
  });
});

describe('Logo Component Verification (§5.3)', () => {
  it('renders default full logo with accessible role and alt text', () => {
    const html = renderToString(<Logo />);
    expect(html).toContain('<img');
    expect(html).toContain('alt="InterviewForge"');
    expect(html).toContain('role="img"');
    expect(html).toContain('src="/brand/logo-full-dark.png"');
  });

  it('renders mark variant with responsive srcset', () => {
    const html = renderToString(<Logo variant="mark" size="sm" />);
    expect(html).toContain('<img');
    expect(html).toContain('src="/brand/logo-mark-64.png"');
    expect(html).toContain('srcSet="/brand/logo-mark-32.png 1x');
  });

  it('renders wordmark variant without throwing', () => {
    const html = renderToString(<Logo variant="wordmark" size="lg" />);
    expect(html).toContain('<img');
    expect(html).toContain('src="/brand/logo-wordmark.png"');
  });

  it('renders light and dark theme variants', () => {
    const darkHtml = renderToString(<Logo variant="full" theme="dark" />);
    expect(darkHtml).toContain('src="/brand/logo-full-dark.png"');

    const lightHtml = renderToString(<Logo variant="full" theme="light" />);
    expect(lightHtml).toContain('src="/brand/logo-full-light.png"');
  });

  it('renders wrapped in an anchor link when href is passed', () => {
    const html = renderToString(<Logo href="/app/dashboard" alt="Go to Dashboard" />);
    expect(html).toContain('<a');
    expect(html).toContain('href="/app/dashboard"');
    expect(html).toContain('aria-label="Go to Dashboard"');
  });

  it('supports custom numeric height', () => {
    const html = renderToString(<Logo size={60} />);
    expect(html).toContain('height:60px');
  });
});
