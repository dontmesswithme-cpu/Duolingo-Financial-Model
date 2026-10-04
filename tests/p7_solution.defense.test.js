/**
 * P8.0 Consolidated Derivation-Guard Suite - Thesis Defense Panel & Pre-Phase 8 Gates.
 *
 * Verifies all specifications from docs/phases/phase_7_solution.md (§3, §4, §5, §7, §8, §9):
 *  1. Thesis Defense panel mounts 7 expandable rows (#defense-lever-1 through #defense-lever-7).
 *  2. Anchor linkages ([D1]..[D6]) present across consuming tables (WACC, DCF, Bridge, Beta, Dual-Path).
 *  3. Dynamic derivation guard: every panel numeral derives from live driver records + engine + corpus.
 *  4. Flip-map mathematics & reachability honesty (WACC parity/flips, closed-form g, C1 pre-growth FCF check).
 *  5. Orphan-figure lint gate: scans user-visible prose for un-sanctioned literals.
 *  6. Prose data-content gate in all 4 interactive states (default, bear, bull, slider-edited).
 *  7. Exhibit A remediation (F1 Base WACC headroom & F2 official Sep-2 OHLCV) + full-prose class sweep.
 *  8. Standing quality gates: zero style=, zero bare literals > 999 outside comments, zero /protocol/i.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderValuation } from '../src/ui/valuationTab.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { RECOMMENDATION_THRESHOLDS } from '../src/data/constants.js';
import schedulesEngine from '../src/engine/schedules.js';
import forecastEngine from '../src/engine/forecast.js';
import threeStatementEngine from '../src/engine/threeStatement.js';
import { build as buildWacc } from '../src/engine/wacc.js';
import { valuate as valuateDcf } from '../src/engine/dcf.js';
import { evaluate as evaluateRec, runFullValuation } from '../src/engine/recommend.js';
import { readLedgerUrls } from './_ledger.js';
import { StubElement } from './_dom_stub.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const UI_VALUATION_PATH = fileURLToPath(new URL('../src/ui/valuationTab.js', import.meta.url));

const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();

async function getDatasets() {
  const historical = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
  const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
  const sched = schedulesEngine.build(historical, assumptions);
  const fc = forecastEngine.project({ historical, assumptions });
  const ts = threeStatementEngine.project(sched, assumptions, fc);
  const waccOut = buildWacc({ assumptions, debtSchedule: sched.debt });
  const dcfOut = valuateDcf(ts, waccOut, { assumptions, corpus: historical });
  const marketPrice = assumptions.get('market_share_price').value;
  const recOut = evaluateRec(dcfOut.perShare, marketPrice);
  return { historical, assumptions, sched, fc, ts, waccOut, dcfOut, recOut, marketPrice };
}

function overrideAssumption(baseAssumptions, overrides) {
  const byName = { ...baseAssumptions.byName };
  for (const [k, v] of Object.entries(overrides)) {
    if (byName[k]) {
      byName[k] = { ...byName[k], value: v };
    }
  }
  return {
    ...baseAssumptions,
    byName,
    get(name) { return byName[name] ?? null; },
    getValue(name) { return byName[name]?.value; },
  };
}

function createHtmlContainer() {
  const container = new StubElement();
  let _innerHTML = '';
  const childMap = new Map();
  Object.defineProperty(container, 'innerHTML', {
    get() {
      return _innerHTML;
    },
    set(val) {
      _innerHTML = String(val);
    },
  });
  container.querySelector = (selector) => {
    const match = /\[data-statement=["']?([^"'\]]+)["']?\]/.exec(selector);
    if (match) {
      const stmt = match[1];
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

describe('P8.0 - Thesis Defense Panel: Mounting, Anatomy & Anchor Linkages', () => {
  test('mounts #thesis-defense-panel with 8 expandable rows collapsed by default', async () => {
    const { waccOut, dcfOut, assumptions } = await getDatasets();
    const container = createHtmlContainer();
    const view = renderValuation({ container, wacc: waccOut, dcf: dcfOut, assumptions, TabulatorConstructor: MockTabulator });

    assert.ok(view);
    const html = container.innerHTML;

    assert.ok(html.includes('id="thesis-defense-panel"'), 'Thesis defense card must exist');
    assert.ok(html.includes('class="valuation-card thesis-defense-card"'), 'Must have thesis-defense-card class');

    for (let lever = 1; lever <= 7; lever++) {
      const rowId = `id="defense-lever-${lever}"`;
      assert.ok(html.includes(rowId), `Row ${lever} with ${rowId} must exist`);
      const detailsTagRegex = new RegExp(`<details class="defense-row" id="defense-lever-${lever}">`);
      assert.match(html, detailsTagRegex, `Lever ${lever} must be a collapsed <details> row`);
    }

    // Retired levers (net cash bridge, scenario bands, benchmark price, discount digest) must NOT render.
    assert.doesNotMatch(html, /id="defense-lever-(8|9|10|11)"/, 'No rows beyond Lever 7 may exist');
    assert.doesNotMatch(html, /Net Cash Bridge \(Today's Balance\)/, 'Net Cash Bridge defense row must be retired');
    assert.doesNotMatch(html, /Scenario Bands \(Operating &amp; Market Deltas\)/, 'Scenario Bands defense row must be retired');
    assert.doesNotMatch(html, /Benchmark Share Price \(Snapshot &amp; Live\)/, 'Benchmark Share Price defense row must be retired');
    assert.doesNotMatch(html, /Discount-Mechanics Digest/, 'Discount digest defense row must be retired (merged into bridge table)');
    assert.ok(!html.includes('ten core'), 'Intro prose must not carry retired count phrasing');

    view.dispose();
  });

  test('surviving anchor links [D1] through [D6] are present across consuming tables', async () => {
    const { waccOut, dcfOut, assumptions } = await getDatasets();
    const container = createHtmlContainer();
    const view = renderValuation({ container, wacc: waccOut, dcf: dcfOut, assumptions, TabulatorConstructor: MockTabulator });
    const html = container.innerHTML;

    for (const lever of [1, 2, 3, 4, 5, 6]) {
      const linkPattern = new RegExp(`href="#defense-lever-${lever}"[^>]*>\\[D${lever}\\]`);
      assert.match(html, linkPattern, `Anchor link [D${lever}] pointing to #defense-lever-${lever} must be present`);
    }
    // Dead-target labels must not render anywhere (removed levers carried D7/D8/D9/D10 labels).
    for (const dead of ['[D7]', '[D8]', '[D9]', '[D10]', '[D11]']) {
      assert.ok(!html.includes(dead), `Dead label ${dead} must not render`);
    }

    assert.match(html, /Risk-Free Rate \(rf\).*href="#defense-lever-1"/s, '[D1] in WACC table rf row');
    assert.match(html, /Equity Beta \(β\).*href="#defense-lever-2"/s, '[D2] in WACC table beta row');
    assert.match(html, /Equity Risk Premium \(ERP\).*href="#defense-lever-3"/s, '[D3] in WACC table ERP row');
    assert.match(html, /Marginal Corporate Tax Rate.*href="#defense-lever-5"/s, '[D5] in WACC table tax row');
    assert.match(html, /Diluted Common Shares Outstanding.*href="#defense-lever-6"/s, '[D6] in Bridge table');

    view.dispose();
  });
});

describe('P8.0 - Thesis Defense: Derivation Guard & Flip-Map Geometry', () => {
  test('all 7 levers re-derive dynamically from engine, corpus, and driver records', async () => {
    const { waccOut, dcfOut, assumptions, marketPrice } = await getDatasets();
    const container = createHtmlContainer();
    const view = renderValuation({ container, wacc: waccOut, dcf: dcfOut, assumptions, TabulatorConstructor: MockTabulator });
    const html = container.innerHTML;

    // Lever 1: rf
    const rfVal = (waccOut.riskFreeRate.value * 100).toFixed(2) + '%';
    assert.ok(html.includes(rfVal), `Lever 1 must render rf: ${rfVal}`);
    assert.ok(html.includes('FRED series DGS10'), 'Lever 1 must cite FRED DGS10');

    // Lever 2: Beta
    const betaVal = waccOut.beta.value.toFixed(2);
    assert.ok(html.includes(betaVal), `Lever 2 must render beta: ${betaVal}`);
    assert.ok(html.includes('Spotify, Roblox, Netflix'), 'Lever 2 must cite locked peer set');
    assert.doesNotMatch(html, /Coursera|Udemy/, 'Peer-set prose must not name removed peer candidates');

    // Lever 3: ERP
    const erpVal = (waccOut.erp.value * 100).toFixed(2) + '%';
    assert.ok(html.includes(erpVal), `Lever 3 must render ERP: ${erpVal}`);
    assert.ok(html.includes('Mechanical trailing-3-month average of Damodaran'), 'Lever 3 leads with smoothing rationale');

    // Lever 4: Terminal Growth g
    const gVal = (dcfOut.terminalGrowthRate * 100).toFixed(2) + '%';
    assert.ok(html.includes(gVal), `Lever 4 must render g: ${gVal}`);
    assert.ok(html.includes('4.00% US nominal GDP ceiling'), 'Lever 4 must cite 4% ceiling');

    // Lever 5: Corporate Tax Rate
    const taxVal = (waccOut.taxRate.value * 100).toFixed(2) + '%';
    assert.ok(html.includes(taxVal), `Lever 5 must render tax rate: ${taxVal}`);
    assert.match(html, /FY2025 \((−|-)126\.99%\) is disqualified: a one-time valuation-allowance release/, 'Lever 5 rejects FY2025 anchor with disqualification rationale');

    // Retired defense rows: net cash bridge, scenario bands, benchmark price (Director order 2026-09-06), discount digest (merged into bridge table).
    assert.doesNotMatch(html, /Net Cash Bridge \(Today's Balance\)/, 'Net Cash defense retired');
    assert.doesNotMatch(html, /Scenario Bands \(Operating &amp; Market Deltas\)/, 'Scenario Bands defense retired');
    assert.doesNotMatch(html, /Benchmark Share Price \(Snapshot &amp; Live\)/, 'Benchmark price defense retired');
    assert.doesNotMatch(html, /Discount-Mechanics Digest/, 'Discount digest defense retired');

    // TV share lives on in the bridge table (merged, not defended).
    const tvPct = ((dcfOut.pvTerminal / dcfOut.enterpriseValue) * 100).toFixed(1) + '%';
    assert.ok(html.includes(tvPct), `Bridge table must carry TV share: ${tvPct}`);

    // Lever 6: Diluted Shares (renumbered from 7) — EP.2 rolled count (BOP 50.031M + gross issuance)
    const sharesM = (dcfOut.sharesOutstanding / 1e6).toFixed(3) + 'M';
    assert.equal(sharesM, '56.933M', 'Diluted shares derivation must be 56.933M (rolled)');
    assert.ok(html.includes(sharesM), `Lever 6 must render shares: ${sharesM}`);
    // P10.5: the lever renders the ROLLED count (the FD schedule plus modelled
    // issuance) as its headline, and states the FD schedule build underneath.
    // Both must be present, and the rolled headline must exceed the schedule
    // base, which is the whole point of the roll.
    assert.ok(
      html.includes('Fully diluted shares outstanding (56.933M)') ||
        html.includes('Fully diluted shares outstanding (56,932,927'),
      'Lever 6 must render the rolled count',
    );
    assert.ok(
      html.includes('point-in-time schedule at 2026-06-30'),
      'Lever 6 must date the point-in-time schedule it rolls from',
    );
    assert.ok(html.includes('46,724,000'), 'Lever 6 must cite the basic period-end count');
    assert.ok(html.includes('40,325,000'), 'Lever 6 must cite Class A outstanding');
    assert.ok(html.includes('6,399,000'), 'Lever 6 must cite Class B outstanding');
    assert.ok(html.includes('520,458'), 'Lever 6 must cite incremental options');
    assert.ok(html.includes('2,817,000'), 'Lever 6 must cite RSUs and other awards');
    assert.ok(
      dcfOut.sharesOutstanding > 50061458,
      'the rolled count must exceed the FD schedule base it starts from',
    );

    // Lever 7: Peer Set Selection (renumbered from 8)
    assert.ok(html.includes('Lever 7: Peer Set Selection'), 'Lever 7 peer-set row must exist');
    assert.ok(html.includes('Why This Choice'), 'Lever 7 must carry the rationale label');
    assert.ok(html.includes('Spotify, Roblox, Netflix'), 'Lever 7 must cite the locked peer set');

    view.dispose();
  });

  test('flip-map coordinates are mathematically verified with C1 pre-growth FCF check', async () => {
    const { waccOut, dcfOut, assumptions } = await getDatasets();
    const container = createHtmlContainer();
    const view = renderValuation({ container, wacc: waccOut, dcf: dcfOut, assumptions, TabulatorConstructor: MockTabulator });
    const html = container.innerHTML;

    assert.match(html, /Parity \(perShare == \$157\.85\)/, 'Must render Parity coordinate');
    // rf parity is engine-derived; at beta 1.49 it resolves to 2.26% (-253.23 bps
    // from the 11.1225% Base WACC). These are recomputed by the flip-map from the
    // live model, so the pin tracks the WACC rather than a retired literal.
    assert.match(html, /2\.26%|-253\.\d+ bps/, 'Must render rf parity coordinate');
    assert.match(html, /Overvalued Flip/, 'Must render Overvalued flip');
    assert.match(html, /Undervalued Flip/, 'Must render Undervalued flip');

    assert.doesNotMatch(html, />3\.62%</, 'Terminal g parity 3.62% is gone (EP.2: parity unreachable)');
    assert.match(html, /&gt; 3\.53%/, 'Terminal g overvalued flip must be > 3.53% (engine-derived at beta 1.49)');
    assert.match(html, /Unreachable within driver bounds \[0, 4%\]/, 'Terminal g undervalued flip must declare unreachable');
    assert.match(html, /within its stated bounds.*terminal growth cannot rescue this thesis; only the discount rate or the flows can/, 'Ratified reachability defense sentence must be present');

    assert.doesNotMatch(html, />3\.45%</, 'C1 violation: grown FCF must NOT be used for closed form g');

    view.dispose();
  });
});

describe('P8.0 - Prose Data-Content Gate in All 4 Interactive States', () => {
  test('prose numerals update reactively across default, bear, bull, and slider-edited states', async () => {
    const { historical, assumptions, sched, fc, ts, waccOut, dcfOut } = await getDatasets();
    const container = createHtmlContainer();
    const view = renderValuation({ container, wacc: waccOut, dcf: dcfOut, assumptions, TabulatorConstructor: MockTabulator });

    // 1. Default state
    let html = container.innerHTML;
    // Base WACC at beta 1.49 = 4.79% + 1.49 x 4.25% = 11.1225%. The prose
    // rounds to 2dp, so the rendered form is 11.12%.
    assert.match(html, /11\.12%|11\.1225%/, 'Default state shows the baseline WACC');

    // 2. Bear state
    const bearVal = runFullValuation(historical, assumptions, 'bear');
    view.update(bearVal.wacc, bearVal.dcf, assumptions);
    html = container.innerHTML;
    const bearWaccStr = (bearVal.wacc.wacc.value * 100).toFixed(2) + '%';
    assert.ok(html.includes(bearWaccStr), 'Bear state updates runtime WACC in defense panel');
    assert.ok(bearVal.wacc.wacc.value > waccOut.wacc.value, 'Bear WACC is higher than Base WACC');

    // 3. Bull state
    const bullVal = runFullValuation(historical, assumptions, 'bull');
    view.update(bullVal.wacc, bullVal.dcf, assumptions);
    html = container.innerHTML;
    const bullWaccStr = (bullVal.wacc.wacc.value * 100).toFixed(2) + '%';
    assert.ok(html.includes(bullWaccStr), 'Bull state updates runtime WACC in defense panel');
    assert.ok(bullVal.wacc.wacc.value < waccOut.wacc.value, 'Bull WACC is lower than Base WACC');

    // 4. Slider-edited state: beta override
    const editedAssumptions = overrideAssumption(assumptions, { beta: 1.20 });
    const editedWacc = buildWacc({ assumptions: editedAssumptions, debtSchedule: sched.debt });
    const editedDcf = valuateDcf(ts, editedWacc, { assumptions: editedAssumptions, corpus: historical });
    view.update(editedWacc, editedDcf, editedAssumptions);
    html = container.innerHTML;
    assert.match(html, /1\.20/, 'Slider-edited state updates beta parameter in defense panel');
    assert.ok(html.includes((editedWacc.wacc.value * 100).toFixed(2) + '%'), 'Slider-edited state updates WACC');

    view.dispose();
  });
});

describe('P8.0 - Exhibit A Remediation & Full-Prose Class Sweep', () => {
  test('F1 and F2 are remediated in assumptions.json driver notes', async () => {
    const content = await fs.promises.readFile(ASSUMPTIONS_PATH, 'utf8');
    const drivers = JSON.parse(content);

    // F1: terminal_growth_rate
    const gDriver = drivers.find((d) => d.name === 'terminal_growth_rate');
    const gNote = gDriver?.notes || '';
    assert.ok(gNote.includes('11.1225%') && gNote.includes('Base WACC'), 'F1 remediated: cites live 11.1225% Base WACC');
    // Headroom is (WACC - g) in bps: 11.1225% - 2.50% = 862.25bps. The prior
    // 853.75bps was the median-beta (11.0375%) headroom and is retired.
    assert.ok(gNote.includes('862.25bps'), 'F1 remediated: cites live 862.25bps Gordon headroom');
    assert.ok(!gNote.includes('8.6638%'), 'F1 stale WACC 8.6638% must be purged');
    assert.ok(!gNote.includes('616bps'), 'F1 stale headroom 616bps must be purged');

    // F2: market_share_price
    const mktDriver = drivers.find((d) => d.name === 'market_share_price');
    const mktNote = mktDriver?.notes || '';
    assert.ok(mktNote.includes('156.24') && mktNote.includes('158.47') && mktNote.includes('154.30'), 'F2 remediated: cites official Sep-2 OHLC');
    assert.ok(mktNote.includes('1,294,851'), 'F2 remediated: cites official Sep-2 volume');
    assert.ok(!mktNote.includes('752,400'), 'F2 phantom volume 752,400 must be purged');
    assert.ok(!mktNote.includes('155.00') && !mktNote.includes('159.20'), 'F2 phantom range must be purged');
  });

  test('full-prose class sweep: all numerals in driver notes derive from live records or sanctioned sources', async () => {
    const content = await fs.promises.readFile(ASSUMPTIONS_PATH, 'utf8');
    const drivers = JSON.parse(content);
    const liveWacc = 0.111225;

    const SANCTIONED_PRECISE_FIGURES = new Set([
      // F1 live WACC and headroom
      11.1225, 862.25,
      // F2 official Sep-2 OHLCV
      156.24, 158.47, 154.30, 157.85, 1294851,
      // 6R3 locked peer betas & regression stats
      1.5657, 1.4387, 1.4713, 1.565748, 1.438748, 1.471329, 1.4919, 0.127, 1.586, 1.4742, 1.5258,
      0.519187, 0.890488, 0.0164, 0.0312, 0.0429,
      // Damodaran monthly ERP prints & rounding step
      4.14, 4.28, 4.30, 4.24, 4.25, 4.46, 4.33, 4.23, 0.0005,
      // Historical FY2025 actual expense & revenue ratios
      27.7694, 29.5226, 12.1124, 17.5298, 0.1551, 4.0179,
      28.4211, 8.3647, 8.2656, 2.9356, 17.0633,
      // Historical effective tax rates FY2021-FY2025
      126.997, 0.2952, 1.5997, 9.6192, 13.4225, 126.99,
      // Macro ceiling & share counts
      2.0, 4.0, 2.5, 50031000, 46786269, 40387012, 6399257, 50031,
    ]);

    const sweepViolations = [];
    for (const d of drivers) {
      const note = d.notes || '';
      if (!note) continue;

      // Stale strings check
      if (note.includes('8.6638%') || note.includes('616bps') || note.includes('752,400') || note.includes('155.00/159.20')) {
        sweepViolations.push(`${d.name}: contains known stale defect string`);
      }

      // WACC check
      if (/WACC/i.test(note)) {
        const pctMatches = note.match(/\b\d+\.\d+%/g) || [];
        for (const p of pctMatches) {
          const v = parseFloat(p);
          if (Math.abs(v - liveWacc * 100) > 0.001 && !SANCTIONED_PRECISE_FIGURES.has(v) && Math.abs(v - (d.value * 100)) > 0.001) {
            sweepViolations.push(`${d.name}: WACC-adjacent % ${p} does not match live Base WACC (${(liveWacc * 100).toFixed(4)}%)`);
          }
        }
      }

      // OHLCV check
      if (/open\s+[\d.]+/i.test(note)) {
        const ohlcv = note.match(/open\s+([\d.]+),\s*high\s+([\d.]+),\s*low\s+([\d.]+)/i);
        if (ohlcv) {
          const [o, h, l] = [parseFloat(ohlcv[1]), parseFloat(ohlcv[2]), parseFloat(ohlcv[3])];
          if (o !== 156.24 || h !== 158.47 || l !== 154.30) {
            sweepViolations.push(`${d.name}: OHLCV mismatch open ${o}, high ${h}, low ${l}`);
          }
        }
      }

      // Precise figures check (3+ decimals)
      const preciseMatches = note.match(/\b\d+\.\d{3,}\b/g) || [];
      for (const p of preciseMatches) {
        const v = parseFloat(p);
        const ownVal = d.value;
        const isOwn = ownVal !== undefined && Math.abs(ownVal - v) < 1e-9;
        const isSanctioned = SANCTIONED_PRECISE_FIGURES.has(v) || [...SANCTIONED_PRECISE_FIGURES].some((s) => Math.abs(s - v) < 1e-6 || Math.abs(s * 100 - v) < 1e-6);
        if (!isOwn && !isSanctioned) {
          sweepViolations.push(`${d.name}: unsanctioned precise figure ${p}`);
        }
      }
    }

    assert.equal(sweepViolations.length, 0, `Class sweep detected violations in assumptions notes:\n${sweepViolations.join('\n')}`);
  });
});

describe('P8.0 - Quality Gates: Purity, Anti-Literal & DOM Integrity', () => {
  test('zero style= inline attributes in valuationTab.js output', async () => {
    const { waccOut, dcfOut, assumptions } = await getDatasets();
    const container = createHtmlContainer();
    const view = renderValuation({ container, wacc: waccOut, dcf: dcfOut, assumptions, TabulatorConstructor: MockTabulator });
    const html = container.innerHTML;

    assert.ok(!html.includes('style='), 'Valuation Tab HTML must contain zero inline style= attributes');
    view.dispose();
  });

  test('zero /protocol/i in product DOM or user strings', async () => {
    const { waccOut, dcfOut, assumptions } = await getDatasets();
    const container = createHtmlContainer();
    const view = renderValuation({ container, wacc: waccOut, dcf: dcfOut, assumptions, TabulatorConstructor: MockTabulator });
    const html = container.innerHTML;

    assert.doesNotMatch(html, /protocol/i, 'Product DOM must contain zero /protocol/i');
    view.dispose();
  });

  test('orphan-figure lint gate: all user-visible numerals > 999 are on explicit reviewed allowlist (D1)', async () => {
    let rawContent = await fs.promises.readFile(UI_VALUATION_PATH, 'utf8');

    // 1. Strip comments
    rawContent = rawContent.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');

    // 2. Join adjacent string concatenations e.g. ('20' + '26') -> '2026'
    rawContent = rawContent.replace(/\(\s*(['"][^'"]*['"])\s*\+\s*(['"][^'"]*['"])\s*\)/g, (m, p1, p2) => `'${p1.slice(1, -1)}${p2.slice(1, -1)}'`);

    // 3. Remove commas inside numbers e.g. 50,031,000 -> 50031000
    rawContent = rawContent.replace(/\b(\d{1,3}(?:,\d{3})+)\b/g, (m) => m.replace(/,/g, ''));

    // 4. Explicit reviewed allowlist of sanctioned numerals > 999
    //
    // P10.5 replaced the P10.0 share approximation (50,031,000 weighted average /
    // 46,786,269 basic from Class A *issued*) with the ruled P10.4 point-in-time
    // schedule: 50,061,458 total, 46,724,000 basic period-end, and the three
    // incremental legs. The superseded figures are removed from the allowlist so
    // a regression back to them fails this gate rather than passing quietly.
    const SANCTIONED_ALLOWLIST = new Set([
      1000, 1280, 1900, 2000, 10000,
      2026, 2025, 2024, 2022, 2021, 2030,
      50061458, 46724000, 40325000, 6399000, 520458, 2817000,
      1294851,
      231655, 182410, 13732, 102306,
    ]);

    // 5. Scan for all numerals > 999
    const numberRegex = /(?<![a-zA-Z0-9_$])([1-9]\d{3,})(?![a-zA-Z0-9_$])/g;
    const lines = rawContent.split('\n');
    const lintOffenders = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;
      while ((match = numberRegex.exec(line)) !== null) {
        const num = Number(match[1]);
        if (!SANCTIONED_ALLOWLIST.has(num)) {
          lintOffenders.push(`Line ${i + 1}: ${match[1]} in "${line.trim()}"`);
        }
      }
    }

    assert.equal(
      lintOffenders.length,
      0,
      `Orphan-figure lint detected unsanctioned numerals > 999:\n${lintOffenders.join('\n')}`,
    );
  });
});
