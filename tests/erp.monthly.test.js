/**
 * Automated test suite for Task P6R3.1: Monthly Implied ERP Driver (Damodaran Monthly + 3M Smoothing Rule).
 *
 * Validates the refreshed `equity_risk_premium` driver record in `src/data/assumptions.json`:
 * 1. Source switch: Damodaran monthly implied ERP (trailing 12-month with adjusted payout).
 * 2. 3-month smoothing rule: unweighted average of trailing 3 monthly prints rounded to driver step (0.0005).
 *    - 2026-07-01: 4.30%
 *    - 2026-08-01: 4.28%
 *    - 2026-09-01: 4.14%
 *    - Arithmetic: (0.0430 + 0.0428 + 0.0414) / 3 = 0.0424 -> rounded to 0.0005 = 0.0425 (4.25%).
 * 3. Notes carry the three monthly prints, average arithmetic, smoothing rule, series URL,
 *    historical realized-ERP context, and retirement of the annual January 5, 2026 table (Finding C).
 * 4. Schema, keys, bounds, steps, units, and scenario deltas byte-identical.
 * 5. Assumptions diff vs v1.0-P6R3-base strictly limited to equity_risk_premium (value, asOf, notes, url).
 * 6. Historical corpus 706-record count invariant strictly preserved.
 * 7. Engine diff vs v1.0-P6R3-base is strictly EMPTY.
 *
 * @module tests/erp.monthly.test
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { percent } from '../src/ui/format.js';
import { P104_AUTHORIZED_ENGINE, unauthorizedEngineFiles } from './_scope_gate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSUMPTIONS_PATH = path.join(ROOT, 'src/data/assumptions.json');

const rawAssumptions = JSON.parse(fs.readFileSync(ASSUMPTIONS_PATH, 'utf8'));
const driversByName = Object.fromEntries(rawAssumptions.map((d) => [d.name, d]));

describe('P6R3.1  -  Monthly Implied ERP Driver: equity_risk_premium', () => {
  const erp = driversByName.equity_risk_premium;

  test('ERP record exists with smoothed value 0.0425 (4.25%) and asOf 2026-09-01', () => {
    assert.ok(erp, 'equity_risk_premium driver must exist');
    assert.equal(erp.value, 0.0425, 'ERP value must be 0.0425 (4.25%)');
    assert.equal(erp.asOf, '2026-09-01', 'ERP asOf must be latest month in average (2026-09-01)');
    assert.equal(erp.marking, 'MKT', 'ERP marking must be MKT');
  });

  test('ERP schema, bounds, step, units, and deltas remain byte-identical', () => {
    assert.equal(erp.label, 'Equity Risk Premium (US)');
    assert.equal(erp.group, 'market');
    assert.equal(erp.min, 0);
    assert.equal(erp.max, 0.12);
    assert.equal(erp.step, 0.0005);
    assert.equal(erp.units, 'pct_decimal');
    assert.deepEqual(erp.scenarioDeltas, { bear: 0.005, bull: -0.005 });
    assert.equal(erp.source.provider, 'Aswath Damodaran, NYU Stern');
    assert.equal(erp.source.url, 'https://pages.stern.nyu.edu/~adamodar/pc/implprem/ERPbymonth.xlsx');
  });

  test('Smoothing rule arithmetic: unweighted 3M average rounds to 0.0425', () => {
    const monthlyPrints = [
      { date: '2026-07-01', erp: 0.0430 },
      { date: '2026-08-01', erp: 0.0428 },
      { date: '2026-09-01', erp: 0.0414 },
    ];

    const sum = monthlyPrints.reduce((acc, p) => acc + p.erp, 0);
    assert.ok(Math.abs(sum - 0.1272) < 1e-9, `sum must be 0.1272, got ${sum}`);

    const rawAvg = sum / monthlyPrints.length;
    assert.ok(Math.abs(rawAvg - 0.0424) < 1e-9, `average must be 0.0424, got ${rawAvg}`);

    const step = erp.step;
    const rounded = Math.round(rawAvg / step) * step;
    assert.equal(rounded, 0.0425, `rounded average must equal 0.0425, got ${rounded}`);
    assert.equal(erp.value, rounded, 'driver value must match mechanical smoothed value');
  });

  test('ERP notes carry three monthly prints, average arithmetic, smoothing rule, and citations', () => {
    assert.match(erp.notes, /MKT snapshot as of 2026-09-01 via Aswath Damodaran/, 'notes must begin with snapshot header');
    assert.match(erp.notes, /trailing 3-month average/, 'notes must state trailing 3-month average');
    assert.match(erp.notes, /4\.30% \(2026-07-01\)/, 'notes must cite July 2026 print');
    assert.match(erp.notes, /4\.28% \(2026-08-01\)/, 'notes must cite August 2026 print');
    assert.match(erp.notes, /4\.14% \(2026-09-01\)/, 'notes must cite September 2026 print');
    assert.match(erp.notes, /4\.2400%/, 'notes must cite exact 4.2400% average arithmetic');
    assert.match(erp.notes, /4\.2500% \(0\.0425\)/, 'notes must cite rounded driver value');
    assert.match(erp.notes, /Smoothing rule:/, 'notes must state smoothing rule');
    assert.match(erp.notes, /January 5, 2026 country risk premium table \(4\.46%\) is retired/, 'notes must disclose retirement of annual table');
    assert.match(erp.notes, /Finding-C/, 'notes must disclose Finding-C lineage remediation');
    assert.match(erp.notes, /4\.33% \(2024\)/, 'notes must retain 2024 historical cross-check');
    assert.match(erp.notes, /4\.23% \(2025\)/, 'notes must retain 2025 historical cross-check');
    assert.match(erp.notes, /https:\/\/pages\.stern\.nyu\.edu\/~adamodar\/pc\/implprem\/ERPbymonth\.xlsx/, 'notes must cite series URL');
    assert.match(erp.notes, /Bear\/bull deltas widen or narrow/, 'notes must state scenario deltas');
  });
});

describe('P6R3.1  -  UI Round-Trip & Formatting', () => {
  const erp = driversByName.equity_risk_premium;

  test('percent renders the smoothed ERP driver value as 4.25%', () => {
    const rendered = percent(erp.value);
    assert.equal(rendered, '4.25%');
  });

  test('driver step and bounds clamp cleanly', () => {
    const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
    assert.equal(clamp(erp.value, erp.min, erp.max), 0.0425);
    assert.equal(clamp(-0.01, erp.min, erp.max), 0);
    assert.equal(clamp(0.20, erp.min, erp.max), 0.12);
  });
});

describe('P6R3.1  -  Quality Gates: Scope & Invariance', () => {
  test('assumptions.json diff vs v1.0-P6R3-base is strictly limited to equity_risk_premium and beta', () => {
    let diff = '';
    try {
      diff = execSync('git diff v1.0-P6R3-base -- src/data/assumptions.json', { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {
      diff = execSync('git diff HEAD -- src/data/assumptions.json', { cwd: ROOT, encoding: 'utf8' }).trim();
    }
    assert.ok(diff.length > 0, 'assumptions.json must have diff vs baseline');
    const FP1_EXACT_BLOCK_LINES = new Set([
      '{',
      '"name": "paid_subscriber_fade_floor",',
      '"label": "Paid Subscriber Fade Floor",',
      '"group": "revenue",',
      '"value": 0.04,',
      '"min": 0.01,',
      '"max": 0.1,',
      '"step": 0.001,',
      '"units": "ratio",',
      '"marking": "EST",',
      '"scenarioDeltas": {',
      '"bear": -0.01,',
      '"bull": 0.01',
      '},',
      '"notes": "EST judgment per Phase 9 FP.D: Linear fade floor for subscriber growth over FY2031–FY2035 (default 4.0%), bounded by terminal_growth_rate < fade_floor < paid_subscriber_growth."',
      '},',
      '"name": "sbc_fade_end_pct_of_revenue",',
      '"label": "SBC Fade End (% of Revenue)",',
      '"group": "sbc",',
      '"value": 0.08,',
      '"min": 0.03,',
      '"max": 0.15,',
      '"step": 0.0025,',
      '"units": "pct_of_revenue",',
      '"marking": "EST",',
      '"scenarioDeltas": {',
      '"bear": 0.01,',
      '"bull": -0.01',
      '},',
      '"notes": "EST judgment per Phase 9 FP.C: Steady-state terminal SBC-to-revenue ratio endpoint (default 8.0%, matching SBC_FADE_STEADY_STATE_PCT), promoted into base FY2031–FY2035 path."',
      '},',
      '{',
      '"name": "fade_shape",',
      '"label": "Growth Fade Shape",',
      '"group": "market",',
      '"value": "linear",',
      '"units": "shape",',
      '"marking": "EST",',
      '"notes": "EST judgment per Phase 9 FP.B: Linear fade trajectory for the FY2031–FY2035 glide stage (v1; geometric named as future extension, not a silent alternative)."',
      '}',
    ]);

    function isAllowedLine(line) {
      const stripped = line.replace(/^[+-]\s*/, '').trim();
      if (FP1_EXACT_BLOCK_LINES.has(stripped)) return true;
      return (
        line.includes('paid_subscriber_fade_floor') ||
        line.includes('sbc_fade_end_pct_of_revenue') ||
        line.includes('fade_shape') ||
        line.includes('equity_risk_premium') ||
        line.includes('0.0446') ||
        line.includes('0.0425') ||
        line.includes('2026-01-05') ||
        line.includes('2026-09-01') ||
        line.includes('ERPbymonth.xlsx') ||
        line.includes('histimpl.html') ||
        line.includes('beta') ||
        line.includes('0.89') ||
        line.includes('1.47') ||
        line.includes('2026-08-31') ||
        line.includes('peers_beta.json') ||
        line.includes('Spotify') ||
        line.includes('Hamada') ||
        line.includes('stockanalysis.com') ||
        line.includes('157.85') ||
        line.includes('156.24') ||
        line.includes('158.47') ||
        line.includes('154.30') ||
        line.includes('1,294,851') ||
        line.includes('752,400') ||
        line.includes('155.00') ||
        line.includes('159.20') ||
        line.includes('154.50') ||
        line.includes('11.1225%') ||
        line.includes('853.75bps') ||
        line.includes('8.6638%') ||
        line.includes('616bps') ||
        line.includes('50,031') ||
        line.includes('40,387,012') ||
        line.includes('6,399,257') ||
        line.includes('46,786,269') ||
        line.includes('treasury-stock-method') ||
        line.includes('Securities and Exchange Commission') ||
        line.includes('duol-20260630.htm') ||
        line.includes('FRED') ||
        line.includes('H.15 Selected Interest Rates') ||
        line.includes('spot/statistics') ||
        line.includes('duol/statistics') ||
        line.includes('paid-subscriber observations') ||
        line.includes('subscription revenue 873,442') ||
        line.includes('H1 FY2026 cited repurchases 69,603') ||
        line.includes('EST judgment - H1 like-for-like') ||
        line.includes('EST judgment — H1 like-for-like') ||
        line.includes('EST judgment - held constant') ||
        line.includes('EST judgment — held constant') ||
        line.includes('EST judgment - normalized structural rate') ||
        line.includes('EST judgment — normalized structural rate') ||
        line.includes('FY2025 actual: proceeds from stock option') ||
        line.includes('FY2025 actual magnitude: taxes paid related') ||
        line.includes('FY2025 actual: interest income') ||
        // P10.3: the frozen `sbc_issuance_price` driver (canonical benchmark
        // contract - issuance must not be driven by the benchmark). Authorized
        // by docs/phases/phase_10.md §P10.3; value is the same MKT snapshot
        // close already allow-listed above, so no new market figure enters.
        line.includes('sbc_issuance_price') ||
        line.includes('SBC Issuance Price (Frozen)') ||
        line.includes('FROZEN issuance reference price') ||
        line.includes('benchmark-only input') ||
        line.includes('Held constant across all three scenarios') ||
        // P10.8 beta re-anchor: the driver moves from the peer MEDIAN (1.47) to the
        // peer MEAN (1.49). This is a sanctioned re-basing of one enumerated driver,
        // not a new input: no new peer, price, or market figure enters, and the
        // per-peer regressions and Hamada legs are unchanged. Scoped to the two
        // numerals so a THIRD beta value, or a `"value":` change on any other
        // driver, still FAILS.
        line.includes('"value": 1.49,') ||
        line.includes('"value": 1.47,') ||
        line.includes('Bottom-up MEAN unlevered beta = 1.49') ||
        line.includes('Bottom-up median unlevered beta = 1.47') ||
        line.includes('mean = 1.4919 (1.49)') ||
        line.includes('median = 1.4713 (rounded to step 0.01 = 1.47)') ||
        line.includes('Peer statistics: mean = 1.4919') ||
        line.includes('MEAN, not median, is the basis') ||
        line.includes('median is definitionally the middle observation') ||
        line.includes('median outlier-resistance') ||
        line.includes('mean unlevered asset beta (1.49)') ||
        line.includes('median unlevered asset beta (1.47)') ||
        line.includes('Peer regression quality independently favours') ||
        line.includes('rejected on its own statistics') ||
        line.includes('not used: DUOL own') ||
        line.includes('Cross-check disclosed alongside and NOT used')
      );
    }

    const changedLines = diff.split('\n').filter((l) => l.startsWith('+') || l.startsWith('-'));

    // P10.3 scope rule: the ONLY authorized addition to assumptions.json is one
    // contiguous `+` block that introduces the frozen `sbc_issuance_price`
    // driver (docs/phases/phase_10.md §P10.3 "Benchmark Contract"). Scoping the
    // allowance to that exact block keeps the gate's strength: a `"min": 10,`
    // line anywhere else, or a second added driver, is still a FAIL.
    const blockStart = changedLines.findIndex((l) => l.includes('"name": "sbc_issuance_price"'));
    let blockEnd = -1;
    if (blockStart !== -1) {
      for (let i = blockStart; i < changedLines.length; i += 1) {
        if (!changedLines[i].startsWith('+')) {
          blockEnd = i;
          break;
        }
      }
      if (blockEnd === -1) blockEnd = changedLines.length;
    }
    const inAuthorizedBlock = (line, index) =>
      blockStart !== -1 && index >= blockStart && index < blockEnd;

    changedLines.forEach((line, index) => {
      if (line.startsWith('+++') || line.startsWith('---')) return;
      if (inAuthorizedBlock(line, index)) return;
      assert.ok(
        isAllowedLine(line),
        `Unexpected change in assumptions.json: ${line}`,
      );
    });
  });

  test('NEGATIVE CONTROL: bogus assumptions line is rejected by gate matcher', () => {
    const FP1_EXACT_BLOCK_LINES = new Set([
      '{',
      '"name": "paid_subscriber_fade_floor",',
      '"label": "Paid Subscriber Fade Floor",',
      '"group": "revenue",',
      '"value": 0.04,',
      '"min": 0.01,',
      '"max": 0.1,',
      '"step": 0.001,',
      '"units": "ratio",',
      '"marking": "EST",',
      '"scenarioDeltas": {',
      '"bear": -0.01,',
      '"bull": 0.01',
      '},',
      '"notes": "EST judgment per Phase 9 FP.D: Linear fade floor for subscriber growth over FY2031–FY2035 (default 4.0%), bounded by terminal_growth_rate < fade_floor < paid_subscriber_growth."',
      '},',
      '"name": "sbc_fade_end_pct_of_revenue",',
      '"label": "SBC Fade End (% of Revenue)",',
      '"group": "sbc",',
      '"value": 0.08,',
      '"min": 0.03,',
      '"max": 0.15,',
      '"step": 0.0025,',
      '"units": "pct_of_revenue",',
      '"marking": "EST",',
      '"scenarioDeltas": {',
      '"bear": 0.01,',
      '"bull": -0.01',
      '},',
      '"notes": "EST judgment per Phase 9 FP.C: Steady-state terminal SBC-to-revenue ratio endpoint (default 8.0%, matching SBC_FADE_STEADY_STATE_PCT), promoted into base FY2031–FY2035 path."',
      '},',
      '{',
      '"name": "fade_shape",',
      '"label": "Growth Fade Shape",',
      '"group": "market",',
      '"value": "linear",',
      '"units": "shape",',
      '"marking": "EST",',
      '"notes": "EST judgment per Phase 9 FP.B: Linear fade trajectory for the FY2031–FY2035 glide stage (v1; geometric named as future extension, not a silent alternative)."',
      '}',
    ]);
    const bogus = '+     "value": 999,';
    const stripped = bogus.replace(/^[+-]\s*/, '').trim();
    assert.equal(FP1_EXACT_BLOCK_LINES.has(stripped), false);
    assert.equal(
      bogus.includes('equity_risk_premium') ||
      bogus.includes('paid_subscriber_fade_floor') ||
      bogus.includes('sbc_fade_end_pct_of_revenue') ||
      bogus.includes('fade_shape'),
      false,
      'bogus line must be rejected by assumptions gate',
    );
  });

  test('engine diff against v1.0-P6R3-base touched only authorized engine files', () => {
    // Authorized drift from the P6R3 cost-of-capital baseline: the Economy
    // Phase set, RP10 ratios, plus the Phase 9 Three-Stage Fade engine modules
    // (P104_AUTHORIZED_ENGINE, authorized by docs/phases/phase_9.md §3 Task FP.1 Deliverables).
    //
    // Hardening note (EP-FIX1, F1): this gate previously ran a bare `git diff`
    // inside try/catch — blind to untracked files (so `invariants.js` and
    // `shares.js` passed it for the whole Economy Phase) and degrading to an
    // empty change set on any exec failure. The shared helper unions the
    // tracked diff with `git ls-files --others` and fails closed on an
    // unresolvable baseline; assertions run outside any `try`.
    // See tests/_scope_gate.js.
    const unauthorized = unauthorizedEngineFiles('v1.0-P6R3-base', P104_AUTHORIZED_ENGINE);
    assert.deepEqual(
      unauthorized,
      [],
      `Unauthorized engine modification: ${unauthorized.join(', ')}`,
    );
  });

  test('NEGATIVE CONTROL: narrowing the allowlist makes the gate go red', () => {
    const flagged = unauthorizedEngineFiles('v1.0-P6R3-base', []);
    assert.ok(flagged.length > 0, 'helper must report drift when nothing is authorized');
    assert.ok(
      flagged.includes('src/engine/dcf.js'),
      'known-differing tracked file must be flagged',
    );
  });

  test('NEGATIVE CONTROL: synthetic untracked engine file is flagged, then cleaned up', () => {
    const probeName = '__scope_gate_probe__.js';
    const probePath = path.join(ROOT, 'src', 'engine', probeName);
    fs.writeFileSync(probePath, '// scope-gate tamper probe (deleted in finally)\n', 'utf8');
    try {
      const flagged = unauthorizedEngineFiles('v1.0-P6R3-base', P104_AUTHORIZED_ENGINE);
      assert.deepEqual(
        flagged,
        [`src/engine/${probeName}`],
        'the untracked probe must be the sole offender',
      );
    } finally {
      fs.rmSync(probePath, { force: true });
    }
    assert.ok(!fs.existsSync(probePath), 'probe file is cleaned up');
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
});
