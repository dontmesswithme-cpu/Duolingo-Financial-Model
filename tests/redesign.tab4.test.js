/**
 * Redesign Phase 4 Test Suite — Tab 04: Supporting Schedules.
 *
 * Covers Task RP4.1 Artifact Contract:
 *  - Deliverable files: src/ui/schedulesTab.js, index.html, tests/redesign.tab4.test.js
 *  - Exported interfaces: renderGateCards, renderSchedules, buildScheduleColumns
 *  - Balance Sheet Invariant Hard Gate cards: 5 executive cards (FY2026-FY2030)
 *    validating Assets = Liabilities + Equity with ✓ BALANCED (Δ$0) badge
 *  - Fail-closed gate behavior when synthetic discrepancy is injected (.badge-fail)
 *  - Units Switcher: Thousands vs Millions with dynamic rescaling factor (scale = 1000 : 1)
 *  - Zero rounding distortion when switching units
 *  - Segmented schedule switcher: [All Schedules], [Balance Sheet], [Working Capital], etc.
 *  - Quality gates: zero inline style=, zero UI bare literals > 999, purity, zero /protocol/i,
 *    and responsive grid collapse CSS rules.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  renderGateCards,
  renderSchedules,
  buildScheduleColumns,
  HISTORICAL_PERIODS,
  FORECAST_PERIODS,
  ALL_PERIODS,
} from '../src/ui/schedulesTab.js';
import { usd, percent, formatAccounting } from '../src/ui/format.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import schedulesEngine from '../src/engine/schedules.js';
import forecastEngine from '../src/engine/forecast.js';
import threeStatementEngine from '../src/engine/threeStatement.js';
import { readLedgerUrls } from './_ledger.js';
import { StubElement } from './_dom_stub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const SCHEDULES_TAB_PATH = path.join(ROOT, 'src/ui/schedulesTab.js');
const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));

const readText = (loc) => fs.promises.readFile(loc, 'utf8');
const LEDGER = readLedgerUrls();

async function getDatasets() {
  const historical = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
  const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
  const schedules = schedulesEngine.build(historical, assumptions);
  const forecast = forecastEngine.project({ historical, assumptions });
  const threeStatement = threeStatementEngine.project(schedules, assumptions, forecast);
  return { historical, assumptions, schedules, forecast, threeStatement };
}

function createInteractiveContainer() {
  const container = new StubElement();
  let _html = '';
  const elementList = [];

  function getOrCreateElement(tag, attrs, text = '') {
    const el = new StubElement(attrs);
    el.tagName = tag.toUpperCase();
    el.textContent = text;
    el.value = attrs.value || '';
    el.id = attrs.id || '';
    el._children = [];
    el.click = () => el.dispatch('click');

    el.classList = {
      _classes: new Set((attrs.class || '').split(/\s+/).filter(Boolean)),
      contains(c) {
        return this._classes.has(c);
      },
      add(c) {
        this._classes.add(c);
      },
      remove(c) {
        this._classes.delete(c);
      },
      toggle(c, force) {
        if (force !== undefined) {
          if (force) this._classes.add(c);
          else this._classes.delete(c);
          return force;
        }
        if (this._classes.has(c)) {
          this._classes.delete(c);
          return false;
        }
        this._classes.add(c);
        return true;
      },
    };

    el.querySelector = (sel) => {
      const child = el._children ? el._children.find((c) => matches(c, sel)) : null;
      if (child) return child;
      return elementList.find((c) => matches(c, sel)) || null;
    };

    el.querySelectorAll = (sel) => {
      const selectors = sel.split(',').map((s) => s.trim()).filter(Boolean);
      const results = [];
      if (el._children) {
        for (const c of el._children) {
          if (selectors.some((s) => matches(c, s))) results.push(c);
        }
      }
      for (const e of elementList) {
        if (selectors.some((s) => matches(e, s)) && !results.includes(e)) results.push(e);
      }
      return results;
    };

    elementList.push(el);
    return el;
  }

  function matches(el, sel) {
    if (!el || !sel) return false;
    if (sel.startsWith('#')) return el.id === sel.slice(1);
    const classAttrMatch = /^\.([a-zA-Z0-9_-]+)\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(sel);
    if (classAttrMatch) {
      const [, cls, name, val] = classAttrMatch;
      if (!el.classList || !el.classList.contains(cls)) return false;
      const actual = el.getAttribute ? el.getAttribute(name) : el.attributes?.[name];
      if (val === undefined) return actual !== null && actual !== undefined;
      return actual === val;
    }
    if (sel.startsWith('.')) return el.classList && el.classList.contains(sel.slice(1));
    const attrMatch = /^\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(sel);
    if (attrMatch) {
      const [, name, val] = attrMatch;
      const actual = el.getAttribute ? el.getAttribute(name) : el.attributes?.[name];
      if (val === undefined) return actual !== null && actual !== undefined;
      return actual === val;
    }
    const tagMatch = /^([a-zA-Z0-9]+)\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(sel);
    if (tagMatch) {
      const [, tag, name, val] = tagMatch;
      if (el.tagName !== tag.toUpperCase()) return false;
      const actual = el.getAttribute ? el.getAttribute(name) : el.attributes?.[name];
      if (val === undefined) return actual !== null && actual !== undefined;
      return actual === val;
    }
    return el.tagName === sel.toUpperCase();
  }

  function parseHtmlIntoElements(html) {
    elementList.length = 0;
    // Parse input radio elements
    const inputRegex = /<input\s+([^>]*?)>/gi;
    let m;
    while ((m = inputRegex.exec(html)) !== null) {
      const attrs = parseAttrs(m[1]);
      getOrCreateElement('input', attrs);
    }
    // Parse button elements
    const btnRegex = /<button\s+([^>]*?)>([\s\S]*?)<\/button>/gi;
    while ((m = btnRegex.exec(html)) !== null) {
      const attrs = parseAttrs(m[1]);
      getOrCreateElement('button', attrs, m[2].trim());
    }
    // Parse radio-pill label elements
    const labelRegex = /<label\s+([^>]*?)>([\s\S]*?)<\/label>/gi;
    while ((m = labelRegex.exec(html)) !== null) {
      const attrs = parseAttrs(m[1]);
      getOrCreateElement('label', attrs, m[2].trim());
    }
    // Parse gate cards
    const cardRegex = /<div\s+class="([^"]*?gate-card[^"]*?)"\s+([^>]*?)>/gi;
    while ((m = cardRegex.exec(html)) !== null) {
      const attrs = parseAttrs(`class="${m[1]}" ${m[2]}`);
      getOrCreateElement('div', attrs);
    }
    // Parse statement cards
    const stmtRegex = /<div\s+class="([^"]*?schedule-statement-card[^"]*?)"\s+([^>]*?)>/gi;
    while ((m = stmtRegex.exec(html)) !== null) {
      const attrs = parseAttrs(`class="${m[1]}" ${m[2]}`);
      getOrCreateElement('div', attrs);
    }
    // Parse hard-gate-section
    const gateSecRegex = /<div\s+class="([^"]*?hard-gate-section[^"]*?)"\s+([^>]*?)>/gi;
    while ((m = gateSecRegex.exec(html)) !== null) {
      const attrs = parseAttrs(`class="${m[1]}" ${m[2]}`);
      getOrCreateElement('div', attrs);
    }
  }

  function parseAttrs(str) {
    const attrs = {};
    const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
    let a;
    while ((a = attrRegex.exec(str)) !== null) {
      attrs[a[1]] = a[2] !== undefined ? a[2] : '';
    }
    return attrs;
  }

  Object.defineProperty(container, 'innerHTML', {
    get() {
      return _html;
    },
    set(val) {
      _html = String(val);
      parseHtmlIntoElements(_html);
    },
  });

  container.querySelector = (sel) => {
    return elementList.find((c) => matches(c, sel)) || null;
  };

  container.querySelectorAll = (sel) => {
    const selectors = sel.split(',').map((s) => s.trim()).filter(Boolean);
    return elementList.filter((c) => selectors.some((s) => matches(c, s)));
  };

  return container;
}

describe('RP4.1 — Supporting Schedules: Hard Gate Cards & Unit Switcher', () => {
  test('RP4.1-A: Deliverables exist and export required interfaces', () => {
    assert.ok(fs.existsSync(SCHEDULES_TAB_PATH), 'src/ui/schedulesTab.js must exist');
    assert.ok(fs.existsSync(INDEX_PATH), 'index.html must exist');
    assert.equal(typeof renderGateCards, 'function', 'renderGateCards must be an exported function');
    assert.equal(typeof renderSchedules, 'function', 'renderSchedules must be an exported function');
    assert.equal(typeof buildScheduleColumns, 'function', 'buildScheduleColumns must be an exported function');
    assert.deepEqual(FORECAST_PERIODS, ['FY2026', 'FY2027', 'FY2028', 'FY2029', 'FY2030']);
  });

  test('RP4.1-B: Hard gate cards display BALANCED (Δ$0) under live baseline engine state across FY2026-FY2030', async () => {
    const { threeStatement } = await getDatasets();
    const gateHtml = renderGateCards(threeStatement, { unit: 'thousands' });

    // Must render all 5 forecast period cards
    for (const p of FORECAST_PERIODS) {
      assert.match(gateHtml, new RegExp(`data-period="${p}"`), `Card for ${p} must exist`);
      assert.match(gateHtml, new RegExp(`<span class="gate-card-period">${p}</span>`), `Period header for ${p} must exist`);
    }

    // Every card under baseline state must display the balanced pass badge
    const passMatches = gateHtml.match(/badge-pass/g) || [];
    assert.equal(passMatches.length, 5, 'Exactly 5 cards must have .badge-pass class');

    const balancedMatches = gateHtml.match(/✓ BALANCED \(Δ\$0\)/g) || [];
    assert.equal(balancedMatches.length, 5, 'Exactly 5 cards must display "✓ BALANCED (Δ$0)"');

    // Zero fail badges under baseline state
    assert.doesNotMatch(gateHtml, /badge-fail/, 'Baseline engine state must have zero .badge-fail');
    assert.doesNotMatch(gateHtml, /gate-card-fail/, 'Baseline engine state must have zero .gate-card-fail');

    // Ledger breakdown rows: Total Assets, Total Liabilities, Stockholders' Equity, Discrepancy ($0)
    for (const p of FORECAST_PERIODS) {
      const bc = threeStatement.balanceCheck.byPeriod[p];
      assert.ok(bc, `balanceCheck for ${p} must exist`);
      assert.equal(bc.difference, 0, `${p} difference must be exactly 0`);
      assert.ok(bc.ok === true || bc.passed === true, `${p} must be marked ok`);

      // Verify mathematical balance: Assets === Liabilities + Equity
      const assets = Math.round(bc.assets);
      const liabPlusEq = Math.round(bc.liabilities + bc.equity);
      assert.equal(assets, liabPlusEq, `${p} Assets must equal Liabilities + Equity`);
    }

    // Discrepancy line item displays $0
    const discMatches = gateHtml.match(/<span class="gate-ledger-val">\$0<\/span>/g) || [];
    assert.ok(discMatches.length >= 5, 'Every card must display "$0" discrepancy');
  });

  test('RP4.1-C: Hard gate card fails closed immediately on injected balance discrepancy', async () => {
    const { threeStatement } = await getDatasets();

    // Clone threeStatement and inject a synthetic discrepancy into FY2028
    const corrupted = {
      ...threeStatement,
      balanceCheck: {
        ...threeStatement.balanceCheck,
        byPeriod: {
          ...threeStatement.balanceCheck.byPeriod,
          FY2028: {
            period: 'FY2028',
            assets: threeStatement.balanceCheck.byPeriod.FY2028.assets,
            liabilities: threeStatement.balanceCheck.byPeriod.FY2028.liabilities,
            equity: threeStatement.balanceCheck.byPeriod.FY2028.equity - 15000,
            difference: 15000,
            ok: false,
          },
        },
      },
    };

    const gateHtml = renderGateCards(corrupted, { unit: 'thousands' });

    // FY2028 must flip to red .badge-fail with exact discrepancy amount
    assert.match(gateHtml, /gate-card-fail/, 'Corrupted period must carry .gate-card-fail class');
    assert.match(gateHtml, /badge-fail/, 'Corrupted period must carry .badge-fail class');
    assert.match(gateHtml, /✗ UNBALANCED \(Δ\$15,000\)/, 'Card must display exact discrepancy amount ($15,000)');

    // The other 4 periods must remain BALANCED (Δ$0)
    const passMatches = gateHtml.match(/badge-pass/g) || [];
    assert.equal(passMatches.length, 4, 'Remaining 4 cards must still be .badge-pass');
  });

  test('RP4.1-D: Units Switcher (Thousands vs Millions) dynamically scales schedule figures without distortion', async () => {
    const { schedules, threeStatement } = await getDatasets();
    const container = createInteractiveContainer();

    class MockTabulator {
      constructor(el, cfg) {
        this.element = el;
        this.config = cfg;
        this.destroyed = false;
      }
      destroy() {
        this.destroyed = true;
      }
      redraw() {}
    }

    let notifiedUnit = null;
    const view = renderSchedules({
      container,
      schedules,
      threeStatement,
      TabulatorConstructor: MockTabulator,
      unit: 'thousands',
      onUnitChange: (u) => { notifiedUnit = u; },
    });

    // 1. Initial default state: Thousands
    assert.equal(view.getUnit(), 'thousands', 'Initial unit must be thousands');
    assert.match(container.innerHTML, /Figures in USD thousands unless otherwise stated/);
    assert.match(container.innerHTML, /Working Capital &amp; Operating Schedules \(\$ in thousands\)/);
    assert.match(container.innerHTML, /PP&amp;E Roll-Forward Schedule \(\$ in thousands\)/);

    // Verify figures in Thousands
    const bc26 = threeStatement.balanceCheck.byPeriod.FY2026;
    const expectedAssetsThousands = usd(bc26.assets, { decimals: 0 });
    assert.match(container.innerHTML, new RegExp(expectedAssetsThousands.replace(/\$/g, '\\$')));

    // 2. Switch to Millions
    view.setUnit('millions');
    assert.equal(view.getUnit(), 'millions', 'Unit must update to millions');
    assert.equal(notifiedUnit, 'millions', 'onUnitChange must be called with "millions"');
    assert.match(container.innerHTML, /Figures in USD millions unless otherwise stated/);
    assert.match(container.innerHTML, /Working Capital &amp; Operating Schedules \(\$ in millions\)/);
    assert.match(container.innerHTML, /PP&amp;E Roll-Forward Schedule \(\$ in millions\)/);

    // Verify figures in Millions scaled by 1000
    const expectedAssetsMillions = usd(bc26.assets / 1e3, { decimals: 1 });
    assert.match(container.innerHTML, new RegExp(expectedAssetsMillions.replace(/\$/g, '\\$')));

    // Discrepancy remains $0 in Millions
    assert.match(container.innerHTML, /✓ BALANCED \(Δ\$0\)/);

    // 3. Switch back to Thousands without distortion
    view.setUnit('thousands');
    assert.equal(view.getUnit(), 'thousands', 'Unit must revert to thousands');
    assert.match(container.innerHTML, /Figures in USD thousands unless otherwise stated/);
    assert.match(container.innerHTML, new RegExp(expectedAssetsThousands.replace(/\$/g, '\\$')));

    view.dispose();
  });

  test('RP4.1-E: Modular Schedule Switcher and filtering lifecycle', async () => {
    const { schedules, threeStatement } = await getDatasets();
    const container = createInteractiveContainer();

    class MockTabulator {
      constructor(el, cfg) {
        this.element = el;
        this.config = cfg;
        this.destroyed = false;
      }
      destroy() {
        this.destroyed = true;
      }
      redraw() {}
    }

    const view = renderSchedules({
      container,
      schedules,
      threeStatement,
      TabulatorConstructor: MockTabulator,
    });

    // Switcher bar exists
    assert.match(container.innerHTML, /class="schedules-switcher-bar"/);
    assert.match(container.innerHTML, /data-schedule-tab="all"/);
    assert.match(container.innerHTML, /data-schedule-tab="balance"/);
    assert.match(container.innerHTML, /data-schedule-tab="workingCapital"/);
    assert.match(container.innerHTML, /data-schedule-tab="ppe"/);
    assert.match(container.innerHTML, /data-schedule-tab="intangibles"/);
    assert.match(container.innerHTML, /data-schedule-tab="sbc"/);
    assert.match(container.innerHTML, /data-schedule-tab="debt"/);

    // Default filter is 'all'
    assert.equal(view.getScheduleFilter(), 'all');

    // Switch to 'workingCapital'
    view.setScheduleFilter('workingCapital');
    assert.equal(view.getScheduleFilter(), 'workingCapital');

    // Switch to 'balance'
    view.setScheduleFilter('balance');
    assert.equal(view.getScheduleFilter(), 'balance');

    // Reset to 'all'
    view.setScheduleFilter('all');
    assert.equal(view.getScheduleFilter(), 'all');

    view.dispose();
  });

  test('RP4.1-F: index.html contains Tab 04 semantic container and responsive grid CSS rules', () => {
    const indexHtml = fs.readFileSync(INDEX_PATH, 'utf8');

    // Container structure
    assert.match(indexHtml, /id="tab-schedules"/, 'index.html must contain #tab-schedules');
    assert.match(indexHtml, /class="[^"]*schedules-hub-container[^"]*"/, 'Must contain .schedules-hub-container');
    assert.match(indexHtml, /class="[^"]*units-toggle-container[^"]*"/, 'Must contain .units-toggle-container');
    assert.match(indexHtml, /class="[^"]*schedules-switcher-bar[^"]*"/, 'Must contain .schedules-switcher-bar');
    assert.match(indexHtml, /id="hard-gate-section"/, 'Must contain #hard-gate-section');
    assert.match(indexHtml, /id="gate-grid"/, 'Must contain #gate-grid');
    assert.match(indexHtml, /id="schedules-tables-container"/, 'Must contain #schedules-tables-container');

    // CSS rules for responsive 5-card grid
    assert.match(indexHtml, /\.gate-grid\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*1fr\)/, 'Must define 5-column grid');
    assert.match(indexHtml, /@media\s*\([^)]*max-width:\s*1100px\)[^}]*\{[^}]*\.gate-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/, 'Must collapse to 3 columns on tablet');
    assert.match(indexHtml, /@media\s*\([^)]*max-width:\s*768px\)[^}]*\{[^}]*\.gate-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*1fr\)/, 'Must collapse to 2 columns on mobile-landscape');
    assert.match(indexHtml, /@media\s*\([^)]*max-width:\s*480px\)[^}]*\{[^}]*\.gate-grid\s*\{[^}]*grid-template-columns:\s*1fr/, 'Must collapse to 1 column on narrow screens');

    // Zero inline styles inside tab-schedules markup
    const tabSchedulesMatch = /<section[^>]*id="tab-schedules"[^>]*>([\s\S]*?)<\/section>/i.exec(indexHtml);
    assert.ok(tabSchedulesMatch, '#tab-schedules section must exist in index.html');
    assert.doesNotMatch(tabSchedulesMatch[1], /\bstyle\s*=/i, '#tab-schedules markup must contain zero inline style=');
  });

  test('RP4.1-G: Quality Gates — Zero inline style=, Zero UI bare literals > 999, Purity & Zero /protocol/i', () => {
    const code = fs.readFileSync(SCHEDULES_TAB_PATH, 'utf8');

    // Zero inline style=
    assert.doesNotMatch(code, /\bstyle\s*=/i, 'src/ui/schedulesTab.js must contain zero inline style=');

    // Zero Date.now, Math.random, fetch
    assert.doesNotMatch(code, /\bDate\.now\s*\(/, 'src/ui/schedulesTab.js must not call Date.now');
    assert.doesNotMatch(code, /\bMath\.random\s*\(/, 'src/ui/schedulesTab.js must not call Math.random');
    assert.doesNotMatch(code, /\bfetch\s*\(/, 'src/ui/schedulesTab.js must not call fetch');

    // Zero protocol occurrences
    assert.doesNotMatch(code, /protocol/i, 'src/ui/schedulesTab.js must contain zero "protocol" mentions');

    // Zero bare numeric literals > 999 outside comments
    const lines = code.split('\n');
    const numRegex = /(?:^|[^\w.])(\d{4,})(?:[^\w.]|$)/g;
    const allowed = new Set([1000, 1280, 1900, 2000, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030]);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const stripped = line.split('//')[0];
      let m;
      while ((m = numRegex.exec(stripped)) !== null) {
        const val = Number(m[1]);
        if (!allowed.has(val)) {
          assert.fail(`Line ${i + 1} contains bare numeric literal > 999: ${m[1]} in "${line.trim()}"`);
        }
      }
    }
  });

  test('RP4.1-H: Fail-closed gate behavior on null or undefined input (zero BALANCED cards)', () => {
    const nullHtml = renderGateCards(null, { unit: 'thousands' });
    const nullBalanced = (nullHtml.match(/✓ BALANCED \(Δ\$0\)/g) || []).length;
    assert.equal(nullBalanced, 0, 'null input must render zero BALANCED cards');

    const passMatches = nullHtml.match(/badge-pass/g) || [];
    assert.equal(passMatches.length, 0, 'null input must render zero .badge-pass');

    const failMatches = nullHtml.match(/badge-fail/g) || [];
    assert.equal(failMatches.length, 5, 'null input must render 5 .badge-fail cards');

    const noDataMatches = nullHtml.match(/✗ NO DATA/g) || [];
    assert.equal(noDataMatches.length, 5, 'null input must render 5 "✗ NO DATA" badges');

    const emptyDiscrepancies = nullHtml.match(/<span class="gate-ledger-val">\s*—\s*<\/span>/g) || [];
    assert.ok(emptyDiscrepancies.length >= 5, 'Discrepancy and ledger rows must render dashes on null input');
  });

  test('RP4.1-I: Fail-closed gate behavior on missing single period (FY2029 deleted does not claim BALANCED)', async () => {
    const { threeStatement } = await getDatasets();
    const missingOne = structuredClone(threeStatement);
    delete missingOne.balanceCheck.byPeriod.FY2029;

    const missHtml = renderGateCards(missingOne, { unit: 'thousands' });
    const missFy29Balanced = /data-period="FY2029"[\s\S]*?✓ BALANCED/.test(missHtml);
    assert.equal(missFy29Balanced, false, 'Missing-period card (FY2029) must not claim BALANCED');

    assert.match(missHtml, /data-period="FY2029"[\s\S]*?✗ NO DATA/, 'FY2029 must render "✗ NO DATA" badge');
    assert.match(missHtml, /data-period="FY2029"[\s\S]*?badge-fail/, 'FY2029 must carry .badge-fail');

    // Preceding periods (FY2026-FY2028) remain BALANCED
    for (const p of ['FY2026', 'FY2027', 'FY2028']) {
      assert.match(missHtml, new RegExp(`data-period="${p}"[\\s\\S]*?✓ BALANCED`), `${p} before missing period remains BALANCED`);
    }
  });
});

describe('RP4.2 — Supporting Schedules: Modular Schedules & Capital Structure Verification', () => {
  test('RP4.2-A: Enhanced accounting formatter (formatAccounting) handles parentheses for negatives and dash for zero', () => {
    assert.equal(typeof formatAccounting, 'function', 'formatAccounting must be an exported function');

    // Negative numbers wrapped in parentheses without minus sign
    assert.equal(formatAccounting(-1033), '(1,033)', 'Negative integer must format as (1,033)');
    assert.equal(formatAccounting(-1033.45, { decimals: 2 }), '(1,033.45)', 'Negative decimal must format as (1,033.45)');
    assert.equal(formatAccounting(-1033, { showCurrency: true }), '($1,033)', 'Negative currency must format as ($1,033)');

    // Zero formatted as em-dash ('—')
    assert.equal(formatAccounting(0), '—', 'Zero must format as em-dash');
    assert.equal(formatAccounting(0, { zeroDisplay: '0' }), '0', 'Custom zeroDisplay option must be honored');

    // Positive numbers formatted with thousands commas
    assert.equal(formatAccounting(2500), '2,500', 'Positive integer must format with commas');
    assert.equal(formatAccounting(2500, { showCurrency: true }), '$2,500', 'Positive currency must format with dollar sign');

    // Non-finite, null, undefined formatted as dash
    assert.equal(formatAccounting(null), ' - ');
    assert.equal(formatAccounting(undefined), ' - ');
    assert.equal(formatAccounting(NaN), ' - ');
    assert.equal(formatAccounting(Infinity), ' - ');
  });

  test('RP4.2-B: Schedule card containers carry contract-mandated semantic class names', async () => {
    const { schedules, threeStatement } = await getDatasets();
    const container = createInteractiveContainer();

    class MockTabulator {
      constructor(el, cfg) {
        this.element = el;
        this.config = cfg;
      }
      destroy() {}
      redraw() {}
    }

    renderSchedules({
      container,
      schedules,
      threeStatement,
      TabulatorConstructor: MockTabulator,
    });

    const html = container.innerHTML;

    // Must contain all 5 contract schedule classes
    assert.match(html, /class="[^"]*schedule-working-capital[^"]*"/, 'Must contain .schedule-working-capital');
    assert.match(html, /class="[^"]*schedule-ppe[^"]*"/, 'Must contain .schedule-ppe');
    assert.match(html, /class="[^"]*schedule-intangibles[^"]*"/, 'Must contain .schedule-intangibles');
    assert.match(html, /class="[^"]*schedule-sbc[^"]*"/, 'Must contain .schedule-sbc');
    assert.match(html, /class="[^"]*schedule-debt[^"]*"/, 'Must contain .schedule-debt');
  });

  test('RP4.2-C: Working Capital schedule highlights NWC and ΔNWC lines with custom row formatters', async () => {
    const { schedules, threeStatement } = await getDatasets();
    const container = createInteractiveContainer();

    class MockTabulator {
      constructor(el, cfg) {
        this.element = el;
        this.config = cfg;
      }
      destroy() {}
      redraw() {}
    }

    const view = renderSchedules({
      container,
      schedules,
      threeStatement,
      TabulatorConstructor: MockTabulator,
    });

    // Find working capital Tabulator config
    const wcConfig = view.tabulatorConfigs.find((c) => c.statement === 'workingCapital');
    assert.ok(wcConfig, 'Working capital Tabulator config must exist');
    assert.equal(typeof wcConfig.rowFormatter, 'function', 'Working capital config must have rowFormatter');

    // Test rowFormatter with mock row elements
    const mockElNwc = { classList: new Set() };
    const mockRowNwc = {
      getData: () => ({ id: 'nwc', label: 'Net Working Capital (NWC)' }),
      getElement: () => ({ classList: { add: (c) => mockElNwc.classList.add(c) } }),
    };
    wcConfig.rowFormatter(mockRowNwc);
    assert.ok(mockElNwc.classList.has('schedule-row-nwc'), 'NWC row must receive .schedule-row-nwc class');

    const mockElDelta = { classList: new Set() };
    const mockRowDelta = {
      getData: () => ({ id: 'delta_nwc', label: 'Change in Net Working Capital (ΔNWC)' }),
      getElement: () => ({ classList: { add: (c) => mockElDelta.classList.add(c) } }),
    };
    wcConfig.rowFormatter(mockRowDelta);
    assert.ok(mockElDelta.classList.has('schedule-row-delta-nwc'), 'ΔNWC row must receive .schedule-row-delta-nwc class');

    // Verify CSS rules exist in index.html for NWC and ΔNWC
    const indexHtml = fs.readFileSync(INDEX_PATH, 'utf8');
    assert.match(indexHtml, /\.schedule-row-nwc/, 'index.html must define .schedule-row-nwc CSS');
    assert.match(indexHtml, /\.schedule-row-delta-nwc/, 'index.html must define .schedule-row-delta-nwc CSS');
  });

  test('RP4.2-D: ΔNWC in the Working Capital schedule ties exactly to the Cash Flow Statement working capital line in engine calculations', async () => {
    const { threeStatement } = await getDatasets();

    for (const p of FORECAST_PERIODS) {
      const cfWc = threeStatement.cashFlow.byPeriod[p].operating_activities.change_in_working_capital.value;
      const schedDeltaNwc = threeStatement.supporting.workingCapital.byPeriod[p].change_in_net_working_capital.value;

      assert.ok(Number.isFinite(cfWc), `Cash flow WC for ${p} must be finite`);
      assert.ok(Number.isFinite(schedDeltaNwc), `Schedule ΔNWC for ${p} must be finite`);

      // In accounting: cash flow impact of ΔNWC is negative delta NWC (cash outflow when NWC increases)
      // For standard non-hybrid projection years, cfWc === -schedDeltaNwc
      if (!threeStatement.cashFlow.byPeriod[p].isHybrid) {
        assert.equal(
          Math.round(cfWc),
          Math.round(-schedDeltaNwc),
          `${p} Cash Flow change in WC (${cfWc}) must tie to schedule -ΔNWC (${-schedDeltaNwc})`
        );
      } else {
        // Hybrid FY2026: cash flow change in WC reflects H2 delta
        assert.ok(Math.abs(cfWc) > 0, 'FY2026 hybrid CF WC must be computed');
      }
    }
  });

  test('RP4.2-E: Debt schedule explicitly renders $0 for all funded debt lines across all historical and projected years', async () => {
    const { schedules, threeStatement } = await getDatasets();
    const container = createInteractiveContainer();

    class MockTabulator {
      constructor(el, cfg) {
        this.element = el;
        this.config = cfg;
      }
      destroy() {}
      redraw() {}
    }

    const view = renderSchedules({
      container,
      schedules,
      threeStatement,
      TabulatorConstructor: MockTabulator,
    });

    const debtConfig = view.tabulatorConfigs.find((c) => c.statement === 'debt');
    assert.ok(debtConfig, 'Debt Tabulator config must exist');

    const totalDebtRow = debtConfig.data.find((r) => r.id === 'total_debt');
    const interestExpRow = debtConfig.data.find((r) => r.id === 'interest_exp');
    const leaseRow = debtConfig.data.find((r) => r.id === 'lease_liab_non_cur');

    assert.ok(totalDebtRow, 'Total funded debt row must exist');
    assert.ok(interestExpRow, 'Interest expense row must exist');
    assert.ok(leaseRow, 'Operating lease liabilities row must exist');

    // Verify $0 for funded debt across ALL 10 periods (FY2021-FY2030)
    for (const p of ALL_PERIODS) {
      assert.equal(totalDebtRow[p], 0, `Total funded debt for ${p} must be exactly 0`);
      assert.equal(interestExpRow[p], 0, `Interest expense on borrowings for ${p} must be exactly 0`);
      assert.ok(Number.isFinite(leaseRow[p]), `Operating lease liability for ${p} must be finite`);
      assert.ok(leaseRow[p] > 0, `Operating lease liability for ${p} must be positive (> 0)`);
    }

    // Informational callout card exists in markup
    assert.match(container.innerHTML, /class="[^"]*debt-callout-card[^"]*"/, 'Must render .debt-callout-card');
    assert.match(container.innerHTML, /Funded Debt Status \(Debt-Free Verified\):/, 'Must render debt-free callout title');
    assert.match(container.innerHTML, /Operating Leases \(ASC 842\):/, 'Must render ASC 842 lease callout');
  });

  test('RP4.2-F: Segmented switcher allows switching between individual schedules or viewing all consecutively', async () => {
    const { schedules, threeStatement } = await getDatasets();
    const container = createInteractiveContainer();

    class MockTabulator {
      constructor(el, cfg) {
        this.element = el;
        this.config = cfg;
      }
      destroy() {}
      redraw() {}
    }

    const view = renderSchedules({
      container,
      schedules,
      threeStatement,
      TabulatorConstructor: MockTabulator,
    });

    // Default is 'all'
    assert.equal(view.getScheduleFilter(), 'all');

    const filterPills = ['all', 'balance', 'workingCapital', 'ppe', 'intangibles', 'sbc', 'debt'];
    for (const f of filterPills) {
      view.setScheduleFilter(f);
      assert.equal(view.getScheduleFilter(), f, `Filter must update to ${f}`);
    }

    // Reset back to all
    view.setScheduleFilter('all');
    assert.equal(view.getScheduleFilter(), 'all');
  });

  test('RP4.2-G: Static Quality Gates — Zero inline style=, Zero UI bare literals > 999, Purity & Zero /protocol/i in format.js', () => {
    const formatCode = fs.readFileSync(path.join(ROOT, 'src/ui/format.js'), 'utf8');

    // Zero inline style=
    assert.doesNotMatch(formatCode, /\bstyle\s*=/i, 'src/ui/format.js must contain zero inline style=');

    // Zero Date.now, Math.random, fetch
    assert.doesNotMatch(formatCode, /\bDate\.now\s*\(/, 'src/ui/format.js must not call Date.now');
    assert.doesNotMatch(formatCode, /\bMath\.random\s*\(/, 'src/ui/format.js must not call Math.random');
    assert.doesNotMatch(formatCode, /\bfetch\s*\(/, 'src/ui/format.js must not call fetch');

    // Zero protocol mentions
    assert.doesNotMatch(formatCode, /protocol/i, 'src/ui/format.js must contain zero "protocol" mentions');
  });

  test('RP4.2-H: Live-table column formatters wire formatAccounting with per-row zeroDisplay (zero cell → —, debt cell → $0)', () => {
    const colsThousands = buildScheduleColumns({ unit: 'thousands' });
    const colsMillions = buildScheduleColumns({ unit: 'millions' });

    const histCol = colsThousands.find((c) => c.field === 'FY2025');
    const fcCol = colsThousands.find((c) => c.field === 'FY2026');
    assert.ok(histCol && typeof histCol.formatter === 'function');
    assert.ok(fcCol && typeof fcCol.formatter === 'function');

    const makeCell = (val, rowData) => ({
      getValue: () => val,
      getRow: () => ({ getData: () => rowData }),
    });

    // 1. Standard row zero cell renders em-dash '—'
    const standardRow = { label: 'Accounts Receivable', isFundedDebt: false };
    assert.equal(histCol.formatter(makeCell(0, standardRow)), '—', 'Standard zero cell must format as em-dash (—)');
    assert.equal(fcCol.formatter(makeCell(0, standardRow)), '—', 'Forecast zero cell must format as em-dash (—)');

    // 2. Funded debt row zero cell renders '$0'
    const fundedDebtRow = { label: 'Total Funded Debt (Short & Long-Term)', isFundedDebt: true };
    assert.equal(histCol.formatter(makeCell(0, fundedDebtRow)), '$0', 'Funded debt zero cell must format as $0');
    assert.equal(fcCol.formatter(makeCell(0, fundedDebtRow)), '$0', 'Funded debt zero cell must format as $0');

    // 3. Negative cell renders accounting parentheses ($1,033)
    assert.equal(histCol.formatter(makeCell(-1033, standardRow)), '($1,033)', 'Negative cell must format in parentheses');
    assert.equal(fcCol.formatter(makeCell(-1033, standardRow)), '($1,033)', 'Forecast negative cell must format in parentheses');

    // 4. Missing/null/non-finite cell renders ' - '
    assert.equal(histCol.formatter(makeCell(null, standardRow)), ' - ', 'Null cell must format as dash');
    assert.equal(fcCol.formatter(makeCell(undefined, standardRow)), ' - ', 'Undefined cell must format as dash');
    assert.equal(fcCol.formatter(makeCell(NaN, standardRow)), ' - ', 'NaN cell must format as dash');

    // 5. Millions column divides by 1000 and formats decimals
    const histColM = colsMillions.find((c) => c.field === 'FY2025');
    assert.equal(histColM.formatter(makeCell(2500, standardRow)), '$2.5', 'Millions format must divide by 1000');
  });

  test('RP4.2-I: Fail-closed capital structure derivation when schedules payload is missing or corrupted', () => {
    const container = createInteractiveContainer();
    class MockTabulator {
      constructor(el, cfg) {
        this.element = el;
        this.config = cfg;
      }
      destroy() {}
      redraw() {}
    }

    // 1. Missing schedules payload fails closed without claiming $0 or DEBT-FREE
    const viewNull = renderSchedules({
      container,
      schedules: null,
      threeStatement: null,
      TabulatorConstructor: MockTabulator,
    });

    const debtConfigNull = viewNull.tabulatorConfigs.find((c) => c.statement === 'debt');
    assert.ok(debtConfigNull, 'Debt tabulator config must exist');
    const totalDebtRow = debtConfigNull.data.find((r) => r.id === 'total_debt');
    const interestRow = debtConfigNull.data.find((r) => r.id === 'interest_exp');

    // Values must be null, not silently defaulting to 0
    for (const p of ALL_PERIODS) {
      assert.equal(totalDebtRow[p], null, `Null schedule total debt ${p} must be null`);
      assert.equal(interestRow[p], null, `Null schedule interest expense ${p} must be null`);
    }

    // Container markup must not claim DEBT-FREE when data is null; must render NO DATA
    assert.match(container.innerHTML, /NO DATA/, 'Null schedule must render NO DATA status');
    assert.doesNotMatch(container.innerHTML, /DEBT-FREE/, 'Null schedule must not display DEBT-FREE badge');

    // 2. Corrupted lease period yields null, not silent 0
    const fakeSched = {
      debt: {
        hasDebt: false,
        status: 'debt_free_verified',
        statementBasis: 'Verified debt-free',
        byPeriod: {
          FY2021: { operating_leases: { long_term_lease_liability: { value: 29724 } } },
        },
      },
    };
    const fakeTs = { supporting: { debt: fakeSched.debt } };
    const containerCorrupt = createInteractiveContainer();
    const viewCorrupt = renderSchedules({
      container: containerCorrupt,
      schedules: fakeSched,
      threeStatement: fakeTs,
      TabulatorConstructor: MockTabulator,
    });

    const debtConfigCorrupt = viewCorrupt.tabulatorConfigs.find((c) => c.statement === 'debt');
    const leaseRow = debtConfigCorrupt.data.find((r) => r.id === 'lease_liab_non_cur');
    assert.equal(leaseRow.FY2023, null, 'Omitted lease period must evaluate to null, not 0');
  });
});

describe('RP4-RW — Card Header Conformance & Units Pill Redesign', () => {
  test('RP4-RW2.1: Canonical unified header CSS rule and neutralized legacy rule apply to Tab 04 headers', () => {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');

    // 1. Shared rule applies border-left 3px solid, padding-left 10px, background transparent, border-bottom none
    assert.match(
      html,
      /\.statement-card-header\s*\{[^}]*border-left:\s*3px\s+solid\s+var\(--color-accent-blue\);[^}]*padding-left:\s*10px;[^}]*background:\s*transparent;[^}]*border-bottom:\s*none;/,
      'Shared RW1.1 rule must apply canonical inline styling to .statement-card-header'
    );

    // 2. Legacy rule (:1238) has been neutralized: background transparent, border-bottom none, font-weight 700
    assert.match(
      html,
      /\.statement-card-header\s*\{[^}]*padding:\s*14px\s+16px\s+10px\s+10px;[^}]*background:\s*transparent;[^}]*border-bottom:\s*none;[^}]*font-weight:\s*700;/,
      'Legacy .statement-card-header rule must be neutralized (no grey banner, no bottom border)'
    );

    // 3. Tab 04 schedule cards and hard-gate section carry .statement-card-header
    assert.match(html, /class="[^"]*statement-card-header\s+gate-section-header[^"]*"/, 'Hard-gate section header carries .statement-card-header');
  });

  test('RP4-RW2.2: Units toggle rebuilt on canonical segmented pill pattern (.pill-control + .pill-btn)', async () => {
    const { schedules, threeStatement } = await getDatasets();
    const container = createInteractiveContainer();

    class MockTabulator {
      constructor(el, cfg) {
        this.element = el;
        this.config = cfg;
      }
      destroy() {}
      redraw() {}
    }

    let changedUnit = null;
    const view = renderSchedules({
      container,
      schedules,
      threeStatement,
      TabulatorConstructor: MockTabulator,
      unit: 'thousands',
      onUnitChange: (u) => { changedUnit = u; },
    });

    // 1. DOM shape conformance: .units-mode-toggle.pill-control container with .pill-btn buttons
    assert.match(container.innerHTML, /class="[^"]*units-mode-toggle\s+pill-control[^"]*"/, 'Units toggle container must carry .units-mode-toggle.pill-control');
    assert.match(container.innerHTML, /<button[^>]*class="[^"]*pill-btn[^"]*units-btn[^"]*"[^>]*data-unit="thousands"/, 'Must render Thousands .pill-btn');
    assert.match(container.innerHTML, /<button[^>]*class="[^"]*pill-btn[^"]*units-btn[^"]*"[^>]*data-unit="millions"/, 'Must render Millions .pill-btn');

    // 2. Radio indicator affordance retired from Tab 04 markup
    assert.doesNotMatch(container.innerHTML, /class="radio-indicator"/, 'Radio indicator dot must be retired');
    assert.doesNotMatch(container.innerHTML, /type="radio"/, 'Radio input elements must be retired from unit toggle');

    // 3. Test maintenance disclosure: .pill-btn[data-unit] is the canonical switcher selector (with .radio-pill retained for probe backward-compatibility)
    const thousandsBtn = container.querySelector('.pill-btn[data-unit="thousands"]');
    const millionsBtn = container.querySelector('.pill-btn[data-unit="millions"]');
    assert.ok(thousandsBtn, 'Thousands button found via canonical .pill-btn[data-unit]');
    assert.ok(millionsBtn, 'Millions button found via canonical .pill-btn[data-unit]');
    assert.ok(thousandsBtn.classList.contains('active'), 'Thousands button active by default');
    assert.equal(thousandsBtn.getAttribute('aria-pressed'), 'true', 'Thousands aria-pressed true');

    // 4. Click interaction flips active class and triggers onUnitChange
    millionsBtn.click();
    assert.equal(view.getUnit(), 'millions', 'view.getUnit() updates to millions after click');
    assert.equal(changedUnit, 'millions', 'onUnitChange fires with millions');

    // 5. Round trip back to thousands (re-query element after re-render)
    const thousandsBtnRestored = container.querySelector('.pill-btn[data-unit="thousands"]');
    assert.ok(thousandsBtnRestored, 'Thousands button found after re-render');
    thousandsBtnRestored.click();
    assert.equal(view.getUnit(), 'thousands', 'view.getUnit() restores thousands');
    assert.equal(changedUnit, 'thousands', 'onUnitChange fires with thousands');

    view.dispose();
  });
});



