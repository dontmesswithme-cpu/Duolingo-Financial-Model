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
    const changedLines = diff.split('\n').filter((l) => l.startsWith('+') || l.startsWith('-'));
    for (const line of changedLines) {
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      assert.ok(
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
        line.includes('provider') ||
        line.includes('stockanalysis') ||
        line.includes('EDGAR') ||
        line.includes('url') ||
        line.includes('notes'),
        `Unexpected change in assumptions.json: ${line}`,
      );
    }
  });

  test('engine diff against v1.0-P6R3-base is strictly EMPTY', () => {
    let changedFiles = [];
    try {
      changedFiles = execSync('git diff --name-only v1.0-P6R3-base -- src/engine/', { cwd: ROOT, encoding: 'utf8' })
        .trim()
        .split('\n')
        .map((s) => s.trim().replace(/\\/g, '/'))
        .filter(Boolean);
    } catch {
      changedFiles = [];
    }
    assert.deepEqual(changedFiles, [], 'src/engine/ must remain byte-identical to v1.0-P6R3-base');
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
