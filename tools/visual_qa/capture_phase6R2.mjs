/**
 * Visual QA Screenshot Capture Script for Phase 5.6.
 *
 * Captures 16 versioned PNG screenshots into docs/screenshots/phase_6R2/v1/:
 *  - 8 tabs × 1280px Desktop: cover_1280, assumptions_1280, historicals_1280, schedules_1280, projections_1280, valuation_1280, summary_1280, sensitivity_1280
 *  - 8 tabs × 390px Mobile: cover_390, assumptions_390, historicals_390, schedules_390, projections_390, valuation_390, summary_390, sensitivity_390
 *
 * Requirements:
 *  - Each PNG must exist and be > 10KB
 *  - Zero console errors or unhandled exceptions
 *  - Clean rendering across all tabs
 *
 * Usage: node tools/visual_qa/capture_phase5.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import http from 'http';

const OUT_DIR = path.resolve('docs/screenshots/phase_6R2/v1');
fs.mkdirSync(OUT_DIR, { recursive: true });

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
  console.log('[Visual QA] Launching browser for Phase 5.6 captures...');

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
      // Wait for initial model calculation and Tabulator rendering
      await page.waitForTimeout(1200);

      for (const tab of TABS) {
        const tabButton = await page.$(`button[data-tab-link="${tab}"]`);
        if (tabButton) {
          await tabButton.click();
          await page.waitForTimeout(500);
        } else {
          console.warn(`[Visual QA] Button for tab "${tab}" not found, trying jump link`);
          await page.evaluate((t) => {
            const btn = document.querySelector(`[data-tab-link="${t}"]`);
            if (btn) btn.click();
          }, tab);
          await page.waitForTimeout(500);
        }

        const outPath = path.join(OUT_DIR, `${tab}_${vp.name}.png`);
        await page.screenshot({ path: outPath, fullPage: false });

        const stats = fs.statSync(outPath);
        const sizeKb = (stats.size / 1024).toFixed(1);
        console.log(`  ✓ Saved: ${tab}_${vp.name}.png (${sizeKb} KB)`);

        if (stats.size < 10 * 1024) {
          throw new Error(`Screenshot ${tab}_${vp.name}.png is too small (${sizeKb} KB < 10 KB)`);
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

  console.log(`\n[Visual QA] Successfully generated all 16 screenshots in ${OUT_DIR}!`);
}

captureAll().catch((err) => {
  console.error('[Visual QA] FATAL ERROR:', err);
  process.exit(1);
});
