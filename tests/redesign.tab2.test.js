/**
 * Redesign Phase 2 Test Suite  -  Tab 02: Assumptions & Drivers.
 *
 * Covers:
 *  - RP2.1: Segmented Controls, Category Filtering & Custom Sliders
 *  - RP2.1: Schema-clamped inputs and bounds matching src/data/assumptions.json
 *  - RP2.1: Accessible tooltip buttons with aria-label descriptions
 *  - RP2.1: Dual presentation modes (Sliders vs Table View) and mode toggle
 *  - RP2.1: Synchronous event dispatching (onChange and onDriverChange)
 *  - RP2.1: Input color-coding (.cell-input blue for inputs, .cell-calc for formulas)
 *  - Carried-over fixups V1, V3, V4 verification
 *  - Quality Gates: Zero inline style=, zero bare numbers > 999 outside comments, purity, zero /protocol/i
 *  - Live App mounting and reactivity in createApp
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderAssumptions } from '../src/ui/assumptionsTab.js';
import { createTabRoot, StubElement } from './_dom_stub.js';
import { createApp } from '../src/app.js';
import * as dataLayer from '../src/data/loader.js';
import { LEDGER_URLS } from '../src/data/ledger.js';
import { extractRows } from '../src/data/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const ASSUMPTIONS_TAB_PATH = path.join(ROOT, 'src/ui/assumptionsTab.js');
const ASSUMPTIONS_DATA_PATH = path.join(ROOT, 'src/data/assumptions.json');

/**
 * Creates an interactive test container that supports querySelector and event dispatching.
 */
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
    };
    return el;
  }

  Object.defineProperty(container, 'innerHTML', {
    get() {
      return _html;
    },
    set(val) {
      _html = String(val);
      elementList.length = 0;
      if (!_html) return;

      const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
      let match;
      while ((match = tagRegex.exec(_html)) !== null) {
        const tag = match[1];
        if (tag.startsWith('/')) continue;
        const attrStr = match[2];
        const attrs = {};
        const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
          attrs[attrMatch[1]] = attrMatch[2] !== undefined ? attrMatch[2] : '';
        }
        elementList.push(getOrCreateElement(tag, attrs));
      }
    },
  });

  function matches(el, selector) {
    const sel = selector.trim();
    if (sel.startsWith('#')) {
      return el.id === sel.slice(1);
    }
    const attrMatch = sel.match(/^\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\]$/);
    if (attrMatch) {
      const [, name, val] = attrMatch;
      return el.hasAttribute(name) && (val === undefined || el.getAttribute(name) === val);
    }
    if (sel.startsWith('.')) {
      const parts = sel.split(/\[|\]/).filter(Boolean);
      const cls = parts[0].slice(1);
      if (!el.classList.contains(cls)) return false;
      if (parts.length > 1) {
        const [attrName, attrVal] = parts[1].split('=');
        const cleanVal = attrVal ? attrVal.replace(/['"]/g, '') : undefined;
        return el.hasAttribute(attrName) && (cleanVal === undefined || el.getAttribute(attrName) === cleanVal);
      }
      return true;
    }
    const tagMatch = sel.match(/^([a-zA-Z0-9-]+)(?:\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\])?$/);
    if (tagMatch) {
      const [, tag, name, val] = tagMatch;
      if (el.tagName !== tag.toUpperCase()) return false;
      if (name) {
        return el.hasAttribute(name) && (val === undefined || el.getAttribute(name) === val);
      }
      return true;
    }
    return false;
  }

  container.querySelector = (selector) => {
    return elementList.find((el) => matches(el, selector)) || null;
  };

  container.querySelectorAll = (selector) => {
    return elementList.filter((el) => matches(el, selector));
  };

  return container;
}

describe('RP2.1  -  HTML Shell & Static Markup Structure (index.html)', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  test('tab-assumptions pane exists and contains required title and controls strip', () => {
    assert.match(html, /<section[^>]+id="tab-assumptions"[^>]*>/, 'Tab 02 pane #tab-assumptions must exist');
    assert.match(html, /02\.\s*Assumptions\s*\/\s*Drivers/i, 'Must contain Tab 02 title');
    assert.match(html, /class="[^"]*input-type-legend[^"]*"/, 'Must contain input type legend');
    assert.match(html, /class="[^"]*legend-dot-input[^"]*"/, 'Must contain legend dot for user input');
    assert.match(html, /class="[^"]*legend-dot-calc[^"]*"/, 'Must contain legend dot for calculated');
    assert.match(html, /User Input/i, 'Must state User Input in legend');
    assert.match(html, /Calculated\s*\/\s*Linked/i, 'Must state Calculated / Linked in legend');
  });

  test('contains dual presentation mode toggle buttons for Sliders and Table View', () => {
    assert.match(html, /class="[^"]*view-mode-toggle[^"]*"/);
    assert.match(html, /data-mode="sliders"/);
    assert.match(html, /data-mode="table"/);
    assert.match(html, />Sliders</);
    assert.match(html, />Table View</);
  });

  test('contains segmented category filter pills', () => {
    assert.match(html, /class="[^"]*category-pill-bar[^"]*"/);
    const expectedCategories = ['all', 'operating', 'margins', 'tax-capital', 'balance-sheet', 'financing', 'valuation', 'other'];
    for (const cat of expectedCategories) {
      assert.match(html, new RegExp(`data-category="${cat}"`), `Must contain category pill for "${cat}"`);
    }
  });

  test('contains Assumptions Note callout referencing Cover & TOC', () => {
    assert.match(html, /class="[^"]*callout-info[^"]*assumptions-note[^"]*"/);
    assert.match(html, /Assumptions Note/i);
    assert.match(html, /Cover\s*&amp;\s*TOC/i);
    assert.match(html, /assets\/icons\/ui\/info-circle\.svg/);
  });
});

describe('RP2 Carried-Over Visual Fixups (V1, V3, V4)', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  test('V1: app-header padding insets nav 0px at sides for full-bleed edge-to-edge navigation', () => {
    assert.match(html, /\.app-header\s*\{[^}]*padding:\s*16px\s+0\s+0/, 'app-header must have padding: 16px 0 0 for full bleed');
    assert.match(html, /\.header-top-bar\s*\{[^}]*margin:\s*0\s+24px\s+14px/, 'header-top-bar must have lateral margin 24px');
  });

  test('V3: callouts have full thin borders and 20px outline icons', () => {
    assert.match(html, /\.callout-info\s*\{[^}]*border:\s*1px\s+solid/, 'callout-info must have full 1px thin border');
    assert.match(html, /\.callout-warning\s*\{[^}]*border:\s*1px\s+solid/, 'callout-warning must have full 1px thin border');
    assert.match(html, /\.callout-warning\s+\.callout-title\s*\{[^}]*color:\s*#B45309/i, 'callout-warning title must be amber-toned #B45309');
    assert.match(html, /\.callout-icon\s*\{[^}]*width:\s*20px/, 'callout-icon must be 20px width');
  });

  test('V4: Important Disclaimer appends Past performance sentence', () => {
    assert.match(
      html,
      /Past performance does not guarantee future results\./,
      'Important Disclaimer must contain sentence: "Past performance does not guarantee future results."',
    );
  });
});

describe('RP2.1  -  View Controller (src/ui/assumptionsTab.js) & Component Tests', () => {
  async function loadTestAssumptions() {
    return dataLayer.loadAssumptions({
      filePath: ASSUMPTIONS_DATA_PATH,
      readText: (p) => fs.promises.readFile(p, 'utf8'),
    });
  }

  test('renderAssumptions throws invalid_dependency if container is missing', () => {
    assert.throws(
      () => renderAssumptions({}),
      /renderAssumptions requires a container element/,
    );
  });

  test('renders all 38 schema drivers with .cell-input and bounded controls', async () => {
    const assumptions = await loadTestAssumptions();
    const container = createInteractiveContainer();

    const view = renderAssumptions({ container, assumptions });
    assert.ok(view);

    const html = container.innerHTML;

    // Verify all 38 drivers are present with input and slider attributes
    assert.equal(assumptions.drivers.length, 38, 'Assumptions dataset must have exactly 38 drivers');
    for (const d of assumptions.drivers) {
      assert.ok(html.includes(`data-driver-input="${d.name}"`), `Must contain data-driver-input for ${d.name}`);
      assert.ok(html.includes(`data-driver-slider="${d.name}"`), `Must contain data-driver-slider for ${d.name}`);
    }

    // Universal blue input styling on inputs and sliders
    assert.match(html, /class="[^"]*cell-input[^"]*driver-number-input/);
    assert.match(html, /class="[^"]*cell-input[^"]*driver-val-pill/);
    assert.match(html, /class="[^"]*cell-input[^"]*driver-slider/);

    // Slider card structure elements
    assert.match(html, /class="[^"]*tooltip-btn[^"]*"/, 'Must contain tooltip button');
    assert.match(html, /class="[^"]*driver-unit-badge[^"]*"/, 'Must contain unit badge');
    assert.match(html, /class="[^"]*driver-notes[^"]*"/, 'Must contain notes/description text');

    // MKT attributes rendered
    for (const mktName of ['risk_free_rate', 'beta', 'equity_risk_premium', 'market_share_price', 'shares_outstanding']) {
      const d = assumptions.get(mktName);
      assert.ok(d);
      assert.match(html, new RegExp(d.asOf));
      if (d.source?.provider) {
        assert.ok(html.includes(d.source.provider));
      }
    }

    view.dispose();
    assert.equal(container.innerHTML, '');
  });

  test('every slider strictly reflects schema min, max, and step from assumptions.json', async () => {
    const assumptions = await loadTestAssumptions();
    const container = createInteractiveContainer();

    const view = renderAssumptions({ container, assumptions });
    const html = container.innerHTML;

    for (const d of assumptions.drivers) {
      const minExpected = typeof d.min === 'number' ? d.min : 0;
      const maxExpected = typeof d.max === 'number' ? d.max : 1;
      const stepExpected = typeof d.step === 'number' ? d.step : 0.01;

      const sliderRegex = new RegExp(
        `<input[^>]+data-driver-slider="${d.name}"[^>]+min="${minExpected}"[^>]+max="${maxExpected}"[^>]+step="${stepExpected}"`,
      );
      assert.match(html, sliderRegex, `Slider for ${d.name} must strictly match schema bounds`);
    }

    view.dispose();
  });

  test('synchronously dispatches onChange and onDriverChange when slider updates', async () => {
    const assumptions = await loadTestAssumptions();
    const container = createInteractiveContainer();

    const changesRecorded = [];
    const view = renderAssumptions({
      container,
      assumptions,
      onChange: (name, val) => {
        changesRecorded.push({ source: 'onChange', name, val });
      },
      onDriverChange: (name, val) => {
        changesRecorded.push({ source: 'onDriverChange', name, val });
      },
    });

    const betaSlider = container.querySelector('[data-driver-slider="beta"]');
    assert.ok(betaSlider, 'Beta slider must be found');

    betaSlider.value = '1.65';
    betaSlider.dispatch('input');

    assert.equal(changesRecorded.length, 2, 'Must trigger both onChange and onDriverChange');
    assert.equal(changesRecorded[0].name, 'beta');
    assert.equal(changesRecorded[0].val, 1.65);
    assert.equal(changesRecorded[1].name, 'beta');
    assert.equal(changesRecorded[1].val, 1.65);

    view.dispose();
  });

  test('B1: same-value driver edit is a true no-op (zero dispatches, zero transient)', async () => {
    const assumptions = await loadTestAssumptions();
    const container = createInteractiveContainer();

    const changes = [];
    const view = renderAssumptions({
      container,
      assumptions,
      onChange: (name, val) => {
        changes.push({ name, val });
      },
    });

    const pill = container.querySelector('[data-driver-input="beta"]');
    assert.ok(pill, 'Beta pill must be found');
    // Re-enter the currently displayed value verbatim (on-step 1.47)
    pill.value = String(pill.value);
    pill.dispatch('change');

    assert.equal(changes.length, 0, 'Same-value edit must not dispatch (B1 no-op path)');
    assert.equal(pill.value, '1.47', 'Display stays on the engine-held value');

    view.dispose();
  });

  test('B1: off-step edit snaps once to the engine-held value and converges', async () => {
    const assumptions = await loadTestAssumptions();
    const container = createInteractiveContainer();

    const changes = [];
    const view = renderAssumptions({
      container,
      assumptions,
      onChange: (name, val) => {
        changes.push({ name, val });
      },
    });

    const pill = container.querySelector('[data-driver-input="beta"]');
    assert.ok(pill, 'Beta pill must be found');

    // Off-step input snaps to the step grid and dispatches exactly once
    pill.value = '1.476';
    pill.dispatch('change');

    assert.equal(changes.length, 1, 'Off-step edit must dispatch exactly once');
    assert.equal(changes[0].name, 'beta');
    assert.equal(changes[0].val, 1.48, 'Dispatched value is step-snapped (engine-held)');
    assert.equal(pill.value, '1.48', 'Display re-syncs to the snapped value');

    // Simulate the app recalc refresh, then re-enter the snapped value: no-op.
    const drivers2 = assumptions.drivers.map((d) => (d.name === 'beta' ? { ...d, value: 1.48 } : d));
    const byName2 = Object.fromEntries(drivers2.map((d) => [d.name, d]));
    view.update({ scenario: 'base', drivers: drivers2, get: (n) => byName2[n] ?? null });
    pill.dispatch('change');
    assert.equal(changes.length, 1, 'Converged value must not dispatch again (B1)');

    view.dispose();
  });

  test('text input changes clamp values strictly within schema bounds', async () => {
    const assumptions = await loadTestAssumptions();
    const container = createInteractiveContainer();

    let lastVal = null;
    const view = renderAssumptions({
      container,
      assumptions,
      onChange: (name, val) => {
        lastVal = val;
      },
    });

    const dsoDriver = assumptions.get('dso_days');
    assert.ok(dsoDriver);
    const dsoInput = container.querySelector('[data-driver-input="dso_days"]');
    assert.ok(dsoInput);

    // Value exceeding max (max is 150)
    dsoInput.value = '999';
    dsoInput.dispatch('change');
    assert.equal(lastVal, dsoDriver.max, 'Out of bounds value above max must clamp to driver.max');

    // Value below min (min is 10)
    dsoInput.value = '1';
    dsoInput.dispatch('change');
    assert.equal(lastVal, dsoDriver.min, 'Out of bounds value below min must clamp to driver.min');

    view.dispose();
  });

  test('category filter immediately toggles visibility of cards', async () => {
    const assumptions = await loadTestAssumptions();
    const container = createInteractiveContainer();

    const view = renderAssumptions({ container, assumptions });

    const operatingPill = container.querySelector('.cat-pill[data-category="operating"]');
    assert.ok(operatingPill, 'Operating category pill must exist');

    operatingPill.dispatch('click');

    const operatingCards = container.querySelectorAll('.driver-group-card[data-category="operating"]');
    const marginCards = container.querySelectorAll('.driver-group-card[data-category="margins"]');

    assert.ok(operatingCards.length > 0, 'Operating cards must exist');
    assert.ok(marginCards.length > 0, 'Margin cards must exist');

    for (const card of operatingCards) {
      assert.ok(!card.classList.contains('hidden'), 'Operating card must be visible when Operating pill is active');
    }
    for (const card of marginCards) {
      assert.ok(card.classList.contains('hidden'), 'Margin card must be hidden when Operating pill is active');
    }

    // Clicking 'all' pill resets all cards to visible
    const allPill = container.querySelector('.cat-pill[data-category="all"]');
    allPill.dispatch('click');

    for (const card of marginCards) {
      assert.ok(!card.classList.contains('hidden'), 'Margin card must be visible when all pill is active');
    }

    view.dispose();
  });

  test('mode switch toggles visibility between Sliders and Table views', async () => {
    const assumptions = await loadTestAssumptions();
    const container = createInteractiveContainer();

    const view = renderAssumptions({ container, assumptions });

    const slidersView = container.querySelector('#assumptions-sliders-view');
    const tableView = container.querySelector('#assumptions-table-view');
    const tableBtn = container.querySelector('.mode-btn[data-mode="table"]');
    const slidersBtn = container.querySelector('.mode-btn[data-mode="sliders"]');

    assert.ok(!slidersView.classList.contains('hidden'), 'Sliders view must be visible by default');
    assert.ok(tableView.classList.contains('hidden'), 'Table view must be hidden by default');

    // Switch to Table View
    tableBtn.dispatch('click');
    assert.ok(slidersView.classList.contains('hidden'), 'Sliders view must hide on table mode');
    assert.ok(!tableView.classList.contains('hidden'), 'Table view must show on table mode');

    // Switch back to Sliders
    slidersBtn.dispatch('click');
    assert.ok(!slidersView.classList.contains('hidden'), 'Sliders view must show on sliders mode');
    assert.ok(tableView.classList.contains('hidden'), 'Table view must hide on sliders mode');

    view.dispose();
  });
});

describe('RP2.2  -  Multi-Year Forecast Table View & Input Color-Coding', () => {
  async function loadTestAssumptions() {
    return dataLayer.loadAssumptions({
      filePath: ASSUMPTIONS_DATA_PATH,
      readText: (p) => fs.promises.readFile(p, 'utf8'),
    });
  }

  test('renders multi-year forecast matrix table covering FY2021 through FY2030E with pinned label column', async () => {
    const assumptions = await loadTestAssumptions();
    const container = createInteractiveContainer();
    const view = renderAssumptions({ container, assumptions });

    const html = container.innerHTML;

    // Header validation: all 10 years present
    const expectedYears = ['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025', 'FY2026E', 'FY2027E', 'FY2028E', 'FY2029E', 'FY2030E'];
    for (const yr of expectedYears) {
      assert.match(html, new RegExp(`<th[^>]*class="[^"]*matrix-col-header[^"]*"[^>]*>${yr}</th>`), `Header must contain ${yr}`);
    }

    // Pinned label column
    assert.match(html, /<th[^>]*class="[^"]*matrix-label-th[^"]*"/, 'First column header must be pinned matrix-label-th');
    assert.match(html, /<td[^>]*class="[^"]*matrix-label-td[^"]*"/, 'Data rows must have pinned matrix-label-td');

    view.dispose();
  });

  test('renders all 4 contract sections with structured rows', async () => {
    const assumptions = await loadTestAssumptions();
    const container = createInteractiveContainer();
    const view = renderAssumptions({ container, assumptions });

    const html = container.innerHTML;

    // 4 section headers
    assert.match(html, /Operating Metrics &amp; KPIs|Operating Metrics & KPIs/);
    assert.match(html, /Revenue Build/);
    assert.match(html, /Cost and Margin Assumptions/);
    assert.match(html, /Balance Sheet &amp; Cash Flow Assumptions|Balance Sheet & Cash Flow Assumptions/);

    // Section 1 operating rows
    assert.match(html, /Total MAUs \(millions\)/);
    assert.match(html, /Paid Subscribers \(millions\)/);
    assert.match(html, /Subscriber Conversion Rate \(%\)/);
    assert.match(html, /Average Revenue per Paid User \(ARPPU\)/);
    assert.match(html, /Ad Revenue per MAU/);
    assert.match(html, /Total Revenue per MAU/);

    // Section 2 revenue build rows
    assert.match(html, /Subscription Revenue \(US\$ mm\)/);
    assert.match(html, /Advertising Revenue \(US\$ mm\)/);
    assert.match(html, /Other Revenue \(US\$ mm\)/);
    assert.match(html, /Total Revenue \(US\$ mm\)/);
    assert.match(html, /Revenue Mix \(%\)/);

    // Section 3 cost & margins rows
    assert.match(html, /Cost of Revenue \(% of revenue\)/);
    assert.match(html, /Research &amp; Development \(% of revenue\)|Research & Development/);
    assert.match(html, /Sales &amp; Marketing \(% of revenue\)|Sales & Marketing/);
    assert.match(html, /General &amp; Administrative \(% of revenue\)|General & Administrative/);
    assert.match(html, /Operating Expense \(% of revenue\)/);
    assert.match(html, /EBIT Margin \(%\)/);
    assert.match(html, /Net Margin \(%\)/);

    // Section 4 balance sheet rows
    assert.match(html, /Accounts Receivable \(Days\)/);
    assert.match(html, /Deferred Revenue \(Days\)/);
    assert.match(html, /Accounts Payable \(Days\)/);
    assert.match(html, /Capital Expenditures \(% of revenue\)/);
    assert.match(html, /Depreciation &amp; Amortization \(% of revenue\)|Depreciation & Amortization/);
    assert.match(html, /Stock-Based Compensation \(% of revenue\)/);
    assert.match(html, /Cash Tax Rate \(%\)/);
    assert.match(html, /Change in Net Working Capital \(% of revenue\)/);

    view.dispose();
  });

  test('historical columns (FY2021-FY2025) are strictly non-flat, cited actuals', async () => {
    const assumptions = await loadTestAssumptions();
    const container = createInteractiveContainer();
    const view = renderAssumptions({ container, assumptions });

    const html = container.innerHTML;

    // Verify non-flat actuals are present (e.g. MAUs 40.5, 60.7, 88.4, 116.7, 133.1)
    assert.ok(html.includes('>40.5<'), 'Must contain FY21 MAU');
    assert.ok(html.includes('>60.7<'), 'Must contain FY22 MAU');
    assert.ok(html.includes('>88.4<'), 'Must contain FY23 MAU');
    assert.ok(html.includes('>116.7<'), 'Must contain FY24 MAU');
    assert.ok(html.includes('>133.1<'), 'Must contain FY25 MAU');

    // Verify cited actual titles
    assert.match(html, /title="Audited SEC 10-K Actual"/);
    assert.match(html, /title="SEC Form 10-K Audited Filing Actual"/);

    view.dispose();
  });

  test('projection years (FY2026E-FY2030E) feature .cell-input and data-matrix-driver on editable drivers', async () => {
    const assumptions = await loadTestAssumptions();
    const container = createInteractiveContainer();
    const view = renderAssumptions({ container, assumptions });

    const matrixInputs = container.querySelectorAll('[data-matrix-driver]');
    assert.ok(matrixInputs.length > 0, 'Must have editable matrix inputs');

    // All editable matrix inputs must have cell-input and matrix-cell-input classes
    for (const input of matrixInputs) {
      assert.ok(input.classList.contains('cell-input'), 'Matrix input must have .cell-input');
      assert.ok(input.classList.contains('matrix-cell-input'), 'Matrix input must have .matrix-cell-input');
      assert.ok(input.classList.contains('tabular-nums'), 'Matrix input must have .tabular-nums');
    }

    // Verify specific drivers are wired in matrix
    const wiredDrivers = [
      'paid_subscriber_growth',
      'subscription_arpu',
      'advertising_revenue_growth',
      'cost_of_revenue_pct_revenue',
      'rd_pct_revenue',
      'sm_pct_revenue',
      'ga_pct_revenue',
      'dso_days',
      'deferred_revenue_pct_revenue',
      'dpo_days',
      'capex_total_pct_revenue',
      'depreciation_pct_revenue',
      'sbc_target_pct_of_revenue',
      'effective_tax_rate',
    ];
    for (const driverName of wiredDrivers) {
      const el = container.querySelector(`[data-matrix-driver="${driverName}"]`);
      assert.ok(el, `Must have matrix input for driver ${driverName}`);
    }

    view.dispose();
  });

  test('two-way reactive binding: editing matrix table input updates slider and dispatches onChange', async () => {
    const assumptions = await loadTestAssumptions();
    const container = createInteractiveContainer();

    const changes = [];
    const view = renderAssumptions({
      container,
      assumptions,
      onChange: (name, val) => {
        changes.push({ name, val });
      },
    });

    const mInput = container.querySelector('[data-matrix-driver="paid_subscriber_growth"]');
    assert.ok(mInput, 'paid_subscriber_growth matrix input must exist');

    // Edit matrix cell
    mInput.value = '22.5%';
    mInput.dispatch('change');

    assert.equal(changes.length, 1, 'Must dispatch change on matrix edit');
    assert.equal(changes[0].name, 'paid_subscriber_growth');
    assert.ok(Math.abs(changes[0].val - 0.225) < 1e-4, 'Parsed value must be 0.225');

    // Check slider and pill were updated
    const slider = container.querySelector('[data-driver-slider="paid_subscriber_growth"]');
    const pill = container.querySelector('[data-driver-input="paid_subscriber_growth"]');
    assert.ok(slider);
    assert.ok(pill);
    assert.equal(slider.value, '0.225');
    assert.equal(pill.value, '22.50%');

    view.dispose();
  });

  test('category filtering filters table rows according to data-category', async () => {
    const assumptions = await loadTestAssumptions();
    const container = createInteractiveContainer();
    const view = renderAssumptions({ container, assumptions });

    const operatingPill = container.querySelector('.cat-pill[data-category="operating"]');
    const allPill = container.querySelector('.cat-pill[data-category="all"]');
    assert.ok(operatingPill);
    assert.ok(allPill);

    // Filter by operating
    operatingPill.dispatch('click');

    const operatingRows = container.querySelectorAll('.matrix-data-row[data-category="operating"]');
    const marginRows = container.querySelectorAll('.matrix-data-row[data-category="margins"]');

    assert.ok(operatingRows.length > 0);
    assert.ok(marginRows.length > 0);

    for (const row of operatingRows) {
      assert.ok(!row.classList.contains('hidden'), 'Operating table row must remain visible');
    }
    for (const row of marginRows) {
      assert.ok(row.classList.contains('hidden'), 'Margin table row must be hidden');
    }

    // Reset to all
    allPill.dispatch('click');
    for (const row of marginRows) {
      assert.ok(!row.classList.contains('hidden'), 'Margin table row must be visible when All is active');
    }

    view.dispose();
  });
});

describe('RP2 Quality Gates & Static Analysis', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const assumptionsTabSource = fs.readFileSync(ASSUMPTIONS_TAB_PATH, 'utf8');

  test('zero inline style= attributes across index.html and assumptionsTab.js', () => {
    const inlineStyleRegex = /<[^>]+style\s*=\s*["'][^"']*["'][^>]*>/gi;
    const matchesHtml = [...html.matchAll(inlineStyleRegex)];
    assert.equal(matchesHtml.length, 0, 'index.html must have 0 inline style attributes');

    const matchesTab = [...assumptionsTabSource.matchAll(inlineStyleRegex)];
    assert.equal(matchesTab.length, 0, 'assumptionsTab.js must have 0 inline style attributes');
  });

  test('assumptionsTab.js contains zero bare numeric literals > 999 outside comments', () => {
    const withoutComments = assumptionsTabSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    const bareNumbers = [...withoutComments.matchAll(/\b\d{4,}\b/g)].map((m) => m[0]);
    assert.deepEqual(bareNumbers, [], 'assumptionsTab.js must contain zero bare numbers > 999');
  });

  test('assumptionsTab.js satisfies strict purity contract (zero Date.now, Math.random, fetch)', () => {
    assert.doesNotMatch(assumptionsTabSource, /\bDate\.now\s*\(/, 'no Date.now');
    assert.doesNotMatch(assumptionsTabSource, /\bMath\.random\s*\(/, 'no Math.random');
    assert.doesNotMatch(assumptionsTabSource, /\bfetch\s*\(/, 'no fetch');
  });

  test('index.html contains zero protocol occurrences (case-insensitive)', () => {
    assert.doesNotMatch(html, /protocol/i, 'index.html must not mention protocol');
  });

  test('corpus invariant: 706 historical records unchanged', async () => {
    const historical = await dataLayer.loadHistorical({
      dir: path.join(ROOT, 'src/data/historical') + path.sep,
      readText: (p) => fs.promises.readFile(p, 'utf8'),
      requireLedger: true,
      ledger: LEDGER_URLS,
    });
    const allRows = [
      ...extractRows(historical.income),
      ...extractRows(historical.balance),
      ...extractRows(historical.cashflow),
      ...extractRows(historical.kpis),
    ];
    assert.equal(allRows.length, 706, 'Corpus must remain exactly 706 records');
  });
});

describe('RP2 Live App Controller Integration', () => {
  test('createApp mounts assumptionsView with reactive recalculation', async () => {
    const historical = await dataLayer.loadHistorical({
      dir: path.join(ROOT, 'src/data/historical') + path.sep,
      readText: (p) => fs.promises.readFile(p, 'utf8'),
      requireLedger: true,
      ledger: LEDGER_URLS,
    });
    const assumptions = await dataLayer.loadAssumptions({
      filePath: ASSUMPTIONS_DATA_PATH,
      readText: (p) => fs.promises.readFile(p, 'utf8'),
    });

    const { root, panes } = createTabRoot(['cover', 'assumptions', 'historicals', 'schedules', 'projections', 'valuation', 'summary', 'sensitivity']);
    const assumptionsPane = panes[1];

    const app = createApp({
      data: dataLayer,
      engine: {},
      historical,
      assumptions,
      root,
      now: () => 1725148800000,
    });

    assert.ok(assumptionsPane.innerHTML.includes('02. Assumptions / Drivers'));
    assert.ok(assumptionsPane.innerHTML.includes('data-driver-input="beta"'));

    // Trigger driver change via app
    app.setDriver('beta', 1.55);
    assert.equal(app.state().assumptions.get('beta').value, 1.55);

    // Check that assumptionsPane innerHTML was updated with new formatted value
    assert.ok(assumptionsPane.innerHTML.includes('value="1.55"'), 'assumptionsPane HTML must update with 1.55');

    app.dispose();
  });

  test('RP2.1 timing pin: slider change triggers synchronous recalculation with median < 16ms over repeated dispatches', async () => {
    const historical = await dataLayer.loadHistorical({
      dir: path.join(ROOT, 'src/data/historical') + path.sep,
      readText: (p) => fs.promises.readFile(p, 'utf8'),
      requireLedger: true,
      ledger: LEDGER_URLS,
    });
    const assumptions = await dataLayer.loadAssumptions({
      filePath: ASSUMPTIONS_DATA_PATH,
      readText: (p) => fs.promises.readFile(p, 'utf8'),
    });

    const { root, panes } = createTabRoot(['cover', 'assumptions', 'historicals', 'schedules', 'projections', 'valuation', 'summary', 'sensitivity']);
    const assumptionsPane = panes[1];

    const app = createApp({
      data: dataLayer,
      engine: {},
      historical,
      assumptions,
      root,
      now: () => 1725148800000,
    });

    // Warm-up runs
    for (let k = 0; k < 5; k++) {
      app.setDriver('beta', 1.50 + k * 0.01);
    }

    // Measure 20 repeated iterations of slider dispatch / recalculation
    const times = [];
    for (let i = 0; i < 20; i++) {
      const val = i % 2 ? 1.50 : 1.55;
      const t0 = performance.now();
      app.setDriver('beta', val);
      const elapsed = performance.now() - t0;
      times.push(elapsed);
    }

    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];

    assert.ok(
      median < 16.0,
      `Slider recalculation latency must be median < 16ms (measured: ${median.toFixed(3)}ms)`
    );

    app.dispose();
  });
});

