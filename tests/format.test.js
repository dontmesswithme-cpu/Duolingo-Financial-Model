/**
 * P5.3 Artifact Contract Tests — Financial Formatters.
 *
 * Covers:
 *  - usd(), percent(), compact(), estSuffix()
 *  - Fail-closed behavior on NaN, Infinity, null, undefined
 *  - Currency scale factors, sign options, and rounding precision
 *  - Universal labeling badge markup
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { usd, percent, compact, estSuffix } from '../src/ui/format.js';

describe('P5.3 — Currency Formatter: usd()', () => {
  test('formats positive and negative currency with commas and precision', () => {
    assert.equal(usd(1234567.89), '$1,234,567.89');
    assert.equal(usd(100), '$100.00');
    assert.equal(usd(0), '$0.00');
    assert.equal(usd(-1234.56), '-$1,234.56');
    assert.equal(usd(-1234.56, { parenthesesNegative: true }), '($1,234.56)');
  });

  test('supports decimals and scale factor options', () => {
    assert.equal(usd(1234.5678, { decimals: 0 }), '$1,235');
    assert.equal(usd(500, { scale: 1000, decimals: 0 }), '$500,000');
    assert.equal(usd(250, { showSign: true }), '+$250.00');
  });

  test('fails closed on non-finite or missing values (returns "—")', () => {
    assert.equal(usd(NaN), '—');
    assert.equal(usd(Infinity), '—');
    assert.equal(usd(-Infinity), '—');
    assert.equal(usd(null), '—');
    assert.equal(usd(undefined), '—');
    assert.equal(usd('100'), '—');
  });
});

describe('P5.3 — Percentage Formatter: percent()', () => {
  test('formats ratios into percentage strings with precision', () => {
    assert.equal(percent(0.15), '15.00%');
    assert.equal(percent(0.0473), '4.73%');
    assert.equal(percent(0.04734, { decimals: 1 }), '4.7%');
    assert.equal(percent(-0.105), '-10.50%');
    assert.equal(percent(0.25, { showSign: true }), '+25.00%');
    assert.equal(percent(0), '0.00%');
  });

  test('fails closed on non-finite or missing values (returns "—")', () => {
    assert.equal(percent(NaN), '—');
    assert.equal(percent(Infinity), '—');
    assert.equal(percent(null), '—');
    assert.equal(percent(undefined), '—');
    assert.equal(percent('0.15'), '—');
  });
});

describe('P5.3 — Compact Formatter: compact()', () => {
  test('formats large figures into $B, $M, $K notation', () => {
    assert.equal(compact(7422599160), '$7.4B');
    assert.equal(compact(531325000), '$531.3M');
    assert.equal(compact(125000), '$125.0K');
    assert.equal(compact(500), '$500.0');
    assert.equal(compact(-1500000), '-$1.5M');
  });

  test('fails closed on non-finite or missing values (returns "—")', () => {
    assert.equal(compact(NaN), '—');
    assert.equal(compact(Infinity), '—');
    assert.equal(compact(null), '—');
    assert.equal(compact(undefined), '—');
  });
});

describe('P5.3 — Labeling Badges: estSuffix()', () => {
  test('emits correct badge markup for EST, MKT, computed, and ACT', () => {
    assert.match(estSuffix('FY2026', 'EST'), /badge-est.*EST/);
    assert.match(estSuffix('Risk-Free Rate', 'MKT'), /badge-mkt.*MKT/);
    assert.match(estSuffix('TTM Revenue', 'computed'), /badge-computed.*computed/);
    assert.match(estSuffix('FY2023', 'ACT'), /badge-act.*ACT/);
  });
});
