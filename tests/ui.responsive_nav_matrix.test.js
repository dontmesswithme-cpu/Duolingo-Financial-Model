/**
 * F-UI-4 + F-UI-5 — Mobile nav readability and sensitivity matrix usability.
 *
 * Source-level invariants (headless): the CSS/HTML/JS affordances that make
 * the 390px experience usable must remain present so a future edit cannot
 * silently reintroduce truncation or clipping by omission.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSensitivityMatrix, buildSensitivityMatrix } from '../src/ui/sensitivityTab.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');

describe('F-UI-4 — Mobile top-nav stays readable without page overflow', () => {
  test('nav keeps full labels with title and aria-label provenance', () => {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');
    for (const label of [
      'Cover &amp; TOC', 'Assumptions / Drivers', 'Historicals', 'Supporting Schedules',
      'Projections (3-Statement)', 'Valuation', 'Summary / Output', 'Sensitivity / Scenarios',
    ]) {
      assert.ok(html.includes(`title="`) && html.includes(label), `nav must carry title with "${label}"`);
    }
    const ariaLabels = [...html.matchAll(/<button[^>]*data-tab-link="[^"]+"[^>]*aria-label="([^"]+)"[^>]*>/g)];
    assert.equal(ariaLabels.length, 8, 'all 8 tab buttons must carry explicit aria-labels');
  });

  test('mobile CSS gives tabs a readable minimum width and removes ellipsis truncation', () => {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');
    assert.match(html, /@media\s*\(max-width:\s*768px\)/, 'mobile breakpoint must exist');
    assert.match(html, /min-width:\s*132px/, 'mobile tabs must keep a readable minimum width');
    assert.match(html, /text-overflow:\s*clip/, 'mobile labels must not ellipsis-truncate');
  });

  test('visible scroll affordance exists for the nav', () => {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');
    assert.match(html, /class="nav-scroll-hint"/, 'nav scroll hint element must exist');
    assert.match(html, /Scroll horizontally to reach all 8 sections/, 'hint must name all 8 sections');
  });

  test('tabs.js keeps the active tab scrolled into view', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/ui/tabs.js'), 'utf8');
    assert.match(source, /scrollIntoView/, 'tab activation must scroll the active link into view');
  });
});

describe('F-UI-5 — Sensitivity matrix usable on mobile', () => {
  test('matrix render includes scroll hint and keyboard-focusable scroll region', () => {
    const grid = {
      waccValues: [0.09, 0.095, 0.10, 0.105, 0.11, 0.115, 0.12, 0.125, 0.13],
      growthValues: [0.015, 0.02, 0.025, 0.03, 0.035],
      base: { wacc: 0.11, growth: 0.025 },
      matrix: Object.fromEntries(
        [0.09, 0.095, 0.10, 0.105, 0.11, 0.115, 0.12, 0.125, 0.13].map((w, wi) => [
          w,
          Object.fromEntries([0.015, 0.02, 0.025, 0.03, 0.035].map((g, gi) => [g, { perShare: 200 - wi * 10 + gi * 100 }])),
        ]),
      ),
      axisNarrowed: false,
    };
    const model = buildSensitivityMatrix(grid);
    const html = renderSensitivityMatrix(model);
    assert.match(html, /class="matrix-scroll-hint"/, 'matrix must render a visible scroll hint');
    assert.match(html, /1\.5% through 3\.5%/, 'hint must name the full g range');
    assert.match(html, /class="matrix-table-scroll"[^>]*tabindex="0"/, 'scroll container must be keyboard-focusable');
    assert.match(html, /role="region"/, 'scroll container must expose role=region');
    assert.match(html, /aria-label="[^"]*scroll horizontally[^"]*"/i, 'scroll container must label the horizontal scroll');
  });

  test('first column is sticky via CSS so rows stay identifiable while scrolling', () => {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');
    assert.match(html, /\.matrix-wacc-label\s*\{[^}]*position:\s*sticky[^}]*left:\s*0/s, '.matrix-wacc-label must stick left');
    assert.match(html, /\.matrix-corner\s*\{[^}]*position:\s*sticky[^}]*left:\s*0/s, '.matrix-corner must stick left');
    assert.match(html, /\.matrix-scroll-hint\s*\{/, 'scroll-hint styling must exist');
    assert.match(html, /\.matrix-table-scroll:focus-visible/, 'scroll region must show keyboard focus');
  });
});
