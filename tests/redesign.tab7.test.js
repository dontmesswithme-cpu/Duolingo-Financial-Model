/* RP7.2 contract tests: sparkline KPI strip, thesis/health cards, live health invariants. */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderSummary } from '../src/ui/summaryTab.js';
import { createApp } from '../src/app.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { readLedgerUrls } from './_ledger.js';
import { createTabRoot } from './_dom_stub.js';
import schedulesEngine from '../src/engine/schedules.js';
import forecastEngine from '../src/engine/forecast.js';
import threeStatementEngine from '../src/engine/threeStatement.js';
import { build as buildWacc } from '../src/engine/wacc.js';
import { valuate as valuateDcf } from '../src/engine/dcf.js';
import { evaluate as evaluateRec, buildSensitivityGrid } from '../src/engine/recommend.js';
import { compute as computeTtm } from '../src/engine/ttm.js';
import { valuateFcffDcf } from '../src/engine/methods/fcffDcf.js';
import { valuateComps } from '../src/engine/methods/comps.js';
import { valuateEvMultiples } from '../src/engine/methods/evMultiples.js';
import { valuatePfcf } from '../src/engine/methods/pfcf.js';
import { valuateSotp } from '../src/engine/methods/sotp.js';
import { valuatePerUser } from '../src/engine/methods/perUser.js';
import { aggregateVerdicts } from '../src/engine/methods/aggregate.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const PEERS_PATH = fileURLToPath(new URL('../src/data/historical/peers.json', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');

async function buildEngineFixture() {
  const historical = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: readLedgerUrls() });
  const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
  const peers = JSON.parse(await readText(PEERS_PATH));
  const schedules = schedulesEngine.build(historical, assumptions);
  const forecast = forecastEngine.project({ historical, assumptions });
  const threeStatement = threeStatementEngine.project(schedules, assumptions, forecast);
  const wacc = buildWacc({ assumptions, debtSchedule: schedules.debt });
  const dcf = valuateDcf(threeStatement, wacc, { assumptions, corpus: historical });
  const marketPrice = assumptions.get('market_share_price').value;
  const rec = evaluateRec(dcf.perShare, marketPrice);
  const p0 = threeStatement.periods[0];
  const income = threeStatement.incomeStatement.byPeriod[p0];
  const cashFlow = threeStatement.cashFlow.byPeriod[p0];
  const forwardRevenue = income.revenue.total.value;
  const detRevenue = income.revenue.segments.duolingo_english_test.value;
  const forwardEbitdar = income.operating_income.value + cashFlow.operating_activities.depreciation_and_amortization.value + (12.071 * 1e3);
  const netCashCapitalized = dcf.fcff.netCashToday - (86.136 * 1e3);
  const ttm = computeTtm(historical);
  const ttmFcf = ttm.flow.find((row) => row.metric === 'cash_from_operating_activities').value -
    Math.abs(ttm.flow.find((row) => row.metric === 'purchase_of_property_and_equipment').value) -
    Math.abs(ttm.flow.find((row) => row.metric === 'capitalized_software_and_intangibles').value);
  const methods = [
    valuateFcffDcf(dcf),
    valuateComps(peers, { forwardRevenue, netCashCapitalized, sharesOutstanding: dcf.sharesOutstanding }),
    valuateEvMultiples(peers, { forwardEbitdar, netCashCapitalized, sharesOutstanding: dcf.sharesOutstanding }),
    valuatePfcf(peers, { ttmFreeCashFlow: ttmFcf, sharesOutstanding: dcf.sharesOutstanding }),
    valuateSotp(peers, { forwardRevenue, detRevenue, forwardEbitdar, netCashCapitalized, sharesOutstanding: dcf.sharesOutstanding }),
    valuatePerUser(peers, {
      kpis: {
        mau: ttm.kpi.find((row) => row.metric === 'mau').value,
        dau: ttm.kpi.find((row) => row.metric === 'dau').value,
        paidSubscribers: ttm.kpi.find((row) => row.metric === 'paid_subscribers').value,
      },
      netCashCapitalized,
      sharesOutstanding: dcf.sharesOutstanding,
      arpuContext: {
        subscriptionArpu: '$6.71 / month ($80.50 / year driver basis)',
        bookingsPerDau: '$21.98 / year',
      },
    }),
  ];
  const verdict = aggregateVerdicts(methods, marketPrice);
  const sensGrid = buildSensitivityGrid({ threeStatement, assumptions, wacc, corpus: historical });
  return { historical, assumptions, threeStatement, dcf, rec, methods, verdict, sensGrid, marketPrice };
}

function bareContainer() {
  return { innerHTML: '', querySelector() { return null; } };
}

describe('RP7.2 — Sparkline KPI strip: engine-true pins and YoY badges', () => {
  test('renders 6 sparkline cards with filed-actual pins and trend badges', async () => {
    const data = await buildEngineFixture();
    const container = bareContainer();
    const view = renderSummary({
      container, dcf: data.dcf, recommendation: data.rec, historical: data.historical,
      assumptions: data.assumptions, threeStatement: data.threeStatement,
      verdict: data.verdict, methods: data.methods, sensitivityGrid: data.sensGrid,
    });
    const html = container.innerHTML;
    assert.equal((html.match(/class="sparkline-card"/g) || []).length, 6);
    assert.equal((html.match(/<svg class="sparkline-svg/g) || []).length, 6);
    // Filed-actual pins (latest-reported strip values + FY2025 ARR + forward Rule of 40)
    for (const pin of ['58.7M', '133.1M', '12.7M', '$873.4M', '9.5%', '47.4%']) {
      assert.ok(html.includes(pin), `Must include engine-true pin ${pin}`);
    }
    // YoY badges: 4 pct badges + 2 pp badges
    assert.ok((html.match(/YoY/g) || []).length >= 6, 'Every card carries a YoY badge');
    for (const badge of ['+30.1% YoY', '+14.1% YoY', '+28.4% YoY', '+43.8% YoY', '+1.0 pp YoY', '-2.7 pp YoY']) {
      assert.ok(html.includes(badge), `Must include YoY badge ${badge}`);
    }
    assert.match(html, /Subscription-revenue basis, FY2025/);
    view.dispose();
    assert.equal(container.innerHTML, '');
  });

  test('sparkline polylines carry finite coordinates only, zero NaN/undefined', async () => {
    const data = await buildEngineFixture();
    const container = bareContainer();
    const view = renderSummary({
      container, dcf: data.dcf, recommendation: data.rec, historical: data.historical,
      assumptions: data.assumptions, threeStatement: data.threeStatement,
      verdict: data.verdict, methods: data.methods, sensitivityGrid: data.sensGrid,
    });
    const html = container.innerHTML;
    const svgs = [...html.matchAll(/<svg class="sparkline-svg[^"]*"[^>]*>([\s\S]*?)<\/svg>/g)];
    assert.equal(svgs.length, 6);
    for (const [, body] of svgs) {
      assert.doesNotMatch(body, /NaN|undefined|Infinity/);
      const m = body.match(/points="([^"]+)"/);
      assert.ok(m, 'Trend svg carries a polyline');
      const coords = m[1].trim().split(/\s+/);
      assert.ok(coords.length >= 4, `Polyline carries a full trend (${coords.length} points)`);
      for (const c of coords) {
        const [x, y] = c.split(',');
        assert.ok(Number.isFinite(Number(x)) && Number.isFinite(Number(y)), `Finite coordinate ${c}`);
      }
    }
    // DAU FY2021-FY2025 (9.6M to 52.7M) is strictly increasing, so its
    // polyline y-coordinates must strictly decrease (SVG origin is top-left).
    const dauPoints = svgs[0][1].match(/points="([^"]+)"/)[1].trim().split(/\s+/).map((c) => Number(c.split(',')[1]));
    for (let i = 1; i < dauPoints.length; i += 1) {
      assert.ok(dauPoints[i] < dauPoints[i - 1], 'DAU trend geometry rises monotonically');
    }
    view.dispose();
  });
});

describe('RP7.2 — Thesis and model health cards', () => {
  test('thesis card carries 5 numbered pillars with zero static financial figures', async () => {
    const data = await buildEngineFixture();
    const container = bareContainer();
    const view = renderSummary({
      container, dcf: data.dcf, recommendation: data.rec, historical: data.historical,
      assumptions: data.assumptions, threeStatement: data.threeStatement,
      verdict: data.verdict, methods: data.methods, sensitivityGrid: data.sensGrid,
    });
    const html = container.innerHTML;
    assert.match(html, /class="summary-card thesis-card"/);
    const thesisOpen = html.indexOf('<ol class="thesis-list">');
    const thesisClose = html.indexOf('</ol>', thesisOpen);
    const thesisBlock = html.slice(thesisOpen, thesisClose);
    assert.equal((thesisBlock.match(/<li>/g) || []).length, 5);
    assert.doesNotMatch(thesisBlock, /\$/);
    assert.equal(thesisBlock.match(/\b\d{4,}\b/), null, 'Thesis prose carries no 4+ digit figures');
    assert.ok(
      /OVERVALUED|UNDERVALUED|FAIR/.test(thesisBlock),
      'Pillar 5 anchors on the live clustered verdict word'
    );
    view.dispose();
  });

  test('health card verifies live engine state: 6 checks green', async () => {
    const data = await buildEngineFixture();
    const container = bareContainer();
    const view = renderSummary({
      container, dcf: data.dcf, recommendation: data.rec, historical: data.historical,
      assumptions: data.assumptions, threeStatement: data.threeStatement,
      verdict: data.verdict, methods: data.methods, sensitivityGrid: data.sensGrid,
    });
    const html = container.innerHTML;
    assert.match(html, /class="summary-card health-card"/);
    assert.equal((html.match(/class="health-row health-/g) || []).length, 6);
    assert.equal((html.match(/health-row health-pass/g) || []).length, 6);
    assert.equal((html.match(/health-pending/g) || []).length, 0);
    for (const status of ['Validated', 'Passed', 'Complete']) {
      assert.ok(html.includes(status), `Health shows live status ${status}`);
    }
    assert.match(html, /Tie-out \$0 across \d+ periods/);
    assert.match(html, /45\/45 WACC x g cells finite/);
    assert.match(html, /forecast cells finite/);
    view.dispose();
  });

  test('health degrades honestly when the sensitivity grid is not wired', async () => {
    const data = await buildEngineFixture();
    const container = bareContainer();
    const view = renderSummary({
      container, dcf: data.dcf, recommendation: data.rec, historical: data.historical,
      assumptions: data.assumptions, threeStatement: data.threeStatement,
      verdict: data.verdict, methods: data.methods,
    });
    const html = container.innerHTML;
    assert.equal((html.match(/class="health-row health-/g) || []).length, 6);
    assert.equal((html.match(/health-row health-pass/g) || []).length, 5);
    assert.equal((html.match(/health-pending/g) || []).length, 1);
    assert.ok(html.includes('Pending'), 'Missing grid renders Pending, never a false pass');
    view.dispose();
  });
});

describe('RP7.2 — Reactivity, verdict-change path and polarity guard', () => {
  test('verdict change flips headline badge, spread card and thesis anchor', async () => {
    const data = await buildEngineFixture();
    const container = bareContainer();
    const view = renderSummary({
      container, dcf: data.dcf, recommendation: data.rec, historical: data.historical,
      assumptions: data.assumptions, threeStatement: data.threeStatement,
      verdict: data.verdict, methods: data.methods, sensitivityGrid: data.sensGrid,
    });
    assert.ok(container.innerHTML.includes('OVERVALUED'));
    const shifted = aggregateVerdicts(data.methods, data.marketPrice * 0.5);
    assert.equal(shifted.verdict, 'undervalued');
    view.update(data.dcf, data.rec, null, data.historical, data.assumptions, data.threeStatement, null, shifted, data.methods, data.sensGrid);
    assert.ok(container.innerHTML.includes('UNDERVALUED'), 'Headline badge follows the live verdict');
    assert.ok(!container.innerHTML.includes('OVERVALUED'), 'Stale verdict fully clears');
    view.dispose();
  });

  test('non-finite upside cell renders a dash under negative polarity, never positive (O1)', async () => {
    const data = await buildEngineFixture();
    const container = bareContainer();
    const view = renderSummary({
      container, dcf: data.dcf, recommendation: data.rec, historical: data.historical,
      assumptions: data.assumptions, threeStatement: data.threeStatement,
      verdict: data.verdict, methods: data.methods, sensitivityGrid: data.sensGrid,
    });
    const hollow = {
      verdict: 'fair',
      agreement: { unanimous: false, summary: 'probe', spread: { min: 100, max: 200, span: 100 } },
      methodResults: [{ method: 'probe', label: 'Probe', impliedPerShare: 100, upsidePct: undefined, verdict: 'fair' }],
    };
    view.update(data.dcf, data.rec, null, data.historical, data.assumptions, data.threeStatement, null, hollow, [], data.sensGrid);
    const row = container.innerHTML.match(/<tr class="method-row-probe">[\s\S]*?<\/tr>/)[0];
    assert.ok(row.includes(' - '), 'Non-finite upside renders a dash');
    assert.doesNotMatch(row, /text-positive/);
    view.dispose();
  });

  test('P8.3 wiring holds: 5 voting method rows post-update, crossed update yields 0', async () => {
    const data = await buildEngineFixture();
    const container = bareContainer();
    const view = renderSummary({
      container, dcf: data.dcf, recommendation: data.rec, historical: data.historical,
      assumptions: data.assumptions, threeStatement: data.threeStatement,
      verdict: data.verdict, methods: data.methods, sensitivityGrid: data.sensGrid,
    });
    // P10.4: SOTP is decomposition-only, so the verdict table has 5 voting rows.
    assert.equal((container.innerHTML.match(/<tr class="method-row-/g) || []).length, 5);
    view.update(data.dcf, data.rec, null, data.historical, data.assumptions, data.threeStatement, null, data.methods, data.verdict, data.sensGrid);
    assert.equal(container.innerHTML.match(/<tr class="method-row-/g), null);
    view.dispose();
  });

  test('R40 precision note: trailing Rule-of-40 sparkline sub names FY2022–FY2025', async () => {
    const data = await buildEngineFixture();
    const container = bareContainer();
    const view = renderSummary({
      container, dcf: data.dcf, recommendation: data.rec, historical: data.historical,
      assumptions: data.assumptions, threeStatement: data.threeStatement,
      verdict: data.verdict, methods: data.methods, sensitivityGrid: data.sensGrid,
    });
    const html = container.innerHTML;
    assert.equal((html.match(/Sparkline FY2022–FY2025/g) || []).length, 1, 'Only the trailing R40 sparkline names FY2022–FY2025');
    assert.equal((html.match(/Sparkline FY2021–FY2025/g) || []).length, 5, 'The five full-history sparklines keep FY2021–FY2025');
    view.dispose();
  });

  test('createApp boot wires sensitivity health to Complete end-to-end', async () => {
    const historical = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: readLedgerUrls() });
    const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
    const { root, panes } = createTabRoot(['cover', 'assumptions', 'historicals', 'schedules', 'projections', 'valuation', 'summary', 'sensitivity']);
    const app = createApp({
      data: { loadHistorical, loadAssumptions },
      engine: {},
      historical,
      assumptions,
      root,
      now: () => Date.parse('2026-09-01T00:00:00.000Z'),
    });
    const summaryPane = panes.find((p) => p.getAttribute('data-tab') === 'summary');
    assert.ok(summaryPane.innerHTML.includes('45/45 WACC x g cells finite'), 'Boot wires the live grid into health');
    assert.ok(summaryPane.innerHTML.includes('sparkline-svg'), 'Boot renders sparkline strip');
    assert.ok(summaryPane.innerHTML.includes('thesis-card'), 'Boot renders thesis card');
    app.setDriver('terminal_growth_rate', 0.025);
    assert.ok(summaryPane.innerHTML.includes('45/45 WACC x g cells finite'), 'Health survives driver recalculation');
    app.dispose();
  });
});
