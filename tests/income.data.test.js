/**
 * P1.1 Artifact Contract tests — `src/data/historical/income.json`.
 *
 * Covers the invariants the contract names: every row cited and in-ledger, no
 * audit violations, segment sums equal to total revenue, the income-statement
 * identity per period, known-figure fixtures matched exactly, quarterly rows
 * discrete (10-Q three-month columns, never relabelled YTD), and the app boot
 * path refusing to start on an out-of-ledger citation.
 *
 * Fully headless and offline: the corpus is read from disk, the ledger is parsed
 * from `docs/sources/sources.md`, and the DOM is injected as a stub.
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
import { readLedgerUrls, readLedgerEntries } from './_ledger.js';
import { KNOWN_FIGURES, GROWTH_FIXTURE } from './fixtures/duolingo_facts.js';

/** Absolute path of the historical dataset directory. */
const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));

/** Reads dataset files from disk — the Node counterpart of the browser's fetch. */
const readText = (location) => fs.promises.readFile(location, 'utf8');

/** The eight model tabs, per `docs/spec.md` §3.4. */
const TAB_KEYS = Object.freeze([
  'cover', 'assumptions', 'historicals', 'schedules',
  'projections', 'valuation', 'summary', 'sensitivity',
]);

/** Revenue components as filed in the Disaggregation of Revenue note. */
const REVENUE_COMPONENTS = Object.freeze([
  'revenue_subscription',
  'revenue_advertising',
  'revenue_duolingo_english_test',
  'revenue_in_app_purchases',
  'revenue_other',
]);

/** Fiscal years the contract requires. */
const FISCAL_YEARS = Object.freeze(['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025']);

/** Discrete quarters transcribed from 10-Q three-month columns. */
const QUARTERS = Object.freeze(['Q3 FY2025', 'Q1 FY2026', 'Q2 FY2026']);

/** @type {Set<string>} */
const LEDGER = readLedgerUrls();

/** Loads the corpus through the production gate. */
async function loadIncome() {
  const dataset = await loadHistorical({
    dir: DATA_DIR,
    readText,
    requireLedger: true,
    ledger: LEDGER,
  });
  return { dataset, rows: extractRows(dataset.income) };
}

/**
 * @param {Array<object>} rows
 * @param {string} period
 * @param {string} metric
 * @returns {number}
 */
function valueOf(rows, period, metric) {
  const row = rows.find((r) => r.period === period && r.metric === metric);
  assert.ok(row, `missing row: ${metric} @ ${period}`);
  return row.value;
}

describe('P1.1 — dataset loads through the unmodified P0 pipeline', () => {
  test('loadHistorical resolves with the income dataset under ledger enforcement', async () => {
    const { rows } = await loadIncome();
    assert.ok(rows.length > 0, 'income dataset must not be empty');
    for (const period of [...FISCAL_YEARS, ...QUARTERS]) {
      assert.ok(
        rows.some((r) => r.period === period),
        `income dataset must cover ${period}`,
      );
    }
  });

  test('every row passes validateRecord against the frozen historicalStatement schema', async () => {
    const { rows } = await loadIncome();
    for (const [index, row] of rows.entries()) {
      const result = validateRecord(row, SCHEMAS.historicalStatement, 'income.json');
      assert.equal(result.ok, true, `row ${index} (${row.metric} @ ${row.period}): ${JSON.stringify(result.errors)}`);
    }
  });

  test('auditDataset reports zero violations and no forbidden rules', async () => {
    const { dataset } = await loadIncome();
    const report = auditDataset(dataset, { requireLedger: true, ledger: LEDGER });
    assert.equal(report.ok, true, JSON.stringify(report.violations, null, 2));
    assert.deepEqual(report.violations, []);
    for (const rule of AUDIT_RULES) {
      assert.ok(
        !report.violations.some((v) => v.rule === rule),
        `${rule} must not fire`,
      );
    }
  });

  test('100% of rows are cited, in-ledger, and marked as non-estimates', async () => {
    const { rows } = await loadIncome();
    for (const row of rows) {
      assert.equal(row.isEstimate, false, `${row.metric} @ ${row.period} must be a filed actual`);
      assert.ok(row.source, `${row.metric} @ ${row.period} must carry a source`);
      assert.match(row.source.url, /^https:\/\/www\.sec\.gov\//);
      assert.ok(LEDGER.has(row.source.url), `citation not in ledger: ${row.source.url}`);
      assert.match(row.source.accessedAt, /^\d{4}-\d{2}-\d{2}$/);
      for (const field of ['filing', 'period', 'statement']) {
        assert.ok(row.source[field]?.trim(), `${row.metric} @ ${row.period}: source.${field} required`);
      }
    }
  });

  test('every citation URL in the dataset joins to a ledger entry (grep, not eyeball)', async () => {
    const text = fs.readFileSync(fileURLToPath(new URL('../src/data/historical/income.json', import.meta.url)), 'utf8');
    const cited = new Set([...text.matchAll(/"url":\s*"([^"]+)"/g)].map((m) => m[1]));
    assert.ok(cited.size > 0);
    for (const url of cited) {
      assert.ok(LEDGER.has(url), `dataset URL missing from ledger: ${url}`);
    }
  });

  test('units are honest: as-reported thousands with matching scale', async () => {
    const { rows } = await loadIncome();
    for (const row of rows) {
      assert.equal(row.units, 'thousands_usd', `${row.metric} @ ${row.period}`);
      assert.equal(row.scale, UNITS.thousands_usd.scale, `${row.metric} @ ${row.period}`);
    }
  });

  test('no duplicate metric / period / periodType identities', async () => {
    const { rows } = await loadIncome();
    const seen = new Set();
    for (const row of rows) {
      const identity = `${row.metric}|${row.period}|${row.periodType}`;
      assert.ok(!seen.has(identity), `duplicate identity: ${identity}`);
      seen.add(identity);
    }
  });
});

describe('P1.1 — statement identities', () => {
  test('revenue components sum exactly to total revenue per period', async () => {
    const { rows } = await loadIncome();
    for (const period of [...FISCAL_YEARS, ...QUARTERS]) {
      const total = valueOf(rows, period, 'revenue_total');
      const sum = REVENUE_COMPONENTS.reduce((acc, metric) => acc + valueOf(rows, period, metric), 0);
      assert.equal(sum, total, `${period}: components ${sum} != total ${total}`);
    }
  });

  test('revenue − cost of revenue = gross profit per period', async () => {
    const { rows } = await loadIncome();
    for (const period of [...FISCAL_YEARS, ...QUARTERS]) {
      const revenue = valueOf(rows, period, 'revenue_total');
      const cost = valueOf(rows, period, 'cost_of_revenue');
      assert.equal(revenue - cost, valueOf(rows, period, 'gross_profit'), period);
    }
  });

  test('gross profit − total operating expenses = operating income per period', async () => {
    const { rows } = await loadIncome();
    for (const period of [...FISCAL_YEARS, ...QUARTERS]) {
      const gross = valueOf(rows, period, 'gross_profit');
      const opex = valueOf(rows, period, 'opex_total');
      assert.equal(gross - opex, valueOf(rows, period, 'operating_income'), period);
    }
  });

  test('operating expense lines sum to total operating expenses per period', async () => {
    const { rows } = await loadIncome();
    for (const period of [...FISCAL_YEARS, ...QUARTERS]) {
      const sum =
        valueOf(rows, period, 'opex_research_and_development') +
        valueOf(rows, period, 'opex_sales_and_marketing') +
        valueOf(rows, period, 'opex_general_and_administrative');
      assert.equal(sum, valueOf(rows, period, 'opex_total'), period);
    }
  });

  test('pretax income − income tax = net income per period', async () => {
    const { rows } = await loadIncome();
    for (const period of [...FISCAL_YEARS, ...QUARTERS]) {
      const pretax = valueOf(rows, period, 'pretax_income');
      const tax = valueOf(rows, period, 'income_tax');
      assert.equal(pretax - tax, valueOf(rows, period, 'net_income'), period);
    }
  });

  test('annual rows: the five fiscal years are positive-revenue and loss-making early', async () => {
    const { rows } = await loadIncome();
    // Sanity anchors on the shape of Duolingo's history: revenue grows every
    // year, FY2021–FY2023 were loss-making at the operating line.
    for (const period of FISCAL_YEARS) {
      assert.ok(valueOf(rows, period, 'revenue_total') > 0, period);
    }
    for (let i = 1; i < FISCAL_YEARS.length; i++) {
      assert.ok(
        valueOf(rows, FISCAL_YEARS[i], 'revenue_total') > valueOf(rows, FISCAL_YEARS[i - 1], 'revenue_total'),
        `${FISCAL_YEARS[i]} revenue must exceed ${FISCAL_YEARS[i - 1]}`,
      );
    }
    for (const period of ['FY2021', 'FY2022', 'FY2023']) {
      assert.ok(valueOf(rows, period, 'operating_income') < 0, `${period} operated at a loss as filed`);
    }
  });
});

describe('P1.1 — known-figure fixtures', () => {
  test('every fixture value matches the dataset exactly', async () => {
    const { rows } = await loadIncome();
    for (const figure of KNOWN_FIGURES) {
      const row = rows.find((r) => r.metric === figure.metric && r.period === figure.period);
      assert.ok(row, `dataset is missing fixture row ${figure.metric} @ ${figure.period}`);
      assert.equal(row.value, figure.value, `${figure.metric} @ ${figure.period}`);
      assert.equal(row.units, figure.units, `${figure.metric} @ ${figure.period} units`);
      assert.equal(row.source.url, figure.source.url, `${figure.metric} @ ${figure.period} source`);
    }
  });

  test('fixtures cover the anchors the contract mandates', () => {
    const has = (metric, period) =>
      KNOWN_FIGURES.some((f) => f.metric === metric && f.period === period);
    assert.ok(has('revenue_total', 'FY2025'));
    assert.ok(has('revenue_total', 'FY2023'));
    assert.ok(has('net_income', 'FY2025'));
    assert.ok(has('net_income', 'FY2023'));
    for (const metric of REVENUE_COMPONENTS) {
      assert.ok(has(metric, 'FY2025'), `FY2025 segment fixture missing: ${metric}`);
    }
  });

  test('YoY revenue growth FY2024 → FY2025 matches the derived fixture', async () => {
    const { rows } = await loadIncome();
    const from = valueOf(rows, GROWTH_FIXTURE.fromPeriod, 'revenue_total');
    const to = valueOf(rows, GROWTH_FIXTURE.toPeriod, 'revenue_total');
    assert.equal(from, GROWTH_FIXTURE.fromValue, 'FY2024 revenue anchor drifted');
    assert.equal(to, GROWTH_FIXTURE.toValue, 'FY2025 revenue anchor drifted');
    assert.equal(to / from - 1, GROWTH_FIXTURE.value);
    // Sanity: growth is large and positive, consistent with the filed 39%.
    assert.ok(GROWTH_FIXTURE.value > 0.3 && GROWTH_FIXTURE.value < 0.45, String(GROWTH_FIXTURE.value));
  });
});

describe('P1.1 — period transcription honesty', () => {
  test('annual rows are fiscal_year rows cited to a 10-K', async () => {
    const { rows } = await loadIncome();
    for (const period of FISCAL_YEARS) {
      const periodRows = rows.filter((r) => r.period === period);
      assert.ok(periodRows.length > 0, period);
      for (const row of periodRows) {
        assert.equal(row.periodType, 'fiscal_year', `${row.metric} @ ${row.period}`);
        assert.equal(row.source.filing, '10-K', `${row.metric} @ ${row.period}`);
      }
    }
  });

  test('quarterly rows are discrete quarters cited to 10-Q three-month columns', async () => {
    const { rows } = await loadIncome();
    for (const period of QUARTERS) {
      const periodRows = rows.filter((r) => r.period === period);
      assert.ok(periodRows.length > 0, period);
      for (const row of periodRows) {
        assert.equal(row.periodType, 'quarter', `${row.metric} @ ${row.period} must be discrete`);
        assert.equal(row.source.filing, '10-Q', `${row.metric} @ ${row.period} must cite a 10-Q`);
        assert.match(
          row.source.period,
          /^Three months ended /,
          `${row.metric} @ ${row.period} must cite a three-month column, not YTD`,
        );
      }
    }
  });

  test('no YTD row is relabelled as a discrete quarter', async () => {
    const { rows } = await loadIncome();
    for (const row of rows) {
      // The income statement is transcribed from three-month columns only; the
      // year-to-date columns a 10-Q also presents must never appear here.
      assert.notEqual(row.periodType, 'ytd', `${row.metric} @ ${row.period}`);
      assert.doesNotMatch(
        row.source.period,
        /^(Nine|Six) months ended/i,
        `${row.metric} @ ${row.period} cites a YTD span but is labelled ${row.periodType}`,
      );
    }
  });

  test('the TTM window is closed by the latest reported quarter (Q2 FY2026)', async () => {
    const { rows } = await loadIncome();
    assert.ok(rows.some((r) => r.period === 'Q2 FY2026'), 'latest reported quarter must be present');
    // Q3 FY2025 is the oldest quarter in the window; nothing earlier is transcribed.
    const quarters = [...new Set(rows.filter((r) => r.periodType === 'quarter').map((r) => r.period))];
    assert.deepEqual(quarters.sort(), [...QUARTERS].sort());
  });
});

describe('P1.1 — app boot path wires the Accuracy Gate', () => {
  /**
   * @returns {Promise<object>}
   */
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

  test('app boots headless with requireLedger wired and the real ledger', async () => {
    const { app, dataset } = await boot(LEDGER);
    try {
      assert.ok(dataset.income, 'boot returns the audited corpus');
      assert.equal(app.state().scenario, 'base');
      assert.equal(typeof app.dispose, 'function');
    } finally {
      app.dispose();
    }
  });

  test('removing a cited ledger entry makes the boot fail', async () => {
    const citedUrl = [...new Set(
      extractRows(JSON.parse(fs.readFileSync(fileURLToPath(new URL('../src/data/historical/income.json', import.meta.url)), 'utf8')))
        .map((r) => r.source.url),
    )][0];

    const pruned = new Set(LEDGER);
    assert.equal(pruned.delete(citedUrl), true, 'test setup: url must have been in the ledger');

    await assert.rejects(
      () => boot(pruned),
      (error) => {
        assert.ok(error instanceof DataValidationError, 'boot must fail with DataValidationError');
        assert.ok(
          error.records.some((record) => record.rule === 'SOURCE_NOT_IN_LEDGER'),
          `expected SOURCE_NOT_IN_LEDGER, got: ${JSON.stringify(error.records)}`,
        );
        return true;
      },
    );
  });

  test('boot fails closed when enforcement is on but no ledger is supplied', async () => {
    await assert.rejects(
      () => boot(undefined),
      (error) => {
        assert.ok(error instanceof DataValidationError);
        assert.ok(error.records.some((r) => r.rule === 'SOURCE_NOT_IN_LEDGER'));
        return true;
      },
    );
  });

  test('the ledger is consumable in the object-entry shape too', async () => {
    const { app } = await boot(readLedgerEntries());
    try {
      assert.equal(app.state().scenario, 'base');
    } finally {
      app.dispose();
    }
  });
});
