/**
 * Redesign Phase TYPE Test Suite — Font Size Hierarchy Correction (Max 20px).
 *
 * Covers:
 *  - RTYPE.2: Canonical token scale in :root (8 --text-* tokens, max 20px, 3 --leading-* tokens)
 *  - RTYPE.2: Font family preservation (--font-sans, --font-mono untouched)
 *  - RTYPE.3: Size-only migration: all font-size declarations rewired to var(--text-*)
 *  - RTYPE.3: Zero px literals in font-size, zero >20px, zero half-pixels
 *  - RTYPE.3: Weight discipline (400, 500, 600, 700 only; 650/900 eliminated)
 *  - RTYPE.3: Line-height discipline (var(--leading-*) or unitless 1/1.1)
 *  - RTYPE.3: Resolution of the 6 duplicate-selector conflicts
 *  - RTYPE.3: Family outlier correction (.gate-ledger-val -> var(--font-mono))
 *  - RTYPE.3: SVG text mapping in src/ui/charts.js (monospace -> var(--font-mono), bold -> 700)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { renderAssumptions } from '../src/ui/assumptionsTab.js';
import { loadAssumptions } from '../src/data/loader.js';
import { formatDisplayText, escapeText } from '../src/ui/format.js';
import { createInteractiveContainer } from './_interactive_container.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const CHARTS_PATH = path.join(ROOT, 'src/ui/charts.js');
const ASSUMPTIONS_TAB_PATH = path.join(ROOT, 'src/ui/assumptionsTab.js');
const ICON_PATH = path.join(ROOT, 'assets/icons/ui/info-circle.svg');
const ASSUMPTIONS_DATA_PATH = path.join(ROOT, 'src/data/assumptions.json');

describe('RTYPE.2 — Canonical Typography Tokens in :root', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(styleMatch, 'index.html must contain a <style> block');
  const css = styleMatch[1];

  test('declares exactly 5 --text-* tokens, capped at 20px', () => {
    const textTokens = [...css.matchAll(/(--text-[a-z0-9]+):\s*([^;]+);/g)];
    assert.equal(textTokens.length, 5, 'must declare exactly 5 --text-* tokens');

    const expectedTokens = {
      '--text-xs': '11px',
      '--text-sm': '12px',
      '--text-base': '13px',
      '--text-lg': '16px',
      '--text-hero': '20px',
    };

    for (const [, name, val] of textTokens) {
      assert.ok(name in expectedTokens, `unexpected token name: ${name}`);
      assert.equal(val.trim(), expectedTokens[name], `token ${name} must equal ${expectedTokens[name]}`);
    }

    assert.equal(css.includes('--text-3xl'), false, '--text-3xl or larger is banned');
  });

  test('declares exactly 3 --leading-* line-height tokens', () => {
    const leadingTokens = [...css.matchAll(/(--leading-[a-z0-9]+):\s*([^;]+);/g)];
    assert.equal(leadingTokens.length, 3, 'must declare exactly 3 --leading-* tokens');

    const expectedLeadings = {
      '--leading-tight': '1.2',
      '--leading-snug': '1.4',
      '--leading-base': '1.5',
    };

    for (const [, name, val] of leadingTokens) {
      assert.ok(name in expectedLeadings, `unexpected leading token: ${name}`);
      assert.equal(val.trim(), expectedLeadings[name], `leading ${name} must equal ${expectedLeadings[name]}`);
    }
  });

  test('font family tokens --font-sans and --font-mono are strictly preserved', () => {
    assert.match(
      css,
      /--font-sans:\s*"Helvetica Neue",\s*Helvetica,\s*Arial,\s*sans-serif;/
    );
    assert.match(
      css,
      /--font-mono:\s*"SFMono-Regular",\s*Menlo,\s*Monaco,\s*Consolas,\s*"Liberation Mono",\s*monospace;/
    );
  });
});

describe('RTYPE.3 — Size-Only Migration & Quality Gates in index.html', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(styleMatch, 'index.html must contain a <style> block');
  const css = styleMatch[1];

  test('every font-size declaration in <style> is a var(--text-*) token (zero px literals)', () => {
    const fontSizeMatches = [...css.matchAll(/font-size:\s*([^;]+);/g)];
    assert.ok(fontSizeMatches.length > 0, 'must have font-size declarations');

    const nonTokens = fontSizeMatches.filter(([, val]) => !val.trim().startsWith('var(--text-'));
    assert.deepEqual(
      nonTokens.map((m) => m[0]),
      [],
      'all font-size declarations must be var(--text-*) references; zero px literals allowed'
    );
  });

  test('zero font-size values > 20px and zero half-pixels', () => {
    const fontSizeMatches = [...css.matchAll(/font-size:\s*([^;]+);/g)];
    for (const [, val] of fontSizeMatches) {
      assert.equal(/px\b/.test(val), false, `no px literal allowed: ${val}`);
      assert.equal(/10\.5|11\.5|12\.5/.test(val), false, `no half-pixel allowed: ${val}`);
    }
  });

  test('weight discipline: font-weight values strictly in {400, 500, 600, 700}, 650 banned', () => {
    const weights = [...css.matchAll(/font-weight:\s*([^;]+);/g)].map(([, val]) => val.trim());
    const allowed = new Set(['400', '500', '600', '700']);
    for (const w of weights) {
      assert.ok(allowed.has(w), `font-weight ${w} is outside allowed set {400, 500, 600, 700}`);
    }
    assert.equal(html.includes('font-weight: 650;'), false, 'font-weight: 650 is banned repo-wide');
    assert.equal(html.includes('font-weight: 900;'), false, 'font-weight: 900 is banned repo-wide');
  });

  test('line-height discipline: every line-height is var(--leading-*) or unitless 1/1.1', () => {
    const lineHeights = [...css.matchAll(/line-height:\s*([^;]+);/g)].map(([, val]) => val.trim());
    const allowedUnitless = new Set(['1', '1.1']);
    for (const lh of lineHeights) {
      if (allowedUnitless.has(lh)) continue;
      assert.ok(
        lh.startsWith('var(--leading-'),
        `line-height ${lh} must be a var(--leading-*) token or unitless 1/1.1`
      );
    }
  });

  test('duplicate selector font conflicts are resolved to exactly one declaration each', () => {
    const selectors = [
      /\.scenario-picker-title\s*\{/,
      /\.driver-group-header\s*\{/,
      /\.app-footer\s*\{/,
      /\.scenario-btn\s*\{/,
      /\.driver-notes\s*\{/,
      /\.driver-label\s*\{/,
    ];
    for (const sel of selectors) {
      const occurrences = [...css.matchAll(new RegExp(sel, 'g'))];
      assert.equal(occurrences.length, 1, `selector ${sel.source} must appear exactly once, got ${occurrences.length}`);
    }
  });

  test('.gate-ledger-val family fixed to var(--font-mono)', () => {
    assert.match(
      css,
      /\.gate-ledger-val\s*\{[^}]*font-family:\s*var\(--font-mono\);/
    );
  });

  test('.tabulator-cell line-height rewired to var(--leading-base)', () => {
    assert.match(
      css,
      /\.tabulator\s+\.tabulator-cell\s*\{[^}]*line-height:\s*var\(--leading-base\);/
    );
  });
});

describe('RTYPE.3 — SVG Chart Typography in src/ui/charts.js', () => {
  const chartsCode = fs.readFileSync(CHARTS_PATH, 'utf8');

  test('zero hardcoded font-family="monospace" in charts.js', () => {
    assert.equal(
      chartsCode.includes('font-family="monospace"'),
      false,
      'monospace must be replaced by var(--font-mono)'
    );
  });

  test('zero font-weight="bold" or "900" in charts.js', () => {
    assert.equal(chartsCode.includes('font-weight="bold"'), false, 'bold must be normalized to 700');
    assert.equal(chartsCode.includes('font-weight="900"'), false, '900 must be normalized to 700');
  });

  test('zero font-size="9", "10", or "15" in charts.js', () => {
    assert.equal(chartsCode.includes('font-size="9"'), false, '9px must be normalized to 11');
    assert.equal(chartsCode.includes('font-size="10"'), false, '10px must be normalized to 11');
    assert.equal(chartsCode.includes('font-size="15"'), false, '15px must be normalized to 16');
  });
});

describe('RTYPE.3 — Scope & Git Invariants', () => {
  test('font-family diff on index.html is exactly one line (.gate-ledger-val fix)', () => {
    const diff = execSync('git diff index.html', { cwd: ROOT, encoding: 'utf8' });
    const addedFamilyLines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++') && l.includes('font-family'));
    const removedFamilyLines = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---') && l.includes('font-family'));

    assert.equal(addedFamilyLines.length, 1, 'exactly 1 added font-family line');
    assert.equal(removedFamilyLines.length, 1, 'exactly 1 removed font-family line');
    assert.match(addedFamilyLines[0], /font-family:\s*var\(--font-mono\);/);
    assert.match(removedFamilyLines[0], /font-family:\s*var\(--font-family-mono,\s*monospace\);/);
  });
});

describe('RTYPE.4 — Tooltip Icon Swap in src/ui/assumptionsTab.js', () => {
  const assumptionsCode = fs.readFileSync(ASSUMPTIONS_TAB_PATH, 'utf8');

  test('zero 24D8, ⓘ, or &#x24D8; literals in src/ui/assumptionsTab.js', () => {
    assert.equal(assumptionsCode.includes('24D8'), false, 'assumptionsTab.js must not contain 24D8');
    assert.equal(assumptionsCode.includes('&#x24D8;'), false, 'assumptionsTab.js must not contain &#x24D8;');
    assert.equal(assumptionsCode.includes('ⓘ'), false, 'assumptionsTab.js must not contain ⓘ');
  });

  test('every .tooltip-btn in rendered output contains the info-circle graphic at 13px box', async () => {
    const assumptions = await loadAssumptions({
      location: ASSUMPTIONS_DATA_PATH,
      readText: (p) => fs.promises.readFile(p, 'utf8'),
    });
    const container = createInteractiveContainer();
    const view = renderAssumptions({ container, assumptions });
    const html = container.innerHTML;

    const btns = [...html.matchAll(/<button[^>]*class="[^"]*tooltip-btn[^"]*"[^>]*>([\s\S]*?)<\/button>/g)];
    assert.equal(btns.length, assumptions.drivers.length, 'must render exactly 1 tooltip button per driver');

    for (const [, innerHtml] of btns) {
      assert.match(innerHtml, /<img[^>]+src="assets\/icons\/ui\/info-circle\.svg"[^>]*\/>/);
      assert.match(innerHtml, /width="13"/);
      assert.match(innerHtml, /height="13"/);
    }
    view.dispose();
  });

  test('aria-label and title still equal the driver note text per row (spot-pin >=3 drivers + empty fallback)', async () => {
    const assumptions = await loadAssumptions({
      location: ASSUMPTIONS_DATA_PATH,
      readText: (p) => fs.promises.readFile(p, 'utf8'),
    });
    const container = createInteractiveContainer();
    const view = renderAssumptions({ container, assumptions });
    const html = container.innerHTML;

    const spotChecks = [
      'paid_subscriber_growth',
      'risk_free_rate',
      'market_share_price',
      'effective_tax_rate',
    ];

    for (const name of spotChecks) {
      const driver = assumptions.get(name);
      assert.ok(driver, `driver ${name} must exist`);
      const rowPattern = new RegExp(
        `<div[^>]*class="[^"]*driver-row[^"]*"[^>]*data-driver-name="${name}"[\\s\\S]*?<button[^>]*class="[^"]*tooltip-btn[^"]*"([\\s\\S]*?)>[\\s\\S]*?<\\/button>`
      );
      const rowMatch = html.match(rowPattern);
      assert.ok(rowMatch, `must find driver row for ${name}`);
      const btnAttrs = rowMatch[1];
      // P10.6: the note is HTML-escaped before it becomes an attribute value, so
      // the assertion compares against the escaped form. Two real driver notes
      // contain markup-significant characters (`beta` has `->`, and
      // `paid_subscriber_fade_floor` has `a < b < c`), which previously reached
      // the attribute raw. The property under test is unchanged — the attribute
      // still carries the driver note, and a browser decodes it back to the
      // exact note text.
      const noteExpected = escapeText(formatDisplayText(driver.notes || driver.label || driver.name));
      assert.ok(btnAttrs.includes(`aria-label="${noteExpected}"`), `aria-label must match driver note for ${name}`);
      assert.ok(btnAttrs.includes(`title="${noteExpected}"`), `title must match driver note for ${name}`);
    }

    // Verify empty-notes fallback behavior (driver.notes missing falls back to driver.label || driver.name)
    const mockDriverNoNotes = {
      name: 'synthetic_no_notes',
      label: 'Synthetic Driver',
      value: 0.1,
      min: 0,
      max: 1,
      step: 0.01,
      units: 'pct',
      category: 'operating',
    };
    const mockAssumptions = {
      drivers: [mockDriverNoNotes],
      get: (n) => (n === 'synthetic_no_notes' ? mockDriverNoNotes : null),
    };
    const mockContainer = createInteractiveContainer();
    const mockView = renderAssumptions({ container: mockContainer, assumptions: mockAssumptions });
    const mockHtml = mockContainer.innerHTML;
    const mockBtnMatch = mockHtml.match(/<button[^>]*class="[^"]*tooltip-btn[^"]*"([^>]*)>/);
    assert.ok(mockBtnMatch, 'must render tooltip-btn for driver without notes');
    assert.ok(mockBtnMatch[1].includes('aria-label="Synthetic Driver"'), 'aria-label falls back to label');
    assert.ok(mockBtnMatch[1].includes('title="Synthetic Driver"'), 'title falls back to label');
    mockView.dispose();

    view.dispose();
  });

  test('assets/icons/ui/info-circle.svg is byte-untouched and valid SVG', () => {
    const content = fs.readFileSync(ICON_PATH, 'utf8');
    assert.match(content, /<svg\s+xmlns="http:\/\/www\.w3\.org\/2000\/svg"\s+viewBox="0 0 24 24"/);
    assert.match(content, /stroke="#2563EB"/);

    const gitDiff = execSync('git diff assets/icons/ui/info-circle.svg', { cwd: ROOT, encoding: 'utf8' });
    assert.equal(gitDiff.trim(), '', 'assets/icons/ui/info-circle.svg must have zero git diff');
  });

  test('static callout icon references in assumptionsTab.js remain untouched at 20px', () => {
    assert.match(
      assumptionsCode,
      /<img\s+src="assets\/icons\/ui\/info-circle\.svg"\s+alt="Info"\s+class="callout-icon"\s+width="20"\s+height="20"\s*\/>/
    );
  });
});

