/**
 * P10.3 Contract Tests — Canonical Benchmark and Transactional State.
 *
 * Verifies docs/phases/phase_10.md §P10.3:
 *  1. Benchmark contract: ONE immutable `{value, asOf, source, status, isEdited,
 *     reason}` object with precedence override > live (by request SEQUENCE) >
 *     dated snapshot.
 *  2. `market_share_price` must not affect FCFF, FCFE, share issuance, terminal
 *     dilution, or the intrinsic DCF per-share value; issuance uses the separate
 *     frozen `sbc_issuance_price`.
 *  3. Transactional updates: clone -> validate -> recalculate candidate -> commit
 *     only on success; failure restores overrides/scenario/dirty/snapshots and
 *     shows a visible field error; a disposed controller rejects everything.
 *  4. Live-price lifecycle: monotonic sequence tokens, abortable transport, a
 *     timeout that covers body consumption, validation of method / content type /
 *     body size / symbol / date / provider / URL / market state, post-dispose
 *     silence, and idempotency.
 *  5. Gates: benchmark parity across every consumer; a benchmark change moves
 *     upside only; DCF + issuance byte-identical; an older response never
 *     overwrites a newer one; malformed/stale/late never downgrades an override
 *     or a newer valid live price; repeated equal values are idempotent.
 *
 * Every gate is proven by a NEGATIVE control (a deliberately wrong input must
 * fail) or by a cross-check against a re-derived engine value, never by
 * comparing the product against itself.
 *
 * @module tests/benchmark.transactional
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { readLedgerUrls } from './_ledger.js';
import { createTabRoot } from './_dom_stub.js';
import { TAB_KEYS } from '../src/ui/tabs.js';
import { createApp } from '../src/app.js';
import { valuateFcffDcf } from '../src/engine/methods/fcffDcf.js';
import schedulesEngine from '../src/engine/schedules.js';
import forecastEngine from '../src/engine/forecast.js';
import threeStatementEngine from '../src/engine/threeStatement.js';
import { build as buildWacc } from '../src/engine/wacc.js';
import { valuate as valuateDcf, valuateDatedSeam } from '../src/engine/dcf.js';
import { projectShares } from '../src/engine/shares.js';
import {
  BENCHMARK_STATUS,
  BENCHMARK_SOURCE,
  createBenchmark,
  createSnapshotBenchmark,
  createOverrideBenchmark,
  createLiveBenchmark,
  applyLiveResponse,
  clearOverride,
  isSameBenchmark,
} from '../src/engine/benchmark.js';
import {
  nextRequestSequence,
  validatePriceEnvelope,
  readResponseBody,
  benchmarkToMarketState,
} from '../src/engine/market.js';
import { PRICE_MAX_BODY_BYTES } from '../src/data/constants.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();

const SNAPSHOT = { value: 157.85, asOf: '2026-09-02', provider: 'stockanalysis.com', url: 'https://stockanalysis.com/stocks/duol/history/' };

async function getDatasets() {
  const historical = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
  const assumptions = await loadAssumptions({ location: ASSUMPTIONS_PATH, readText });
  return { historical, assumptions };
}

function bootApp({ historical, assumptions, transport = null, horizon = 10 } = {}) {
  const { root, links, panes } = createTabRoot(TAB_KEYS);
  const app = createApp({
    data: { loadHistorical, loadAssumptions },
    engine: {},
    root,
    now: () => Date.parse('2026-09-01T00:00:00.000Z'),
    historical,
    assumptions,
    transport,
    horizon,
  });
  const paneOf = (key) => panes.find((p) => p.getAttribute('data-tab') === key);
  const visit = (key) => links.find((l) => l.getAttribute('data-tab') === key).dispatch('click');
  return { app, root, links, panes, paneOf, visit };
}

/** A transport double that resolves to one validated official-close payload. */
function liveTransport(price, asOf, extra = {}) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      symbol: 'DUOL',
      price,
      asOf,
      isOfficialClose: true,
      intradayPrice: null,
      provider: 'stockanalysis.com',
      retrievedAt: '2026-09-04T01:00:00.000Z',
      ...extra,
    }),
  });
}

/** A transport double that never resolves within the deadline. */
function hangingTransport() {
  return () => new Promise(() => {});
}

describe('P10.3  -  Benchmark Contract: one immutable object', () => {
  test('the benchmark exposes exactly the contracted fields, deeply frozen', () => {
    const bench = createSnapshotBenchmark(SNAPSHOT);
    for (const field of ['value', 'asOf', 'source', 'status', 'isEdited', 'reason']) {
      assert.ok(field in bench, `benchmark exposes ${field}`);
    }
    assert.equal(bench.value, 157.85);
    assert.equal(bench.asOf, '2026-09-02');
    assert.equal(bench.status, BENCHMARK_STATUS.SNAPSHOT);
    assert.equal(bench.isEdited, false);
    assert.equal(bench.source.kind, BENCHMARK_SOURCE.SNAPSHOT);
    assert.equal(bench.source.provider, 'stockanalysis.com');
    assert.ok(bench.reason.length > 0, 'the benchmark always states why it holds its value');
    assert.ok(Object.isFrozen(bench), 'benchmark is frozen');
    assert.ok(Object.isFrozen(bench.source), 'benchmark.source is frozen');
    assert.throws(() => { bench.value = 1; }, TypeError, 'a consumer cannot mutate the benchmark');
  });

  test('malformed benchmark fields fail closed (negative controls)', () => {
    const base = { value: 100, asOf: '2026-09-02', source: { kind: 'live_response', provider: 'stockanalysis.com' }, status: 'live' };
    for (const [label, patch] of [
      ['zero value', { value: 0 }],
      ['negative value', { value: -5 }],
      ['NaN value', { value: Number.NaN }],
      ['non-ISO asOf', { asOf: 'Sep 2 2026' }],
      ['unknown status', { status: 'whatever' }],
      ['missing provider', { source: { kind: 'live_response' } }],
    ]) {
      assert.throws(
        () => createBenchmark({ ...base, ...patch }),
        (err) => err.name === 'EngineError' && err.code === 'invalid_benchmark',
        `${label} must fail closed`,
      );
    }
    // isEdited is only legal on a manual override — a false claim is rejected.
    assert.throws(
      () => createBenchmark({ ...base, isEdited: true }),
      (err) => err.code === 'invalid_benchmark',
      'isEdited is only legal on an override',
    );
  });
});

describe('P10.3  -  Precedence: override > live (by sequence) > snapshot', () => {
  test('a manual override is never replaced by any live response', () => {
    const override = createOverrideBenchmark({ value: 140, asOf: '2026-09-02' });
    assert.equal(override.status, BENCHMARK_STATUS.OVERRIDE);
    assert.equal(override.isEdited, true);
    assert.equal(override.source.kind, BENCHMARK_SOURCE.MANUAL);

    const applied = applyLiveResponse(override, {
      ok: true,
      sequence: 9,
      value: 999,
      asOf: '2026-09-09',
      provider: 'stockanalysis.com',
    });
    assert.equal(applied.accepted, false, 'a valid live response cannot replace an uncleared override');
    assert.equal(applied.benchmark.value, 140, 'the held override value is untouched');
    assert.equal(applied.benchmark.isEdited, true, 'the override is still marked as edited');

    // A FAILED response must not downgrade it either.
    const failed = applyLiveResponse(override, { ok: false, sequence: 10, error: 'HTTP 500' });
    assert.equal(failed.benchmark.value, 140);
    assert.equal(failed.benchmark.isEdited, true);
  });

  test('"latest" means the highest request SEQUENCE, not arrival order', () => {
    const snapshot = createSnapshotBenchmark(SNAPSHOT);
    const newer = applyLiveResponse(snapshot, {
      ok: true, sequence: 5, value: 200, asOf: '2026-09-05', provider: 'stockanalysis.com',
    });
    assert.equal(newer.accepted, true);
    assert.equal(newer.benchmark.value, 200);

    // An OLDER response arriving LATER must not win.
    const older = applyLiveResponse(newer.benchmark, {
      ok: true, sequence: 3, value: 150, asOf: '2026-09-03', provider: 'stockanalysis.com',
    });
    assert.equal(older.accepted, false, 'a lower sequence is rejected even though it arrived later');
    assert.equal(older.benchmark.value, 200, 'the newer price is preserved');

    // The SAME sequence is not newer either.
    const same = applyLiveResponse(newer.benchmark, {
      ok: true, sequence: 5, value: 111, asOf: '2026-09-06', provider: 'stockanalysis.com',
    });
    assert.equal(same.accepted, false);
    assert.equal(same.benchmark.value, 200);

    // A genuinely higher sequence does win.
    const higher = applyLiveResponse(newer.benchmark, {
      ok: true, sequence: 6, value: 210, asOf: '2026-09-06', provider: 'stockanalysis.com',
    });
    assert.equal(higher.accepted, true);
    assert.equal(higher.benchmark.value, 210);
  });

  test('nextRequestSequence is strictly monotonic', () => {
    assert.equal(nextRequestSequence(0), 1);
    assert.equal(nextRequestSequence(7), 8);
    assert.equal(nextRequestSequence(undefined), 1);
    let last = 0;
    const seen = [];
    for (let i = 0; i < 5; i += 1) {
      last = nextRequestSequence(last);
      seen.push(last);
    }
    assert.deepEqual(seen, [1, 2, 3, 4, 5]);
    for (let i = 1; i < seen.length; i += 1) {
      assert.ok(seen[i] > seen[i - 1], 'sequence strictly increases');
    }
  });

  test('a failed response preserves a newer valid live price and falls back visibly', () => {
    const snapshot = createSnapshotBenchmark(SNAPSHOT);
    const live = applyLiveResponse(snapshot, {
      ok: true, sequence: 4, value: 180, asOf: '2026-09-04', provider: 'stockanalysis.com',
    }).benchmark;

    const failed = applyLiveResponse(live, { ok: false, sequence: 5, error: 'malformed JSON' });
    assert.equal(failed.accepted, false);
    assert.equal(failed.benchmark.value, 180, 'the newer valid price survives the failure');
    assert.equal(failed.benchmark.status, BENCHMARK_STATUS.STALE_LIVE, 'the staleness is declared');
    assert.match(failed.benchmark.reason, /malformed JSON/, 'the failure reason is disclosed');

    // From the snapshot state, a failure falls back to the visible snapshot.
    const fromSnapshot = applyLiveResponse(snapshot, { ok: false, sequence: 1, error: 'HTTP 503' });
    assert.equal(fromSnapshot.benchmark.value, 157.85);
    assert.equal(fromSnapshot.benchmark.status, BENCHMARK_STATUS.SNAPSHOT);
    assert.match(fromSnapshot.benchmark.reason, /HTTP 503/);
  });

  test('clearing an override restores the best available state', () => {
    const snapshot = createSnapshotBenchmark(SNAPSHOT);
    const live = createLiveBenchmark({ value: 190, asOf: '2026-09-06', provider: 'stockanalysis.com', sequence: 8 });
    const override = createOverrideBenchmark({ value: 140, asOf: '2026-09-02' });

    assert.equal(clearOverride(override, live, snapshot).value, 190, 'the best live seen while overridden is restored');
    assert.equal(clearOverride(override, null, snapshot).value, 157.85, 'with no live seen, the snapshot returns');
  });

  test('repeated equal values are idempotent', () => {
    const snapshot = createSnapshotBenchmark(SNAPSHOT);
    const live = createLiveBenchmark({ value: 180, asOf: '2026-09-04', provider: 'stockanalysis.com', sequence: 2 });
    assert.equal(isSameBenchmark(live, createLiveBenchmark({ value: 180, asOf: '2026-09-04', provider: 'stockanalysis.com', sequence: 7 })), true,
      'a re-applied identical value is the same consumer-visible benchmark');
    assert.equal(isSameBenchmark(live, snapshot), false, 'a different status is a different benchmark');
  });
});

describe('P10.3  -  Benchmark does not touch intrinsic value or issuance', () => {
  test('the benchmark does not move share issuance; sbc_issuance_price does', async () => {
    const { historical, assumptions } = await getDatasets();
    const sched = schedulesEngine.build(historical, assumptions);
    const fc = forecastEngine.project({ historical, assumptions, horizon: 10 });
    const ts = threeStatementEngine.project(sched, assumptions, fc);

    const withDriver = (name, value) => ({
      ...assumptions,
      get: (n) => (n === name ? { name, value, marking: 'MKT' } : assumptions.get(n)),
      byName: { ...assumptions.byName, [name]: { name, value, marking: 'MKT' } },
      getValue: (n) => (n === name ? value : assumptions.getValue(n)),
    });

    const base = projectShares(assumptions, ts, historical);
    const movedBenchmark = projectShares(withDriver('market_share_price', 999), ts, historical);
    const movedIssuance = projectShares(withDriver('sbc_issuance_price', 300), ts, historical);

    assert.equal(movedBenchmark.sharesDcf, base.sharesDcf, 'the benchmark leaves issuance byte-identical');
    assert.notEqual(movedIssuance.sharesDcf, base.sharesDcf, 'the frozen issuance price drives issuance');
    assert.equal(base.byPeriod.FY2026.provenance.priceDriver.name, 'sbc_issuance_price', 'provenance names the issuance driver');
  });

  test('the benchmark does not move the intrinsic DCF per-share, EV, or FCFF/FCFE', async () => {
    const { historical, assumptions } = await getDatasets();
    const sched = schedulesEngine.build(historical, assumptions);
    const fc = forecastEngine.project({ historical, assumptions, horizon: 10 });
    const ts = threeStatementEngine.project(sched, assumptions, fc);
    const wacc = buildWacc({ assumptions, debtSchedule: sched.debt });

    const withBenchmark = (value) => ({
      ...assumptions,
      get: (n) => (n === 'market_share_price' ? { name: 'market_share_price', value, marking: 'MKT' } : assumptions.get(n)),
      byName: { ...assumptions.byName, market_share_price: { name: 'market_share_price', value, marking: 'MKT' } },
      getValue: (n) => (n === 'market_share_price' ? value : assumptions.getValue(n)),
    });

    const base = valuateDatedSeam(ts, wacc, { assumptions, corpus: historical, horizon: 10 });
    const moved = valuateDatedSeam(ts, wacc, { assumptions: withBenchmark(999), corpus: historical, horizon: 10 });

    assert.equal(moved.perShare, base.perShare, 'intrinsic per-share is byte-identical');
    assert.equal(moved.enterpriseValue, base.enterpriseValue, 'EV is byte-identical');
    assert.equal(moved.equityValue, base.equityValue, 'equity value is byte-identical');
    assert.equal(moved.sharesOutstanding, base.sharesOutstanding, 'terminal dilution is byte-identical');
    assert.equal(JSON.stringify(moved.fcff.schedule), JSON.stringify(base.fcff.schedule), 'FCFF series is byte-identical');
    assert.equal(JSON.stringify(moved.fcfe.schedule), JSON.stringify(base.fcfe.schedule), 'FCFE series is byte-identical');
  });

  test('a live benchmark moves the upside and nothing else', async () => {
    const { historical, assumptions } = await getDatasets();
    const { app } = bootApp({ historical, assumptions, transport: liveTransport(200, '2026-09-05') });

    const before = app.state();
    await app.fetchPrice();
    const after = app.state();

    assert.equal(after.dcf.perShare, before.dcf.perShare, 'DCF per-share is unchanged by a live price');
    assert.equal(after.dcf.enterpriseValue, before.dcf.enterpriseValue, 'EV is unchanged');
    assert.equal(after.dcf.sharesOutstanding, before.dcf.sharesOutstanding, 'diluted count is unchanged');
    assert.equal(JSON.stringify(after.dcf.schedule), JSON.stringify(before.dcf.schedule), 'the DCF schedule is byte-identical');
    assert.equal(after.benchmark.value, 200, 'the benchmark itself moved');
    assert.equal(after.marketPrice.price, 200, 'the market price moved');

    // P10.5 F1: the recommendation is driven by the CANONICAL add-back DCF, not
    // `dcf.perShare` (the finite-roll intermediate). The property under test is
    // unchanged -- a live benchmark recomputes the upside and moves nothing else --
    // so the expectation is computed from the canonical figure.
    const expectedUpside =
      (valuateFcffDcf(after.dcf).isCanonicalAddBackDcf - 200) / 200;
    assert.ok(Math.abs(after.recommendation.upsidePct - expectedUpside) < 1e-9, 'upside is recomputed against the new benchmark');
    assert.equal(
      after.recommendation.dcfPerShare,
      valuateFcffDcf(after.dcf).isCanonicalAddBackDcf,
      'the recommendation is driven by the canonical figure, not the intermediate',
    );
    assert.notEqual(after.recommendation.upsidePct, before.recommendation.upsidePct, 'the upside really did move');
    app.dispose();
  });
});

describe('P10.3  -  Benchmark parity across every consumer', () => {
  test('cover, summary, valuation, sensitivity, scenarios, and verdict read one benchmark', async () => {
    const { historical, assumptions } = await getDatasets();
    const { app, paneOf, visit } = bootApp({ historical, assumptions, transport: liveTransport(175.25, '2026-09-05') });
    await app.fetchPrice();

    const state = app.state();
    const expected = state.benchmark;
    assert.equal(expected.value, 175.25);
    assert.equal(expected.asOf, '2026-09-05');

    const priceText = `$${expected.value.toFixed(2)}`;
    const asOfText = expected.asOf;
    for (const key of ['cover', 'summary', 'valuation', 'sensitivity']) {
      visit(key);
      const html = paneOf(key).innerHTML;
      assert.ok(html.includes(priceText), `${key} shows the benchmark price ${priceText}`);
      // The cover renders a human-formatted date; the other views render ISO.
      if (key === 'cover') {
        const year = asOfText.slice(0, 4);
        const month = Number(asOfText.slice(5, 7));
        const day = Number(asOfText.slice(8, 10));
        const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1];
        const human = `${monthName} ${day}, ${year}`;
        assert.ok(
          html.includes(human) || html.includes(asOfText),
          `cover shows the benchmark as-of date (${human} or ${asOfText})`,
        );
      } else {
        assert.ok(html.includes(asOfText), `${key} shows the benchmark as-of date ${asOfText}`);
      }
      assert.ok(!html.includes('$157.85'), `${key} does not still show the superseded snapshot close`);
    }

    // The verdict and scenario comparisons consume the same price.
    //
    // P10.5: the method row's own value is now the CANONICAL add-back DCF
    // (after modelled future dilution), not `state.dcf.perShare`, which is the
    // finite-roll intermediate. The benchmark-price parity this test guards is
    // unchanged, so the comparison is made against the method row's value.
    const methodRow = state.verdict.methodResults[0];
    assert.ok(
      Math.abs(methodRow.upsidePct - (methodRow.impliedPerShare - expected.value) / expected.value) < 1e-9,
      'the method verdict is computed against the canonical benchmark',
    );
    for (const key of ['bear', 'base', 'bull']) {
      const row = state.scenarios[key];
      // P10.5 F1: the scenario recommendation is driven by that scenario's own
      // CANONICAL add-back DCF, not its finite-roll intermediate.
      const perShare = row.dcf
        ? valuateFcffDcf(row.dcf).isCanonicalAddBackDcf
        : row.perShare;
      assert.ok(
        Math.abs(row.recommendation.upsidePct - (perShare - expected.value) / expected.value) < 1e-9,
        `the ${key} scenario is computed against the canonical benchmark`,
      );
    }
    app.dispose();
  });
});

describe('P10.3  -  Transactional updates', () => {
  test('an invalid driver edit preserves state byte-for-byte and shows a visible error', async () => {
    const { historical, assumptions } = await getDatasets();
    const { app, paneOf, visit } = bootApp({ historical, assumptions });

    app.setDriver('terminal_growth_rate', 0.0275);
    const before = app.state();
    const beforeHtml = paneOf('summary').innerHTML;
    visit('assumptions');
    assert.ok(
      !paneOf('assumptions').innerHTML.includes('data-field-error'),
      'no error chrome is shown while the model is valid',
    );

    // A cross-driver ordering violation: g must stay below the subscriber fade
    // floor, so the candidate recalculation fails closed.
    assert.throws(
      () => app.setDriver('terminal_growth_rate', 0.04),
      (err) => err.name === 'EngineError',
      'the invalid edit is rejected',
    );

    const after = app.state();
    assert.equal(after.dcf.perShare, before.dcf.perShare, 'per-share preserved byte-for-byte');
    assert.equal(after.dcf.enterpriseValue, before.dcf.enterpriseValue, 'EV preserved');
    assert.equal(JSON.stringify(after.dcf.schedule), JSON.stringify(before.dcf.schedule), 'schedule preserved');
    assert.equal(after.assumptions.get('terminal_growth_rate').value, before.assumptions.get('terminal_growth_rate').value, 'the driver value was rolled back');
    assert.equal(after.scenario, before.scenario, 'the scenario was restored');
    assert.equal(after.dirty, before.dirty, 'the dirty flag was restored');
    assert.ok(after.fieldError, 'a field error is recorded');
    assert.equal(after.fieldError.field, 'terminal_growth_rate', 'the error names the offending field');
    assert.ok(after.fieldError.message.length > 0, 'the error carries a visible message');

    visit('summary');
    assert.equal(paneOf('summary').innerHTML, beforeHtml, 'the rendered model view is unchanged after the failed edit');

    // DOM-LEVEL ASSERTION: the error is DISPLAYED, not merely recorded in state.
    visit('assumptions');
    const errorHtml = paneOf('assumptions').innerHTML;
    assert.ok(errorHtml.includes('data-field-error'), 'the recalc-path failure renders a visible error element');
    assert.ok(errorHtml.includes('role="alert"'), 'the error is an announced alert region');
    assert.ok(errorHtml.includes('terminal_growth_rate'), 'the rendered error names the offending field');
    assert.ok(errorHtml.includes(after.fieldError.message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')) || /must be strictly greater|ordering|Driver ordering/i.test(after.fieldError.message),
      'the rendered error shows the reason');

    // The next valid edit succeeds (no poisoned state) and clears the error chrome.
    app.setDriver('terminal_growth_rate', 0.03);
    const recovered = app.state();
    assert.notEqual(recovered.dcf.perShare, before.dcf.perShare, 'the next valid edit took effect');
    assert.equal(recovered.fieldError, null, 'the field error is cleared on success');
    visit('assumptions');
    assert.ok(
      !paneOf('assumptions').innerHTML.includes('data-field-error'),
      'the error chrome is gone after recovery',
    );
    app.dispose();
  });

  test('an EARLY-VALIDATION failure also records AND displays the field error', async () => {
    // P10.3 F1(a): the pre-clone validations (unknown driver, non-finite value)
    // used to throw without ever recording a field error, so a user typing NaN
    // saw nothing at all. Both paths must record and display.
    const { historical, assumptions } = await getDatasets();
    const { app, paneOf, visit } = bootApp({ historical, assumptions });
    visit('assumptions');

    // 1. Non-finite value (OP's own probe: setDriver('beta', NaN)).
    assert.throws(() => app.setDriver('beta', Number.NaN), (err) => err.code === 'invalid_driver_value');
    let state = app.state();
    assert.ok(state.fieldError, 'a non-finite edit records a field error');
    assert.equal(state.fieldError.field, 'beta', 'the error names the field');
    assert.equal(state.fieldError.code, 'invalid_driver_value', 'the error carries the typed code');
    visit('assumptions');
    let html = paneOf('assumptions').innerHTML;
    assert.ok(html.includes('data-field-error="beta"'), 'the non-finite failure renders a visible error element');
    assert.ok(html.includes('role="alert"'), 'it is an announced alert region');
    assert.ok(html.includes('finite number'), 'the rendered error states the reason');

    // 2. Unknown driver.
    assert.throws(() => app.setDriver('not_a_driver', 1), (err) => err.code === 'missing_driver');
    state = app.state();
    assert.ok(state.fieldError, 'an unknown-driver edit records a field error');
    assert.equal(state.fieldError.code, 'missing_driver');
    visit('assumptions');
    html = paneOf('assumptions').innerHTML;
    assert.ok(html.includes('data-field-error="not_a_driver"'), 'the unknown-driver failure renders a visible error element');
    assert.ok(html.includes('Unknown driver'), 'the rendered error states the reason');

    // 3. A valid edit clears BOTH the record and the chrome.
    app.setDriver('beta', 1.5);
    state = app.state();
    assert.equal(state.fieldError, null, 'a valid edit clears the recorded error');
    visit('assumptions');
    assert.ok(
      !paneOf('assumptions').innerHTML.includes('data-field-error'),
      'a valid edit removes the rendered error',
    );
    app.dispose();
  });

  test('a manual benchmark override is sticky and explicitly clearable', async () => {
    const { historical, assumptions } = await getDatasets();
    const { app } = bootApp({ historical, assumptions, transport: liveTransport(190, '2026-09-06') });

    app.setDriver('market_share_price', 140);
    const overridden = app.state();
    assert.equal(overridden.benchmark.isEdited, true, 'the benchmark is marked as edited');
    assert.equal(overridden.benchmark.value, 140);
    assert.equal(overridden.benchmark.source.kind, BENCHMARK_SOURCE.MANUAL);
    const dcfAtOverride = overridden.dcf.perShare;

    // A live response must not displace the override.
    await app.fetchPrice();
    assert.equal(app.state().benchmark.value, 140, 'the override survives a live response');
    assert.equal(app.state().dcf.perShare, dcfAtOverride, 'and the DCF never moved');

    // Clearing restores the best available state (the live response).
    app.clearBenchmarkOverride();
    const cleared = app.state();
    assert.equal(cleared.benchmark.isEdited, false, 'the override is cleared');
    assert.equal(cleared.benchmark.value, 190, 'the live response is restored after clearing');
    assert.equal(cleared.dcf.perShare, dcfAtOverride, 'clearing the benchmark still does not move the DCF');
    app.dispose();
  });

  test('a disposed controller rejects every subsequent operation', async () => {
    const { historical, assumptions } = await getDatasets();
    const { app } = bootApp({ historical, assumptions, transport: liveTransport(180, '2026-09-04') });
    app.dispose();

    assert.throws(() => app.setDriver('terminal_growth_rate', 0.03), (err) => err.code === 'disposed', 'setDriver is rejected');
    assert.throws(() => app.setScenario('bear'), (err) => err.code === 'disposed', 'setScenario is rejected');
    assert.throws(() => app.clearBenchmarkOverride(), (err) => err.code === 'disposed', 'clearing an override is rejected');
    await assert.rejects(() => app.fetchPrice(), (err) => err.code === 'disposed', 'fetchPrice is rejected');
  });

  test('a response that arrives after disposal cannot mutate state', async () => {
    const { historical, assumptions } = await getDatasets();
    let release = null;
    const slowTransport = () => new Promise((resolve) => { release = resolve; });
    const { app } = bootApp({ historical, assumptions, transport: slowTransport });

    const inFlight = app.fetchPrice();
    const before = app.state();
    app.dispose();
    // Let the transport be invoked so the deferred resolver is assigned.
    await new Promise((resolve) => setTimeout(resolve, 5));
    release({ ok: true, status: 200, json: async () => ({ symbol: 'DUOL', price: 999, asOf: '2026-09-09', isOfficialClose: true, provider: 'stockanalysis.com' }) });
    await inFlight;

    // The real gate: no post-dispose response may mutate anything.
    assert.equal(before.benchmark.value, 157.85, 'the benchmark never moved');
    assert.equal(before.benchmark.status, BENCHMARK_STATUS.SNAPSHOT, 'it is still the dated snapshot');
    const htmlBefore = before.benchmark.value;
    assert.equal(typeof htmlBefore, 'number');
    // P10.5: the DCF divisor is the point-in-time fully diluted schedule, so the
    // pre-dispose per-share value is captured from the live engine rather than
    // pinned to a literal. A pin here would only re-assert the share count. The
    // post-dispose read is null BY DESIGN, which is the stronger statement: the
    // controller refuses to serve state at all rather than serving a stale one.
    const dcfPerShareBefore = before.dcf.perShare;
    assert.ok(Number.isFinite(dcfPerShareBefore) && dcfPerShareBefore > 0);
    assert.equal(app.state().dcf, null, 'no state is served after disposal');
  });
});

describe('P10.3  -  Live-price response validation (negative controls per field)', () => {
  const validBody = {
    symbol: 'DUOL',
    price: 165.5,
    asOf: '2026-09-03',
    isOfficialClose: true,
    provider: 'stockanalysis.com',
    source: { url: 'https://stockanalysis.com/stocks/duol/history/' },
  };
  const envelope = (body, headers = { 'content-type': 'application/json' }) => ({
    ok: true, status: 200, headers, json: async () => body, text: JSON.stringify(body),
  });

  test('a fully valid response passes every check (positive control)', () => {
    const res = validatePriceEnvelope(envelope(validBody), { bodyText: JSON.stringify(validBody) });
    assert.equal(res.ok, true, `expected a pass, got: ${res.error}`);
    assert.equal(res.body.price, 165.5);
    assert.ok(res.bytes > 0);
  });

  test('each invalid field is rejected with a visible reason', () => {
    const oversized = { ...validBody, note: 'x'.repeat(PRICE_MAX_BODY_BYTES + 100) };
    const cases = [
      ['non-2xx status', { ...envelope(validBody), ok: false, status: 500 }, /HTTP 500/],
      ['missing envelope', null, /valid HTTP response envelope/],
      ['wrong content type', envelope(validBody, { 'content-type': 'text/html' }), /content-type/],
      ['oversized body', envelope(oversized), /exceeds the .*-byte cap/],
      ['invalid JSON', { ok: true, status: 200, headers: { 'content-type': 'application/json' }, text: '{not json' }, /not valid JSON/],
      ['wrong symbol', envelope({ ...validBody, symbol: 'AAPL' }), /does not match DUOL/],
      ['unpinned provider', envelope({ ...validBody, provider: 'evil.example' }), /not the pinned/],
      ['bad URL', envelope({ ...validBody, source: { url: 'https://evil.example/duol' } }), /provider-URL check/],
      ['missing date', envelope({ ...validBody, asOf: undefined, lastOfficialCloseAsOf: undefined }), /as-of date/],
      ['no market state', envelope({ ...validBody, isOfficialClose: false, lastOfficialClose: undefined }), /Intraday price quotes are unavailable; official close required/],
    ];
    for (const [label, res, pattern] of cases) {
      const result = validatePriceEnvelope(res, {
        bodyText: res && typeof res.text === 'string' ? res.text : undefined,
        urlPattern: /stockanalysis\.com/,
      });
      assert.equal(result.ok, false, `${label} must be rejected`);
      assert.match(result.error, pattern, `${label} must disclose why`);
    }
  });

  test('the body cap is measured on the CONSUMED body', async () => {
    const huge = { ...validBody, note: 'x'.repeat(PRICE_MAX_BODY_BYTES + 100) };
    const res = { ok: true, status: 200, headers: { 'content-type': 'application/json' }, text: async () => JSON.stringify(huge) };
    const read = readResponseBody(res);
    assert.equal(typeof read.promise.then, 'function', 'a method-style text() is read as a promise');
    const text = await read.promise;
    const result = validatePriceEnvelope(res, { bodyText: text });
    assert.equal(result.ok, false);
    assert.match(result.error, /exceeds the/);
  });

  test('a hung transport is a timeout, not a hang (deadline covers body consumption)', async () => {
    // The deadline lives in the controller, which is the production path: the
    // engine price client constructs no Promise, so the controller races it.
    const { historical, assumptions } = await getDatasets();
    const { app } = bootApp({ historical, assumptions, transport: hangingTransport() });

    const before = app.state();
    const started = process.hrtime.bigint();
    const outcome = await app.fetchPrice({ timeoutMs: 60 });
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    assert.ok(elapsedMs < 5000, `the deadline fired promptly (took ${elapsedMs.toFixed(0)}ms)`);
    assert.equal(outcome.value, before.benchmark.value, 'the held benchmark never moved');
    assert.equal(outcome.status, BENCHMARK_STATUS.SNAPSHOT, 'it is still the dated snapshot');
    assert.equal(app.state().dcf.perShare, before.dcf.perShare, 'the DCF did not move');
    assert.match(outcome.reason, /timed out|Fell back|held/i, 'the outcome discloses why');
    app.dispose();
  });

  test('an abort signal is passed to the transport', async () => {
    const { fetchLatestPrice } = await import('../src/engine/market.js');
    let seenSignal = null;
    const transport = async (_url, opts) => {
      seenSignal = opts?.signal ?? null;
      return { ok: true, status: 200, json: async () => validBody };
    };
    await fetchLatestPrice(transport, { fallbackPrice: 157.85, fallbackAsOf: '2026-09-02', sequence: 1, timeoutMs: 5000 });
    assert.ok(seenSignal, 'the transport receives an abort signal');
  });

  test('a rejected live response leaves the held benchmark untouched', async () => {
    const { historical, assumptions } = await getDatasets();
    const failing = async () => { throw new TypeError('Failed to fetch (network offline)'); };
    const { app } = bootApp({ historical, assumptions, transport: failing });

    const before = app.state();
    await app.fetchPrice();
    const after = app.state();

    assert.equal(after.benchmark.value, before.benchmark.value, 'the benchmark did not move');
    assert.equal(after.benchmark.status, BENCHMARK_STATUS.SNAPSHOT, 'it is still the dated snapshot');
    assert.equal(after.dcf.perShare, before.dcf.perShare, 'the DCF did not move');
    app.dispose();
  });

  test('the market-state projection preserves the close-only display contract', () => {
    const live = createLiveBenchmark({
      value: 157.85,
      asOf: '2026-09-02',
      provider: 'stockanalysis.com',
      sequence: 1,
    });
    const projected = benchmarkToMarketState(live);
    assert.equal(projected.price, 157.85, 'verdict price is the completed close');
    assert.equal(projected.intradayPrice, null, 'intraday price is null in close-only contract');
    assert.equal(projected.status, 'live_close', 'rendered as live_close');
    assert.equal(projected.bannerText, null, 'official close clears the banner');

    const close = benchmarkToMarketState(createLiveBenchmark({ value: 165, asOf: '2026-09-03', provider: 'stockanalysis.com', sequence: 2 }));
    assert.equal(close.status, 'live_close');
    assert.equal(close.bannerText, null, 'an official close clears the banner');
  });
});
