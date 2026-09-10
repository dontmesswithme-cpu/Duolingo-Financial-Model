import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { regress } from '../src/engine/beta.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { renderValuation } from '../src/ui/valuationTab.js';
import { renderSensitivity } from '../src/ui/sensitivityTab.js';
import peersDataset from '../src/data/historical/peers_beta.json' with { type: 'json' };

const P3_CORPUS_RECORD_COUNT = 706;
const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');
const getAssumptions = () => loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
const getHistorical = () => loadHistorical({ dir: DATA_DIR, readText });

function extractRows(dataset) {
  if (!dataset) return [];
  if (Array.isArray(dataset)) return dataset;
  if (Array.isArray(dataset.rows)) return dataset.rows;
  return [];
}

function createHtmlContainer() {
  return {
    innerHTML: '',
    querySelectorAll(selector) {
      if (this.innerHTML.includes(selector.replace(/[[\]"]/g, ''))) {
        return [{ getAttribute: () => 'base', addEventListener: () => {} }];
      }
      return [];
    },
    querySelector() {
      return {
        innerHTML: '',
        appendChild: () => {},
        setAttribute: () => {},
        getAttribute: () => null,
        addEventListener: () => {},
      };
    },
  };
}

describe('P6R3.2  -  Peer Beta Corpus: Dataset Integrity & Peer Lock', () => {
  test('peers_beta.json contains locked peer set (SPOT, RBLX, NFLX) and zero excluded peers', () => {
    assert.deepStrictEqual(peersDataset.peerSymbols, ['SPOT', 'RBLX', 'NFLX']);
    assert.strictEqual(peersDataset.peersCount, 3);
    assert.strictEqual(peersDataset.n, 60);
    assert.strictEqual(peersDataset.pricesCount, 61);
    assert.strictEqual(peersDataset.windowStart, '2021-09');
    assert.strictEqual(peersDataset.windowEnd, '2026-08');

    // Director rule: Coursera and Udemy permanently removed from ALL peer uses
    const rawJson = JSON.stringify(peersDataset);
    assert.doesNotMatch(rawJson, /\bCOUR\b/i, 'Coursera (COUR) must be completely absent from peer beta corpus');
    assert.doesNotMatch(rawJson, /\bCoursera\b/i, 'Coursera must be completely absent from peer beta corpus');
    assert.doesNotMatch(rawJson, /\bUDMY\b/i, 'Udemy (UDMY) must be completely absent from peer beta corpus');
    assert.doesNotMatch(rawJson, /\bUdemy\b/i, 'Udemy must be completely absent from peer beta corpus');
  });

  test('each peer carries 60 observations and cited capital structure metadata', () => {
    for (const sym of ['SPOT', 'RBLX', 'NFLX']) {
      const peer = peersDataset.peers[sym];
      assert.ok(peer, `Peer ${sym} must exist in dataset`);
      assert.strictEqual(peer.observations.length, 60, `${sym} must have 60 observations`);
      assert.strictEqual(peer.prices.length, 61, `${sym} must have 61 price points`);
      assert.ok(peer.capitalStructure, `${sym} must have capital structure block`);
      assert.strictEqual(peer.capitalStructure.asOf, '2025-12-31');
      assert.ok(peer.capitalStructure.totalDebt > 0, `${sym} total debt must be positive`);
      assert.ok(peer.capitalStructure.marketCap > 0, `${sym} market cap must be positive`);
      assert.ok(peer.capitalStructure.debtToEquity > 0, `${sym} D/E must be positive`);
      assert.ok(peer.capitalStructure.effectiveTaxRate > 0, `${sym} tax rate must be positive`);
      assert.ok(peer.capitalStructure.source.accession, `${sym} must have SEC accession`);
    }
  });
});

describe('P6R3.2  -  Beta Math: OLS Regression & Hamada Unlevering', () => {
  test('frozen beta.regress executes on each peer and reproduces verified levered betas', () => {
    const spotReg = regress(peersDataset.peers.SPOT);
    assert.ok(Math.abs(spotReg.beta - 1.585990) < 1e-4, `SPOT beta expected ~1.5860, got ${spotReg.beta}`);
    assert.strictEqual(spotReg.n, 60);

    const rblxReg = regress(peersDataset.peers.RBLX);
    assert.ok(Math.abs(rblxReg.beta - 1.474154) < 1e-4, `RBLX beta expected ~1.4742, got ${rblxReg.beta}`);
    assert.strictEqual(rblxReg.n, 60);

    const nflxReg = regress(peersDataset.peers.NFLX);
    assert.ok(Math.abs(nflxReg.beta - 1.525779) < 1e-4, `NFLX beta expected ~1.5258, got ${nflxReg.beta}`);
    assert.strictEqual(nflxReg.n, 60);
  });

  test('Hamada unlevered betas derive median = 1.47, mean = 1.49, span = 0.13', () => {
    const unlevered = [];
    for (const sym of ['SPOT', 'RBLX', 'NFLX']) {
      const p = peersDataset.peers[sym];
      const reg = regress(p);
      const de = p.capitalStructure.debtToEquity;
      const t = p.capitalStructure.effectiveTaxRate;
      const denom = 1 + (1 - t) * de;
      const bU = reg.beta / denom;
      unlevered.push({ symbol: sym, bU });
    }

    const spotU = unlevered.find(x => x.symbol === 'SPOT').bU;
    const rblxU = unlevered.find(x => x.symbol === 'RBLX').bU;
    const nflxU = unlevered.find(x => x.symbol === 'NFLX').bU;

    assert.ok(Math.abs(spotU - 1.5657) < 1e-3, `SPOT unlevered ~1.5657, got ${spotU}`);
    assert.ok(Math.abs(rblxU - 1.4387) < 1e-3, `RBLX unlevered ~1.4387, got ${rblxU}`);
    assert.ok(Math.abs(nflxU - 1.4713) < 1e-3, `NFLX unlevered ~1.4713, got ${nflxU}`);

    const sorted = [...unlevered].sort((a, b) => a.bU - b.bU);
    const median = sorted[1].bU;
    const mean = (spotU + rblxU + nflxU) / 3;
    const span = sorted[2].bU - sorted[0].bU;

    const roundedMedian = Number(median.toFixed(2));
    const roundedMean = Number(mean.toFixed(2));
    const roundedSpan = Number(span.toFixed(2));

    assert.strictEqual(roundedMedian, 1.47, `Median must equal 1.47, got ${roundedMedian}`);
    assert.strictEqual(roundedMean, 1.49, `Mean must equal 1.49, got ${roundedMean}`);
    assert.strictEqual(roundedSpan, 0.13, `Span must equal 0.13, got ${roundedSpan}`);
  });

  test('driver re-anchor consistency gate: assumptions.json beta value === 1.47', async () => {
    const assumptions = await getAssumptions();
    const betaDriver = assumptions.get('beta');
    assert.ok(betaDriver, 'beta driver must exist');
    assert.strictEqual(betaDriver.value, 1.47, `Driver value must be 1.47, got ${betaDriver.value}`);
    assert.strictEqual(betaDriver.marking, 'MKT');
    assert.strictEqual(betaDriver.asOf, '2026-08-31');
    assert.ok(betaDriver.notes.includes('1.47'));
    assert.ok(betaDriver.notes.includes('Spotify'));
    assert.ok(betaDriver.notes.includes('Roblox'));
    assert.ok(betaDriver.notes.includes('Netflix'));
    assert.ok(betaDriver.notes.includes('0.89')); // Vasicek cross-check disclosed
    assert.ok(betaDriver.notes.includes('debt-free')); // Debt-free direct application disclosed
  });

  test('corpus invariant: 706 historical records unchanged', async () => {
    const historical = await getHistorical();
    const allRows = [
      ...extractRows(historical.income),
      ...extractRows(historical.balance),
      ...extractRows(historical.cashflow),
      ...extractRows(historical.kpis),
    ];
    assert.strictEqual(allRows.length, P3_CORPUS_RECORD_COUNT);
  });
});

describe('P6R3.2  -  UI Presentation: Peer Derivation & Range Readout', () => {
  test('valuationTab renders Peer Median Derivation Table and Vasicek cross-check', () => {
    const container = createHtmlContainer();
    const mockWacc = {
      beta: {
        value: 1.47,
        asOf: '2026-08-31',
        source: { provider: 'stockanalysis.com / SEC EDGAR', url: 'https://stockanalysis.com/stocks/spot/statistics/' },
      },
      riskFreeRate: { value: 0.0479, asOf: '2026-09-01', source: { provider: 'FRED' } },
      erp: { value: 0.0425, asOf: '2026-09-01', source: { provider: 'Damodaran' } },
      costOfEquity: { value: 0.110375 },
      wacc: { value: 0.110375 },
      sharesOutstanding: { value: 50.031, asOf: '2026-06-30' },
    };
    const mockDcf = {
      schedule: [],
      pvExplicit: 1586880.58,
      pvTerminal: 4205133.49,
      terminalValue: 7097871.98,
      terminalGrowthRate: 0.025,
      enterpriseValue: 5792014.07,
      bridge: { cash: 649088, shortTermInvestments: 767471, longTermInvestments: 0, debt: 0 },
      equityValue: 7208573.07,
      sharesOutstanding: 50031000,
      perShareValue: 144.08,
    };

    const view = renderValuation({
      container,
      wacc: mockWacc,
      dcf: mockDcf,
      TabulatorConstructor: null,
    });

    const html = container.innerHTML;
    assert.ok(html.includes('peer-beta-table'), 'Must render peer beta derivation table');
    assert.ok(html.includes('Spotify Technology S.A.') || html.includes('SPOT'), 'Must include Spotify');
    assert.ok(html.includes('Roblox Corporation') || html.includes('RBLX'), 'Must include Roblox');
    assert.ok(html.includes('Netflix, Inc.') || html.includes('NFLX'), 'Must include Netflix');
    assert.ok(html.includes('1.47'), 'Must display peer median 1.47');
    assert.ok(html.includes('1.49'), 'Must display peer mean 1.49');
    assert.ok(html.includes('0.13'), 'Must display peer span 0.13');
    // RWC.1d maintenance: block renamed to Single-Stock Regression Cross-Check, Vasicek-shrunk claim removed (raw 0.89 shown with no shrinkage).
    assert.ok(html.includes('Single-Stock Regression Cross-Check'), 'Must render Single-Stock Regression Cross-Check header');
    assert.ok(!html.includes('Vasicek'), 'Must not claim Vasicek shrinkage was performed');
    assert.ok(html.includes('0.8905'), 'Must render DUOL computed OLS slope');
    assert.ok(html.includes('0.89'), 'Must render DUOL OLS rounded slope / cross-check');

    view.dispose();
  });

  test('sensitivityTab states the beta range under evaluation', async () => {
    const assumptions = await getAssumptions();
    const betaDriver = assumptions.get('beta');
    const baseBeta = betaDriver.value;
    const bearBeta = Number((baseBeta + betaDriver.scenarioDeltas.bear).toFixed(2));
    const bullBeta = Number((baseBeta + betaDriver.scenarioDeltas.bull).toFixed(2));

    const container = createHtmlContainer();
    const mockGrid = {
      base: { wacc: 0.110375, growth: 0.025 },
      waccValues: [0.090375, 0.110375, 0.130375],
      growthValues: [0.01, 0.02, 0.025, 0.03],
      matrix: {
        0.110375: { 0.025: { perShare: 144.08 } }
      }
    };

    const view = renderSensitivity({
      container,
      sensitivityGrid: mockGrid,
      TabulatorConstructor: null,
    });

    const html = container.innerHTML;
    assert.ok(html.includes('beta range'), 'Must mention beta range');
    assert.ok(html.includes(`Bear β = ${bearBeta}`) || html.includes(`${bearBeta}`), `Must disclose Bear beta ${bearBeta}`);
    assert.ok(html.includes(`Base β = ${baseBeta}`) || html.includes(`${baseBeta}`), `Must disclose Base beta ${baseBeta}`);
    assert.ok(html.includes(`Bull β = ${bullBeta}`) || html.includes(`${bullBeta}`), `Must disclose Bull beta ${bullBeta}`);

    view.dispose();
  });
});
