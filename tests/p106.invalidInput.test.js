/**
 * P10.6 — invalid driver input must be refused, not silently absorbed.
 *
 * OP finding F1-remainder traced a real view-layer gap: number inputs commit only
 * on `change`, and the root cause was `parseDriverInput` FAILING OPEN — an
 * unparseable string returned `driver.value`, so the caller's
 * `Number.isFinite(parsed)` guard passed, the valid branch ran, and the field was
 * silently reformatted with no error, no restore and no dispatch. Typing garbage
 * into a real browser was met with silence.
 *
 * These gates pin the fail-closed contract so it cannot regress.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseDriverInput, formatDriverDisplay } from '../src/ui/format.js';

const driver = { name: 'd', label: 'D', units: 'pct_of_revenue', min: 0, max: 1, step: 0.01, value: 0.25 };

// P10.6 (OP finding): the first version of this gate built EVERY driver with
// `units: 'pct_of_revenue'`, so it proved only the ratio branch while the
// non-`pct_*` branch — the MAJORITY of real drivers — still failed open. These
// cover the unit families the app actually uses, probed against the real units.
const NON_PCT_DRIVERS = [
  { name: 'beta', units: 'multiple', min: 0.5, max: 2.5, step: 0.01, value: 1.47 },
  { name: 'market_share_price', units: 'usd_per_share', min: 50, max: 400, step: 0.01, value: 157.85 },
  { name: 'shares_outstanding', units: 'count', min: 0, max: 1e9, step: 1, value: 50061458 },
  { name: 'headcount', units: 'headcount', min: 0, max: 1e6, step: 1, value: 4200 },
  { name: 'terminal_growth_rate', units: 'ratio', min: 0, max: 0.1, step: 0.001, value: 0.025 },
];

describe('P10.6 — parseDriverInput fails CLOSED', () => {
  test('an unparseable string returns NaN, not the current value', () => {
    const out = parseDriverInput('not-a-number', driver);
    assert.ok(Number.isNaN(out), `expected NaN, got ${out}`);
    assert.notEqual(out, driver.value, 'it must NOT silently return the current value');
  });

  test('a non-numeric string with a unit suffix also returns NaN', () => {
    assert.ok(Number.isNaN(parseDriverInput('abc%', driver)), 'abc%');
    assert.ok(Number.isNaN(parseDriverInput('12x', driver)), '12x');
    assert.ok(Number.isNaN(parseDriverInput('1.2.3', driver)), '1.2.3');
  });

  test('empty and whitespace-only input return NaN', () => {
    assert.ok(Number.isNaN(parseDriverInput('', driver)), 'empty string');
    assert.ok(Number.isNaN(parseDriverInput('   ', driver)), 'whitespace only');
  });

  test('non-string, non-number input returns NaN rather than a default', () => {
    for (const bad of [null, undefined, {}, [], true]) {
      assert.ok(Number.isNaN(parseDriverInput(bad, driver)), `${String(bad)} must be NaN`);
    }
  });

  test('a non-finite number returns NaN', () => {
    assert.ok(Number.isNaN(parseDriverInput(NaN, driver)), 'NaN');
    assert.ok(Number.isNaN(parseDriverInput(Infinity, driver)), 'Infinity');
  });

  test('valid input still parses, so the fix did not break the happy path', () => {
    assert.equal(parseDriverInput('0.5', driver), 0.5);
    assert.equal(parseDriverInput('50%', driver), 0.5);
    assert.equal(parseDriverInput(' 0.4 ', driver), 0.4, 'surrounding whitespace is tolerated');
    assert.equal(parseDriverInput(0.3, driver), 0.3, 'a finite number passes through');
  });

  test('the display formatter is unaffected', () => {
    assert.equal(typeof formatDriverDisplay(0.25, driver.units), 'string');
  });
});

// P10.6 (OP finding): the gap that produced the third consecutive FAIL. These
// assert the fix on the MAJORITY path — every non-`pct_*` unit family — and would
// have failed against the previous implementation.
describe('P10.6 — the non-pct majority path also fails closed', () => {
  test('garbage returns NaN for every non-pct unit family', () => {
    for (const d of NON_PCT_DRIVERS) {
      for (const bad of ['not-a-number', '', '   ', 'abc', '12x', '1.2.3', '%']) {
        const out = parseDriverInput(bad, d);
        assert.ok(
          Number.isNaN(out),
          `${d.name} (units=${d.units}) with ${JSON.stringify(bad)} must be NaN, got ${out}`,
        );
        assert.notEqual(out, d.value, `${d.name} must NOT silently return its current value`);
      }
    }
  });

  test('non-string and non-finite input returns NaN for every family', () => {
    for (const d of NON_PCT_DRIVERS) {
      for (const bad of [null, undefined, {}, [], true, NaN, Infinity, -Infinity]) {
        assert.ok(
          Number.isNaN(parseDriverInput(bad, d)),
          `${d.name} with ${String(bad)} must be NaN`,
        );
      }
    }
  });

  test('valid input still parses on every family, so the fix broke nothing', () => {
    for (const d of NON_PCT_DRIVERS) {
      const mid = d.min + (d.max - d.min) * 0.5;
      const out = parseDriverInput(String(mid), d);
      assert.ok(Number.isFinite(out), `${d.name} must parse a valid number, got ${out}`);
      assert.ok(Math.abs(out - mid) <= (d.max - d.min), `${d.name} parsed out of range: ${out}`);
    }
  });

  test('a finite number passes through and is clamped, on every family', () => {
    for (const d of NON_PCT_DRIVERS) {
      const inside = parseDriverInput(d.value, d);
      assert.equal(inside, d.value, `${d.name} in-range value unchanged`);
      const above = parseDriverInput(d.max * 10, d);
      assert.equal(above, d.max, `${d.name} clamps to max`);
    }
  });
});
