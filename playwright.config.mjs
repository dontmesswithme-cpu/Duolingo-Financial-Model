import { defineConfig, devices } from '@playwright/test';

/**
 * P10.6 — Chromium configuration.
 *
 * OP finding F1: the prior submission declared the Browser Behavior section
 * unimplemented for lack of a headless-browser dependency. That premise was false:
 * `@playwright/test` and `playwright` are both in devDependencies and installed, and
 * headless Chromium runs in this environment. This config plus `tests/browser/*.spec.mjs`
 * discharges the contract's Chromium gates.
 *
 * The suite runs against a static file server rooted at the ALLOWLISTED artifact
 * (`_pages/`), not the repo root, so the pages actually exercised are the ones that
 * ship — the same set the Pages allowlist gate enforces.
 */
export default defineConfig({
  testDir: './tests/browser',
  // The browser boots a real page and a real module graph; give it room.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Serves the built static artifact. `tools/build_pages_artifact.mjs` is the
    // allowlist gate; running it here means the browser tests cannot accidentally
    // pass against files that would never be published.
    command: 'node tools/build_pages_artifact.mjs && node tools/serve_pages.mjs',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
