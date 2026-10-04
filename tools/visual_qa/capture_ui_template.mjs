// Universal UI / Web screenshot capture template using Playwright
// Usage: node tools/visual_qa/capture_ui_template.mjs

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.APP_URL || 'http://127.0.0.1:3000';
const OUT_DIR = path.resolve(process.env.SCREENSHOT_DIR || 'docs/screenshots/phase_1/v1');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function captureRoute(name, routePath, options = {}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}${routePath}`, { waitUntil: 'networkidle', timeout: 15000 });
    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 5000 });
    }
    if (options.delay) {
      await page.waitForTimeout(options.delay);
    }
    const screenshotPath = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: options.fullPage || false });
    console.log(`[Visual QA] Captured: ${screenshotPath}`);
  } catch (err) {
    console.error(`[Visual QA] Failed to capture ${name}:`, err.message);
  } finally {
    await browser.close();
  }
}

// Example captures
async function run() {
  console.log(`Starting visual captures for ${BASE_URL}...`);
  await captureRoute('01_dashboard_desktop', '/', { delay: 500 });
  await captureRoute('02_dashboard_mobile', '/', { viewport: { width: 390, height: 844 }, delay: 500 });
  console.log('Visual captures completed.');
}

run();
