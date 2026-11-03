import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const require = createRequire(import.meta.url);
const sharp = require(path.join(projectRoot, 'frontend/node_modules/sharp'));

const masterPath = fs.existsSync(path.join(projectRoot, 'design-reference/brand/interviewforge-master-original.png'))
  ? path.join(projectRoot, 'design-reference/brand/interviewforge-master-original.png')
  : path.join(projectRoot, 'design-reference/brand/interviewforge-logo.png');

console.log(`[Brand Pipeline] Reading master asset from: ${masterPath}`);

// Target directories
const dirs = [
  path.join(projectRoot, 'design-reference/brand'),
  path.join(projectRoot, 'frontend/public/brand'),
  path.join(projectRoot, 'frontend/src/assets/brand'),
  path.join(projectRoot, 'frontend/public')
];

for (const d of dirs) {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
}

// 1. Process Master Image: Alpha Transparency & White Unmixing
const { data, info } = await sharp(masterPath).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
console.log(`[Brand Pipeline] Master dimension: ${width}x${height} (${channels} channels)`);

const rgba = Buffer.alloc(width * height * 4);
const rgbaDark = Buffer.alloc(width * height * 4);
const rgbaLight = Buffer.alloc(width * height * 4);
const rgbaMonoWhite = Buffer.alloc(width * height * 4);
const rgbaMonoDark = Buffer.alloc(width * height * 4);

let minX = width, maxX = 0, minY = height, maxY = 0;
let markMinX = width, markMaxX = 0, markMinY = height, markMaxY = 0;
let textMinX = width, textMaxX = 0, textMinY = height, textMaxY = 0;

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const srcIdx = (y * width + x) * channels;
    const destIdx = (y * width + x) * 4;

    const r = data[srcIdx];
    const g = data[srcIdx + 1];
    const b = data[srcIdx + 2];
    const minC = Math.min(r, g, b);

    // Smooth transparency curve: 252 -> 0, 225 -> 255
    let a = 0;
    if (minC < 252) {
      a = Math.min(255, Math.max(0, Math.round(((252 - minC) / 27) * 255)));
    }

    if (a > 10) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (y < 740) {
        if (x < markMinX) markMinX = x;
        if (x > markMaxX) markMaxX = x;
        if (y < markMinY) markMinY = y;
        if (y > markMaxY) markMaxY = y;
      } else {
        if (x < textMinX) textMinX = x;
        if (x > textMaxX) textMaxX = x;
        if (y < textMinY) textMinY = y;
        if (y > textMaxY) textMaxY = y;
      }
    }

    const alphaFactor = a / 255;
    // Unmix white background to prevent fringing
    const unmix = (c) => Math.min(255, Math.max(0, Math.round((c - (1 - alphaFactor) * 255) / Math.max(alphaFactor, 0.05))));

    const fgR = a > 0 ? unmix(r) : 0;
    const fgG = a > 0 ? unmix(g) : 0;
    const fgB = a > 0 ? unmix(b) : 0;

    // Standard natural RGBA
    rgba[destIdx] = fgR;
    rgba[destIdx + 1] = fgG;
    rgba[destIdx + 2] = fgB;
    rgba[destIdx + 3] = a;

    // Dark Background Variant: mark remains natural, text (y >= 740) becomes crisp light (#F8FAFC)
    if (y >= 740 && a > 15) {
      rgbaDark[destIdx] = 248;
      rgbaDark[destIdx + 1] = 250;
      rgbaDark[destIdx + 2] = 252;
      rgbaDark[destIdx + 3] = a;
    } else {
      rgbaDark[destIdx] = fgR;
      rgbaDark[destIdx + 1] = fgG;
      rgbaDark[destIdx + 2] = fgB;
      rgbaDark[destIdx + 3] = a;
    }

    // Light Background Variant: natural colors with high contrast dark text
    rgbaLight[destIdx] = fgR;
    rgbaLight[destIdx + 1] = fgG;
    rgbaLight[destIdx + 2] = fgB;
    rgbaLight[destIdx + 3] = a;

    // Mono White: #FFFFFF with alpha
    rgbaMonoWhite[destIdx] = 255;
    rgbaMonoWhite[destIdx + 1] = 255;
    rgbaMonoWhite[destIdx + 2] = 255;
    rgbaMonoWhite[destIdx + 3] = a;

    // Mono Dark: #0D1117 with alpha
    rgbaMonoDark[destIdx] = 13;
    rgbaMonoDark[destIdx + 1] = 17;
    rgbaMonoDark[destIdx + 2] = 23;
    rgbaMonoDark[destIdx + 3] = a;
  }
}

console.log(`[Brand Pipeline] Bounding Boxes:`);
console.log(`  Combined: [${minX}, ${minY}, ${maxX}, ${maxY}] (size: ${maxX - minX + 1}x${maxY - minY + 1})`);
console.log(`  Mark:     [${markMinX}, ${markMinY}, ${markMaxX}, ${markMaxY}] (size: ${markMaxX - markMinX + 1}x${markMaxY - markMinY + 1})`);
console.log(`  Wordmark: [${textMinX}, ${textMinY}, ${textMaxX}, ${textMaxY}] (size: ${textMaxX - textMinX + 1}x${textMaxY - textMinY + 1})`);

// Helper to crop with padding
function getPaddedBox(box, pad, maxW, maxH) {
  const left = Math.max(0, box.minX - pad);
  const top = Math.max(0, box.minY - pad);
  const right = Math.min(maxW - 1, box.maxX + pad);
  const bottom = Math.min(maxH - 1, box.maxY + pad);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

const fullBox = getPaddedBox({ minX, minY, maxX, maxY }, 24, width, height);
const markBox = getPaddedBox({ minX: markMinX, minY: markMinY, maxX: markMaxX, maxY: markMaxY }, 16, width, height);
const textBox = getPaddedBox({ minX: textMinX, minY: textMinY, maxX: textMaxX, maxY: textMaxY }, 16, width, height);

// Master Sharp instances
const masterFull = sharp(rgba, { raw: { width, height, channels: 4 } }).extract(fullBox);
const masterFullDark = sharp(rgbaDark, { raw: { width, height, channels: 4 } }).extract(fullBox);
const masterFullLight = sharp(rgbaLight, { raw: { width, height, channels: 4 } }).extract(fullBox);
const masterFullMonoWhite = sharp(rgbaMonoWhite, { raw: { width, height, channels: 4 } }).extract(fullBox);
const masterFullMonoDark = sharp(rgbaMonoDark, { raw: { width, height, channels: 4 } }).extract(fullBox);

const masterMark = sharp(rgba, { raw: { width, height, channels: 4 } }).extract(markBox);
const masterWordmark = sharp(rgba, { raw: { width, height, channels: 4 } }).extract(textBox);

// 2. Save Section 5.1 Master Assets in design-reference/brand/
const designBrandDir = path.join(projectRoot, 'design-reference/brand');
await masterFull.clone().png().toFile(path.join(designBrandDir, 'interviewforge-logo.png'));
await masterMark.clone().png().toFile(path.join(designBrandDir, 'interviewforge-mark.png'));
await masterWordmark.clone().png().toFile(path.join(designBrandDir, 'interviewforge-wordmark.png'));
await masterFullLight.clone().png().toFile(path.join(designBrandDir, 'interviewforge-logo-light.png'));
await masterFullDark.clone().png().toFile(path.join(designBrandDir, 'interviewforge-logo-dark.png'));
await masterFullMonoWhite.clone().png().toFile(path.join(designBrandDir, 'interviewforge-logo-mono-white.png'));
await masterFullMonoDark.clone().png().toFile(path.join(designBrandDir, 'interviewforge-logo-mono-dark.png'));
console.log(`[Brand Pipeline] Saved master assets to design-reference/brand/`);

// 3. Multi-size ICO Builder Helper
function buildIco(pngBuffers) {
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + numImages * dirEntrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(numImages, 4);

  const entries = [];
  for (const item of pngBuffers) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(item.width >= 256 ? 0 : item.width, 0);
    entry.writeUInt8(item.height >= 256 ? 0 : item.height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(item.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += item.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map((p) => p.buffer)]);
}

// 4. Generate Section 5.2 Derivatives into target folders
const targetDirs = [
  path.join(projectRoot, 'frontend/public/brand'),
  path.join(projectRoot, 'frontend/src/assets/brand')
];

// Generate Mark Square with padding for icons
const markSquare = await masterMark
  .clone()
  .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

// Favicon sizes
const fav16 = await sharp(markSquare).resize(16, 16).png().toBuffer();
const fav32 = await sharp(markSquare).resize(32, 32).png().toBuffer();
const fav48 = await sharp(markSquare).resize(48, 48).png().toBuffer();
const icoBuffer = buildIco([
  { width: 16, height: 16, buffer: fav16 },
  { width: 32, height: 32, buffer: fav32 },
  { width: 48, height: 48, buffer: fav48 }
]);

// iOS Apple Touch Icon (180x180 with subtle dark background padding)
const appleTouchIcon = await sharp(markSquare)
  .resize(150, 150, { fit: 'contain' })
  .extend({
    top: 15,
    bottom: 15,
    left: 15,
    right: 15,
    background: { r: 13, g: 17, b: 23, alpha: 1 } // #0D1117
  })
  .png()
  .toBuffer();

// Android Chrome Icons
const android192 = await sharp(markSquare).resize(192, 192).png().toBuffer();
const android512 = await sharp(markSquare).resize(512, 512).png().toBuffer();

// Logo Mark sizes
const mark32 = await sharp(markSquare).resize(32, 32).png().toBuffer();
const mark64 = await sharp(markSquare).resize(64, 64).png().toBuffer();
const mark128 = await sharp(markSquare).resize(128, 128).png().toBuffer();

// Full logo buffers
const fullPng = await masterFull.clone().png().toBuffer();
const fullWebp = await masterFull.clone().webp({ quality: 95 }).toBuffer();
const fullLightPng = await masterFullLight.clone().png().toBuffer();
const fullDarkPng = await masterFullDark.clone().png().toBuffer();
const wordmarkPng = await masterWordmark.clone().png().toBuffer();
const logoPdfBuffer = await sharp(fullLightPng).resize(260).png().toBuffer();

// Vector SVG Mark (High-fidelity clean SVG with embedded crisp mark)
const markBase64 = markSquare.toString('base64');
const logoMarkSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <image width="512" height="512" href="data:image/png;base64,${markBase64}" />
</svg>
`;

// Social Preview OG Image (1200x630)
// Centered logo, subtle background, product title & tagline
const ogLogoResized = await sharp(fullDarkPng).resize(320, null, { fit: 'contain' }).png().toBuffer();
const ogBackgroundSvg = Buffer.from(`
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#1E293B" />
      <stop offset="100%" stop-color="#0A0F1D" />
    </radialGradient>
    <linearGradient id="line" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0" />
      <stop offset="50%" stop-color="#F59E0B" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#F59E0B" stop-opacity="0" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect x="200" y="520" width="800" height="2" fill="url(#line)" />
  <text x="600" y="440" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="600" fill="#F8FAFC" text-anchor="middle" letter-spacing="0.5">Adaptive AI Mock Interview Platform</text>
  <text x="600" y="480" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#94A3B8" text-anchor="middle">Personalized Questions • Live Telemetry • Actionable Readiness Plans</text>
</svg>
`);

const ogImageBuffer = await sharp(ogBackgroundSvg)
  .composite([
    {
      input: ogLogoResized,
      top: 110,
      left: Math.round((1200 - 320) / 2)
    }
  ])
  .png()
  .toBuffer();

// Write to frontend/public/brand and frontend/src/assets/brand
for (const targetDir of targetDirs) {
  fs.writeFileSync(path.join(targetDir, 'favicon.ico'), icoBuffer);
  fs.writeFileSync(path.join(targetDir, 'favicon-16x16.png'), fav16);
  fs.writeFileSync(path.join(targetDir, 'favicon-32x32.png'), fav32);
  fs.writeFileSync(path.join(targetDir, 'favicon-48x48.png'), fav48);
  fs.writeFileSync(path.join(targetDir, 'apple-touch-icon.png'), appleTouchIcon);
  fs.writeFileSync(path.join(targetDir, 'android-chrome-192x192.png'), android192);
  fs.writeFileSync(path.join(targetDir, 'android-chrome-512x512.png'), android512);
  fs.writeFileSync(path.join(targetDir, 'og-image.png'), ogImageBuffer);
  fs.writeFileSync(path.join(targetDir, 'logo-full.png'), fullPng);
  fs.writeFileSync(path.join(targetDir, 'logo-full.webp'), fullWebp);
  fs.writeFileSync(path.join(targetDir, 'logo-full-light.png'), fullLightPng);
  fs.writeFileSync(path.join(targetDir, 'logo-full-dark.png'), fullDarkPng);
  fs.writeFileSync(path.join(targetDir, 'logo-mark.png'), markSquare);
  fs.writeFileSync(path.join(targetDir, 'logo-mark.svg'), logoMarkSvg, 'utf8');
  fs.writeFileSync(path.join(targetDir, 'logo-mark-32.png'), mark32);
  fs.writeFileSync(path.join(targetDir, 'logo-mark-64.png'), mark64);
  fs.writeFileSync(path.join(targetDir, 'logo-mark-128.png'), mark128);
  fs.writeFileSync(path.join(targetDir, 'logo-wordmark.png'), wordmarkPng);
  fs.writeFileSync(path.join(targetDir, 'logo-pdf.png'), logoPdfBuffer);
  console.log(`[Brand Pipeline] Wrote brand assets to ${targetDir}`);
}

// Generate base64 data URI export for PDF document embedding
const logoPdfDataUri = `data:image/png;base64,${logoPdfBuffer.toString('base64')}`;
const logoPdfTsContent = `// Auto-generated by scripts/build_brand_assets.mjs
export const BRAND_LOGO_PDF_DATA_URI = '${logoPdfDataUri}';
`;
fs.writeFileSync(path.join(projectRoot, 'frontend/src/assets/brand/logoPdfBase64.ts'), logoPdfTsContent, 'utf8');

// Write Web Manifest
const manifestContent = JSON.stringify(
  {
    name: 'InterviewForge',
    short_name: 'InterviewForge',
    description: 'Adaptive AI Mock Interview Platform',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d1117',
    theme_color: '#0d1117',
    icons: [
      {
        src: '/brand/favicon-32x32.png',
        sizes: '32x32',
        type: 'image/png'
      },
      {
        src: '/brand/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: '/brand/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png'
      }
    ]
  },
  null,
  2
);

fs.writeFileSync(path.join(projectRoot, 'frontend/public/brand/manifest.webmanifest'), manifestContent, 'utf8');
fs.writeFileSync(path.join(projectRoot, 'frontend/src/assets/brand/manifest.webmanifest'), manifestContent, 'utf8');

// Copy root public convenience assets
const publicRoot = path.join(projectRoot, 'frontend/public');
fs.writeFileSync(path.join(publicRoot, 'favicon.ico'), icoBuffer);
fs.writeFileSync(path.join(publicRoot, 'apple-touch-icon.png'), appleTouchIcon);
fs.writeFileSync(path.join(publicRoot, 'og-image.png'), ogImageBuffer);
fs.writeFileSync(path.join(publicRoot, 'manifest.webmanifest'), manifestContent, 'utf8');

console.log(`[Brand Pipeline] Successfully completed all brand derivatives!`);

