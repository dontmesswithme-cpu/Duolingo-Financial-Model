/**
 * P1.3 Artifact Contract tests  -  `src/data/historical/cashflow.json`.
 *
 * Covers the invariants the contract names: every row cited and in-ledger, no
 * audit violations, cash-flow statement identities per period (O + I + F = net change;
 * ending - beginning = net change; operating/investing/financing sections sum from
 * components), cash-flow fixtures matched exactly, period transcription honesty
 * (fiscal_year for 10-K, ytd for 10-Q, never relabeled discrete), and the app
 * boot path refusing to start on an out-of-ledger citation (combined
 * income + balance + cashflow corpus).
 *
 * Fully headless and offline.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadHistorical } from '../src/data/loader.js';
import { auditDataset, AUDIT_RULES } from '../src/data/audit.js';
import { SCHEMAS, validateRecord, extractRows } from '../src/data/schema.js';
import { UNITS } from '../src/data/constants.js';
import { DataValidationError } from '../src/data/errors.js';
import { bootApp } from '../src/app.js';
import { createTabRoot } from './_dom_stub.js';
import { readLedgerUrls } from './_ledger.js';
import { CASHFLOW_KNOWN_FIGURES, ALL_KNOWN_FIGURES } from './fixtures/duolingo_facts.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');

const TAB_KEYS = Object.freeze([
  'cover', 'assumptions', 'historicals', 'schedules',
  'projections', 'valuation', 'summary', 'sensitivity',
]);

const LEDGER = readLedgerUrls();

const FISCAL_YEARS = Object.freeze(['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025']);
const YTD_PERIODS = Object.freeze([
  '9M FY2025', '9M FY2024',
  '3M FY2026', '3M FY2025',
  '6M FY2026', '6M FY2025',
]);
const ALL_PERIODS = Object.freeze([...FISCAL_YEARS, ...YTD_PERIODS]);

async function loadCashflow() {
  const dataset = await loadHistorical({
    dir: DATA_DIR,
    readText,
    requireLedger: true,
    ledger: LEDGER,
  });
  return { dataset, rows: extractRows(dataset.cashflow) };
}

function valueOf(rows, period, metric) {
  const row = rows.find((r) => r.period === period && r.metric === metric);
  assert.ok(row, `missing row: ${metric} @ ${period}`);
  return row.value;
}

function maybeValueOf(rows, period, metric) {
  const row = rows.find((r) => r.period === period && r.metric === metric);
  return row ? row.value : 0;
}

describe('P1.3  -  dataset loads through the unmodified P0 pipeline (cashflow)', () => {
  test('loadHistorical resolves with the cashflow dataset under ledger enforcement (combined corpus)', async () => {
    const { rows } = await loadCashflow();
    assert.ok(rows.length > 0, 'cashflow dataset must not be empty');
    for (const period of ALL_PERIODS) {
      assert.ok(rows.some((r) => r.period === period), `cashflow dataset must cover ${period}`);
    }
    for (const row of rows) {
      assert.equal(row.klass, 'flow', `${row.metric} @ ${row.period} must be klass flow`);
    }
  });

  test('every row passes validateRecord against the frozen historicalStatement schema', async () => {
    const { rows } = await loadCashflow();
    for (const [index, row] of rows.entries()) {
      const result = validateRecord(row, SCHEMAS.historicalStatement, 'cashflow.json');
      assert.equal(result.ok, true, `row ${index} (${row.metric} @ ${row.period}): ${JSON.stringify(result.errors)}`);
    }
  });

  test('auditDataset reports zero violations over combined income+balance+cashflow corpus', async () => {
    const dataset = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
    const report = auditDataset(dataset, { requireLedger: true, ledger: LEDGER });
    assert.equal(report.ok, true, JSON.stringify(report.violations, null, 2));
    assert.deepEqual(report.violations, []);
    for (const rule of AUDIT_RULES) {
      assert.ok(!report.violations.some((v) => v.rule === rule), `${rule} must not fire`);
    }
  });

  test('100% of cashflow rows are cited, in-ledger, and marked as non-estimates', async () => {
    const { rows } = await loadCashflow();
    for (const row of rows) {
      assert.equal(row.isEstimate, false, `${row.metric} @ ${row.period} must not be an estimate`);
      assert.ok(row.source, `${row.metric} @ ${row.period} must have a source object`);
      assert.ok(typeof row.source.filing === 'string' && row.source.filing.length > 0);
      assert.ok(typeof row.source.period === 'string' && row.source.period.length > 0);
      assert.ok(typeof row.source.statement === 'string' && row.source.statement.length > 0);
      assert.ok(typeof row.source.url === 'string' && row.source.url.startsWith('https://'));
      assert.ok(typeof row.source.accessedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.source.accessedAt));
      assert.ok(LEDGER.has(row.source.url), `${row.source.url} must be in sources.md`);
    }
  });

  test('every citation URL in the dataset joins to a ledger entry (grep, not eyeball)', async () => {
    const raw = await readText(new URL('../src/data/historical/cashflow.json', import.meta.url));
    const urls = [...raw.matchAll(/"url":\s*"(https:\/\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(urls.length > 0, 'must have extracted urls');
    for (const url of urls) {
      assert.ok(LEDGER.has(url), `uncited URL in cashflow.json: ${url}`);
    }
  });

  test('units are honest: as-reported thousands with matching scale', async () => {
    const { rows } = await loadCashflow();
    for (const row of rows) {
      assert.equal(row.units, 'thousands_usd', `${row.metric} @ ${row.period}`);
      assert.equal(row.scale, 1000, `${row.metric} @ ${row.period}`);
      assert.ok(row.units in UNITS, `${row.units} must be in constants.UNITS`);
      assert.ok(Number.isFinite(row.value), `${row.metric} @ ${row.period} must be finite`);
    }
  });

  test('no duplicate metric / period / periodType identities', async () => {
    const { rows } = await loadCashflow();
    const seen = new Set();
    for (const row of rows) {
      const key = `${row.metric}|${row.period}|${row.periodType}`;
      assert.ok(!seen.has(key), `duplicate identity in cashflow.json: ${key}`);
      seen.add(key);
    }
  });
});

describe('P1.3  -  statement identities (cashflow)', () => {
  test('annual and YTD identity: operating + investing + financing = net change in cash', async () => {
    const { rows } = await loadCashflow();
    for (const period of ALL_PERIODS) {
      const o = valueOf(rows, period, 'cash_from_operating_activities');
      const i = valueOf(rows, period, 'cash_from_investing_activities');
      const f = valueOf(rows, period, 'cash_from_financing_activities');
      const net = valueOf(rows, period, 'net_change_in_cash');
      assert.equal(
        o + i + f,
        net,
        `O + I + F !== net change @ ${period}: ${o} + ${i} + ${f} = ${o + i + f} vs ${net}`
      );
    }
  });

  test('annual and YTD identity: ending cash - beginning cash = net change in cash', async () => {
    const { rows } = await loadCashflow();
    for (const period of ALL_PERIODS) {
      const beg = valueOf(rows, period, 'cash_beginning_of_period');
      const end = valueOf(rows, period, 'cash_end_of_period');
      const net = valueOf(rows, period, 'net_change_in_cash');
      assert.equal(
        end - beg,
        net,
        `ending - beginning !== net change @ ${period}: ${end} - ${beg} = ${end - beg} vs ${net}`
      );
    }
  });

  test('operating activities components sum to cash_from_operating_activities', async () => {
    const { rows } = await loadCashflow();
    const opMetrics = [
      'cf_net_income',
      'cf_deferred_income_taxes',
      'cf_stock_based_compensation',
      'cf_depreciation_and_amortization',
      'cf_accretion_on_marketable_securities',
      'cf_gain_loss_sale_capitalized_software',
      'cf_loss_on_disposal_leasehold_improvements',
      'cf_impairment_capitalized_software',
      'cf_other_noncash',
      'cf_change_deferred_revenue',
      'cf_change_accounts_receivable',
      'cf_change_deferred_cost_of_revenues',
      'cf_change_prepaid_expenses_and_other_assets',
      'cf_change_accounts_payable',
      'cf_change_accrued_expenses',
      'cf_change_noncurrent_assets_and_liabilities',
    ];

    for (const period of ALL_PERIODS) {
      let sum = 0;
      for (const m of opMetrics) {
        sum += maybeValueOf(rows, period, m);
      }
      const reported = valueOf(rows, period, 'cash_from_operating_activities');
      assert.equal(
        sum,
        reported,
        `Operating components sum mismatch @ ${period}: computed ${sum} vs reported ${reported}`
      );
    }
  });

  test('investing activities components sum to cash_from_investing_activities', async () => {
    const { rows } = await loadCashflow();
    const invMetrics = [
      'purchases_of_investments',
      'maturities_and_paydowns_of_investments',
      'capitalized_software_and_intangibles',
      'purchase_of_property_and_equipment',
      'proceeds_from_sale_of_capitalized_software',
      'acquisitions_net_of_cash_acquired',
    ];

    for (const period of ALL_PERIODS) {
      let sum = 0;
      for (const m of invMetrics) {
        sum += maybeValueOf(rows, period, m);
      }
      // In 9M FY2025 10-Q, payment_of_acquisition_earn_out is classified under investing
      if (period === '9M FY2025') {
        sum += maybeValueOf(rows, period, 'payment_of_acquisition_earn_out');
      }
      const reported = valueOf(rows, period, 'cash_from_investing_activities');
      assert.equal(
        sum,
        reported,
        `Investing components sum mismatch @ ${period}: computed ${sum} vs reported ${reported}`
      );
    }
  });

  test('financing activities components sum to cash_from_financing_activities', async () => {
    const { rows } = await loadCashflow();
    const finMetrics = [
      'issuance_of_common_stock_ipo',
      'proceeds_from_stock_options_exercise',
      'repurchases_of_stock_options',
      'repurchase_of_common_stock',
      'taxes_paid_net_share_settlement',
    ];

    for (const period of ALL_PERIODS) {
      let sum = 0;
      for (const m of finMetrics) {
        sum += maybeValueOf(rows, period, m);
      }
      // In FY2025 10-K, payment_of_acquisition_earn_out is classified under financing
      if (period === 'FY2025') {
        sum += maybeValueOf(rows, period, 'payment_of_acquisition_earn_out');
      }
      const reported = valueOf(rows, period, 'cash_from_financing_activities');
      assert.equal(
        sum,
        reported,
        `Financing components sum mismatch @ ${period}: computed ${sum} vs reported ${reported}`
      );
    }
  });
});

describe('P1.3  -  known-figure fixtures', () => {
  test('every fixture value matches the dataset exactly', async () => {
    const { rows } = await loadCashflow();
    for (const fixture of CASHFLOW_KNOWN_FIGURES) {
      const match = rows.find(
        (r) => r.metric === fixture.metric && r.period === fixture.period
      );
      assert.ok(match, `missing cashflow fixture: ${fixture.metric} @ ${fixture.period}`);
      assert.equal(
        match.value,
        fixture.value,
        `fixture mismatch for ${fixture.metric} @ ${fixture.period}: dataset ${match.value} vs fixture ${fixture.value}`
      );
      assert.equal(match.units, fixture.units);
      assert.equal(match.source.filing, fixture.source.filing);
      assert.equal(match.source.url, fixture.source.url);
    }
  });

  test('all ALL_KNOWN_FIGURES and CASHFLOW_KNOWN_FIGURES join to ledger', async () => {
    for (const fixture of ALL_KNOWN_FIGURES) {
      assert.ok(LEDGER.has(fixture.source.url), `fixture URL missing in ledger: ${fixture.source.url}`);
    }
    for (const fixture of CASHFLOW_KNOWN_FIGURES) {
      assert.ok(LEDGER.has(fixture.source.url), `cashflow fixture URL missing in ledger: ${fixture.source.url}`);
    }
  });
});

describe('P1.3  -  period transcription honesty (cashflow)', () => {
  test('annual rows are fiscal_year rows cited to a 10-K', async () => {
    const { rows } = await loadCashflow();
    for (const fy of FISCAL_YEARS) {
      const fyRows = rows.filter((r) => r.period === fy);
      assert.ok(fyRows.length > 0, `missing rows for ${fy}`);
      for (const row of fyRows) {
        assert.equal(row.periodType, 'fiscal_year', `${row.metric} @ ${row.period}`);
        assert.equal(row.source.filing, '10-K', `${row.metric} @ ${row.period}`);
        assert.equal(row.source.statement, 'Consolidated Statements of Cash Flows');
      }
    }
  });

  test('10-Q rows are transcribed as ytd with 10-Q citations and span labels', async () => {
    const { rows } = await loadCashflow();
    for (const ytd of YTD_PERIODS) {
      const ytdRows = rows.filter((r) => r.period === ytd);
      assert.ok(ytdRows.length > 0, `missing rows for ${ytd}`);
      for (const row of ytdRows) {
        assert.equal(row.periodType, 'ytd', `${row.metric} @ ${row.period} must be periodType ytd`);
        assert.equal(row.source.filing, '10-Q', `${row.metric} @ ${row.period} must cite 10-Q`);
        assert.match(
          row.source.period,
          /^(Nine|Three|Six) months ended /i,
          `${row.metric} @ ${row.period} source.period must state span as filed`
        );
        assert.equal(
          row.source.statement,
          'Unaudited Condensed Consolidated Statements of Cash Flows'
        );
      }
    }
  });

  test('no YTD row is relabelled as a discrete quarter', async () => {
    const { rows } = await loadCashflow();
    for (const row of rows) {
      if (/^(9M|3M|6M)/.test(row.period)) {
        assert.equal(row.periodType, 'ytd', `${row.metric} @ ${row.period} must be ytd`);
      }
    }
  });
});

describe('P1.3  -  app boot path wires the Accuracy Gate (combined corpus)', () => {
  async function boot(ledger) {
    const { root } = createTabRoot(TAB_KEYS);
    return bootApp({
      data: { loadHistorical },
      engine: {},
      root,
      now: () => 0,
      dir: DATA_DIR,
      readText,
      ledger,
    });
  }

  test('app boots headless with requireLedger wired over income+balance+cashflow', async () => {
    const { app, dataset } = await boot(LEDGER);
    try {
      assert.ok(dataset.cashflow, 'boot returns the audited corpus');
      assert.equal(app.state().scenario, 'base');
      assert.equal(typeof app.dispose, 'function');
    } finally {
      app.dispose();
    }
  });

  test('removing a cited cashflow ledger entry makes the boot fail', async () => {
    const citedUrl = [...new Set(
      extractRows(JSON.parse(fs.readFileSync(fileURLToPath(new URL('../src/data/historical/cashflow.json', import.meta.url)), 'utf8')))
        .map((r) => r.source.url),
    )][0];

    const pruned = new Set(LEDGER);
    pruned.delete(citedUrl);

    await assert.rejects(
      () => boot(pruned),
      (err) => {
        assert.ok(err instanceof DataValidationError);
        assert.equal(err.name, 'DataValidationError');
        assert.match(err.message, /SOURCE_NOT_IN_LEDGER/);
        return true;
      }
    );
  });
});
