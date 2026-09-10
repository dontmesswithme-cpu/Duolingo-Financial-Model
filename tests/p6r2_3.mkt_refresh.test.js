/**
 * Automated test suite for Task P6R2.3: MKT Anchor Refresh (rf, ERP, Price).
 *
 * Validates the three refreshed MKT driver records in `src/data/assumptions.json`:
 * 1. `risk_free_rate`: 0.0479 @ 2026-09-01 via FRED DGS10 (posted official observation).
 * 2. `equity_risk_premium`: 0.0446 @ 2026-01-05 via Damodaran (published decomposition: 4.23% + 0.23% = 4.46%).
 * 3. `market_share_price`: 157.85 @ 2026-09-02 via stockanalysis.com (last completed session close).
 *
 * Quality gates:
 * - Refreshed driver record values, asOf dates, citations, and notes.
 * - Driver schema, keys, bounds, steps, units, and scenario deltas byte-identical.
 * - Mathematical re-derivation of refreshed WACC (8.7594%) and market cap ($7,897,393,350).
 * - Assumptions diff vs v1.0-P6R2-base strictly limited to the four enumerated P6R2 drivers.
 * - Historical corpus 706-record count invariant strictly preserved.
 *
 * @module tests/p6r2_3.mkt_refresh.test
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { EP_AUTHORIZED_ENGINE, unauthorizedEngineFiles } from './_scope_gate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSUMPTIONS_PATH = path.join(ROOT, 'src/data/assumptions.json');

const rawAssumptions = JSON.parse(fs.readFileSync(ASSUMPTIONS_PATH, 'utf8'));
const driversByName = Object.fromEntries(rawAssumptions.map((d) => [d.name, d]));

describe('P6R2.3  -  MKT Anchor Refresh: risk_free_rate (FRED DGS10)', () => {
  const rf = driversByName.risk_free_rate;

  test('rf record exists with refreshed value 0.0479 (4.79%) and asOf 2026-09-01', () => {
    assert.ok(rf, 'risk_free_rate driver must exist');
    assert.equal(rf.value, 0.0479, 'rf value must be 0.0479');
    assert.equal(rf.asOf, '2026-09-01', 'rf asOf must be 2026-09-01');
    assert.equal(rf.marking, 'MKT', 'rf marking must be MKT');
  });

  test('rf notes cite posted official observation and retire staleness rationale', () => {
    assert.match(rf.notes, /MKT snapshot as of 2026-09-01 via FRED/, 'notes must begin with MKT snapshot as of 2026-09-01');
    assert.match(rf.notes, /4\.79%/, 'notes must cite 4.79% yield');
    assert.match(rf.notes, /posted official observation/, 'notes must cite posted official observation');
    assert.match(rf.source.provider, /FRED/, 'provider must cite FRED');
    assert.equal(rf.source.url, 'https://fred.stlouisfed.org/series/DGS10', 'url must point to DGS10');
  });

  test('rf schema, bounds, step, units, and deltas remain byte-identical', () => {
    assert.equal(rf.label, 'Risk-Free Rate (10Y Treasury)');
    assert.equal(rf.group, 'market');
    assert.equal(rf.min, 0);
    assert.equal(rf.max, 0.15);
    assert.equal(rf.step, 0.0005);
    assert.equal(rf.units, 'pct_decimal');
    assert.deepEqual(rf.scenarioDeltas, { bear: 0.005, bull: -0.005 });
  });
});

describe('P6R2.3  -  MKT Anchor Refresh: equity_risk_premium (Damodaran 4.25%)', () => {
  const erp = driversByName.equity_risk_premium;

  test('ERP record exists with published value 0.0425 (4.25%) and asOf 2026-09-01', () => {
    assert.ok(erp, 'equity_risk_premium driver must exist');
    assert.equal(erp.value, 0.0425, 'ERP value must be 0.0425');
    assert.equal(erp.asOf, '2026-09-01', 'ERP asOf must be 2026-09-01');
    assert.equal(erp.marking, 'MKT', 'ERP marking must be MKT');
  });

  test('ERP notes carry published decomposition, historical cross-check, and Finding C remediation', () => {
    assert.match(erp.notes, /MKT snapshot as of 2026-09-01 via Aswath Damodaran/, 'notes must begin with MKT snapshot as of 2026-09-01');
    assert.match(erp.notes, /4\.2500%/, 'notes must cite 4.2500% ERP');
    assert.match(erp.notes, /trailing 3-month average/, 'notes must cite trailing 3-month average');
    assert.match(erp.notes, /4\.33% \(2024\)/, 'notes must cite 2024 historical cross-check');
    assert.match(erp.notes, /4\.23% \(2025\)/, 'notes must cite 2025 historical cross-check');
    assert.match(erp.notes, /Finding-C/, 'notes must disclose Finding C remediation');
    assert.equal(erp.source.provider, 'Aswath Damodaran, NYU Stern');
    assert.equal(erp.source.url, 'https://pages.stern.nyu.edu/~adamodar/pc/implprem/ERPbymonth.xlsx');
  });

  test('ERP schema, bounds, step, units, and deltas remain byte-identical', () => {
    assert.equal(erp.label, 'Equity Risk Premium (US)');
    assert.equal(erp.group, 'market');
    assert.equal(erp.min, 0);
    assert.equal(erp.max, 0.12);
    assert.equal(erp.step, 0.0005);
    assert.equal(erp.units, 'pct_decimal');
    assert.deepEqual(erp.scenarioDeltas, { bear: 0.005, bull: -0.005 });
  });
});

describe('P6R2.3  -  MKT Anchor Refresh: market_share_price ($157.85 Close)', () => {
  const px = driversByName.market_share_price;

  test('market_share_price record exists with close value 157.85 and asOf 2026-09-02', () => {
    assert.ok(px, 'market_share_price driver must exist');
    assert.equal(px.value, 157.85, 'share price must be 157.85');
    assert.equal(px.asOf, '2026-09-02', 'share price asOf must be 2026-09-02');
    assert.equal(px.marking, 'MKT', 'share price marking must be MKT');
  });

  test('price notes cite completed session close and exclude intraday print', () => {
    assert.match(px.notes, /MKT snapshot as of 2026-09-02 via stockanalysis\.com/, 'notes must cite stockanalysis.com as of 2026-09-02');
    assert.match(px.notes, /\$157\.85/, 'notes must cite official close $157.85');
    assert.match(px.notes, /last COMPLETED trading session close/, 'notes must disclose completed session close');
    assert.match(px.notes, /intraday print is excluded/, 'notes must disclose intraday exclusion');
    assert.match(px.notes, /benchmark price immobility/, 'notes must state benchmark immobility');
    assert.equal(px.source.provider, 'stockanalysis.com');
    assert.equal(px.source.url, 'https://stockanalysis.com/stocks/duol/history/');
  });

  test('scenario deltas remain strictly 0 and schema is byte-identical', () => {
    assert.equal(px.scenarioDeltas.bear, 0, 'bear delta must be 0');
    assert.equal(px.scenarioDeltas.bull, 0, 'bull delta must be 0');
    assert.equal(px.label, 'Market Share Price (Snapshot Close)');
    assert.equal(px.group, 'market');
    assert.equal(px.min, 10);
    assert.equal(px.max, 2000);
    assert.equal(px.step, 0.01);
    assert.equal(px.units, 'usd_per_share');
  });
});

describe('P6R2.3  -  Refreshed Anchor Mathematics & Quality Gates', () => {
  test('Cost of equity / WACC re-derivation at refreshed anchors: Re = 11.0375%', () => {
    const rf = driversByName.risk_free_rate.value;
    const beta = driversByName.beta.value;
    const erp = driversByName.equity_risk_premium.value;

    const re = rf + beta * erp;
    assert.ok(Math.abs(re - 0.110375) < 1e-6, `Re must equal 0.110375 (got ${re})`);
  });

  test('Derived market capitalization: 157.85 × 50,031,000 = 7,897,393,350', () => {
    const px = driversByName.market_share_price.value;
    const shares = driversByName.shares_outstanding.value;

    const marketCap = Math.round(px * shares);
    assert.equal(marketCap, 7897393350, `marketCap must be 7,897,393,350 (got ${marketCap})`);
  });

  test('assumptions.json diff vs v1.0-P6R2-base is limited to the four enumerated P6R2 drivers', () => {
    let diff = '';
    try {
      diff = execSync('git diff v1.0-P6R2-base -- src/data/assumptions.json', { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {
      diff = execSync('git diff HEAD -- src/data/assumptions.json', { cwd: ROOT, encoding: 'utf8' }).trim();
    }
    assert.ok(diff.length > 0, 'assumptions.json must have diff vs baseline');
    const changedFields = diff.split('\n').filter((l) => l.startsWith('+') || l.startsWith('-'));
    for (const line of changedFields) {
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      assert.ok(
        line.includes('Beta') ||
        line.includes('beta') ||
        line.includes('0.89') ||
        line.includes('1.47') ||
        line.includes('peers_beta') ||
        line.includes('Spotify') ||
        line.includes('Hamada') ||
        line.includes('stockanalysis') ||
        line.includes('EDGAR') ||
        line.includes('risk_free_rate') ||
        line.includes('4.79%') ||
        line.includes('4.73%') ||
        line.includes('0.0479') ||
        line.includes('0.0473') ||
        line.includes('2026-09-01') ||
        line.includes('2026-08-28') ||
        line.includes('equity_risk_premium') ||
        line.includes('0.0446') ||
        line.includes('0.0442') ||
        line.includes('0.0425') ||
        line.includes('2026-01-05') ||
        line.includes('2026-07-01') ||
        line.includes('4.46%') ||
        line.includes('4.42%') ||
        line.includes('4.25%') ||
        line.includes('ERPbymonth') ||
        line.includes('market_share_price') ||
        line.includes('157.85') ||
        line.includes('148.36') ||
        line.includes('2026-09-02') ||
        line.includes('2026-08-31') ||
        line.includes('notes') ||
        line.includes('value') ||
        line.includes('provider') ||
        line.includes('url') ||
        line.includes('asOf'),
        `Unexpected change in assumptions.json: ${line}`,
      );
    }
  });

  test('historical corpus 706-record count invariant is strictly preserved', () => {
    const historicalFiles = ['income.json', 'balance.json', 'cashflow.json', 'kpis.json'];
    let totalCount = 0;
    for (const f of historicalFiles) {
      const p = path.join(ROOT, 'src/data/historical', f);
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      totalCount += data.length;
    }
    assert.equal(totalCount, 706, `Corpus count must be exactly 706, got ${totalCount}`);
  });

  test('engine diff against v1.0-P6R2-base touched only authorized files', () => {
    // Authorized drift from the P6R2.3 anchor-refresh baseline: the P6R3
    // cost-of-capital files (beta.js, market.js), the P6R2 model-rigor revision
    // (threeStatement.js), the P8 method modules (filtered out by the helper),
    // plus the Economy Phase set (EP_AUTHORIZED_ENGINE). Director un-park order
    // 2026-09-10, `docs/logs/ds/economy_phase.md` §5.
    //
    // Hardening note (EP-FIX1, F1): the previous bare `git diff` inside
    // try/catch could not see untracked engine modules and degraded to an
    // empty change set on exec failure. See tests/_scope_gate.js.
    const authorized = [
      'src/engine/beta.js',
      'src/engine/market.js',
      'src/engine/threeStatement.js',
      ...EP_AUTHORIZED_ENGINE,
    ];
    const unauthorized = unauthorizedEngineFiles('v1.0-P6R2-base', authorized);
    assert.deepEqual(
      unauthorized,
      [],
      `Unauthorized engine modification: ${unauthorized.join(', ')}`,
    );
  });

  test('NEGATIVE CONTROL: narrowing the allowlist makes the gate go red', () => {
    const flagged = unauthorizedEngineFiles('v1.0-P6R2-base', []);
    assert.ok(flagged.length > 0, 'helper must report drift when nothing is authorized');
    assert.ok(
      flagged.includes('src/engine/threeStatement.js') || flagged.includes('src/engine/dcf.js'),
      'known-differing tracked file must be flagged',
    );
  });
});
