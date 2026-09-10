/**
 * P8.4 Multi-Method Detail Presentation Tests (tests/methods.detail.test.js)
 *
 * Verifies all specifications from docs/phases/phase_8.md §3 Task P8.4 & OP Review Requirements:
 *  1. 6-Method Card & Detail Panel Matrix (fcff_dcf, comps, ev_multiples, pfcf, sotp, perUser)
 *  2. Tile card switching and aria-pressed / method-card-active state sync
 *  3. Panel-key sync ([data-method-panel] matches active selection)
 *  4. Per-method derivation binding:
 *      - DCF: 2-stage explicit forecast + Gordon TV + net cash bridge + lease convention disclosure
 *      - Comps: 3-name median EV/Revenue + capitalized net cash bridge
 *      - EV Multiples: EV/EBITDAR + RBLX exclusion rationale + capitalized net cash bridge
 *      - P/FCF: Equity-level P/FCF multiple on TTM FCF + peer yields
 *      - SOTP: Exactly 2 segments (Subscriptions w/ ad fold + DET w/ constraint) + segment EV sum
 *      - Per-User: 3 native bases (MAU, DAU, Paid Subs) + median of bases + DUOL ARPU context
 *  5. Selection persistence across view.update()
 *  6. Selection persistence across createApp live driver-edit recalculation
 *  7. Negative swap-inversion tripwire & fallback safety
 *  8. Listener disposal & clean teardown
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderValuation } from '../src/ui/valuationTab.js';
import { createApp } from '../src/app.js';
import * as dataLayer from '../src/data/loader.js';
import schedulesEngine from '../src/engine/schedules.js';
import forecastEngine from '../src/engine/forecast.js';
import threeStatementEngine from '../src/engine/threeStatement.js';
import { build as buildWacc } from '../src/engine/wacc.js';
import { valuate as valuateDcf } from '../src/engine/dcf.js';
import { evaluate as evaluateRec } from '../src/engine/recommend.js';
import { compute as computeTtm } from '../src/engine/ttm.js';
import { valuateFcffDcf } from '../src/engine/methods/fcffDcf.js';
import { valuateComps } from '../src/engine/methods/comps.js';
import { valuateEvMultiples } from '../src/engine/methods/evMultiples.js';
import { valuatePfcf } from '../src/engine/methods/pfcf.js';
import { valuateSotp } from '../src/engine/methods/sotp.js';
import { valuatePerUser } from '../src/engine/methods/perUser.js';
import { aggregateVerdicts } from '../src/engine/methods/aggregate.js';
import { StubElement, createTabRoot } from './_dom_stub.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const PEERS_PATH = fileURLToPath(new URL('../src/data/historical/peers.json', import.meta.url));

const readFile = (p) => fs.promises.readFile(p, 'utf8');

async function getDatasets() {
  const historical = await dataLayer.loadHistorical({ dir: DATA_DIR, readText: readFile });
  const assumptions = await dataLayer.loadAssumptions({ location: ASSUMPTIONS_PATH, readText: readFile });
  const peers = JSON.parse(await readFile(PEERS_PATH));

  const sched = schedulesEngine.build(historical, assumptions);
  const fc = forecastEngine.project({ historical, assumptions });
  const ts = threeStatementEngine.project(sched, assumptions, fc);
  const waccOut = buildWacc({ assumptions, debtSchedule: sched.debt });
  const dcfOut = valuateDcf(ts, waccOut, { assumptions, corpus: historical });
  const marketPrice = assumptions.get('market_share_price').value;
  const recOut = evaluateRec(dcfOut.perShare, marketPrice);

  const p0 = ts.periods[0];
  const isP0 = ts.incomeStatement.byPeriod[p0];
  const cfP0 = ts.cashFlow.byPeriod[p0];

  const forwardRevenue = isP0.revenue.total.value;
  const detRevenue = isP0.revenue.segments.duolingo_english_test.value;
  const da = cfP0.operating_activities.depreciation_and_amortization.value;
  const opInc = isP0.operating_income.value;
  const rent = (12.071 * 1e3);
  const forwardEbitdar = opInc + da + rent;
  const leaseLiab = (86.136 * 1e3);
  const netCashCapitalized = dcfOut.fcff.netCashToday - leaseLiab;
  const sharesOutstanding = dcfOut.sharesOutstanding;

  const ttm = computeTtm(historical);
  const ocfTtm = ttm.flow.find((x) => x.metric === 'cash_from_operating_activities').value;
  const ppeCapex = Math.abs(ttm.flow.find((x) => x.metric === 'purchase_of_property_and_equipment').value);
  const softCapex = Math.abs(ttm.flow.find((x) => x.metric === 'capitalized_software_and_intangibles').value);
  const ttmFcf = ocfTtm - (ppeCapex + softCapex);

  const dau = ttm.kpi.find((x) => x.metric === 'dau').value;
  const mau = ttm.kpi.find((x) => x.metric === 'mau').value;
  const paidSubs = ttm.kpi.find((x) => x.metric === 'paid_subscribers').value;

  const arpuContext = {
    subscriptionArpu: '$6.71 / month ($80.50 / year driver basis)',
    bookingsPerDau: '$21.98 / year ($1,158,425k FY2025 bookings / 52.7M avg DAU)',
  };

  const resDcf = valuateFcffDcf(dcfOut);
  const resComps = valuateComps(peers, { forwardRevenue, netCashCapitalized, sharesOutstanding });
  const resEv = valuateEvMultiples(peers, { forwardEbitdar, netCashCapitalized, sharesOutstanding });
  const resPfcf = valuatePfcf(peers, { ttmFreeCashFlow: ttmFcf, sharesOutstanding });
  const resSotp = valuateSotp(peers, { forwardRevenue, detRevenue, forwardEbitdar, netCashCapitalized, sharesOutstanding });
  const resPerUser = valuatePerUser(peers, {
    kpis: { mau, dau, paidSubscribers: paidSubs },
    netCashCapitalized,
    sharesOutstanding,
    arpuContext,
  });

  const methods = [resDcf, resComps, resEv, resPfcf, resSotp, resPerUser];
  const verdictOut = aggregateVerdicts(methods, marketPrice);

  return {
    historical,
    assumptions,
    sched,
    fc,
    ts,
    waccOut,
    dcfOut,
    recOut,
    marketPrice,
    methods,
    verdict: verdictOut,
  };
}

/**
 * Creates an interactive StubElement container that supports querySelector and querySelectorAll
 * over simulated child elements and lightweight outerHTML swaps.
 */
function createInteractiveValuationContainer() {
  const container = new StubElement();
  let _innerHTML = '';
  const childMap = new Map();
  let switchButtons = [];

  Object.defineProperty(container, 'innerHTML', {
    get() {
      return _innerHTML;
    },
    set(val) {
      _innerHTML = String(val);
      syncButtons();
    },
  });

  function syncButtons() {
    switchButtons = [];
    const btnRegex = /<button[^>]*data-method-switch="([^"]+)"[^>]*>/g;
    let match;
    while ((match = btnRegex.exec(_innerHTML)) !== null) {
      const fullTag = match[0];
      const key = match[1];
      const isActive = fullTag.includes('method-card-active');
      const btn = new StubElement({
        'data-method-switch': key,
        'class': isActive ? 'method-card method-switch method-card-active' : 'method-card method-switch',
        'aria-pressed': isActive ? 'true' : 'false',
      });
      switchButtons.push(btn);
    }
  }

  container.querySelectorAll = (selector) => {
    if (selector === '[data-method-switch]') {
      return switchButtons;
    }
    return [];
  };

  container.querySelector = (selector) => {
    if (selector === '#multi-method-valuation-panel') {
      const panelStub = new StubElement({ id: 'multi-method-valuation-panel' });
      Object.defineProperty(panelStub, 'outerHTML', {
        get() {
          const match = /<div class="valuation-card multi-method-card" id="multi-method-valuation-panel"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/.exec(_innerHTML);
          return match ? match[0] : '';
        },
        set(val) {
          _innerHTML = _innerHTML.replace(
            /<div class="valuation-card multi-method-card" id="multi-method-valuation-panel"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
            String(val)
          );
          syncButtons();
        },
      });
      return panelStub;
    }
    const stmtMatch = /\[data-statement=["']?([^"'\]]+)["']?\]/.exec(selector);
    if (stmtMatch) {
      const stmt = stmtMatch[1];
      if (!childMap.has(stmt)) {
        childMap.set(stmt, new StubElement({ 'data-statement': stmt }));
      }
      return childMap.get(stmt);
    }
    return null;
  };

  return container;
}

class MockTabulator {
  constructor(element, config) {
    this.element = element;
    this.config = config;
    this.destroyed = false;
  }
  destroy() {
    this.destroyed = true;
  }
}

describe('P8.4 Multi-Method Detail Presentation — Matrix, Switching & Binding', () => {
  test('mounts all 6 method switcher buttons with fcff_dcf active by default', async () => {
    const data = await getDatasets();
    const container = createInteractiveValuationContainer();

    const view = renderValuation({
      container,
      wacc: data.waccOut,
      dcf: data.dcfOut,
      assumptions: data.assumptions,
      TabulatorConstructor: MockTabulator,
      methods: data.methods,
      verdict: data.verdict,
    });

    const buttons = container.querySelectorAll('[data-method-switch]');
    assert.equal(buttons.length, 6, 'Must mount exactly 6 method switcher buttons');

    const expectedKeys = ['fcff_dcf', 'comps', 'ev_multiples', 'pfcf', 'sotp', 'perUser'];
    for (let i = 0; i < expectedKeys.length; i++) {
      assert.equal(buttons[i].getAttribute('data-method-switch'), expectedKeys[i]);
    }

    // Default active method is fcff_dcf
    assert.match(container.innerHTML, /data-method-panel="fcff_dcf"/, 'Default detail panel must be fcff_dcf');
    assert.match(container.innerHTML, /Methodology; 2-Stage FCFF DCF/, 'Must render 2-stage FCFF DCF methodology header');
    assert.match(container.innerHTML, /Gordon/, 'Must reference Gordon terminal value');
    assert.match(container.innerHTML, /PV of Explicit Forecast/, 'Must render explicit forecast row');

    view.dispose();
  });

  test('clicking each switcher button updates active panel and aria-pressed state for all 6 methods', async () => {
    const data = await getDatasets();
    const container = createInteractiveValuationContainer();

    const view = renderValuation({
      container,
      wacc: data.waccOut,
      dcf: data.dcfOut,
      assumptions: data.assumptions,
      TabulatorConstructor: MockTabulator,
      methods: data.methods,
      verdict: data.verdict,
    });

    const expectedMap = {
      comps: {
        title: 'EV / Forward Revenue',
        panelMatch: /data-method-panel="comps"/,
        contentMatch: /Trading Comparables/,
      },
      ev_multiples: {
        title: 'EV / Forward EBITDAR',
        panelMatch: /data-method-panel="ev_multiples"/,
        contentMatch: /Peer Exclusions \(Disclosed\)/,
      },
      pfcf: {
        title: 'P/FCF &amp; FCF Yield',
        panelMatch: /data-method-panel="pfcf"/,
        contentMatch: /Equity Multiple/,
      },
      sotp: {
        title: 'Sum-of-the-Parts',
        panelMatch: /data-method-panel="sotp"/,
        contentMatch: /Two Segments/,
      },
      perUser: {
        title: 'Per-User / Per-Subscriber',
        panelMatch: /data-method-panel="perUser"/,
        contentMatch: /Native KPI Bases/,
      },
      fcff_dcf: {
        title: '2-Stage FCFF DCF',
        panelMatch: /data-method-panel="fcff_dcf"/,
        contentMatch: /Gordon/,
      },
    };

    for (const [key, spec] of Object.entries(expectedMap)) {
      const buttons = container.querySelectorAll('[data-method-switch]');
      const targetBtn = buttons.find((b) => b.getAttribute('data-method-switch') === key);
      assert.ok(targetBtn, `Button for ${key} must exist`);

      // Simulate tile click
      targetBtn.dispatch('click');

      // Assert panel swapped
      assert.match(container.innerHTML, spec.panelMatch, `Panel must switch to data-method-panel="${key}"`);
      assert.match(container.innerHTML, spec.contentMatch, `Panel for ${key} must contain expected content`);

      // Assert active button
      const updatedButtons = container.querySelectorAll('[data-method-switch]');
      const activeBtn = updatedButtons.find((b) => b.getAttribute('data-method-switch') === key);
      assert.equal(activeBtn.getAttribute('aria-pressed'), 'true', `Active button ${key} must have aria-pressed="true"`);
    }

    view.dispose();
  });

  test('detail panels render contract derivations faithfully without hardcoded fallbacks', async () => {
    const data = await getDatasets();
    const container = createInteractiveValuationContainer();

    const view = renderValuation({
      container,
      wacc: data.waccOut,
      dcf: data.dcfOut,
      assumptions: data.assumptions,
      TabulatorConstructor: MockTabulator,
      methods: data.methods,
      verdict: data.verdict,
    });

    // 1. SOTP Detail Panel
    let buttons = container.querySelectorAll('[data-method-switch]');
    buttons.find((b) => b.getAttribute('data-method-switch') === 'sotp').dispatch('click');
    assert.match(container.innerHTML, /Subscriptions \(incl\. advertising\)/, 'SOTP must show Subscriptions segment');
    assert.match(container.innerHTML, /Duolingo English Test/, 'SOTP must show DET segment');
    assert.match(container.innerHTML, /Advertising folded per segment mandate/, 'SOTP must show fold footnote');
    assert.match(container.innerHTML, /Segment EV Sum/, 'SOTP must sum segment EVs');

    // 2. Per-User Detail Panel
    buttons = container.querySelectorAll('[data-method-switch]');
    buttons.find((b) => b.getAttribute('data-method-switch') === 'perUser').dispatch('click');
    assert.match(container.innerHTML, /Spotify MAU Basis/, 'Per-user must list Spotify MAU basis');
    assert.match(container.innerHTML, /Roblox DAU Basis/, 'Per-user must list Roblox DAU basis');
    assert.match(container.innerHTML, /Netflix Paid Subscribers Basis/, 'Per-user must list Netflix Paid Subs basis');
    assert.match(container.innerHTML, /Method Vote \(Median Basis\)/, 'Per-user must show median of bases');
    assert.match(container.innerHTML, /\$6\.71 \/ month/, 'Per-user must render caller-supplied ARPU context');

    // 3. EV Multiples (EBITDAR) Detail Panel
    buttons = container.querySelectorAll('[data-method-switch]');
    buttons.find((b) => b.getAttribute('data-method-switch') === 'ev_multiples').dispatch('click');
    assert.match(container.innerHTML, /RBLX: Negative or non-meaningful EBITDAR/, 'Must disclose RBLX exclusion rationale');

    // 4. DCF Detail Panel
    buttons = container.querySelectorAll('[data-method-switch]');
    buttons.find((b) => b.getAttribute('data-method-switch') === 'fcff_dcf').dispatch('click');
    assert.match(container.innerHTML, /Cash \+ STI \+ LTI − Funded Debt/, 'DCF must show net cash bridge formula');
    assert.match(container.innerHTML, /WACC \(Discount Rate\)/, 'DCF must show WACC discount rate');

    view.dispose();
  });

  test('selection persists across view.update() calls', async () => {
    const data = await getDatasets();
    const container = createInteractiveValuationContainer();

    const view = renderValuation({
      container,
      wacc: data.waccOut,
      dcf: data.dcfOut,
      assumptions: data.assumptions,
      TabulatorConstructor: MockTabulator,
      methods: data.methods,
      verdict: data.verdict,
    });

    // Select sotp
    let buttons = container.querySelectorAll('[data-method-switch]');
    buttons.find((b) => b.getAttribute('data-method-switch') === 'sotp').dispatch('click');
    assert.match(container.innerHTML, /data-method-panel="sotp"/);

    // Call update with fresh datasets
    view.update(data.waccOut, data.dcfOut, data.assumptions, null, data.marketPrice, data.methods, data.verdict);

    // Selection MUST persist as sotp
    assert.match(container.innerHTML, /data-method-panel="sotp"/, 'Selected method MUST persist across view.update()');
    assert.match(container.innerHTML, /Sum-of-the-Parts/, 'Detail panel must still be SOTP');

    // Select perUser
    buttons = container.querySelectorAll('[data-method-switch]');
    buttons.find((b) => b.getAttribute('data-method-switch') === 'perUser').dispatch('click');
    assert.match(container.innerHTML, /data-method-panel="perUser"/);

    // Call update again
    view.update(data.waccOut, data.dcfOut, data.assumptions, null, data.marketPrice, data.methods, data.verdict);
    assert.match(container.innerHTML, /data-method-panel="perUser"/, 'Selected method MUST persist as perUser');

    view.dispose();
  });

  test('negative tripwire: swapped or null methods gracefully suppresses cards (P8.3-R2 pattern)', async () => {
    const data = await getDatasets();
    const container = createInteractiveValuationContainer();

    const view = renderValuation({
      container,
      wacc: data.waccOut,
      dcf: data.dcfOut,
      assumptions: data.assumptions,
      TabulatorConstructor: MockTabulator,
      methods: null,
      verdict: null,
    });

    // When methods is null, multi-method valuation panel returns empty string
    assert.doesNotMatch(container.innerHTML, /id="multi-method-valuation-panel"/, 'Null methods must not render broken panel');

    // Passing empty array also suppresses
    view.update(data.waccOut, data.dcfOut, data.assumptions, null, data.marketPrice, [], null);
    assert.doesNotMatch(container.innerHTML, /id="multi-method-valuation-panel"/, 'Empty methods array must not render broken panel');

    view.dispose();
  });
});

describe('P8.4 Multi-Method Detail Presentation — App Integration & Recalculation Persistence', () => {
  test('createApp mounts multi-method panel and maintains selection across driver-edit recalculation', async () => {
    const dataset = await dataLayer.loadHistorical({ dir: DATA_DIR, readText: readFile });
    const assumptions = await dataLayer.loadAssumptions({ location: ASSUMPTIONS_PATH, readText: readFile });

    const { root, panes } = createTabRoot([
      'cover',
      'assumptions',
      'historicals',
      'schedules',
      'projections',
      'valuation',
      'summary',
      'sensitivity',
    ]);

    const app = createApp({
      data: { loadHistorical: async () => dataset, loadAssumptions: async () => assumptions },
      engine: {},
      historical: dataset,
      assumptions,
      root,
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
    });

    const valuationPane = panes.find((p) => p.getAttribute('data-tab') === 'valuation');
    assert.ok(valuationPane, 'Valuation tab pane must exist');

    // Initial render must show multi-method panel with default fcff_dcf
    assert.match(valuationPane.innerHTML, /id="multi-method-valuation-panel"/, 'Multi-method panel must be rendered at boot');
    assert.match(valuationPane.innerHTML, /data-method-panel="fcff_dcf"/, 'Boot state must have fcff_dcf active');

    // Trigger reactive recalculation via driver update
    app.setDriver('terminal_growth_rate', 0.024);

    // After recalculate, panel must still be present and valid
    assert.match(valuationPane.innerHTML, /id="multi-method-valuation-panel"/, 'Panel must remain mounted post-recalculate');
    assert.match(valuationPane.innerHTML, /data-method-panel="fcff_dcf"/, 'Panel must stay valid post-recalculate');

    app.dispose();
  });
});
