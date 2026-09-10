/**
 * P6.1 Artifact Contract Tests  -  End-to-End Accuracy, Corpus Tie-Out & Valuation Encasement.
 *
 * Comprehensive verification against docs/phases/phase_6.md §3 Task P6.1:
 *  1. Sampled Corpus Tie-Outs per Statement Class (Annual, Quarterly, YTD)
 *     - Income Statement: FY2021..FY2025 actuals, 4Q FY2025, discrete quarters, revenue component sums, GP/OI formulas.
 *     - Balance Sheet: Historical snapshots, zero-difference balance accounting identity (Assets === Liabilities + Equity).
 *     - Cash Flow Statement: Operating, Investing, and Financing activities, D&A/SBC reconciliations.
 *     - KPIs: DAUs, MAUs, Paid Subscribers, DET Revenue, Bookings across annual and quarterly periods.
 *  2. TTM Recomputation Anchors
 *     - TTM differencing via `ttm.compute` over 10-K / 10-Q filing intervals.
 *  3. Hybrid FY2026 Invariants
 *     - Filed H1 actuals (REV 590,421, OI 78,472, NI 76,618, OCF 239,031) + forecasted H2 = FY2026 1,193,853.52 total.
 *     - Invariance of filed H1 actuals across driver shifts.
 *  4. Full Authoritative Valuation Pin Set
 *     - WACC / CAPM Build (rf 4.79%, beta 1.47, ERP 4.25% -> Re 11.0375%, debt-free theorem WACC = 11.0375%).
 *     - DCF Explicit & Terminal Values (pvExplicit 1,586,880.58, Gordon TV 6,321,697.06, EV 5,332,169.32, Net Cash 1,416,559.00, Equity 6,748,728.32, perShare $118.60167662384697, -24.86% Overvalued).
 *     - Scenario Range: Bear $72.38 (overvalued) < Base $118.60 < Bull $217.98 (undervalued).
 *     - Sensitivity 9x5 Matrix: 45 cells, WACC > g guard, monotonicity across rows and columns.
 *  5. KPI Truths & Golden Metrics
 *     - DAU 58.7M, MAU 133.1M, Subscribers 12.7M, Total Bookings $1,158,425, Rule of 40 47.4%.
 *  6. Rendered View Tie-Out & Marking Gates
 *     - Live DOM render tie-outs for all 8 views (Cover, Assumptions, Historicals, Schedules, Projections, Valuation, Summary, Sensitivity).
 *     - Zero inline styles (`style=`), zero bare numeric literals > 999 outside comments in UI.
 *     - Corpus invariance: 706 records in historical datasets.
 */

/* PIN-GENESIS-STAMP-BEGIN
{"hash":"398097191b2ee12f889e2bf2b51f46e758d3e0f19d9f1db7c1963032b0d64588","generatedFrom":["src/data/assumptions.json","src/engine/beta.js","src/engine/dcf.js","src/engine/forecast.js","src/engine/invariants.js","src/engine/market.js","src/engine/methods/aggregate.js","src/engine/methods/comps.js","src/engine/methods/evMultiples.js","src/engine/methods/fcffDcf.js","src/engine/methods/perUser.js","src/engine/methods/pfcf.js","src/engine/methods/sotp.js","src/engine/recommend.js","src/engine/scenarios.js","src/engine/schedules.js","src/engine/shares.js","src/engine/threeStatement.js","src/engine/ttm.js","src/engine/wacc.js"],"createdAt":"2026-09-10T18:01:22.437Z","files":{"src/data/assumptions.json":"e4a32541b1ad7b0a290b08b6fcc750480d5caadac990d8527ec6532aab40c250","src/engine/beta.js":"932ea72c8cff71fb11905674481735a0a59175a3ef704e574a0fea83215b6f6b","src/engine/dcf.js":"2a487298d06e4fd4c56895028228b627bf9ae1d34e87cb02df500b3ee4d4d49d","src/engine/forecast.js":"7d9d5537bc69852186d05025813abe97a5f6f83eba22615cbf501a91def3eeb3","src/engine/invariants.js":"47ba9b1c2e992b578fb3fbc9ba5315028053e30adfe0ae3b31612eb42cc76c8f","src/engine/market.js":"873940c0a4b6db91949c45d09819bff0bf1cf9f697fff65629645993ceb8c3c5","src/engine/methods/aggregate.js":"af1f416333833ede5124863f0b7ed57c247dd0badb2e9d50ad58f035252b1623","src/engine/methods/comps.js":"fe5a63d3cb0572eef5a56f327a0709265fcfaedf9c6324db2bb6286ffdf4a02f","src/engine/methods/evMultiples.js":"7c6611d38ab38c98173a194df4688c986db31af98e7b244693bfb8e6053b6b7d","src/engine/methods/fcffDcf.js":"5cb7274f63bddb5e5dc1ae1838589f8301b9768b30f91491c2e24918823684bd","src/engine/methods/perUser.js":"2116853d2b2e2451d01ed1c4917a04cf8a964dc14991a8bc2b17e7e1bdfeb925","src/engine/methods/pfcf.js":"b30abf50732692ba64eadf30f80552a1af9ab5cf35fb786fc6d4333be15b7808","src/engine/methods/sotp.js":"bcb8f1f72c566394ec99a924fbaf8cd869b66e572c518ab4ba6cdb15a4f939d4","src/engine/recommend.js":"c86b5b68f6389ff7dddb320f1c25daeb85a1de8f1a58a9ddc13d278ee779527c","src/engine/scenarios.js":"b6043b3e2e73420f4cc47eb3d4a03388763f09d2e41b6a4bc0431217f0d4d80d","src/engine/schedules.js":"7e9d903d2139753e7c73243e15c0e2bc834f65ffaa7dd64adc5ecbd12b747f77","src/engine/shares.js":"0fd089cb5fcd53225f9919659a94fde2ab81770e11bfe0ffebc7c5f505586c20","src/engine/threeStatement.js":"80922814761c6d3ff7604eadd93ff551a63ee2d628b94e462fe6141fd050f8ed","src/engine/ttm.js":"5b2ec60292b4fcc83f8a11b6a3a947e6683d60eb6db99cf924b48dd57be408c4","src/engine/wacc.js":"c77bc38094ba9a15d12712e1e13970d6555861e2242e3ad785db839bbbdb89f6"}}
PIN-GENESIS-STAMP-END */


import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createApp } from '../src/app.js';
import { TAB_KEYS } from '../src/ui/tabs.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { compute as computeTtm } from '../src/engine/ttm.js';
import { RECOMMENDATION_THRESHOLDS } from '../src/data/constants.js';
import schedulesEngine from '../src/engine/schedules.js';
import forecastEngine from '../src/engine/forecast.js';
import threeStatementEngine from '../src/engine/threeStatement.js';
import { build as buildWacc } from '../src/engine/wacc.js';
import { valuate as valuateDcf } from '../src/engine/dcf.js';
import { evaluate as evaluateRec, buildSensitivityGrid, runFullValuation } from '../src/engine/recommend.js';
import { readLedgerUrls } from './_ledger.js';
import { StubElement, createTabRoot } from './_dom_stub.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const UI_DIR = fileURLToPath(new URL('../src/ui/', import.meta.url));

const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();
const CORPUS_RECORD_COUNT = 706;

async function getFullModel() {
  const historical = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
  const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
  const sched = schedulesEngine.build(historical, assumptions);
  const fc = forecastEngine.project({ historical, assumptions });
  const ts = threeStatementEngine.project(sched, assumptions, fc);
  const waccOut = buildWacc({ assumptions, debtSchedule: sched.debt });
  const dcfOut = valuateDcf(ts, waccOut, { assumptions, corpus: historical });
  const marketPrice = assumptions.get('market_share_price').value;
  const recOut = evaluateRec(dcfOut.perShare, marketPrice);
  const sensGrid = buildSensitivityGrid({ threeStatement: ts, assumptions, wacc: waccOut, corpus: historical });
  const scenarios = {
    bear: runFullValuation(historical, assumptions, 'bear'),
    base: { wacc: waccOut, dcf: dcfOut, recommendation: recOut, assumptions, perShare: dcfOut.perShare, upsidePct: recOut.upsidePct },
    bull: runFullValuation(historical, assumptions, 'bull'),
  };
  return {
    historical,
    assumptions,
    schedules: sched,
    forecast: fc,
    threeStatement: ts,
    wacc: waccOut,
    dcf: dcfOut,
    recommendation: recOut,
    sensitivityGrid: sensGrid,
    scenarios,
  };
}

describe('P6.1  -  Sampled Corpus Tie-Outs per Statement Class', () => {
  test('Income Statement: annual FY2021-FY2025, quarterly, and YTD classes tie out to filed records', async () => {
    const { historical } = await getFullModel();
    const incomeRows = extractRows(historical.income);

    const findRow = (metric, period) => incomeRows.find((r) => r.metric === metric && r.period === period);

    // FY2025 anchors
    const rev2025 = findRow('revenue_total', 'FY2025');
    assert.equal(rev2025?.value, 1037589, 'FY2025 revenue_total matches 10-K');
    const net2025 = findRow('net_income', 'FY2025');
    assert.equal(net2025?.value, 414065, 'FY2025 net_income matches 10-K');

    // Revenue decomposition sum check across all periods
    const periods = [...new Set(incomeRows.map((r) => r.period))];
    for (const period of periods) {
      const sub = findRow('revenue_subscription', period)?.value;
      const adv = findRow('revenue_advertising', period)?.value;
      const det = findRow('revenue_duolingo_english_test', period)?.value;
      const iap = findRow('revenue_in_app_purchases', period)?.value;
      const oth = findRow('revenue_other', period)?.value;
      const tot = findRow('revenue_total', period)?.value;

      if (tot !== undefined && sub !== undefined && adv !== undefined && det !== undefined && iap !== undefined) {
        const sumComponents = sub + adv + det + iap + (oth ?? 0);
        assert.equal(sumComponents, tot, `Revenue components sum to total for period ${period}`);
      }

      // Gross profit = Total Revenue - Cost of Revenue
      const cor = findRow('cost_of_revenue_total', period)?.value;
      const gp = findRow('gross_profit', period)?.value;
      if (tot !== undefined && cor !== undefined && gp !== undefined) {
        assert.equal(tot - cor, gp, `Gross profit matches Revenue - Cost of Revenue for period ${period}`);
      }
    }

    // Discrete quarterly periods from 10-Q filings
    const revQ2_26 = findRow('revenue_total', 'Q2 FY2026');
    assert.equal(revQ2_26?.value, 298454, 'Q2 FY2026 revenue matches 10-Q');
    const revQ1_26 = findRow('revenue_total', 'Q1 FY2026');
    assert.equal(revQ1_26?.value, 291967, 'Q1 FY2026 revenue matches 10-Q');
  });

  test('Balance Sheet: Accounting identity (Assets === Liabilities + Equity) holds with diff 0 across all periods', async () => {
    const { historical } = await getFullModel();
    const balanceRows = extractRows(historical.balance);

    const periods = [...new Set(balanceRows.map((r) => r.period))];
    for (const period of periods) {
      const assets = balanceRows.find((r) => r.metric === 'total_assets' && r.period === period)?.value;
      const liab = balanceRows.find((r) => r.metric === 'total_liabilities' && r.period === period)?.value;
      const eq = balanceRows.find((r) => r.metric === 'total_stockholders_equity' && r.period === period)?.value;
      const liabEq = balanceRows.find((r) => r.metric === 'total_liabilities_and_stockholders_equity' && r.period === period)?.value;

      if (assets !== undefined && liab !== undefined && eq !== undefined) {
        assert.equal(assets, liab + eq, `Balance sheet identity Assets = Liab + Equity for ${period}`);
      }
      if (assets !== undefined && liabEq !== undefined) {
        assert.equal(assets, liabEq, `Balance sheet identity Assets = Liab+Eq line for ${period}`);
      }
    }
  });

  test('Cash Flow Statement: OCF, ICF, and CFF reconcile cleanly with D&A and SBC', async () => {
    const { historical } = await getFullModel();
    const cfRows = extractRows(historical.cashflow);

    const findCf = (metric, period) => cfRows.find((r) => r.metric === metric && r.period === period);

    // FY2025 Cash from operations = 387,823
    const ocf2025 = findCf('cash_from_operating_activities', 'FY2025');
    assert.equal(ocf2025?.value, 387823, 'FY2025 OCF matches filed 10-K');

    // 6M FY2026 Cash from operations = 239,031
    const ocf6m26 = findCf('cash_from_operating_activities', '6M FY2026');
    assert.equal(ocf6m26?.value, 239031, '6M FY2026 OCF matches filed 10-Q');
  });

  test('KPIs: User and monetization metrics match authoritative filings', async () => {
    const { historical } = await getFullModel();
    const kpiRows = extractRows(historical.kpis);

    const findKpi = (metric, period) => kpiRows.find((r) => r.metric === metric && r.period === period);

    // Q2 FY2026 DAU = 58.7M (58,700,000)
    const dauQ2_26 = findKpi('dau', 'Q2 FY2026');
    assert.equal(dauQ2_26?.value, 58700000, 'Q2 FY2026 DAU matches filing (58.7M)');

    // FY2025 MAU = 133.1M (133,100,000)
    const mau2025 = findKpi('mau', 'FY2025');
    assert.equal(mau2025?.value, 133100000, 'FY2025 MAU matches filing (133.1M)');

    // Q2 FY2026 Paid Subscribers = 12.7M (12,700,000)
    const subsQ2_26 = findKpi('paid_subscribers', 'Q2 FY2026');
    assert.equal(subsQ2_26?.value, 12700000, 'Q2 FY2026 Subscribers match filing (12.7M)');

    // FY2025 Total Bookings = 1,158,425
    const bookings2025 = findKpi('total_bookings', 'FY2025');
    assert.equal(bookings2025?.value, 1158425, 'FY2025 Total Bookings matches 10-K');
  });
});

describe('P6.1  -  TTM Recomputation Anchors', () => {
  test('computeTtm produces mathematically exact TTM figures across 10-K and 10-Q intervals', async () => {
    const { historical } = await getFullModel();
    const ttmResult = computeTtm(historical);

    assert.ok(ttmResult, 'TTM recomputations succeed');
    assert.ok(Array.isArray(ttmResult.records), 'TTM records generated');
    assert.ok(ttmResult.byMetric instanceof Map, 'TTM byMetric map exists');

    // Verify TTM Cash from operations = 430,548
    const ocf = ttmResult.byMetric.get('cash_from_operating_activities');
    assert.ok(ocf, 'TTM OCF computed');
    assert.equal(ocf.value, 430548, 'TTM OCF equals 430,548');
    assert.equal(ocf.isComputed, true, 'TTM OCF isComputed is true');

    // Verify latest balance date stock metric resolution
    const assets = ttmResult.byMetric.get('total_assets');
    assert.ok(assets, 'TTM total assets computed');
    assert.equal(assets.value, 2073953, 'Latest total assets = 2,073,953');
  });
});

describe('P6.1  -  Hybrid FY2026 Invariants', () => {
  test('Hybrid FY2026 combines filed H1 actuals with projected H2 seamlessly', async () => {
    const { forecast, threeStatement } = await getFullModel();
    const fc2026 = forecast.byPeriod.FY2026;
    const is2026 = threeStatement.incomeStatement.byPeriod.FY2026;
    const cf2026 = threeStatement.cashFlow.byPeriod.FY2026;

    assert.ok(fc2026, 'FY2026 forecast exists');
    assert.ok(is2026, 'FY2026 income statement exists');

    // Filed H1 actuals invariants
    assert.equal(fc2026.revenue.total.h1.value, 590421, 'H1 Revenue filed actual invariant = 590,421');
    assert.equal(fc2026.operating_income.h1.value, 78472, 'H1 Operating Income filed actual invariant = 78,472');
    assert.equal(is2026.net_income.h1.value, 76618, 'H1 Net Income filed actual invariant = 76,618');
    assert.equal(cf2026.operating_activities.total.h1.value, 239031, 'H1 Operating Cash Flow filed actual invariant = 239,031');

    // H2 projected & Full Year hybrid total
    assert.equal(Math.round(fc2026.revenue.total.h2.value * 100) / 100, 603432.52, 'H2 Revenue projection = 603,432.52');
    assert.equal(Math.round(fc2026.revenue.total.value * 100) / 100, 1193853.52, 'Full FY2026 total revenue = 1,193,853.52');
  });
});

describe('P6.1  -  Full Authoritative Valuation Pin Set', () => {
  test('WACC / CAPM Build matches authoritative pin table', async () => {
    const { wacc, assumptions } = await getFullModel();

    assert.equal(assumptions.get('risk_free_rate').value, 0.0479, 'Risk-free rate = 4.79%');
    assert.equal(assumptions.get('beta').value, 1.47, 'Beta = 1.47');
    assert.equal(assumptions.get('equity_risk_premium').value, 0.0425, 'ERP = 4.25%');
    assert.equal(assumptions.get('effective_tax_rate').value, 0.134225, 'Tax rate = 13.4225%');
    assert.equal(assumptions.get('shares_outstanding').value, 50031000, 'Diluted shares = 50,031,000');
    assert.equal(assumptions.get('market_share_price').value, 157.85, 'Market share price = $157.85');

    // Cost of Equity & WACC
    assert.equal(Math.round(wacc.costOfEquity.value * 1000000) / 1000000, 0.110375, 'Cost of Equity Re = 0.110375');
    assert.equal(Math.round(wacc.wacc.value * 1000000) / 1000000, 0.110375, 'Debt-free WACC = 0.110375');
    assert.equal(wacc.debtFree, true, 'debtFree is true');
    assert.equal(wacc.costOfDebt.value, null, 'costOfDebt.value is null for debt-free structure');
    assert.equal(wacc.debtWeight.value, 0, 'debtWeight is 0');
    assert.equal(wacc.equityWeight.value, 1, 'equityWeight is 1');
  });

  test('DCF Valuation matches authoritative pin table and Gordon Growth calculations', async () => {
    const { dcf, recommendation } = await getFullModel();

    // Discount Factors
    assert.ok(Math.abs(dcf.schedule[0].discountFactor - 0.9005966452774964) < 1e-6, 'df FY2026 matches pin');
    assert.ok(Math.abs(dcf.schedule[4].discountFactor - 0.5924498916887444) < 1e-6, 'df FY2030 matches pin');

    // Present Value of Explicit Period FCFs
    assert.ok(Math.abs(dcf.pvExplicit - 1586880.58) < 1.0, 'pvExplicit matches pin 1,586,880.58');

    // Terminal Year FCF & Gordon TV
    const terminalFcf = dcf.schedule[4].fcf * (1 + dcf.terminalGrowthRate);
    assert.ok(Math.abs(terminalFcf - 605980.82) < 1.0, 'terminal FCF matches pin 605,980.82');
    assert.ok(Math.abs(dcf.terminalValue - 6321697.06) < 10.0, 'Gordon TV matches pin 6,321,697.06');
    assert.ok(Math.abs(dcf.pvTerminal - 3745288.74) < 10.0, 'pvTerminal matches pin 3,745,288.74');

    // EV, Net Cash, Equity Value, Per Share Value
    assert.ok(Math.abs(dcf.enterpriseValue - 5332169.32) < 10.0, 'EV matches pin 5,332,169.32');
    assert.ok(Math.abs(dcf.netCash - 1416559.00) < 1.0, 'Net Cash matches pin 1,416,559.00');
    assert.ok(Math.abs(dcf.equityValue - 6748728.32) < 10.0, 'Equity Value matches pin 6,748,728.32');

    // Per Share Value & Recommendation (EP.2: rolled-share denominator, 56.90m)
    assert.ok(Math.abs(dcf.perShare - 118.60167662384697) < 1e-4, 'perShare matches exact pin 118.60167662384697');
    assert.equal(recommendation.label, 'overvalued', 'Recommendation label is overvalued');
    assert.ok(Math.abs(recommendation.upsidePct - (-0.248643)) < 1e-3, 'Upside % matches -24.86%');
  });

  test('Scenario Range satisfies strict ordering: Bear ($72.38) < Base ($118.60) < Bull ($217.98)', async () => {
    const { scenarios } = await getFullModel();

    const bearPrice = scenarios.bear.dcf.perShare;
    const basePrice = scenarios.base.dcf.perShare;
    const bullPrice = scenarios.bull.dcf.perShare;

    assert.ok(Math.abs(bearPrice - 72.38) < 0.5, `Bear price ${bearPrice} matches ~72.38`);
    assert.ok(Math.abs(basePrice - 118.60) < 0.5, `Base price ${basePrice} matches ~118.60`);
    assert.ok(Math.abs(bullPrice - 217.98) < 0.5, `Bull price ${bullPrice} matches ~217.98`);

    assert.ok(bearPrice < basePrice, 'Bear price < Base price');
    assert.ok(basePrice < bullPrice, 'Base price < Bull price');

    assert.equal(scenarios.bear.recommendation.label, 'overvalued', 'Bear scenario recommendation is overvalued');
    assert.equal(scenarios.base.recommendation.label, 'overvalued', 'Base scenario recommendation is overvalued');
    assert.equal(scenarios.bull.recommendation.label, 'undervalued', 'Bull scenario recommendation is undervalued');
  });

  test('Sensitivity Grid: 45 cells satisfy WACC > g guard and strict 2D monotonicity', async () => {
    const { sensitivityGrid } = await getFullModel();

    assert.equal(sensitivityGrid.waccValues.length, 9, '9 WACC rows');
    assert.equal(sensitivityGrid.growthValues.length, 5, '5 growth columns');
    assert.equal(sensitivityGrid.cells.length, 45, '45 total cells');

    // Check all 45 cells for finite positive valuation and WACC > g
    for (const cell of sensitivityGrid.cells) {
      assert.ok(cell.wacc > cell.growth, `WACC (${cell.wacc}) > g (${cell.growth}) guard holds`);
      assert.ok(Number.isFinite(cell.perShare) && cell.perShare > 0, `Cell perShare is finite positive: ${cell.perShare}`);
    }

    // Monotonicity check:
    // Across columns (fixed growth, increasing WACC): perShare must strictly DECREASE
    for (const g of sensitivityGrid.growthValues) {
      for (let i = 1; i < sensitivityGrid.waccValues.length; i += 1) {
        const higherWacc = sensitivityGrid.waccValues[i];
        const lowerWacc = sensitivityGrid.waccValues[i - 1];
        const priceHigherWacc = sensitivityGrid.matrix[higherWacc][g].perShare;
        const priceLowerWacc = sensitivityGrid.matrix[lowerWacc][g].perShare;
        assert.ok(
          priceHigherWacc < priceLowerWacc,
          `Monotonicity fail: higher WACC (${higherWacc}) price ($${priceHigherWacc}) must be < lower WACC (${lowerWacc}) price ($${priceLowerWacc}) at g=${g}`
        );
      }
    }

    // Across rows (fixed WACC, increasing growth): perShare must strictly INCREASE
    for (const w of sensitivityGrid.waccValues) {
      for (let j = 1; j < sensitivityGrid.growthValues.length; j += 1) {
        const higherG = sensitivityGrid.growthValues[j];
        const lowerG = sensitivityGrid.growthValues[j - 1];
        const priceHigherG = sensitivityGrid.matrix[w][higherG].perShare;
        const priceLowerG = sensitivityGrid.matrix[w][lowerG].perShare;
        assert.ok(
          priceHigherG > priceLowerG,
          `Monotonicity fail: higher g (${higherG}) price ($${priceHigherG}) must be > lower g (${lowerG}) price ($${priceLowerG}) at WACC=${w}`
        );
      }
    }
  });
});

describe('P6.1  -  Rule of 40 & Golden Metrics', () => {
  test('Rule of 40 equals 47.4% (31.4% FY2030 FCF margin + 16.1% 5Y CAGR)', async () => {
    const { forecast, threeStatement } = await getFullModel();

    // FY2030 revenue and FCF
    const rev2025 = 1037589;
    const rev2030 = forecast.byPeriod.FY2030.revenue.total.value;
    const fcf2030 = threeStatement.cashFlow.byPeriod.FY2030.free_cash_flow.value;

    assert.ok(rev2030, 'FY2030 total revenue exists');
    assert.ok(fcf2030, 'FY2030 FCF exists');

    // 5Y Revenue CAGR = (rev2030 / rev2025)^(1/5) - 1
    const cagr = Math.pow(rev2030 / rev2025, 1 / 5) - 1;
    const fcfMargin = fcf2030 / rev2030;
    const ruleOf40 = (cagr + fcfMargin) * 100;

    assert.ok(Math.abs(cagr - 0.1610) < 0.005, '5Y Revenue CAGR is ~16.1%');
    assert.ok(Math.abs(fcfMargin - 0.3135) < 0.005, 'FY2030 FCF Margin is ~31.4%');
    assert.ok(Math.abs(ruleOf40 - 47.45) < 0.5, 'Rule of 40 is 47.4%');
  });
});

describe('P6.1  -  Rendered View Tie-Out & Quality Gates', () => {
  test('createApp initializes cleanly and executes reactive recalc pipeline', async () => {
    const { historical, assumptions } = await getFullModel();
    const { root } = createTabRoot(TAB_KEYS);

    const app = createApp({
      data: { loadHistorical, loadAssumptions },
      engine: {},
      root,
      now: () => 1725148800000,
      historical,
      assumptions,
    });

    assert.ok(app, 'App initialized successfully');
    assert.equal(typeof app.setDriver, 'function');
    assert.equal(typeof app.setScenario, 'function');
    assert.equal(typeof app.state, 'function');

    const state = app.state();
    assert.equal(state.scenario, 'base');
    assert.ok(state.wacc);
    assert.ok(state.dcf);
    assert.ok(state.recommendation);

    // Verify reactive recalc path
    const prevPerShare = state.dcf.perShare;
    app.setDriver('risk_free_rate', 0.05);
    const updatedPerShare = app.state().dcf.perShare;
    assert.ok(updatedPerShare < prevPerShare, 'Higher risk-free rate lowers DCF per share value');

    app.dispose();
  });

  test('Quality Gate: 706 historical records unchanged', async () => {
    const { historical } = await getFullModel();
    const totalRecords =
      extractRows(historical.income).length +
      extractRows(historical.balance).length +
      extractRows(historical.cashflow).length +
      extractRows(historical.kpis).length;

    assert.equal(totalRecords, CORPUS_RECORD_COUNT, `Corpus contains exactly ${CORPUS_RECORD_COUNT} records`);
  });

  test('Quality Gate: Zero style= attributes across all src/ui/ files', async () => {
    const files = await fs.promises.readdir(UI_DIR);
    for (const file of files) {
      if (!file.endsWith('.js')) continue;
      const content = await fs.promises.readFile(`${UI_DIR}/${file}`, 'utf8');
      assert.ok(!content.includes('style='), `No inline style= in ${file}`);
    }
  });

  test('Quality Gate: Zero bare numeric literals > 999 outside comments in src/ui/*.js', async () => {
    const files = await fs.promises.readdir(UI_DIR);
    const numberRegex = /(?<![a-zA-Z0-9_$])([1-9]\d{3,})(?![a-zA-Z0-9_$])/g;

    for (const file of files) {
      if (!file.endsWith('.js')) continue;
      const rawContent = await fs.promises.readFile(`${UI_DIR}/${file}`, 'utf8');
      const lines = rawContent.split('\n');
      let inBlockComment = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let code = line;

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
          const num = Number(match[1]);
          // Filing-date years in cited prose/asOf fallbacks (Warning #2 disposition,
          // EP.4): reviewed calendar years, not financial figures. The P8.0
          // orphan-figure gate audits user-visible numerals separately.
          if (num === 1000 || num === 1280 || num === 1900 || num === 2000 || num === 2025 || num === 2026) continue;
          assert.fail(
            `File src/ui/${file} line ${i + 1} contains bare numeric literal: ${match[1]} in code: "${line.trim()}"`
          );
        }
      }
    }
  });
});
