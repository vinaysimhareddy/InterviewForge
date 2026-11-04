import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('PR5: Production Tool & Route Pruning Verification', () => {
  it('verifies that the production bundle dist/ is free of developer tools and debug artifacts', () => {
    const distAssetsDir = path.resolve(__dirname, '../dist/assets');
    expect(fs.existsSync(distAssetsDir)).toBe(true);

    const jsFiles = fs
      .readdirSync(distAssetsDir)
      .filter((file) => file.endsWith('.js') && !file.includes('react-pdf'));
    expect(jsFiles.length).toBeGreaterThan(0);

    const bannedPatterns = [
      'STTLab',
      'LatencyLab',
      'Design System Preview',
      'DEBUG TELEMETRY HUD',
      'Run Diagnostics',
      'console.log(',
      'console.debug(',
      'console.info(',
    ];

    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(distAssetsDir, file), 'utf-8');
      for (const pattern of bannedPatterns) {
        expect(
          content.includes(pattern),
          `Production bundle file "${file}" unexpectedly contains banned dev pattern: "${pattern}"`
        ).toBe(false);
      }
    }
  });

  it('verifies that no sourcemap (.map) files exist in production dist/', () => {
    const distDir = path.resolve(__dirname, '../dist');
    expect(fs.existsSync(distDir)).toBe(true);

    const findMaps = (dir: string): string[] => {
      let maps: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          maps = maps.concat(findMaps(fullPath));
        } else if (entry.name.endsWith('.map')) {
          maps.push(fullPath);
        }
      }
      return maps;
    };

    const mapFiles = findMaps(distDir);
    expect(mapFiles).toEqual([]);
  });
});

