/**
 * P1.2 Artifact Contract tests — `src/data/historical/balance.json`.
 *
 * Covers the invariants the contract names: every row cited and in-ledger, no
 * audit violations, balance-sheet identity per date (assets = liabilities +
 * equity) recomputed from transcribed components, sub-total identities,
 * balance-sum fixtures matched exactly, unearned-revenue presence per year,
 * period transcription honesty, and the app boot path refusing to start on an
 * out-of-ledger citation (combined income+balance corpus).
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
import { BALANCE_KNOWN_FIGURES, ALL_KNOWN_FIGURES } from './fixtures/duolingo_facts.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');

const TAB_KEYS = Object.freeze([
  'cover', 'assumptions', 'historicals', 'schedules',
  'projections', 'valuation', 'summary', 'sensitivity',
]);

const LEDGER = readLedgerUrls();

/** Fiscal year-ends the contract requires, plus latest quarter-end. */
const FISCAL_YEARS = Object.freeze(['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025']);
const QUARTER_END = 'Q2 FY2026';
const ALL_PERIODS = Object.freeze([...FISCAL_YEARS, QUARTER_END]);

/** Metrics that are sub-totals — excluded from grep-based sum checks as they are totals themselves. */
// Not used directly, but defines component vs total distinction for sum checks.

async function loadBalance() {
  const dataset = await loadHistorical({
    dir: DATA_DIR,
    readText,
    requireLedger: true,
    ledger: LEDGER,
  });
  return { dataset, rows: extractRows(dataset.balance) };
}

function valueOf(rows, period, metric) {
  const row = rows.find((r) => r.period === period && r.metric === metric);
  assert.ok(row, `missing row: ${metric} @ ${period}`);
  return row.value;
}

function hasMetric(rows, period, metric) {
  return rows.some((r) => r.period === period && r.metric === metric);
}

describe('P1.2 — dataset loads through the unmodified P0 pipeline (balance)', () => {
  test('loadHistorical resolves with the balance dataset under ledger enforcement (combined corpus)', async () => {
    const { rows } = await loadBalance();
    assert.ok(rows.length > 0, 'balance dataset must not be empty');
    for (const period of ALL_PERIODS) {
      assert.ok(rows.some((r) => r.period === period), `balance dataset must cover ${period}`);
    }
    // Balance rows should be stock klass
    for (const row of rows) {
      assert.equal(row.klass, 'stock', `${row.metric} @ ${row.period} must be klass stock`);
    }
  });

  test('every row passes validateRecord against the frozen historicalStatement schema', async () => {
    const { rows } = await loadBalance();
    for (const [index, row] of rows.entries()) {
      const result = validateRecord(row, SCHEMAS.historicalStatement, 'balance.json');
      assert.equal(result.ok, true, `row ${index} (${row.metric} @ ${row.period}): ${JSON.stringify(result.errors)}`);
    }
  });

  test('auditDataset reports zero violations over combined income+balance+empty datasets', async () => {
    const dataset = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
    const report = auditDataset(dataset, { requireLedger: true, ledger: LEDGER });
    assert.equal(report.ok, true, JSON.stringify(report.violations, null, 2));
    assert.deepEqual(report.violations, []);
    for (const rule of AUDIT_RULES) {
      assert.ok(!report.violations.some((v) => v.rule === rule), `${rule} must not fire`);
    }
  });

  test('100% of balance rows are cited, in-ledger, and marked as non-estimates', async () => {
    const { rows } = await loadBalance();
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

  test('every citation URL in balance dataset joins to a ledger entry (grep, not eyeball)', async () => {
    const text = fs.readFileSync(fileURLToPath(new URL('../src/data/historical/balance.json', import.meta.url)), 'utf8');
    const cited = new Set([...text.matchAll(/"url":\s*"([^"]+)"/g)].map((m) => m[1]));
    assert.ok(cited.size > 0);
    for (const url of cited) {
      assert.ok(LEDGER.has(url), `dataset URL missing from ledger: ${url}`);
    }
  });

  test('units are honest: as-reported thousands with matching scale', async () => {
    const { rows } = await loadBalance();
    for (const row of rows) {
      assert.equal(row.units, 'thousands_usd', `${row.metric} @ ${row.period}`);
      assert.equal(row.scale, UNITS.thousands_usd.scale, `${row.metric} @ ${row.period}`);
    }
  });

  test('no duplicate metric / period / periodType identities in balance', async () => {
    const { rows } = await loadBalance();
    const seen = new Set();
    for (const row of rows) {
      const identity = `${row.metric}|${row.period}|${row.periodType}`;
      assert.ok(!seen.has(identity), `duplicate identity: ${identity}`);
      seen.add(identity);
    }
  });

  test('no duplicate identities across income+balance combined (cross-dataset DUP_KEY)', async () => {
    const dataset = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
    const incomeRows = extractRows(dataset.income);
    const balanceRows = extractRows(dataset.balance);
    const seen = new Set();
    for (const row of [...incomeRows, ...balanceRows]) {
      const id = `${row.metric}|${row.period}|${row.periodType}`;
      assert.ok(!seen.has(id), `cross-dataset duplicate: ${id}`);
      seen.add(id);
    }
  });
});

describe('P1.2 — statement identities (balance balances)', () => {
  test('assets = liabilities + equity per balance date, recomputed from transcribed totals', async () => {
    const { rows } = await loadBalance();
    for (const period of ALL_PERIODS) {
      const assets = valueOf(rows, period, 'total_assets');
      const liab = valueOf(rows, period, 'total_liabilities');
      const equity = valueOf(rows, period, 'total_stockholders_equity');
      assert.equal(assets, liab + equity, `${period}: assets ${assets} != liabilities ${liab} + equity ${equity}`);
      // Also verify total_liabilities_and_stockholders_equity equals assets where present
      const totalLiabEquity = rows.find((r) => r.period === period && r.metric === 'total_liabilities_and_stockholders_equity')?.value;
      if (totalLiabEquity !== undefined) {
        assert.equal(totalLiabEquity, assets, `${period}: total_liab+equity ${totalLiabEquity} != assets ${assets}`);
      }
    }
  });

  test('total current assets = sum of current-asset components per period', async () => {
    const { rows } = await loadBalance();
    const components = [
      'cash_and_cash_equivalents',
      'short_term_investments',
      'accounts_receivable',
      'deferred_cost_of_revenues',
      'income_tax_receivable',
      'prepaid_expenses_and_other_current_assets',
    ];
    for (const period of ALL_PERIODS) {
      const total = valueOf(rows, period, 'total_current_assets');
      let sum = 0;
      let had = false;
      for (const metric of components) {
        const row = rows.find((r) => r.period === period && r.metric === metric);
        if (row) {
          sum += row.value;
          had = true;
        }
      }
      // Only assert when at least one component present — but contract says total should equal sum of those present
      assert.ok(had, `${period}: no current-asset components found`);
      assert.equal(sum, total, `${period}: current assets components sum ${sum} != total ${total}`);
    }
  });

  test('total current liabilities = sum of current-liability components per period', async () => {
    const { rows } = await loadBalance();
    const components = [
      'deferred_revenues',
      'accounts_payable',
      'income_tax_payable',
      'accrued_expenses_and_other_current_liabilities',
    ];
    for (const period of ALL_PERIODS) {
      const total = valueOf(rows, period, 'total_current_liabilities');
      let sum = 0;
      for (const metric of components) {
        const row = rows.find((r) => r.period === period && r.metric === metric);
        if (row) sum += row.value;
      }
      assert.equal(sum, total, `${period}: curr-liab components sum ${sum} != total ${total}`);
    }
  });

  test('total liabilities = total current liabilities + long-term components per period', async () => {
    const { rows } = await loadBalance();
    for (const period of ALL_PERIODS) {
      const totalCurr = valueOf(rows, period, 'total_current_liabilities');
      const totalLiab = valueOf(rows, period, 'total_liabilities');
      const ltLease = rows.find((r) => r.period === period && r.metric === 'long_term_operating_lease_liability')?.value ?? 0;
      const defTaxLiab = rows.find((r) => r.period === period && r.metric === 'deferred_tax_liabilities_net')?.value ?? 0;
      // FY2021 has no deferred_tax_liabilities, so just ltLease
      assert.equal(totalCurr + ltLease + defTaxLiab, totalLiab, `${period}: total liab recompute mismatch`);
    }
  });

  test('total assets = total current assets + non-current asset lines per period', async () => {
    const { rows } = await loadBalance();
    const nonCurrentMetrics = [
      'operating_lease_right_of_use_assets',
      'long_term_investments',
      'intangible_assets_net',
      'property_and_equipment_net',
      'goodwill',
      'capitalized_software_net',
      'restricted_cash',
      'deferred_tax_assets_net',
      'other_assets',
    ];
    for (const period of ALL_PERIODS) {
      const totalCurr = valueOf(rows, period, 'total_current_assets');
      const totalAssets = valueOf(rows, period, 'total_assets');
      let nonCurrSum = 0;
      for (const metric of nonCurrentMetrics) {
        const row = rows.find((r) => r.period === period && r.metric === metric);
        if (row) nonCurrSum += row.value;
      }
      assert.equal(totalCurr + nonCurrSum, totalAssets, `${period}: assets recompute mismatch (curr ${totalCurr} + noncurr ${nonCurrSum} != total ${totalAssets})`);
    }
  });

  test('equity = common stock + APIC + retained earnings/accum deficit (+ treasury where present) per period', async () => {
    const { rows } = await loadBalance();
    for (const period of ALL_PERIODS) {
      const totalEquity = valueOf(rows, period, 'total_stockholders_equity');
      const common = valueOf(rows, period, 'common_stock');
      const apic = valueOf(rows, period, 'additional_paid_in_capital');
      const retained = valueOf(rows, period, 'retained_earnings_accumulated_deficit');
      const treasury = rows.find((r) => r.period === period && r.metric === 'treasury_stock')?.value ?? 0;
      // For periods without treasury, treasury = 0
      assert.equal(common + apic + retained + treasury, totalEquity, `${period}: equity components ${common}+${apic}+${retained}+${treasury} != total ${totalEquity}`);
    }
  });
});

describe('P1.2 — known-figure fixtures', () => {
  test('every balance fixture value matches the dataset exactly', async () => {
    const { rows } = await loadBalance();
    assert.ok(BALANCE_KNOWN_FIGURES.length >= 3, 'fixtures must include at least 3 balance anchors');
    for (const figure of BALANCE_KNOWN_FIGURES) {
      const row = rows.find((r) => r.metric === figure.metric && r.period === figure.period);
      assert.ok(row, `dataset missing balance fixture row ${figure.metric} @ ${figure.period}`);
      assert.equal(row.value, figure.value, `${figure.metric} @ ${figure.period}`);
      assert.equal(row.units, figure.units, `${figure.metric} @ ${figure.period} units`);
      assert.equal(row.source.url, figure.source.url, `${figure.metric} @ ${figure.period} source`);
    }
  });

  test('fixtures cover the contract-mandated balance anchors', () => {
    const has = (metric, period) => BALANCE_KNOWN_FIGURES.some((f) => f.metric === metric && f.period === period);
    assert.ok(has('total_assets', 'FY2025'), 'FY2025 total assets fixture required');
    assert.ok(has('total_stockholders_equity', 'FY2025'), 'FY2025 total equity fixture required');
    assert.ok(has('total_assets', 'FY2023'), 'FY2023 total assets fixture required');
    // Additional anchors for coverage
    assert.ok(has('total_assets', 'FY2024'), 'FY2024 total assets fixture should exist');
    assert.ok(has('total_assets', 'Q2 FY2026'), 'Q2 FY2026 total assets fixture should exist');
  });

  test('ALL_KNOWN_FIGURES is the union of income and balance anchors (no fixture drifts)', () => {
    assert.equal(ALL_KNOWN_FIGURES.length, BALANCE_KNOWN_FIGURES.length + 10, 'income anchors (10) + balance anchors should equal union length');
  });
});

describe('P1.2 — unearned / deferred revenue presence', () => {
  test('deferred revenues present for every fiscal year-end (P2 WC dependency)', async () => {
    const { rows } = await loadBalance();
    for (const period of FISCAL_YEARS) {
      assert.ok(hasMetric(rows, period, 'deferred_revenues'), `${period}: deferred_revenues required`);
      const val = valueOf(rows, period, 'deferred_revenues');
      assert.ok(val > 0, `${period}: deferred revenues must be positive, got ${val}`);
    }
  });

  test('deferred revenues present for latest quarter-end', async () => {
    const { rows } = await loadBalance();
    assert.ok(hasMetric(rows, QUARTER_END, 'deferred_revenues'), `${QUARTER_END}: deferred_revenues required`);
  });

  test('deferred revenues grows over time (sanity: 98k in FY2021 to 505k in Q2 2026)', async () => {
    const { rows } = await loadBalance();
    const fy2021 = valueOf(rows, 'FY2021', 'deferred_revenues');
    const fy2025 = valueOf(rows, 'FY2025', 'deferred_revenues');
    const q2 = valueOf(rows, QUARTER_END, 'deferred_revenues');
    assert.equal(fy2021, 98_267);
    assert.equal(fy2025, 496_205);
    assert.equal(q2, 505_102);
    assert.ok(fy2025 > fy2021, 'deferred revenues should grow FY2021->FY2025');
    assert.ok(q2 >= fy2025, 'Q2 deferred should be >= FY2025');
  });
});

describe('P1.2 — period transcription honesty', () => {
  test('fiscal-year rows are fiscal_year periodType cited to a 10-K', async () => {
    const { rows } = await loadBalance();
    for (const period of FISCAL_YEARS) {
      const periodRows = rows.filter((r) => r.period === period);
      assert.ok(periodRows.length > 0, period);
      for (const row of periodRows) {
        assert.equal(row.periodType, 'fiscal_year', `${row.metric} @ ${row.period}`);
        assert.equal(row.source.filing, '10-K', `${row.metric} @ ${row.period}`);
      }
    }
  });

  test('quarter-end rows are quarter periodType cited to a 10-Q as-of date', async () => {
    const { rows } = await loadBalance();
    const qRows = rows.filter((r) => r.period === QUARTER_END);
    assert.ok(qRows.length > 0, QUARTER_END);
    for (const row of qRows) {
      assert.equal(row.periodType, 'quarter', `${row.metric} @ ${row.period}`);
      assert.equal(row.source.filing, '10-Q', `${row.metric} @ ${row.period}`);
      assert.match(row.source.period, /^As of June 30, 2026/, `${row.metric} @ ${row.period} must cite as-of date`);
    }
  });

  test('balance rows are stock klass, not flow', async () => {
    const { rows } = await loadBalance();
    for (const row of rows) {
      assert.equal(row.klass, 'stock', `${row.metric} @ ${row.period} must be stock`);
    }
  });
});

describe('P1.2 — regression: OP FAIL 2026-09-01 (convertible vs bottom-line)', () => {
  test('FY2021 has no convertible_preferred_stock row — filed cell is dash (zero preferred after IPO)', async () => {
    const { rows } = await loadBalance();
    assert.equal(hasMetric(rows, 'FY2021', 'convertible_preferred_stock'), false, 'FY2021 must not have convertible_preferred_stock; filed cell is em-dash');
    // also ensure no FY2021 convertible row anywhere (global check)
    const anyConvertible = rows.filter((r) => r.metric === 'convertible_preferred_stock');
    assert.equal(anyConvertible.length, 0, `no balance date should carry convertible_preferred_stock as filed (found ${anyConvertible.map((r)=>r.period).join(', ')}) — post-IPO zero, dash in filing`);
  });

  test('every balance date has total_liabilities_and_stockholders_equity row (including FY2021 bottom line)', async () => {
    const { rows } = await loadBalance();
    for (const period of ALL_PERIODS) {
      assert.ok(hasMetric(rows, period, 'total_liabilities_and_stockholders_equity'), `${period}: total_liabilities_and_stockholders_equity must be present (bottom line)`);
      const v = valueOf(rows, period, 'total_liabilities_and_stockholders_equity');
      const assets = valueOf(rows, period, 'total_assets');
      assert.equal(v, assets, `${period}: TLE ${v} must equal total_assets ${assets}`);
    }
    // pin FY2021 specifically
    assert.equal(valueOf(rows, 'FY2021', 'total_liabilities_and_stockholders_equity'), 661_311, 'FY2021 TLE must be 661,311 (the bottom-line value previously mis-mapped)');
  });

  test('no phantom metrics: every balance row corresponds to a real filed line (per-period expected sets)', async () => {
    const { rows } = await loadBalance();
    // Expected metric sets per period, exactly as filed (dash = omitted, not phantom)
    const EXPECTED = {
      FY2021: new Set([
        'cash_and_cash_equivalents','accounts_receivable','deferred_cost_of_revenues','prepaid_expenses_and_other_current_assets','total_current_assets','operating_lease_right_of_use_assets','property_and_equipment_net','capitalized_software_net','other_assets','total_assets','deferred_revenues','accounts_payable','income_tax_payable','accrued_expenses_and_other_current_liabilities','total_current_liabilities','long_term_operating_lease_liability','total_liabilities','common_stock','additional_paid_in_capital','retained_earnings_accumulated_deficit','total_stockholders_equity','total_liabilities_and_stockholders_equity',
        'ppe_leasehold_improvements','ppe_furniture_fixtures_and_equipment','ppe_gross','ppe_accumulated_depreciation','intangibles_capitalized_software','intangibles_gross','intangibles_accumulated_amortization',
      ]),
      FY2022: new Set([
        'cash_and_cash_equivalents','accounts_receivable','deferred_cost_of_revenues','prepaid_expenses_and_other_current_assets','total_current_assets','property_and_equipment_net','goodwill','intangible_assets_net','operating_lease_right_of_use_assets','deferred_tax_assets_net','other_assets','total_assets','deferred_revenues','accounts_payable','income_tax_payable','accrued_expenses_and_other_current_liabilities','total_current_liabilities','long_term_operating_lease_liability','total_liabilities','common_stock','additional_paid_in_capital','retained_earnings_accumulated_deficit','total_stockholders_equity','total_liabilities_and_stockholders_equity',
        'ppe_leasehold_improvements','ppe_furniture_fixtures_and_equipment','ppe_gross','ppe_accumulated_depreciation','intangibles_capitalized_software','intangibles_other','intangibles_gross','intangibles_accumulated_amortization',
      ]),
      FY2023: new Set([
        'cash_and_cash_equivalents','accounts_receivable','deferred_cost_of_revenues','prepaid_expenses_and_other_current_assets','total_current_assets','property_and_equipment_net','goodwill','intangible_assets_net','operating_lease_right_of_use_assets','deferred_tax_assets_net','restricted_cash','other_assets','total_assets','deferred_revenues','accounts_payable','income_tax_payable','accrued_expenses_and_other_current_liabilities','total_current_liabilities','long_term_operating_lease_liability','total_liabilities','common_stock','additional_paid_in_capital','retained_earnings_accumulated_deficit','total_stockholders_equity','total_liabilities_and_stockholders_equity',
        'ppe_leasehold_improvements','ppe_furniture_fixtures_and_equipment','ppe_gross','ppe_accumulated_depreciation','intangibles_capitalized_software','intangibles_other','intangibles_gross','intangibles_accumulated_amortization',
      ]),
      FY2024: new Set([
        'cash_and_cash_equivalents','short_term_investments','accounts_receivable','deferred_cost_of_revenues','income_tax_receivable','prepaid_expenses_and_other_current_assets','total_current_assets','operating_lease_right_of_use_assets','long_term_investments','intangible_assets_net','property_and_equipment_net','goodwill','restricted_cash','deferred_tax_assets_net','other_assets','total_assets','deferred_revenues','accounts_payable','income_tax_payable','accrued_expenses_and_other_current_liabilities','total_current_liabilities','long_term_operating_lease_liability','deferred_tax_liabilities_net','total_liabilities','common_stock','additional_paid_in_capital','retained_earnings_accumulated_deficit','total_stockholders_equity','total_liabilities_and_stockholders_equity',
        'ppe_leasehold_improvements','ppe_furniture_fixtures_and_equipment','ppe_gross','ppe_accumulated_depreciation','intangibles_capitalized_software','intangibles_acquired','intangibles_other_indefinite_lived','intangibles_gross','intangibles_accumulated_amortization',
      ]),
      FY2025: new Set([
        'cash_and_cash_equivalents','short_term_investments','accounts_receivable','deferred_cost_of_revenues','income_tax_receivable','prepaid_expenses_and_other_current_assets','total_current_assets','operating_lease_right_of_use_assets','long_term_investments','intangible_assets_net','property_and_equipment_net','goodwill','restricted_cash','deferred_tax_assets_net','other_assets','total_assets','deferred_revenues','accounts_payable','income_tax_payable','accrued_expenses_and_other_current_liabilities','total_current_liabilities','long_term_operating_lease_liability','deferred_tax_liabilities_net','total_liabilities','common_stock','additional_paid_in_capital','retained_earnings_accumulated_deficit','total_stockholders_equity','total_liabilities_and_stockholders_equity',
        'ppe_leasehold_improvements','ppe_furniture_fixtures_and_equipment','ppe_gross','ppe_accumulated_depreciation','intangibles_capitalized_software','intangibles_acquired','intangibles_other_indefinite_lived','intangibles_gross','intangibles_accumulated_amortization',
      ]),
      'Q2 FY2026': new Set([
        'cash_and_cash_equivalents','short_term_investments','accounts_receivable','deferred_cost_of_revenues','income_tax_receivable','prepaid_expenses_and_other_current_assets','total_current_assets','operating_lease_right_of_use_assets','long_term_investments','intangible_assets_net','property_and_equipment_net','goodwill','restricted_cash','deferred_tax_assets_net','other_assets','total_assets','deferred_revenues','accounts_payable','income_tax_payable','accrued_expenses_and_other_current_liabilities','total_current_liabilities','long_term_operating_lease_liability','deferred_tax_liabilities_net','total_liabilities','common_stock','treasury_stock','additional_paid_in_capital','retained_earnings_accumulated_deficit','total_stockholders_equity','total_liabilities_and_stockholders_equity',
        'ppe_leasehold_improvements','ppe_furniture_fixtures_and_equipment','ppe_gross','ppe_accumulated_depreciation','intangibles_capitalized_software','intangibles_acquired','intangibles_other_indefinite_lived','intangibles_gross','intangibles_accumulated_amortization',
      ]),
    };

    for (const period of ALL_PERIODS) {
      const actual = new Set(rows.filter((r)=>r.period===period).map((r)=>r.metric));
      const expected = EXPECTED[period];
      assert.ok(expected, `unexpected period ${period}`);
      assert.equal(actual.size, expected.size, `${period}: metric count ${actual.size} != expected ${expected.size} — actual ${[...actual].sort().join(', ')}`);
      for (const m of actual) assert.ok(expected.has(m), `${period}: phantom metric ${m} not in expected filed set`);
      for (const m of expected) assert.ok(actual.has(m), `${period}: missing expected metric ${m}`);
    }
    // also ensure no convertible_preferred_stock anywhere (post-IPO)
    assert.equal(rows.some((r)=>r.metric==='convertible_preferred_stock'), false, 'no phantom convertible_preferred_stock should exist post-fix');
  });
});

describe('P1.2 — app boot path wires the Accuracy Gate (combined corpus)', () => {
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

  test('app boots headless with requireLedger wired and the real ledger (income+balance)', async () => {
    const { app, dataset } = await boot(LEDGER);
    try {
      assert.ok(dataset.balance, 'boot returns balance corpus');
      assert.ok(dataset.income, 'boot returns income corpus');
      assert.equal(app.state().scenario, 'base');
      assert.equal(typeof app.dispose, 'function');
    } finally {
      app.dispose();
    }
  });

  test('removing a cited balance ledger entry makes the boot fail', async () => {
    const text = fs.readFileSync(fileURLToPath(new URL('../src/data/historical/balance.json', import.meta.url)), 'utf8');
    const citedUrl = [...new Set([...text.matchAll(/"url":\s*"([^"]+)"/g)].map((m) => m[1]))][0];
    const pruned = new Set(LEDGER);
    assert.equal(pruned.delete(citedUrl), true, 'test setup: url must have been in the ledger');
    await assert.rejects(
      () => boot(pruned),
      (error) => {
        assert.ok(error instanceof DataValidationError, 'boot must fail with DataValidationError');
        assert.ok(error.records.some((r) => r.rule === 'SOURCE_NOT_IN_LEDGER'));
        return true;
      },
    );
  });

  test('boot fails closed when enforcement is on but no ledger is supplied (balance)', async () => {
    await assert.rejects(
      () => boot(undefined),
      (error) => {
        assert.ok(error instanceof DataValidationError);
        assert.ok(error.records.some((r) => r.rule === 'SOURCE_NOT_IN_LEDGER'));
        return true;
      },
    );
  });

  test('the ledger is consumable in the object-entry shape too (balance)', async () => {
    const { app } = await boot(readLedgerEntries());
    try {
      assert.equal(app.state().scenario, 'base');
    } finally {
      app.dispose();
    }
  });
});
