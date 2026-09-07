/**
 * Visual QA Screenshot Capture Script for Phase 8 Sub-Phase P8.0.
 *
 * Captures versioned PNG screenshots into docs/screenshots/phase_8/p8_0/
 * and copies to docs/screenshots/phase_8/:
 *  - 8 tabs × 1280px Desktop: cover_1280, assumptions_1280, historicals_1280, schedules_1280, projections_1280, valuation_1280, summary_1280, sensitivity_1280
 *  - 8 tabs × 390px Mobile: cover_390, assumptions_390, historicals_390, schedules_390, projections_390, valuation_390, summary_390, sensitivity_390
 *  - Expanded Thesis Defense view: valuation_defense_expanded_1280, valuation_defense_expanded_390
 *
 * Requirements:
 *  - Each PNG must exist and be > 10KB
 *  - Zero console errors or unhandled exceptions
 *  - Clean rendering across all tabs
 *
 * Usage: node tools/visual_qa/capture_phase8_p8_0.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import http from 'http';

const OUT_DIR_P8_0 = path.resolve('docs/screenshots/phase_8/p8_0');
const OUT_DIR_ROOT = path.resolve('docs/screenshots/phase_8');
fs.mkdirSync(OUT_DIR_P8_0, { recursive: true });
fs.mkdirSync(OUT_DIR_ROOT, { recursive: true });

const TABS = [
  'cover',
  'assumptions',
  'historicals',
  'schedules',
  'projections',
  'valuation',
  'summary',
  'sensitivity',
];

const VIEWPORTS = [
  { name: '1280', width: 1280, height: 900 },
  { name: '390', width: 390, height: 844 },
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function createStaticServer() {
  const root = path.resolve('.');
  return http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://127.0.0.1');
    let reqPath = parsedUrl.pathname;
    if (reqPath === '/api/price') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify({
        symbol: 'DUOL',
        price: 157.85,
        asOf: '2026-09-02',
        isOfficialClose: true,
        intradayPrice: null,
        provider: 'stockanalysis.com',
        retrievedAt: new Date().toISOString(),
        status: 'live_close',
        source: {
          provider: 'stockanalysis.com',
          url: 'https://stockanalysis.com/stocks/duol/history/',
        },
      }));
      return;
    }
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    const filePath = path.join(root, decodeURIComponent(reqPath));
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found: ' + reqPath);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
}

async function captureAll() {
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/index.html`;

  console.log(`[Visual QA] Static server listening at ${baseUrl}`);
  console.log('[Visual QA] Launching browser for Phase 8 (P8.0) captures...');

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
  });

  const consoleErrors = [];

  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n[Visual QA] Capturing Viewport: ${vp.width}x${vp.height} (${vp.name}px)...`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await context.newPage();

      page.on('pageerror', (err) => {
        console.error(`[Page Error] ${err.message}`);
        consoleErrors.push(err.message);
      });

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          console.error(`[Console Error] ${msg.text()}`);
          consoleErrors.push(msg.text());
        }
      });

      await page.goto(baseUrl, { waitUntil: 'load' });
      await page.waitForTimeout(1200);

      for (const tab of TABS) {
        const tabButton = await page.$(`button[data-tab-link="${tab}"]`);
        if (tabButton) {
          await tabButton.click();
          await page.waitForTimeout(500);
        } else {
          await page.evaluate((t) => {
            const btn = document.querySelector(`[data-tab-link="${t}"]`);
            if (btn) btn.click();
          }, tab);
          await page.waitForTimeout(500);
        }

        const outPathP8_0 = path.join(OUT_DIR_P8_0, `${tab}_${vp.name}.png`);
        const outPathRoot = path.join(OUT_DIR_ROOT, `${tab}_${vp.name}.png`);
        await page.screenshot({ path: outPathP8_0, fullPage: false });
        fs.copyFileSync(outPathP8_0, outPathRoot);

        const stats = fs.statSync(outPathP8_0);
        const sizeKb = (stats.size / 1024).toFixed(1);
        console.log(`  ✓ Saved: ${tab}_${vp.name}.png (${sizeKb} KB)`);

        if (stats.size < 10 * 1024) {
          throw new Error(`Screenshot ${tab}_${vp.name}.png is too small (${sizeKb} KB < 10 KB)`);
        }

        // For valuation tab: also capture with defense rows expanded
        if (tab === 'valuation') {
          await page.evaluate(() => {
            const details = document.querySelectorAll('#thesis-defense-panel details');
            details.forEach((d) => (d.open = true));
          });
          await page.waitForTimeout(300);

          const expandedP8_0 = path.join(OUT_DIR_P8_0, `valuation_defense_expanded_${vp.name}.png`);
          const expandedRoot = path.join(OUT_DIR_ROOT, `valuation_defense_expanded_${vp.name}.png`);
          await page.screenshot({ path: expandedP8_0, fullPage: false });
          fs.copyFileSync(expandedP8_0, expandedRoot);

          const expStats = fs.statSync(expandedP8_0);
          const expSizeKb = (expStats.size / 1024).toFixed(1);
          console.log(`  ✓ Saved: valuation_defense_expanded_${vp.name}.png (${expSizeKb} KB)`);

          // Reset rows back to collapsed
          await page.evaluate(() => {
            const details = document.querySelectorAll('#thesis-defense-panel details');
            details.forEach((d) => (d.open = false));
          });
          await page.waitForTimeout(100);
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (consoleErrors.length > 0) {
    throw new Error(`Captured with ${consoleErrors.length} console errors: ${consoleErrors.join('; ')}`);
  }

  console.log(`\n[Visual QA] Successfully generated all screenshots in ${OUT_DIR_P8_0} and ${OUT_DIR_ROOT}!`);
}

captureAll().catch((err) => {
  console.error('[Visual QA] FATAL ERROR:', err);
  process.exit(1);
});
