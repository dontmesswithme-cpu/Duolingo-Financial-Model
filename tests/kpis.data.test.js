/**
 * P1.4 Artifact Contract tests — `src/data/historical/kpis.json`.
 *
 * Covers:
 * - Dataset totality and schema validation under `SCHEMAS.kpi`.
 * - Zero audit violations across full 4-statement corpus (`income`, `balance`, `cashflow`, `kpis`).
 * - 100% cited, in-ledger, non-estimates.
 * - Units honesty (`count` has `scale: 1`, `thousands_usd` has `scale: 1000`).
 * - Definitions verbatim: exact string comparison for DAU, MAU, Paid Subscribers, Bookings, Adjusted EBITDA.
 * - KPI fixtures matched exactly against filed figures.
 * - Quarterly continuity across the TTM window.
 * - App boot path gate over full corpus.
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
import {
  KPI_KNOWN_FIGURES,
  KPI_PER_DOC_DEFINITIONS,
  ALL_DATA_FIXTURES,
} from './fixtures/duolingo_facts.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');

const TAB_KEYS = Object.freeze([
  'cover', 'assumptions', 'historicals', 'schedules',
  'projections', 'valuation', 'summary', 'sensitivity',
]);

const LEDGER = readLedgerUrls();

const FISCAL_YEARS = Object.freeze(['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025']);
const TTM_QUARTERS = Object.freeze(['Q3 FY2025', 'Q4 FY2025', 'Q1 FY2026', 'Q2 FY2026']);

async function loadKpis() {
  const dataset = await loadHistorical({
    dir: DATA_DIR,
    readText,
    requireLedger: true,
    ledger: LEDGER,
  });
  return { dataset, rows: extractRows(dataset.kpis) };
}

describe('P1.4 — dataset loads through the unmodified P0 pipeline (kpis)', () => {
  test('loadHistorical resolves with the KPI dataset under ledger enforcement (full corpus)', async () => {
    const { rows } = await loadKpis();
    assert.ok(rows.length > 0, 'kpi dataset must not be empty');
    for (const fy of FISCAL_YEARS) {
      assert.ok(rows.some((r) => r.period === fy), `kpi dataset must cover ${fy}`);
    }
    for (const q of TTM_QUARTERS) {
      assert.ok(rows.some((r) => r.period === q), `kpi dataset must cover ${q}`);
    }
  });

  test('every row passes validateRecord against the frozen kpi schema', async () => {
    const { rows } = await loadKpis();
    for (const [index, row] of rows.entries()) {
      const result = validateRecord(row, SCHEMAS.kpi, 'kpis.json');
      assert.equal(result.ok, true, `row ${index} (${row.metric} @ ${row.period}): ${JSON.stringify(result.errors)}`);
      assert.ok(row.definition && row.definition.trim().length > 0, `row ${index} missing definition`);
      assert.ok(row.category && row.category.trim().length > 0, `row ${index} missing category`);
    }
  });

  test('auditDataset reports zero violations over full 4-dataset corpus (income+balance+cashflow+kpis)', async () => {
    const dataset = await loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
    const report = auditDataset(dataset, { requireLedger: true, ledger: LEDGER });
    assert.equal(report.ok, true, JSON.stringify(report.violations, null, 2));
    assert.deepEqual(report.violations, []);
    for (const rule of AUDIT_RULES) {
      assert.ok(!report.violations.some((v) => v.rule === rule), `${rule} must not fire`);
    }
  });

  test('100% of KPI rows are cited, in-ledger, and marked as non-estimates', async () => {
    const { rows } = await loadKpis();
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

  test('every citation URL in kpis.json joins to a ledger entry (grep, not eyeball)', async () => {
    const raw = await readText(new URL('../src/data/historical/kpis.json', import.meta.url));
    const urls = [...raw.matchAll(/"url":\s*"(https:\/\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(urls.length > 0, 'must have extracted urls');
    for (const url of urls) {
      assert.ok(LEDGER.has(url), `uncited URL in kpis.json: ${url}`);
    }
  });

  test('units are honest: count with scale 1, thousands_usd with scale 1000', async () => {
    const { rows } = await loadKpis();
    for (const row of rows) {
      assert.ok(row.units in UNITS, `${row.units} must be in constants.UNITS`);
      assert.equal(row.scale, UNITS[row.units].scale, `${row.metric} @ ${row.period}`);
      assert.ok(Number.isFinite(row.value), `${row.metric} @ ${row.period} must be finite`);
      if (row.units === 'count') {
        assert.equal(row.scale, 1);
        assert.ok(Number.isInteger(row.value), `${row.metric} count must be integer`);
      }
    }
  });

  test('no duplicate metric / period / periodType identities', async () => {
    const { rows } = await loadKpis();
    const seen = new Set();
    for (const row of rows) {
      const key = `${row.metric}|${row.period}|${row.periodType}`;
      assert.ok(!seen.has(key), `duplicate identity in kpis.json: ${key}`);
      seen.add(key);
    }
  });
});

describe('P1.4 — verbatim definitions (kpis)', () => {
  test('DAU definition matches the filed verbatim wording from its own cited filing', async () => {
    const { rows } = await loadKpis();
    const dauRows = rows.filter((r) => r.metric === 'dau');
    assert.ok(dauRows.length > 0);
    for (const r of dauRows) {
      const expected = KPI_PER_DOC_DEFINITIONS[r.source.url]?.dau;
      assert.ok(expected, `no expected DAU definition for ${r.source.url}`);
      assert.equal(r.definition, expected, `DAU definition mismatch for ${r.period} (${r.source.url})`);
    }
  });

  test('MAU definition matches the filed verbatim wording from its own cited filing', async () => {
    const { rows } = await loadKpis();
    const mauRows = rows.filter((r) => r.metric === 'mau');
    assert.ok(mauRows.length > 0);
    for (const r of mauRows) {
      const expected = KPI_PER_DOC_DEFINITIONS[r.source.url]?.mau;
      assert.ok(expected, `no expected MAU definition for ${r.source.url}`);
      assert.equal(r.definition, expected, `MAU definition mismatch for ${r.period} (${r.source.url})`);
    }
  });

  test('Paid subscribers definition matches the filed verbatim wording from its own cited filing', async () => {
    const { rows } = await loadKpis();
    const subRows = rows.filter((r) => r.metric === 'paid_subscribers');
    assert.ok(subRows.length > 0);
    for (const r of subRows) {
      const expected = KPI_PER_DOC_DEFINITIONS[r.source.url]?.paid_subscribers;
      assert.ok(expected, `no expected Paid subscribers definition for ${r.source.url}`);
      assert.equal(r.definition, expected, `Paid subscribers definition mismatch for ${r.period} (${r.source.url})`);
    }
  });

  test('Bookings definition matches the filed verbatim wording from its own cited filing', async () => {
    const { rows } = await loadKpis();
    const bookingsRows = rows.filter((r) => r.metric.includes('bookings'));
    assert.ok(bookingsRows.length > 0);
    for (const r of bookingsRows) {
      const expected = KPI_PER_DOC_DEFINITIONS[r.source.url]?.bookings;
      assert.ok(expected, `no expected Bookings definition for ${r.source.url}`);
      assert.equal(r.definition, expected, `Bookings definition mismatch for ${r.period} (${r.source.url})`);
    }
  });

  test('Adjusted EBITDA definition matches the filed verbatim wording from its own cited filing', async () => {
    const { rows } = await loadKpis();
    const ebitdaRows = rows.filter((r) => r.metric === 'adjusted_ebitda');
    assert.ok(ebitdaRows.length > 0);
    for (const r of ebitdaRows) {
      const expected = KPI_PER_DOC_DEFINITIONS[r.source.url]?.adjusted_ebitda;
      assert.ok(expected, `no expected Adjusted EBITDA definition for ${r.source.url}`);
      assert.equal(r.definition, expected, `Adjusted EBITDA definition mismatch for ${r.period} (${r.source.url})`);
    }
  });
});

describe('P1.4 — known-figure fixtures (kpis)', () => {
  test('every KPI fixture value matches the dataset exactly', async () => {
    const { rows } = await loadKpis();
    for (const fixture of KPI_KNOWN_FIGURES) {
      const match = rows.find(
        (r) => r.metric === fixture.metric && r.period === fixture.period
      );
      assert.ok(match, `missing KPI fixture: ${fixture.metric} @ ${fixture.period}`);
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

  test('all ALL_DATA_FIXTURES join to ledger', () => {
    for (const fixture of ALL_DATA_FIXTURES) {
      assert.ok(LEDGER.has(fixture.source.url), `fixture URL missing in ledger: ${fixture.source.url}`);
    }
  });
});

describe('P1.4 — quarterly continuity and engagement metrics', () => {
  test('DAU and Paid subscribers are present across all TTM window quarters', async () => {
    const { rows } = await loadKpis();
    for (const q of TTM_QUARTERS) {
      const dau = rows.find((r) => r.metric === 'dau' && r.period === q);
      const subs = rows.find((r) => r.metric === 'paid_subscribers' && r.period === q);
      assert.ok(dau, `missing DAU for ${q}`);
      assert.ok(subs, `missing Paid Subscribers for ${q}`);
      assert.ok(dau.value > 0, `DAU for ${q} must be positive`);
      assert.ok(subs.value > 0, `Paid Subscribers for ${q} must be positive`);
    }
  });

  test('MAU matches the exact filed 10-K / 10-Q values without letter bleeding', async () => {
    const { rows } = await loadKpis();
    const mauExpected = {
      'FY2025': 133_100_000,
      'FY2024': 116_700_000,
      'Q4 FY2025': 133_100_000,
      'Q3 FY2025': 135_300_000,
      'FY2023': 88_400_000,
      'FY2022': 60_700_000,
      'FY2021': 40_500_000,
    };
    for (const [period, expectedVal] of Object.entries(mauExpected)) {
      const match = rows.find((r) => r.metric === 'mau' && r.period === period);
      assert.ok(match, `missing MAU for ${period}`);
      assert.equal(match.value, expectedVal, `MAU mismatch for ${period}: expected ${expectedVal}, got ${match.value}`);
    }
  });

  test('DAU grows monotonically across the TTM window as filed', async () => {
    const { rows } = await loadKpis();
    const q3 = rows.find((r) => r.metric === 'dau' && r.period === 'Q3 FY2025').value;
    const q4 = rows.find((r) => r.metric === 'dau' && r.period === 'Q4 FY2025').value;
    const q1 = rows.find((r) => r.metric === 'dau' && r.period === 'Q1 FY2026').value;
    const q2 = rows.find((r) => r.metric === 'dau' && r.period === 'Q2 FY2026').value;

    assert.ok(q4 >= q3, `Q4 DAU (${q4}) >= Q3 DAU (${q3})`);
    assert.ok(q1 >= q4, `Q1 DAU (${q1}) >= Q4 DAU (${q4})`);
    assert.ok(q2 >= q1, `Q2 DAU (${q2}) >= Q1 DAU (${q1})`);
  });
});

describe('P1.4 — app boot path wires the Accuracy Gate (full corpus)', () => {
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

  test('app boots headless with requireLedger wired over full corpus (income+balance+cashflow+kpis)', async () => {
    const { app, dataset } = await boot(LEDGER);
    try {
      assert.ok(dataset.income, 'income loaded');
      assert.ok(dataset.balance, 'balance loaded');
      assert.ok(dataset.cashflow, 'cashflow loaded');
      assert.ok(dataset.kpis, 'kpis loaded');
      assert.equal(app.state().scenario, 'base');
      assert.equal(typeof app.dispose, 'function');
    } finally {
      app.dispose();
    }
  });

  test('removing a cited KPI ledger entry makes the boot fail', async () => {
    const citedUrl = [...new Set(
      extractRows(JSON.parse(fs.readFileSync(fileURLToPath(new URL('../src/data/historical/kpis.json', import.meta.url)), 'utf8')))
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
