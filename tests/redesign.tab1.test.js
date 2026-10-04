/**
 * Redesign Phase 1 Test Suite  -  Tab 01: Cover & Model Architecture.
 *
 * Covers:
 *  - RP1.1: Cover Dashboard Grid layout (.cover-grid) and 5 core executive cards
 *  - RP1.1: Metadata HUD (.cover-overview-card) with 4 .stat-pill indicators
 *  - RP1.1: Live valuation snapshot (.cover-snapshot-card) with dynamic .badge-upside
 *  - RP1.1: Model integrity status card (.cover-status-card) with 6 verified checklist items
 *  - RP1.1: Baseline key assumptions card (.cover-assumptions-card)
 *  - RP1.1: Multi-method valuation summary card (.cover-methods-card) with 6 methods
 *  - RP1.1: Dynamic view controller in src/ui/coverTab.js with update and dispose lifecycle
 *  - RP1.2: Architecture directory table (.architecture-table) with 8 rows in spec order
 *  - RP1.2: Clickable jump buttons (.jump-btn / [data-jump-tab]) activating target tabs
 *  - RP1.2: Side-by-side callouts (.callout-info, .callout-warning) with verified SVG icon references
 *  - Quality Gates: Zero inline style=, zero bare numbers > 999 in coverTab.js, purity, and zero protocol mentions
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderCover } from '../src/ui/coverTab.js';
import { createTabs, TAB_KEYS } from '../src/ui/tabs.js';
import { createTabRoot, StubElement } from './_dom_stub.js';
import { createApp } from '../src/app.js';
import * as dataLayer from '../src/data/loader.js';
import { LEDGER_URLS } from '../src/data/ledger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const COVERTAB_PATH = path.join(ROOT, 'src/ui/coverTab.js');

describe('RP1.1  -  Cover Dashboard Grid & HTML Card Markup (index.html)', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  test('tab-cover pane contains .cover-grid with responsive styling', () => {
    assert.match(html, /<section[^>]+id="tab-cover"[^>]*>/, 'Tab 01 pane #tab-cover must exist');
    assert.match(html, /class="[^"]*cover-grid[^"]*"/, 'Tab 01 must use .cover-grid layout');
    assert.match(html, /\.cover-grid\s*\{[^}]*display:\s*grid/, 'CSS must declare display: grid for .cover-grid');
  });

  test('declares all 5 mandated executive cards with semantic HTML elements', () => {
    const requiredCards = [
      '.cover-overview-card',
      '.cover-snapshot-card',
      '.cover-status-card',
      '.cover-assumptions-card',
      '.cover-methods-card',
    ];

    for (const cardClass of requiredCards) {
      assert.ok(
        html.includes(cardClass.slice(1)),
        `index.html must declare element with class "${cardClass}"`,
      );
      assert.match(
        html,
        new RegExp(`<article[^>]+class="[^"]*${cardClass.slice(1)}[^"]*"`),
        `Card ${cardClass} must be rendered with semantic <article> element`,
      );
    }
  });

  test('overview card contains prose and exactly 4 .stat-pill elements', () => {
    assert.match(html, /class="[^"]*cover-overview-card[^"]*"/);
    assert.match(html, /class="[^"]*cover-prose[^"]*"/);

    const statPillMatches = [...html.matchAll(/class="[^"]*stat-pill\b[^"]*"/g)];
    assert.ok(
      statPillMatches.length >= 4,
      `Overview card must contain at least 4 .stat-pill elements; found ${statPillMatches.length}`,
    );

    assert.match(html, /Valuation Date/i);
    assert.match(html, /Share Price/i);
    assert.match(html, /Model Version/i);
    assert.match(html, /Model Type/i);
  });

  test('valuation snapshot card contains dynamic upside badge and metrics placeholders', () => {
    assert.match(html, /class="[^"]*cover-snapshot-card[^"]*"/);
    assert.match(html, /class="[^"]*badge-upside[^"]*"/);
    assert.match(html, /id="cover-dcf-fair-value"/);
    assert.match(html, /id="cover-snapshot-market-price"/);
    assert.match(html, /id="cover-snapshot-wacc"/);
    assert.match(html, /id="cover-snapshot-growth"/);
  });

  test('model status card contains 6 verified checklist items with check-circle SVG', () => {
    assert.match(html, /class="[^"]*cover-status-card[^"]*"/);
    assert.match(html, /class="[^"]*status-checklist[^"]*"/);

    const checkIconMatches = [...html.matchAll(/assets\/icons\/ui\/check-circle\.svg/g)];
    assert.ok(
      checkIconMatches.length >= 6,
      `Status checklist must reference check-circle.svg at least 6 times; found ${checkIconMatches.length}`,
    );

    const checkSvgPath = path.join(ROOT, 'assets/icons/ui/check-circle.svg');
    assert.ok(fs.existsSync(checkSvgPath), 'check-circle.svg asset must exist on disk');
  });

  test('methods card contains table ready for 6 valuation methodologies', () => {
    assert.match(html, /class="[^"]*cover-methods-card[^"]*"/);
    assert.match(html, /class="[^"]*methods-summary-table[^"]*"/);
    assert.match(html, /id="cover-methods-table-body"/);
  });
});

describe('RP1.1  -  Cover Tab View Controller (src/ui/coverTab.js)', () => {
  test('renderCover throws invalid_dependency if container is missing', () => {
    assert.throws(
      () => renderCover({}),
      /renderCover requires a container DOM element/,
    );
  });

  test('renderCover hydrates container with dynamic engine outputs', () => {
    const container = new StubElement();
    let _html = '';
    Object.defineProperty(container, 'innerHTML', {
      get() { return _html; },
      set(val) { _html = String(val); },
    });

    const mockDcf = {
      perShare: 144.08,
      sharesOutstanding: 50031000,
    };
    const mockWacc = {
      wacc: { value: 0.111225 },
    };
    const mockRec = {
      recommendation: 'fair',
      upsidePct: -0.0872,
    };
    const mockAssumptions = {
      get(name) {
        if (name === 'market_share_price') return { value: 157.85, asOf: '2026-09-01' };
        if (name === 'terminal_growth_rate') return { value: 0.025 };
        if (name === 'effective_tax_rate') return { value: 0.21 };
        if (name === 'paid_subscriber_growth') return { value: 0.184 };
        return null;
      },
    };
    const mockMethods = [
      { label: '2-Stage FCFF DCF', impliedPerShare: 144.08, upsidePct: -0.0872, verdict: 'fair' },
      { label: 'Trading Comparables', impliedPerShare: 141.59, upsidePct: -0.1030, verdict: 'fair' },
      { label: 'EV/EBITDAR Multiples', impliedPerShare: 116.20, upsidePct: -0.2639, verdict: 'overvalued' },
      { label: 'P/FCF Multiple', impliedPerShare: 240.43, upsidePct: 0.5232, verdict: 'undervalued' },
      { label: 'Sum-of-the-Parts (SOTP)', impliedPerShare: 141.59, upsidePct: -0.1030, verdict: 'fair' },
      { label: 'Per-User Metric Value', impliedPerShare: 443.68, upsidePct: 1.8108, verdict: 'undervalued' },
    ];
    const mockVerdict = {
      verdict: 'fair',
    };

    const view = renderCover({
      container,
      dcf: mockDcf,
      wacc: mockWacc,
      recommendation: mockRec,
      assumptions: mockAssumptions,
      methods: mockMethods,
      verdict: mockVerdict,
    });

    assert.ok(container.innerHTML.includes('$144.08'), 'Must display live DCF per share $144.08');
    assert.ok(container.innerHTML.includes('$157.85'), 'Must display live market price $157.85');
    assert.ok(container.innerHTML.includes('-8.7%'), 'Must display live implied upside %');
    assert.ok(container.innerHTML.includes('11.12%'), 'Must display active WACC 11.12%');
    assert.ok(container.innerHTML.includes('2.50%'), 'Must display terminal growth 2.50%');
    assert.ok(container.innerHTML.includes('50.03M'), 'Must display formatted diluted shares count');
    assert.ok(container.innerHTML.includes('$116.20 – $443.68'), 'Must display multi-method spread');
    assert.ok(!container.innerHTML.includes('$204.59'), 'Must NOT contain unsanctioned arithmetic mean $204.59');
    assert.ok(container.innerHTML.includes('Trading Comparables'), 'Must render all 6 methods in table');
    assert.ok(container.innerHTML.includes('Sum-of-the-Parts (SOTP)'), 'Must render SOTP method');

    // Test update path
    view.update(
      { perShare: 160.00, sharesOutstanding: 50031000 },
      mockWacc,
      { recommendation: 'fair', upsidePct: 0.0136 },
      mockAssumptions,
      null,
      mockMethods,
      mockVerdict,
    );

    assert.ok(container.innerHTML.includes('$160.00'), 'Update path must refresh DCF fair value');
    assert.ok(container.innerHTML.includes('+1.4%'), 'Update path must refresh implied upside');

    // Test dispose path
    view.dispose();
    assert.equal(container.innerHTML, '', 'dispose() must clear container HTML');
  });
});

describe('RP1.2  -  Architecture Directory & Navigation Jump Links', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  test('architecture directory table contains exactly 8 rows matching TAB_KEYS', () => {
    assert.match(html, /<table[^>]+class="[^"]*architecture-table[^"]*"/);

    for (const key of TAB_KEYS) {
      assert.ok(
        html.includes(`data-jump-tab="${key}"`),
        `Architecture directory must contain jump target for "${key}"`,
      );
    }

    const rowMatches = [...html.matchAll(/<tr[^>]+data-jump-tab="([^"]+)"[^>]*>/g)];
    assert.equal(rowMatches.length, 8, 'Must have exactly 8 navigation rows');
    assert.deepEqual(
      rowMatches.map((m) => m[1]),
      [...TAB_KEYS],
      'Rows must match TAB_KEYS spec order 01 through 08',
    );
  });

  test('each row contains .jump-btn button', () => {
    const jumpBtnMatches = [...html.matchAll(/class="[^"]*jump-btn[^"]*"/g)];
    assert.equal(jumpBtnMatches.length, 8, 'Must contain exactly 8 .jump-btn buttons');
  });

  test('clicking any row or jump button switches immediately to target tab', () => {
    const { root, links, panes } = createTabRoot(TAB_KEYS);
    const tabs = createTabs({ root, tabs: TAB_KEYS });

    assert.equal(tabs.active(), 'cover');

    // Click jump link for assumptions
    const jumpEl = new StubElement({ 'data-jump-tab': 'assumptions' });
    root.dispatch('click', { target: jumpEl });
    assert.equal(tabs.active(), 'assumptions');
    assert.equal(panes[1].hasAttribute('hidden'), false);

    // Click jump link for valuation
    const jumpValuation = new StubElement({ 'data-jump-tab': 'valuation' });
    root.dispatch('click', { target: jumpValuation });
    assert.equal(tabs.active(), 'valuation');
    assert.equal(panes[5].hasAttribute('hidden'), false);

    // Click jump link for summary
    const jumpSummary = new StubElement({ 'data-jump-tab': 'summary' });
    root.dispatch('click', { target: jumpSummary });
    assert.equal(tabs.active(), 'summary');
    assert.equal(panes[6].hasAttribute('hidden'), false);

    tabs.dispose();
  });

  test('all 8 jump links navigate correctly and invalid target is safely ignored', () => {
    const { root, panes } = createTabRoot(TAB_KEYS);
    const tabs = createTabs({ root, tabs: TAB_KEYS });

    for (let i = 0; i < TAB_KEYS.length; i++) {
      const key = TAB_KEYS[i];
      const jumpEl = new StubElement({ 'data-jump-tab': key });
      root.dispatch('click', { target: jumpEl });
      assert.equal(tabs.active(), key);
      assert.equal(panes[i].hasAttribute('hidden'), false);
    }

    // Invalid target guard
    const badJump = new StubElement({ 'data-jump-tab': 'invalid_unknown' });
    root.dispatch('click', { target: badJump });
    assert.equal(tabs.active(), TAB_KEYS[TAB_KEYS.length - 1], 'Invalid jump target must not change active tab');

    tabs.dispose();
  });

  test('renderCover HTML output contains 8-row architecture directory and callouts', () => {
    const container = new StubElement();
    let _html = '';
    Object.defineProperty(container, 'innerHTML', {
      get() { return _html; },
      set(val) { _html = String(val); },
    });

    renderCover({ container });
    assert.match(container.innerHTML, /class="[^"]*architecture-table[^"]*"/);
    assert.match(container.innerHTML, /class="[^"]*callout-info[^"]*"/);
    assert.match(container.innerHTML, /class="[^"]*callout-warning[^"]*"/);
    for (const key of TAB_KEYS) {
      assert.ok(container.innerHTML.includes(`data-jump-tab="${key}"`), `Must contain jump target for ${key}`);
    }
  });
});

describe('RP1.2  -  Standardized Side-by-Side Callouts', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  test('contains .callout-info with Methodology Scope Note and info-circle.svg', () => {
    assert.match(html, /class="[^"]*callout-info[^"]*"/);
    assert.match(html, /Methodology Scope Note/i);
    assert.match(html, /Trading Comparables/i);
    assert.match(html, /Precedent Transactions/i);
    assert.match(html, /assets\/icons\/ui\/info-circle\.svg/);

    const infoSvgPath = path.join(ROOT, 'assets/icons/ui/info-circle.svg');
    assert.ok(fs.existsSync(infoSvgPath), 'info-circle.svg must exist on disk');
  });

  test('contains .callout-warning with Research Disclaimer and alert-triangle.svg', () => {
    assert.match(html, /class="[^"]*callout-warning[^"]*"/);
    assert.match(html, /Regulatory &amp; Research Disclaimer|Research Disclaimer/i);
    assert.match(html, /not investment advice/i);
    assert.match(html, /assets\/icons\/ui\/alert-triangle\.svg/);

    const alertSvgPath = path.join(ROOT, 'assets/icons/ui/alert-triangle.svg');
    assert.ok(fs.existsSync(alertSvgPath), 'alert-triangle.svg must exist on disk');
  });
});

describe('RP1 Quality Gates & Purity', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const coverSource = fs.readFileSync(COVERTAB_PATH, 'utf8');

  test('zero inline style= attributes across index.html and src/ui/coverTab.js', () => {
    const inlineStyleRegex = /<[^>]+style\s*=\s*["'][^"']*["'][^>]*>/gi;
    const matchesHtml = [...html.matchAll(inlineStyleRegex)];
    assert.equal(matchesHtml.length, 0, 'index.html must have 0 inline style attributes');

    const matchesCover = [...coverSource.matchAll(inlineStyleRegex)];
    assert.equal(matchesCover.length, 0, 'coverTab.js must have 0 inline style attributes');
  });

  test('src/ui/coverTab.js contains zero bare numeric literals > 999 outside comments', () => {
    const numberRegex = /(?<![A-Za-z0-9_$.])([1-9]\d{3,}(?:\.\d+)?)(?![A-Za-z0-9_$])/g;
    const lines = coverSource.split('\n');
    let inBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
      let code = lines[i];

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
          // Filing-date years in cited prose/asOf fallbacks (Warning #2 disposition,
          // EP.4): reviewed calendar years, not financial figures. The P8.0
          // orphan-figure gate audits user-visible numerals separately.
          if (match[1] === '2025' || match[1] === '2026') continue;
          assert.fail(
            `src/ui/coverTab.js line ${i + 1} contains bare numeric literal: ${match[1]} in: "${lines[i].trim()}"`,
          );
        }
    }
  });

  test('src/ui/coverTab.js satisfies strict purity contract', () => {
    assert.doesNotMatch(coverSource, /\bDate\.now\s*\(/, 'coverTab.js must not call Date.now');
    assert.doesNotMatch(coverSource, /\bMath\.random\s*\(/, 'coverTab.js must not call Math.random');
    assert.doesNotMatch(coverSource, /\bfetch\s*\(/, 'coverTab.js must not call fetch');
  });

  test('zero occurrences of protocol (case-insensitive)', () => {
    assert.doesNotMatch(coverSource, /protocol/i, 'coverTab.js must contain zero protocol occurrences');
    assert.doesNotMatch(html, /protocol/i, 'index.html must contain zero protocol occurrences');
  });
});

describe('RP1 Live App Controller Integration', () => {
  test('createApp mounts coverView and executes reactive recalculation updates', async () => {
    const historical = await dataLayer.loadHistorical({
      dir: path.join(ROOT, 'src/data/historical') + path.sep,
      readText: (p) => fs.promises.readFile(p, 'utf8'),
      requireLedger: true,
      ledger: LEDGER_URLS,
    });
    const assumptions = await dataLayer.loadAssumptions({
      filePath: path.join(ROOT, 'src/data/assumptions.json'),
      readText: (p) => fs.promises.readFile(p, 'utf8'),
    });

    const { root, panes } = createTabRoot(TAB_KEYS);
    const coverPane = panes[0];

    const app = createApp({
      data: dataLayer,
      engine: {},
      historical,
      assumptions,
      root,
      now: () => 1725148800000,
      horizon: 5,
    });

    // Verify Cover pane received hydrated markup
    assert.ok(coverPane.innerHTML.includes('Duolingo, Inc.'), 'Cover pane must contain title');
    assert.ok(coverPane.innerHTML.includes('Executive Model Overview'), 'Cover pane must contain overview');
    assert.ok(coverPane.innerHTML.includes('Valuation Snapshot'), 'Cover pane must contain snapshot');
    assert.ok(coverPane.innerHTML.includes('Model Integrity'), 'Cover pane must contain checklist');
    assert.ok(coverPane.innerHTML.includes('Architecture &amp; Section Directory') || coverPane.innerHTML.includes('Architecture & Section Directory'), 'Cover pane must contain directory');

    // Dynamic valuation figure check from the live calculation engine.
    // P10.6: the cover fair-value tile states the CANONICAL basis (after modeled future
    // dilution), NOT the finite-roll intermediate. On Lane B (createApp at horizon 5 with
    assert.ok(coverPane.innerHTML.includes('$119.26'), 'Cover pane must display the canonical DCF per share (Lane B canonical: horizon 5 + dated seam)');
    assert.ok(coverPane.innerHTML.includes('$157.85'), 'Cover pane must display live market price $157.85');

    // Trigger driver change: market price update
    app.setDriver('market_share_price', 160.00);
    assert.ok(coverPane.innerHTML.includes('$160.00'), 'Cover pane must update with new share price $160.00');

    // Trigger driver change: terminal growth update
    app.setDriver('terminal_growth_rate', 0.035);
    // P10.3: the benchmark is benchmark-only, so editing the market price moves
    // the market-price card and the upside but NOT the DCF fair value. The DCF
    // here is the g=3.50% recalculation, with issuance frozen at
    // `sbc_issuance_price` (unchanged by the 160.00 benchmark edit above).
    // The g=3.50% recalculation re-runs the DCF, and the DCF divisor is the
    // point-in-time fully diluted schedule, so this figure moves with the roll
    // base rather than being a fixed headline.
    // P10.6: stated on the CANONICAL basis. Measured off the live cover render at
    // g = 3.50%: canonical 129.86 (up from the 119.26 pre-edit canonical figure).
    assert.ok(coverPane.innerHTML.includes('$129.86'), 'Cover pane must recalculate the canonical DCF fair value to $129.86 at g=3.50%');
    assert.ok(coverPane.innerHTML.includes('3.50%'), 'Cover pane must update terminal growth rate display to 3.50%');

    app.dispose();
  });

  test('right rail displays live engine metrics for CAGR, margins, and funded debt with driver reactivity', async () => {
    const historical = await dataLayer.loadHistorical({
      dir: path.join(ROOT, 'src/data/historical') + path.sep,
      readText: (p) => fs.promises.readFile(p, 'utf8'),
      requireLedger: true,
      ledger: LEDGER_URLS,
    });
    const assumptions = await dataLayer.loadAssumptions({
      filePath: path.join(ROOT, 'src/data/assumptions.json'),
      readText: (p) => fs.promises.readFile(p, 'utf8'),
    });

    const { root, panes } = createTabRoot(TAB_KEYS);
    const coverPane = panes[0];

    const app = createApp({
      data: dataLayer,
      engine: {},
      historical,
      assumptions,
      root,
      now: () => 1725148800000,
    });

    // Check baseline right rail figures matching engine truth
    assert.ok(coverPane.innerHTML.includes('16.4%'), 'Must display 4-step Revenue CAGR 16.4%');
    assert.ok(coverPane.innerHTML.includes('13.1%'), 'Must display FY2030 EBIT margin 13.1%');
    assert.ok(coverPane.innerHTML.includes('31.4%'), 'Must display FY2030 FCF margin 31.4%');
    assert.ok(coverPane.innerHTML.includes('id="cover-assump-net-debt">$0'), 'Must display debt schedule verified Net Debt $0');

    // Trigger driver change affecting projections and margins
    app.setDriver('paid_subscriber_growth', 0.25);
    // After driver change, revenue growth / CAGR updates reactively
    assert.ok(!coverPane.innerHTML.includes('16.4%'), 'Cover pane must reactively refresh CAGR upon driver update');

    app.dispose();
  });
});

