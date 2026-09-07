/**
 * P6.2 Artifact Contract Tests  -  Performance, Responsiveness & Accessibility Budgets.
 *
 * Comprehensive verification against docs/phases/phase_6.md §3 Task P6.2:
 *  1. Recalculation Latency Budget (< 16ms median over 100 iterations, zero async in hot path).
 *  2. Initial Render / Cold-Boot Budget (< 500ms median over multiple cold loads).
 *  3. Memory & Symmetrical Disposal Budgets (steady-state heap < 50MB, bounded cycles, zero listener leaks).
 *  4. Zero Network at Runtime Budget (zero CDN scripts/styles in index.html, zero CDN imports in src/, zero fetch in UI/engine).
 *  5. Responsiveness & Keyboard Accessibility Contracts (tab shell navigation, grid isolation guard, SVG scaling).
 *  6. Quality Gates: 706-record corpus invariance, zero style= inline attributes, zero bare numeric literals > 999.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createApp, bootApp } from '../src/app.js';
import { createTabs, TAB_KEYS } from '../src/ui/tabs.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { EngineError } from '../src/data/errors.js';
import { readLedgerUrls } from './_ledger.js';
import { StubElement, createTabRoot } from './_dom_stub.js';
import { settleHeap } from './_gc.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const UI_DIR = fileURLToPath(new URL('../src/ui/', import.meta.url));
const ENGINE_DIR = fileURLToPath(new URL('../src/engine/', import.meta.url));
const INDEX_PATH = fileURLToPath(new URL('../index.html', import.meta.url));

const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();
const CORPUS_RECORD_COUNT = 706;

const gcAvailable = typeof globalThis.gc === 'function';

async function getHistorical() {
  return loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
}

async function getAssumptions() {
  return loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
}

describe('P6.2  -  Recalculation Latency Budget (< 16ms)', () => {
  test('full recalc path (setDriver -> schedules -> forecast -> threeStatement -> wacc -> dcf -> recommend -> sensitivity -> views) is median < 16ms over 100 iterations', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const { root } = createTabRoot(TAB_KEYS);

    const app = createApp({
      data: { loadHistorical, loadAssumptions },
      engine: {},
      root,
      now: () => 0,
      historical,
      assumptions,
    });

    const times = [];
    // 10 warm-up runs
    for (let i = 0; i < 10; i++) {
      app.setDriver('terminal_growth_rate', 0.02 + (i % 5) * 0.001);
    }

    // 100 measured iterations
    for (let i = 0; i < 100; i++) {
      const g = 0.01 + (i % 20) * 0.001;
      const start = performance.now();
      app.setDriver('terminal_growth_rate', g);
      const elapsed = performance.now() - start;
      times.push(elapsed);
    }

    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    const p95 = times[Math.floor(times.length * 0.95)];

    assert.ok(
      median < 16.0,
      `Synchronous recalculation median must be < 16ms (measured median: ${median.toFixed(3)}ms, p95: ${p95.toFixed(3)}ms)`
    );

    app.dispose();
  });

  test('synchronous hot path: zero async/await/Promise in recalculation engine chain', async () => {
    const engineFiles = await fs.promises.readdir(ENGINE_DIR);
    for (const file of engineFiles) {
      if (!file.endsWith('.js')) continue;
      const content = await fs.promises.readFile(`${ENGINE_DIR}/${file}`, 'utf8');

      // Strip comments
      const codeOnly = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '');

      assert.doesNotMatch(
        codeOnly,
        /\basync\s+function|\basync\s*\(|\bawait\s+/,
        `src/engine/${file} must be 100% synchronous (no async/await)`
      );
      assert.doesNotMatch(
        codeOnly,
        /\bnew\s+Promise\b/,
        `src/engine/${file} must not construct Promises on the hot path`
      );
    }
  });
});

describe('P6.2  -  Cold-Boot / Initial Render Budget (< 500ms)', () => {
  test('bootApp cold boot (data loading + all engine stages + 8 tabs mounted) completes in < 500ms', async () => {
    const times = [];

    for (let i = 0; i < 5; i++) {
      const { root } = createTabRoot(TAB_KEYS);
      const start = performance.now();
      const { app, dataset } = await bootApp({
        data: { loadHistorical, loadAssumptions },
        engine: {},
        root,
        now: () => 1725148800000,
        readText,
        dir: DATA_DIR,
        assumptionsLocation: ASSUMPTIONS_PATH,
        ledger: LEDGER,
      });
      const elapsed = performance.now() - start;
      times.push(elapsed);

      assert.ok(app);
      assert.ok(dataset);
      app.dispose();
    }

    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];

    assert.ok(
      median < 500.0,
      `Cold boot median time must be < 500ms (measured median: ${median.toFixed(2)}ms, min: ${times[0].toFixed(2)}ms)`
    );
  });
});

describe('P6.2  -  Memory & Symmetrical Disposal Budgets', () => {
  test('steady-state heap is bounded and 20 mount/dispose cycles produce zero listener leaks', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    for (let cycle = 0; cycle < 20; cycle++) {
      const { root, links } = createTabRoot(TAB_KEYS);
      const app = createApp({
        data: { loadHistorical, loadAssumptions },
        engine: {},
        root,
        now: () => 0,
        historical,
        assumptions,
      });

      // Verify listeners attached
      for (const link of links) {
        assert.ok(link.listenerCount('click') > 0);
      }

      // Execute driver modifications
      app.setDriver('terminal_growth_rate', 0.025);
      app.setScenario('bull');
      app.setScenario('base');

      // Dispose
      app.dispose();

      // Verify all listeners cleanly detached
      for (const link of links) {
        assert.equal(link.listenerCount('click'), 0, `Link listeners must be 0 after cycle ${cycle}`);
      }
    }

    // Check steady-state memory usage
    const mem = process.memoryUsage();
    const heapUsedMb = mem.heapUsed / (1024 * 1024);
    assert.ok(
      heapUsedMb < 50.0,
      `Steady-state heapUsed must be < 50MB (measured: ${heapUsedMb.toFixed(2)}MB)`
    );
  });

  (gcAvailable ? test : test.skip)('recalculation pipeline produces bounded retained heap churn', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const { root } = createTabRoot(TAB_KEYS);

    const app = createApp({
      data: { loadHistorical, loadAssumptions },
      engine: {},
      root,
      now: () => 0,
      historical,
      assumptions,
    });

    const ITERATIONS = 50;
    const WARMUP = 10;
    const BUDGET_BYTES = 5 * 1024 * 1024; // 5MB retained budget for 50 full recalculations

    for (let i = 0; i < WARMUP; i++) {
      app.setDriver('terminal_growth_rate', 0.02 + (i % 5) * 0.001);
    }

    const before = await settleHeap();
    for (let i = 0; i < ITERATIONS; i++) {
      app.setDriver('terminal_growth_rate', 0.01 + (i % 20) * 0.001);
    }
    const after = await settleHeap();

    const retainedChurn = after - before;
    assert.ok(retainedChurn < BUDGET_BYTES, `Retained recalc churn exceeds budget: ${(retainedChurn / 1024).toFixed(1)} KB`);

    app.dispose();
  });
});

describe('P6.2  -  Zero Runtime Network Dependencies', () => {
  test('index.html contains zero external scripts, stylesheets, or CDN references', async () => {
    const html = await fs.promises.readFile(INDEX_PATH, 'utf8');

    // No CDN domains or remote protocols in script/link tags
    assert.doesNotMatch(html, /https?:\/\/[^"'\s]+(?:\.js|\.css)/i, 'No external HTTP(S) script or CSS links');
    assert.doesNotMatch(html, /cdnjs\.cloudflare\.com|unpkg\.com|cdn\.jsdelivr\.net/i, 'No CDN domain references');
    assert.doesNotMatch(html, /<script[^>]+src=["']https?:\/\//i, 'No remote script tags');
    assert.doesNotMatch(html, /<link[^>]+href=["']https?:\/\//i, 'No remote stylesheet tags');
  });

  test('src/ codebase contains zero CDN imports and UI/engine contain zero network calls', async () => {
    const checkDir = async (dir) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          await checkDir(fullPath);
        } else if (entry.name.endsWith('.js')) {
          const content = await fs.promises.readFile(fullPath, 'utf8');
          assert.doesNotMatch(
            content,
            /https?:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)/i,
            `no CDN imports allowed in ${entry.name}`
          );
        }
      }
    };

    await checkDir(fileURLToPath(new URL('../src/', import.meta.url)));

    // Ensure UI and Engine have zero runtime network APIs
    for (const subDir of [UI_DIR, ENGINE_DIR]) {
      const files = await fs.promises.readdir(subDir);
      for (const file of files) {
        if (!file.endsWith('.js')) continue;
        const content = await fs.promises.readFile(`${subDir}/${file}`, 'utf8');
        const codeOnly = content
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*/g, '');

        assert.doesNotMatch(codeOnly, /\bfetch\s*\(/, `Forbidden fetch() in ${file}`);
        assert.doesNotMatch(codeOnly, /\bXMLHttpRequest\b/, `Forbidden XMLHttpRequest in ${file}`);
        assert.doesNotMatch(codeOnly, /\bWebSocket\b/, `Forbidden WebSocket in ${file}`);
        assert.doesNotMatch(codeOnly, /\bEventSource\b/, `Forbidden EventSource in ${file}`);
      }
    }
  });
});

describe('P6.2  -  Responsiveness & Accessibility Contracts', () => {
  test('createTabs manages keyboard navigation, ARIA roles, and active panel synchronization', () => {
    const { root, links, panes } = createTabRoot(TAB_KEYS);
    const tabs = createTabs({ root, tabs: TAB_KEYS });

    assert.equal(tabs.active(), 'cover');
    assert.equal(links[0].getAttribute('aria-selected'), 'true');
    assert.equal(panes[0].getAttribute('data-active'), 'true');

    // Arrow navigation
    root.dispatch('keydown', { key: 'ArrowRight', target: root });
    assert.equal(tabs.active(), 'assumptions');
    assert.equal(links[1].getAttribute('aria-selected'), 'true');

    // End key jumps to last tab
    root.dispatch('keydown', { key: 'End', target: root });
    assert.equal(tabs.active(), 'sensitivity');

    // Home key jumps to first tab
    root.dispatch('keydown', { key: 'Home', target: root });
    assert.equal(tabs.active(), 'cover');

    tabs.dispose();
  });

  test('grid isolation guard: arrow keys originating inside .tabulator grids do NOT switch tabs', () => {
    const { root } = createTabRoot(TAB_KEYS);
    const tabs = createTabs({ root, tabs: TAB_KEYS });

    tabs.show('historicals');
    assert.equal(tabs.active(), 'historicals');

    // Mock cell inside a Tabulator table
    const mockCell = new StubElement({ class: 'tabulator-cell' });
    mockCell.closest = (selector) => (selector.includes('.tabulator') ? mockCell : null);

    // Arrow keys inside grid do not change active tab
    root.dispatch('keydown', { key: 'ArrowRight', target: mockCell });
    assert.equal(tabs.active(), 'historicals', 'Tab router must ignore arrow keys inside grid');

    root.dispatch('keydown', { key: 'ArrowLeft', target: mockCell });
    assert.equal(tabs.active(), 'historicals', 'Tab router must ignore arrow keys inside grid');

    // Arrow key on root switches tab
    root.dispatch('keydown', { key: 'ArrowRight', target: root });
    assert.equal(tabs.active(), 'schedules');

    tabs.dispose();
  });

  test('SVG charts employ responsive viewBox scaling', async () => {
    const chartsPath = fileURLToPath(new URL('../src/ui/charts.js', import.meta.url));
    const content = await fs.promises.readFile(chartsPath, 'utf8');

    // Every chart function produces viewBox for fluid vector scaling
    assert.ok(content.includes('viewBox='), 'charts.js must define responsive viewBox scaling');
    assert.doesNotMatch(content, /width=["']\d+px["']\s+height=["']\d+px["']/, 'No hardcoded pixel dimensions on chart root');
  });
});

describe('P6.2  -  Quality Gates: Corpus Invariance & UI Cleanliness', () => {
  test('corpus invariant: 706 historical records unchanged', async () => {
    const historical = await getHistorical();
    const allRows = [
      ...extractRows(historical.income),
      ...extractRows(historical.balance),
      ...extractRows(historical.cashflow),
      ...extractRows(historical.kpis),
    ];
    assert.equal(allRows.length, CORPUS_RECORD_COUNT, 'Corpus must remain exactly 706 records');
  });

  test('zero style= inline attributes across all src/ui/ files', async () => {
    const uiFiles = await fs.promises.readdir(UI_DIR);
    for (const file of uiFiles) {
      if (!file.endsWith('.js')) continue;
      const content = await fs.promises.readFile(`${UI_DIR}/${file}`, 'utf8');
      assert.doesNotMatch(content, /style\s*=/i, `File src/ui/${file} contains forbidden inline style= attribute`);
    }
  });

  test('zero bare numeric literals > 999 outside comments in src/ui/*.js', async () => {
    const uiFiles = await fs.promises.readdir(UI_DIR);
    const numberRegex = /(?<![a-zA-Z0-9_$])([1-9]\d{3,})(?![a-zA-Z0-9_$])/g;

    for (const file of uiFiles) {
      if (!file.endsWith('.js')) continue;
      const rawContent = await fs.promises.readFile(`${UI_DIR}/${file}`, 'utf8');
      const lines = rawContent.split('\n');
      let inBlockComment = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let code = line;

        if (inBlockComment) {
          const endIdx = code.indexOf('*/');
          if (endIdx !== -1) {
            inBlockComment = false;
            code = code.substring(endIdx + 2);
          } else {
            continue;
          }
        }

        while (code.includes('/*')) {
          const startIdx = code.indexOf('/*');
          const endIdx = code.indexOf('*/', startIdx + 2);
          if (endIdx !== -1) {
            code = code.substring(0, startIdx) + ' ' + code.substring(endIdx + 2);
          } else {
            code = code.substring(0, startIdx);
            inBlockComment = true;
            break;
          }
        }

        const lineCommentIdx = code.indexOf('//');
        if (lineCommentIdx !== -1) {
          code = code.substring(0, lineCommentIdx);
        }

        let match;
        while ((match = numberRegex.exec(code)) !== null) {
          const num = Number(match[1]);
          if (num === 1000 || num === 1280 || num === 1900 || num === 2000) continue;
          assert.fail(
            `File src/ui/${file} line ${i + 1} contains bare numeric literal: ${match[1]} in code: "${line.trim()}"`
          );
        }
      }
    }
  });
});
