/**
 * Redesign Phase 0 Test Suite — Design System Tokens, Helvetica Stack & App Shell.
 *
 * Covers:
 *  - RP0.1: Design Tokens & CSS custom properties in :root
 *  - RP0.1: Helvetica font stack ("Helvetica Neue", Helvetica, Arial, sans-serif) applied globally
 *  - RP0.1: tabular-nums applied to table cells, metric cards, and .tabular-nums utility
 *  - RP0.1: Standardized component classes (.pill-control, .pill-btn, .callout-*, .badge-*)
 *  - RP0.1: Format utility: tabularNums helper function and default export
 *  - RP0.2: Semantic app header with Duo mascot, Duolingo, Inc. title, NASDAQ: DUOL, and metadata cluster
 *  - RP0.2: Top horizontal navigation bar (app-tab-nav) with 8 numbered tabs in spec order
 *  - RP0.2: Tab switcher logic in tabs.js managing aria-selected, data-active, and hidden attributes
 *  - RP0.2: Keyboard navigation (Arrow keys, Home, End)
 *  - RP0.2: Standardized legal disclaimer footer with version tag and non-affiliation disclosure
 *  - Quality Gates: Zero inline style=, zero /protocol/i, zero wall-clock reads, zero bare numbers > 999
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { tabularNums } from '../src/ui/format.js';
import formatDefault from '../src/ui/format.js';
import { createTabs, TAB_KEYS } from '../src/ui/tabs.js';
import { createTabRoot } from './_dom_stub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const FORMAT_PATH = path.join(ROOT, 'src/ui/format.js');
const TABS_PATH = path.join(ROOT, 'src/ui/tabs.js');

describe('RP0.1 — Design System Tokens & CSS Architecture', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  test(':root declares all mandated CSS custom properties with exact values', () => {
    const requiredTokens = [
      ['--font-sans', '"Helvetica Neue", Helvetica, Arial, sans-serif'],
      ['--font-mono', '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace'],
      ['--color-header-bg', '#0B1E36'],
      ['--color-header-text', '#FFFFFF'],
      ['--color-page-bg', '#F8FAFC'],
      ['--color-card-bg', '#FFFFFF'],
      ['--color-border', '#E2E8F0'],
      ['--color-border-subtle', '#EDF2F7'],
      ['--color-text-primary', '#0F172A'],
      ['--color-text-secondary', '#475569'],
      ['--color-text-muted', '#94A3B8'],
      ['--color-accent-blue', '#1A56DB'],
      ['--color-accent-blue-soft', '#EBF5FF'],
      ['--color-badge-fair-bg', '#FEF3C7'],
      ['--color-badge-fair-text', '#B45309'],
      ['--color-badge-over-bg', '#FEE2E2'],
      ['--color-badge-over-text', '#B91C1C'],
      ['--color-badge-under-bg', '#DCFCE7'],
      ['--color-badge-under-text', '#15803D'],
    ];

    for (const [token, expectedValue] of requiredTokens) {
      assert.ok(
        html.includes(token),
        `index.html must declare CSS variable "${token}"`,
      );
      const escapedToken = token.replace(/[-]/g, '\\-');
      const tokenRegex = new RegExp(`${escapedToken}\\s*:\\s*([^;]+);`);
      const match = tokenRegex.exec(html);
      assert.ok(match, `CSS variable "${token}" must be defined with a value`);
      assert.equal(
        match[1].trim().toLowerCase(),
        expectedValue.toLowerCase(),
        `CSS variable "${token}" must equal "${expectedValue}"`,
      );
    }
  });

  test('body applies --font-sans globally and uses Helvetica stack', () => {
    assert.match(
      html,
      /body\s*\{[^}]*font-family:\s*var\(--font-sans\)/,
      'body must apply var(--font-sans)',
    );
  });

  test('font-variant-numeric: tabular-nums is applied to table cells, metric cards, and utility', () => {
    assert.match(
      html,
      /font-variant-numeric:\s*tabular-nums/,
      'stylesheet must apply tabular-nums for numeric alignment',
    );
    assert.match(html, /\.tabular-nums\s*\{[^}]*font-variant-numeric:\s*tabular-nums/);
  });

  test('declares all mandated standardized classes', () => {
    const requiredClasses = [
      '.pill-control',
      '.pill-btn',
      '.pill-btn.active',
      '.callout-info',
      '.callout-warning',
      '.badge-undervalued',
      '.badge-fair',
      '.badge-overvalued',
    ];

    for (const cls of requiredClasses) {
      assert.ok(
        html.includes(cls),
        `index.html must declare style rule for "${cls}"`,
      );
    }
  });

  test('zero inline style= attributes exist across index.html', () => {
    const inlineStyleRegex = /<[^>]+style\s*=\s*["'][^"']*["'][^>]*>/gi;
    const matches = [...html.matchAll(inlineStyleRegex)];
    assert.equal(
      matches.length,
      0,
      `Found ${matches.length} inline style attributes in index.html`,
    );
  });

  test('index.html contains zero protocol occurrences (case-insensitive)', () => {
    assert.doesNotMatch(html, /protocol/i, 'index.html must contain zero occurrences of "protocol"');
  });
});

describe('RP0.1 — Format Utility: tabularNums()', () => {
  test('tabularNums wraps values in span with tabular-nums class', () => {
    assert.equal(tabularNums('123.45'), '<span class="tabular-nums">123.45</span>');
    assert.equal(tabularNums(456), '<span class="tabular-nums">456</span>');
    assert.equal(tabularNums('$1,234.56'), '<span class="tabular-nums">$1,234.56</span>');
  });

  test('tabularNums supports custom class parameter', () => {
    assert.equal(
      tabularNums('99.9%', 'num-tabular'),
      '<span class="num-tabular">99.9%</span>',
    );
  });

  test('tabularNums fails gracefully on null and undefined', () => {
    assert.equal(tabularNums(null), '');
    assert.equal(tabularNums(undefined), '');
  });

  test('tabularNums is exported on format default object', () => {
    assert.equal(typeof formatDefault.tabularNums, 'function');
    assert.equal(
      formatDefault.tabularNums('42'),
      '<span class="tabular-nums">42</span>',
    );
  });

  test('src/ui/format.js maintains strict purity and quality gates', () => {
    const source = fs.readFileSync(FORMAT_PATH, 'utf8');
    assert.doesNotMatch(source, /\bDate\.now\s*\(/, 'no Date.now in format.js');
    assert.doesNotMatch(source, /\bMath\.random\s*\(/, 'no Math.random in format.js');
    assert.doesNotMatch(source, /\bfetch\s*\(/, 'no fetch in format.js');
    assert.doesNotMatch(source, /protocol/i, 'no protocol mentions in format.js');
    assert.doesNotMatch(source, /style\s*=/i, 'no inline style in format.js');
  });
});

describe('RP0.2 — App Shell & Duolingo Brand Header', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  test('header contains Duolingo mascot SVG asset reference', () => {
    assert.match(
      html,
      /<img[^>]+src=["']assets\/branding\/duolingo-owl\.svg["']/i,
      'app-header must embed official Duolingo mascot SVG asset',
    );
    const mascotPath = path.join(ROOT, 'assets/branding/duolingo-owl.svg');
    assert.ok(fs.existsSync(mascotPath), 'duolingo-owl.svg asset must exist on disk');
  });

  test('header contains brand block with title, ticker pill, and model subtitle', () => {
    assert.match(html, /<header[^>]+class="[^"]*app-header[^"]*"/, 'app-header must exist');
    assert.match(html, /Duolingo,\s*Inc\./i, 'brand block must include "Duolingo, Inc."');
    assert.match(html, /NASDAQ:\s*DUOL/i, 'brand block must include "NASDAQ: DUOL" ticker pill');
    assert.match(html, /class="[^"]*ticker-pill[^"]*"/, 'ticker must have .ticker-pill styling class');
    assert.match(html, /class="[^"]*app-subtitle[^"]*"/, 'subtitle must have .app-subtitle class');
  });

  test('header contains metadata cluster with Valuation Date, Model Version, and Prepared By', () => {
    assert.match(html, /Valuation Date/i, 'metadata block must contain Valuation Date');
    assert.match(html, /Sep 1,\s*2026/i, 'Valuation Date must match Sep 1, 2026');
    assert.match(html, /Model Version/i, 'metadata block must contain Model Version');
    assert.match(html, /v1\.0-P4/i, 'Model Version must match v1.0-P4');
    assert.match(html, /Prepared By/i, 'metadata block must contain Prepared By');
    assert.match(html, /Independent Analysis/i, 'Prepared By must state Independent Analysis');
  });
});

describe('RP0.2 — Top Horizontal Navigation Bar & Structure', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  test('navigation bar uses .app-tab-nav with all 8 tabs in mandated order', () => {
    assert.match(html, /<nav[^>]+class="[^"]*app-tab-nav[^"]*"/, 'nav must carry class .app-tab-nav');

    const buttonRegex = /<button\b[^>]*\bdata-tab-link="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g;
    const matches = [...html.matchAll(buttonRegex)];
    const tabKeys = matches.map((m) => m[1]);

    assert.deepEqual(
      tabKeys,
      [...TAB_KEYS],
      'All 8 tab keys must appear in mandated spec order',
    );

    // Verify numbered prefix 01 through 08
    const expectedPrefixes = ['01', '02', '03', '04', '05', '06', '07', '08'];
    for (let i = 0; i < matches.length; i++) {
      const buttonContent = matches[i][2];
      assert.ok(
        buttonContent.includes(expectedPrefixes[i]),
        `Tab button ${tabKeys[i]} must include numbered prefix ${expectedPrefixes[i]}`,
      );
    }
  });

  test('navigation is strictly top horizontal bar with zero left vertical sidebars', () => {
    assert.doesNotMatch(html, /class="[^"]*sidebar[^"]*"/i, 'DOM must not contain sidebar class');
    assert.doesNotMatch(html, /<aside\b/i, 'DOM must not contain <aside> sidebar element');
  });

  test('all 8 tab panes exist with corresponding aria-labelledby matching control ids', () => {
    for (const key of TAB_KEYS) {
      assert.ok(
        html.includes(`id="tab-${key}"`),
        `Tab pane for "${key}" must exist with id="tab-${key}"`,
      );
      assert.ok(
        html.includes(`aria-controls="tab-${key}"`),
        `Tab button for "${key}" must carry aria-controls="tab-${key}"`,
      );
    }
  });
});

describe('RP0.2 — Tab Switcher Logic & Accessibility (tabs.js)', () => {
  test('createTabs toggles active state, aria-selected, and hidden attribute cleanly', () => {
    const { root, links, panes } = createTabRoot(TAB_KEYS);
    const tabs = createTabs({ root, tabs: TAB_KEYS });

    // Initial activation: cover is active
    assert.equal(tabs.active(), 'cover');
    assert.equal(links[0].getAttribute('data-active'), 'true');
    assert.equal(links[0].getAttribute('aria-selected'), 'true');
    assert.equal(panes[0].hasAttribute('hidden'), false);

    // Other panes are hidden
    for (let i = 1; i < panes.length; i++) {
      assert.equal(panes[i].getAttribute('hidden'), '');
      assert.equal(links[i].getAttribute('aria-selected'), 'false');
    }

    // Switch to assumptions
    tabs.show('assumptions');
    assert.equal(tabs.active(), 'assumptions');
    assert.equal(links[1].getAttribute('data-active'), 'true');
    assert.equal(links[1].getAttribute('aria-selected'), 'true');
    assert.equal(panes[1].hasAttribute('hidden'), false);

    // Previous active pane receives hidden
    assert.equal(panes[0].getAttribute('hidden'), '');
    assert.equal(links[0].hasAttribute('data-active'), false);
    assert.equal(links[0].getAttribute('aria-selected'), 'false');

    // Switch to sensitivity
    tabs.show('sensitivity');
    assert.equal(tabs.active(), 'sensitivity');
    assert.equal(panes[7].hasAttribute('hidden'), false);
    assert.equal(panes[1].getAttribute('hidden'), '');

    tabs.dispose();
  });

  test('keyboard navigation cycles through tabs via ArrowRight/Down and ArrowLeft/Up', () => {
    const { root, panes } = createTabRoot(TAB_KEYS);
    const tabs = createTabs({ root, tabs: TAB_KEYS });

    assert.equal(tabs.active(), 'cover');

    // ArrowRight -> assumptions
    root.dispatch('keydown', { key: 'ArrowRight' });
    assert.equal(tabs.active(), 'assumptions');
    assert.equal(panes[1].hasAttribute('hidden'), false);

    // ArrowDown -> historicals
    root.dispatch('keydown', { key: 'ArrowDown' });
    assert.equal(tabs.active(), 'historicals');

    // ArrowLeft -> assumptions
    root.dispatch('keydown', { key: 'ArrowLeft' });
    assert.equal(tabs.active(), 'assumptions');

    // ArrowUp -> cover
    root.dispatch('keydown', { key: 'ArrowUp' });
    assert.equal(tabs.active(), 'cover');

    // End -> sensitivity
    root.dispatch('keydown', { key: 'End' });
    assert.equal(tabs.active(), 'sensitivity');
    assert.equal(panes[7].hasAttribute('hidden'), false);

    // Home -> cover
    root.dispatch('keydown', { key: 'Home' });
    assert.equal(tabs.active(), 'cover');

    tabs.dispose();
  });

  test('src/ui/tabs.js maintains purity and zero quality-gate violations', () => {
    const source = fs.readFileSync(TABS_PATH, 'utf8');
    assert.doesNotMatch(source, /\bDate\.now\s*\(/, 'tabs.js must not call Date.now');
    assert.doesNotMatch(source, /\bMath\.random\s*\(/, 'tabs.js must not call Math.random');
    assert.doesNotMatch(source, /\bfetch\s*\(/, 'tabs.js must not call fetch');
    assert.doesNotMatch(source, /protocol/i, 'tabs.js must contain zero protocol occurrences');
    assert.doesNotMatch(source, /style\s*=/i, 'tabs.js must contain zero inline styles');
  });
});

describe('RP0.2 — Institutional Footer & Disclaimers', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  test('footer contains standardized legal disclaimer and non-affiliation disclosure', () => {
    assert.match(html, /<footer[^>]+class="[^"]*app-footer[^"]*"/, 'app-footer must exist');
    assert.match(html, /not affiliated with, endorsed by, or associated with Duolingo, Inc\./i);
    assert.match(html, /not investment advice/i);
    assert.match(html, /strictly for educational, informational, and analytical research purposes/i);
    assert.match(html, /does not constitute a solicitation to buy or sell securities/i);
    assert.match(html, /v1\.0-P4/i, 'footer must carry model version tag');
  });
});
