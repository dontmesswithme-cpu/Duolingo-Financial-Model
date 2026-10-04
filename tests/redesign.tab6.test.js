/* RP6.1 contract tests: valuation strip, primary DCF card, and EV bridge hook. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderValuation } from '../src/ui/valuationTab.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { readLedgerUrls } from './_ledger.js';
import schedulesEngine from '../src/engine/schedules.js';
import forecastEngine from '../src/engine/forecast.js';
import threeStatementEngine from '../src/engine/threeStatement.js';
import { build as buildWacc } from '../src/engine/wacc.js';
import { valuate as valuateDcf } from '../src/engine/dcf.js';
import { compute as computeTtm } from '../src/engine/ttm.js';
import { evaluate as evaluateRec } from '../src/engine/recommend.js';
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
  const kpis = {
    mau: ttm.kpi.find((row) => row.metric === 'mau').value,
    dau: ttm.kpi.find((row) => row.metric === 'dau').value,
    paidSubscribers: ttm.kpi.find((row) => row.metric === 'paid_subscribers').value,
  };
  const arpuContext = {
    subscriptionArpu: '$6.71 / month ($80.50 / year driver basis)',
    bookingsPerDau: '$21.98 / year',
  };
  const methods = [
    valuateFcffDcf(dcf),
    valuateComps(peers, { forwardRevenue, netCashCapitalized, sharesOutstanding: dcf.sharesOutstanding }),
    valuateEvMultiples(peers, { forwardEbitdar, netCashCapitalized, sharesOutstanding: dcf.sharesOutstanding }),
    valuatePfcf(peers, { ttmFreeCashFlow: ttmFcf, sharesOutstanding: dcf.sharesOutstanding }),
    valuateSotp(peers, { forwardRevenue, detRevenue, forwardEbitdar, netCashCapitalized, sharesOutstanding: dcf.sharesOutstanding }),
    valuatePerUser(peers, { kpis, netCashCapitalized, sharesOutstanding: dcf.sharesOutstanding, arpuContext }),
  ];
  const marketPrice = assumptions.get('market_share_price').value;
  return { assumptions, wacc, dcf, methods, verdict: aggregateVerdicts(methods, marketPrice) };
}

function figure(value) {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fixture() {
  const methods = ['fcff_dcf', 'comps', 'ev_multiples', 'pfcf', 'sotp', 'perUser'].map((method, index) => ({
    method,
    label: method,
    impliedPerShare: 100 + index,
    rangePerShare: { min: 90 + index, max: 110 + index },
  }));
  const dcf = {
    schedule: [{ period: 'FY2026', fcf: 100, t: 1, discountFactor: 0.9, presentValue: 90 }],
    terminalGrowthRate: 0.025,
    wacc: 0.1,
    pvExplicit: 90,
    terminalValue: 1000,
    pvTerminal: 900,
    enterpriseValue: 990,
    netCash: 100,
    equityValue: 1090,
    sharesOutstanding: 10_000_000,
    perShare: 109,
    fcff: { perShare: 109 },
    fcfe: { perShare: 100 },
    bridge: { cash: 100, shortTermInvestments: 0, longTermInvestments: 0, debt: 0 },
  };
  const wacc = {
    wacc: { value: 0.1 },
    riskFreeRate: { value: 0.0479, asOf: '2026-09-01', source: { provider: 'FRED', url: 'https://example.com/rf' } },
    beta: { value: 1.47, asOf: '2026-09-01', source: { provider: 'Peers', url: 'https://example.com/beta' } },
    erp: { value: 0.0425, asOf: '2026-09-01', source: { provider: 'Damodaran', url: 'https://example.com/erp' } },
    taxRate: { value: 0.21 },
    marketCap: { value: 1_000_000 },
    sharesOutstanding: { value: 10_000_000 },
  };
  return { methods, dcf, wacc, verdict: { methodResults: [{ method: 'fcff_dcf', verdict: 'fair', upsidePct: -0.1 }] } };
}

test('RP6.1 renders six-method strip, primary DCF card, and EV bridge hook', () => {
  const container = { innerHTML: '', querySelector() { return null; } };
  const { methods, dcf, wacc, verdict } = fixture();
  const view = renderValuation({ container, wacc, dcf, methods, verdict, TabulatorConstructor: null });

  assert.equal((container.innerHTML.match(/data-method-switch=/g) || []).length, 6);
  assert.match(container.innerHTML, /class="valuation-card-body valuation-strip"/);
  assert.match(container.innerHTML, /class="valuation-card dcf-primary-card"/);
  assert.match(container.innerHTML, /Key Runtime Parameters/);
  assert.match(container.innerHTML, /id="valuation-method-summary"/);
  assert.equal((container.innerHTML.match(/<tr>\s*<td><strong>/g) || []).length >= 6, true);
  assert.match(container.innerHTML, /Lease Convention \(Cross-Method Disclosure\)/);
  assert.match(container.innerHTML, /id="chart-ev-bridge"/);
  assert.match(container.innerHTML, /\$109\.00/);
  view.dispose();
  assert.equal(container.innerHTML, '');
});

test('RP6.2 C1 pins rendered valuation figures to engine methods and DCF bridge', async () => {
  const data = await buildEngineFixture();
  const container = { innerHTML: '', querySelector() { return null; } };
  const view = renderValuation({
    container,
    wacc: data.wacc,
    dcf: data.dcf,
    assumptions: data.assumptions,
    methods: data.methods,
    verdict: data.verdict,
    TabulatorConstructor: null,
  });
  for (const method of data.methods) {
    assert.match(container.innerHTML, new RegExp(`\\$${method.impliedPerShare.toFixed(2)}`));
    assert.match(container.innerHTML, new RegExp(`\\$${method.rangePerShare.min.toFixed(2)}`));
    assert.match(container.innerHTML, new RegExp(`\\$${method.rangePerShare.max.toFixed(2)}`));
  }
  for (const value of [data.dcf.pvExplicit, data.dcf.pvTerminal, data.dcf.enterpriseValue, data.dcf.netCash, data.dcf.equityValue, data.dcf.perShare]) {
    assert.match(container.innerHTML, new RegExp(figure(value).replace('$', '\\$')));
  }
  assert.doesNotMatch(container.innerHTML, /blendedPrice|consensus/i);
  assert.equal((container.innerHTML.match(/id="defense-lever-[1-7]"/g) || []).length, 7);
  assert.equal((container.innerHTML.match(/class="defense-row"[^>]*open/g) || []).length, 0);
  assert.equal((container.innerHTML.match(/audit-stat-grid/g) || []).length, 7);
  assert.equal((container.innerHTML.match(/audit-flip-monitor/g) || []).length, 4);
  assert.match(container.innerHTML, /audit-formula/);
  view.dispose();
});

test('O1: null upside renders a dash with no polarity class in the method detail panel', () => {
  const container = { innerHTML: '', querySelector() { return null; } };
  const { methods, dcf, wacc } = fixture();
  const hollow = methods.map((m) => (m.method === 'fcff_dcf'
    ? { ...m, impliedPerShare: null, rangePerShare: null }
    : m));
  const verdict = { methodResults: [{ method: 'fcff_dcf', verdict: 'fair' }] };
  const view = renderValuation({
    container, wacc, dcf, methods: hollow, verdict, TabulatorConstructor: null,
  });
  const html = container.innerHTML;
  assert.match(html, /Upside vs Benchmark/);
  assert.match(html, /<div class="method-detail-metric-value font-mono "> - <\/div>/, 'Non-finite upside renders a class-free dash');
  assert.doesNotMatch(html, /method-detail-metric-value font-mono text-(positive|negative)"> - </, 'Dash carries no polarity class');
  view.dispose();
});
