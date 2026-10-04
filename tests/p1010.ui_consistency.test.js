/**
 * P10.10 Cross-Tab UI Consistency Suite
 *
 * Verifies contract findings U1–U7 and carry item C1:
 *  - C1: Summary tab refresh button restores to '↻ Refresh Last Close'
 *  - U1: 3-cluster / 5-voting-row synthesis wording; banned-language sweeps
 *  - U2: Valuation detail/bridge prefers production dated seam currentDcf over fcff
 *  - U3: Projections 2030E KPI sublabels are 'Explicit-horizon (2030E)'
 *  - U4: App shell and header dynamic date synchronization (Sep 2, 2026; fallback is '-')
 *  - U5: Share denominator diagnostic labeling
 *  - U6: Divisor basis intermediate labeling
 *  - U7: Separator (en-dash '–'), units notation ($M), and scenario vocabulary captioning
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderSummary } from '../src/ui/summaryTab.js';
import { renderProjections } from '../src/ui/projectionsTab.js';
import { renderValuation } from '../src/ui/valuationTab.js';
import { renderSensitivity } from '../src/ui/sensitivityTab.js';
import { renderCover } from '../src/ui/coverTab.js';
import { createApp } from '../src/app.js';
import { EFFECTIVE_VALUATION_DATE } from '../src/data/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function stubContainer() {
  let html = '';
  const listeners = {};
  return {
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v); },
    addEventListener(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    removeEventListener(event, fn) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((f) => f !== fn);
      }
    },
    dispatchEvent(event) {
      const fns = listeners[event.type] || [];
      for (const fn of fns) fn(event);
    },
    querySelector(sel) {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

describe('P10.10: C1 — Refresh Last Close Button Restoration Pin', () => {
  test('summaryTab restores button text to "↻ Refresh Last Close" post-refresh', async () => {
    const container = stubContainer();
    let refreshCalled = false;
    let resolveRefresh;
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    const mockDcf = {
      perShare: 144.08,
      sharesOutstanding: 66890000,
      pvExplicit: 200000,
      pvTerminal: 800000,
      netCash: 100000,
      stageDisclosure: { stageTag: '3-Stage', fadePresent: true },
    };
    const mockRec = {
      label: 'fair',
      recommendation: 'fair',
      upsidePct: -0.087,
    };
    const mockVerdict = {
      verdict: 'fair',
      agreement: { unanimous: true },
    };
    const mockMethods = [
      { method: 'fcff_dcf', label: '3-Stage FCFF DCF', impliedPerShare: 144.08, upsidePct: -0.087, verdict: 'fair', impliedEquityValue: 9637500 },
    ];

    const view = renderSummary({
      container,
      dcf: mockDcf,
      recommendation: mockRec,
      marketPrice: 157.85,
      verdict: mockVerdict,
      methods: mockMethods,
      onRefreshPrice: () => {
        refreshCalled = true;
        return refreshPromise;
      },
    });

    // Initial button text in HTML
    assert.match(container.innerHTML, /↻ Refresh Last Close/, 'Initial button text must be ↻ Refresh Last Close');

    // Simulate clicking the refresh button
    const btnStub = {
      textContent: '↻ Refresh Last Close',
      disabled: false,
      closest: (sel) => (sel === '[data-action="refresh-price"]' ? btnStub : null),
    };
    container.dispatchEvent({ type: 'click', target: btnStub });

    assert.equal(refreshCalled, true, 'onRefreshPrice must be invoked on click');
    assert.equal(btnStub.disabled, true, 'Button must be disabled during refresh');
    assert.equal(btnStub.textContent, 'Refreshing...', 'Button must show Refreshing... during refresh');

    // Resolve refresh
    resolveRefresh();
    await refreshPromise;
    // Allow finally block microtask to run
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(btnStub.disabled, false, 'Button must be re-enabled after refresh');
    assert.equal(btnStub.textContent, '↻ Refresh Last Close', 'Button must restore to "↻ Refresh Last Close", never "↻ Refresh Live Price"');

    view.dispose();
  });
});

describe('P10.10: U1 — Synthesis Contract Language & Banned Residuals', () => {
  test('valuationTab synthesis card carries 3 Evidence Clusters · 5 Voting Rows', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/ui/valuationTab.js'), 'utf8');
    assert.match(source, /Multi-Method Valuation Synthesis \(3 Evidence Clusters · 5 Voting Rows\)/);
    assert.match(source, /Three evidence clusters \(5 voting methods\) evaluated under an unweighted agreement-only verdict engine/);
    assert.match(source, /SOTP decomposition-only, FCFE diagnostic-only/);
    assert.match(source, /producing three constituent implied per-share values/);

    // Negative controls / banned residual phrases
    assert.doesNotMatch(source, /Multi-Method Valuation Synthesis \(6 Valuation Methods\)/);
    assert.doesNotMatch(source, /Six institutional valuation methodologies evaluated/);
    assert.doesNotMatch(source, /producing three independent implied per-share values/);
  });

  test('summaryTab carries clustered agreement verdict phrasing', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/ui/summaryTab.js'), 'utf8');
    assert.match(source, /the clustered agreement verdict is/);
    assert.match(source, /Unanimous clustered agreement/);

    // Negative controls
    assert.doesNotMatch(source, /the six-method agreement verdict is/);
    assert.doesNotMatch(source, /Unanimous 6-method agreement/);
  });
});

describe('P10.10: U2 — Production Lane Preference in DCF Detail & Bridge', () => {
  test('valuationTab DCF detail panel prefers currentDcf over fcff', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/ui/valuationTab.js'), 'utf8');

    // pvExplicitVal prefers currentDcf
    assert.match(source, /currentDcf\?\.pvByStage\?\.explicit \?\? fcff\.pvByStage\?\.explicit/);
    assert.match(source, /currentDcf\?\.pvExplicit \?\? fcff\.pvExplicit/);

    // pvFadeVal prefers currentDcf
    assert.match(source, /currentDcf\?\.pvByStage\?\.fade \?\? fcff\.pvByStage\?\.fade/);

    // pvTerminal prefers currentDcf
    assert.match(source, /currentDcf\?\.pvTerminal \?\? fcff\.pvTerminal/);

    // netCash prefers currentDcf
    assert.match(source, /currentDcf\?\.netCash \?\? fcff\.netCashToday/);
  });
});

describe('P10.10: U3 — Explicit-Horizon (2030E) KPI Labeling', () => {
  test('projectionsTab KPI sublabels explicitly designate Explicit-horizon (2030E)', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/ui/projectionsTab.js'), 'utf8');
    assert.match(source, /Explicit-horizon \(2030E\) EBIT margin/);
    assert.match(source, /Explicit-horizon \(2030E\) UFCF margin/);
    assert.match(source, /Explicit-horizon \(2030E\) net income/);

    // Negative control: 2030 is NOT the terminal year (terminal year is FY2035)
    assert.doesNotMatch(source, /Terminal-year EBIT margin/);
    assert.doesNotMatch(source, /Terminal-year UFCF margin/);
    assert.doesNotMatch(source, /Terminal-year net income/);
  });
});

describe('P10.10: U4 — App Shell & Header Dynamic Date Synchronization', () => {
  test('index.html static shell carries Sep 2, 2026 header and footer', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.match(html, /<span class="meta-value" data-header-meta="valuation-date">Sep 2, 2026<\/span>/);
    assert.match(html, /<span>Sep 2, 2026<\/span>/);
    assert.doesNotMatch(html, /data-header-meta="valuation-date">Sep 1, 2026/);
  });

  test('coverTab formatDateClean returns "-" on missing or invalid date, never a plausible real date', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/ui/coverTab.js'), 'utf8');
    assert.match(source, /if \(!dateStr \|\| typeof dateStr !== 'string'\) return '-';/);
    assert.doesNotMatch(source, /return 'Sep 1, 2026';/);
  });

  test('src/app.js dynamically updates [data-header-meta="valuation-date"] on boot', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
    assert.match(source, /data-header-meta="valuation-date"/);
    assert.match(source, /syncHeaderValuationDate/);
  });
});

describe('P10.10: U5 & U6 — Share Denominator & Divisor Provenance Disclosures', () => {
  test('coverTab documents Note 11 EPS diagnostic and DCF intermediate roll in titles', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/ui/coverTab.js'), 'utf8');
    assert.match(source, /Note 11 weighted-average EPS diagnostic only \(cannot serve as valuation denominator; relative methods use ruled FD schedule 50\.06M\)/);
    assert.match(source, /intermediate roll through explicit & fade horizons before perpetual dilution/);
  });
});

describe('P10.10: U7 — Separators, Units, and Scenario Vocabulary Conventions', () => {
  test('valuationTab uses en-dash "–" in range outputs', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/ui/valuationTab.js'), 'utf8');
    assert.match(source, /Range: \$\{usd\(m\.rangePerShare\.min, \{ decimals: 2 \}\)\} – \$\{usd\(m\.rangePerShare\.max, \{ decimals: 2 \}\)\}/);
    assert.match(source, /Span \$\{usd\(m\.rangePerShare\?\.min, \{ decimals: 2 \}\)\} – \$\{usd\(m\.rangePerShare\?\.max, \{ decimals: 2 \}\)\}/);
    assert.doesNotMatch(source, /Range: \$\{usd\(m\.rangePerShare\.min, \{ decimals: 2 \}\)\};/);
  });

  test('summaryTab table header declares units as ($M)', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/ui/summaryTab.js'), 'utf8');
    assert.match(source, /<th class="align-right">Implied Equity Value \(\$M\)<\/th>/);
    assert.doesNotMatch(source, /<th class="align-right">Implied Equity Value \(\$mm\)<\/th>/);
  });

  test('summaryTab uses en-dash "–" in valuation spread outputs', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/ui/summaryTab.js'), 'utf8');
    assert.match(source, /\$\{usd\(minSpread, \{ decimals: 2 \}\)\} – \$\{usd\(maxSpread, \{ decimals: 2 \}\)\}/);
    assert.match(source, /\$\{usd\(minEquityMm, \{ decimals: 2 \}\)\} – \$\{usd\(maxEquityMm, \{ decimals: 2 \}\)\}/);
    assert.match(source, /\$\{percent\(spreadUpsideMin, \{ decimals: 2, showSign: true \}\)\} – \$\{percent\(spreadUpsideMax, \{ decimals: 2, showSign: true \}\)\}/);
    assert.doesNotMatch(source, /\$\{usd\(minSpread, \{ decimals: 2 \}\)\} - \$\{usd\(maxSpread, \{ decimals: 2 \}\)\}/);
  });

  test('sensitivityTab captions scenario beta range with Downside / Upside vocabulary', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/ui/sensitivityTab.js'), 'utf8');
    assert.match(source, /Downside.*Bear β.*Base β.*Upside.*Bull β/);
  });
});
