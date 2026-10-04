/**
 * P0.2 Artifact Contract tests  -  `src/data/audit.js` (the Accuracy Gate).
 *
 * Proves the gate cannot be bypassed: uncited historicals are rejected, cited
 * ones pass, estimates are flagged rather than trusted, and every finding names
 * its metric, period, and rule. The final block drives the same gate end-to-end
 * through `loadHistorical()`.
 *
 * NOTE ON FIXTURE VALUES: every number below is a synthetic placeholder. Phase 0
 * delivers machinery only  -  no Duolingo figure is transcribed until P1.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { auditDataset, AUDIT_RULES, AUDIT_FLAGS, FLAG_EST_ROW } from '../src/data/audit.js';
import { loadHistorical } from '../src/data/loader.js';
import { DataValidationError } from '../src/data/errors.js';

/**
 * @param {object} [overrides]
 * @returns {object} A schema-valid cited historical row.
 */
function citedRow(overrides = {}) {
  return {
    metric: 'revenue',
    label: 'Total Revenue',
    klass: 'flow',
    period: 'FY2023',
    periodType: 'fiscal_year',
    value: 1234567, // synthetic placeholder, not a filed figure
    units: 'thousands_usd',
    scale: 1000,
    isEstimate: false,
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2023',
      statement: 'Consolidated Statements of Operations',
      url: 'https://www.sec.gov/example-filing.htm',
      accessedAt: '2026-08-31',
    },
    ...overrides,
  };
}

/**
 * @param {Array<object>} rows
 * @param {string} [datasetName]
 * @returns {Object.<string, unknown>}
 */
function dataset(rows, datasetName = 'income') {
  return { [datasetName]: { rows } };
}

/**
 * @param {object} report
 * @returns {string[]}
 */
function rules(report) {
  return report.violations.map((violation) => violation.rule);
}

describe('Accuracy Gate  -  cited data passes', () => {
  test('a fully-cited dataset yields ok === true with no violations', () => {
    const report = auditDataset(dataset([citedRow()]));
    assert.equal(report.ok, true);
    assert.deepEqual(report.violations, []);
  });

  test('an empty dataset passes', () => {
    const report = auditDataset({ income: { rows: [] } });
    assert.equal(report.ok, true);
    assert.deepEqual(report.violations, []);
  });

  test('audits every dataset in the collection', () => {
    const report = auditDataset({
      income: { rows: [citedRow({ metric: 'revenue' })] },
      balance: { rows: [citedRow({ metric: 'cash', klass: 'stock' })] },
      cashflow: { rows: [citedRow({ metric: 'operating_cash_flow' })] },
    });
    assert.equal(report.ok, true);
  });
});

describe('HIST_NO_SOURCE / SOURCE_URL_MISSING  -  uncited data is rejected', () => {
  test('a single uncited historical record is rejected', () => {
    const row = citedRow();
    delete row.source;

    const report = auditDataset(dataset([row]));
    assert.equal(report.ok, false);
    assert.deepEqual(rules(report), ['HIST_NO_SOURCE']);
    assert.match(report.violations[0].message, /revenue @ FY2023 violates HIST_NO_SOURCE/);
  });

  test('a source object with no url is rejected', () => {
    const row = citedRow();
    delete row.source.url;

    const report = auditDataset(dataset([row]));
    assert.equal(report.ok, false);
    assert.deepEqual(rules(report), ['SOURCE_URL_MISSING']);
  });

  test('a url without an http(s) scheme is rejected', () => {
    const row = citedRow({ source: { ...citedRow().source, url: 'www.sec.gov/example.htm' } });
    const report = auditDataset(dataset([row]));
    assert.deepEqual(rules(report), ['SOURCE_URL_MISSING']);
  });

  test('a null source is treated as absent, not as an empty citation', () => {
    const report = auditDataset(dataset([citedRow({ source: null })]));
    assert.deepEqual(rules(report), ['HIST_NO_SOURCE']);
  });
});

describe('HIST_MARKED_ESTIMATE & the EST_ROW flag', () => {
  test('an estimate without provenance is rejected as a historical', () => {
    const row = citedRow({ isEstimate: true });
    delete row.source;

    const report = auditDataset(dataset([row]));
    assert.equal(report.ok, false);
    assert.deepEqual(rules(report), ['HIST_MARKED_ESTIMATE']);
  });

  test('an estimate carrying a valid citation passes but is flagged EST_ROW', () => {
    const report = auditDataset(dataset([citedRow({ isEstimate: true })]));
    assert.equal(report.ok, true, 'a cited estimate is not a violation');
    assert.deepEqual(
      report.flags.map((flag) => flag.rule),
      [FLAG_EST_ROW],
    );
    assert.deepEqual(report.violations, []);
  });

  test('the EST_ROW flag never affects the ok verdict', () => {
    const flaggedOnly = auditDataset(dataset([citedRow({ isEstimate: true })]));
    assert.equal(flaggedOnly.ok, true);
    assert.ok(flaggedOnly.flags.length > 0, 'flag must still be emitted');
  });

  test('only estimate rows are flagged', () => {
    const report = auditDataset(
      dataset([citedRow({ metric: 'revenue', isEstimate: false }), citedRow({ metric: 'bookings', period: 'FY2024', isEstimate: true })]),
    );
    assert.equal(report.ok, true);
    assert.deepEqual(report.flags.map((flag) => flag.metric), ['bookings']);
  });
});

describe('DUP_KEY  -  record identity is unique', () => {
  test('the same metric/period/periodType twice is rejected', () => {
    const report = auditDataset(dataset([citedRow(), citedRow()]));
    assert.equal(report.ok, false);
    assert.deepEqual(rules(report), ['DUP_KEY']);
    assert.match(report.violations[0].message, /first seen in dataset "income"/);
  });

  test('the same metric in different periods is allowed', () => {
    const report = auditDataset(dataset([citedRow({ period: 'FY2023' }), citedRow({ period: 'FY2024' })]));
    assert.equal(report.ok, true);
  });

  test('the same metric/period with different periodType is allowed', () => {
    const report = auditDataset(
      dataset([citedRow({ periodType: 'fiscal_year' }), citedRow({ periodType: 'ytd' })]),
    );
    assert.equal(report.ok, true, 'filed annual and YTD rows for one period are distinct facts');
  });

  test('duplicates are detected across datasets', () => {
    const report = auditDataset({
      income: { rows: [citedRow()] },
      cashflow: { rows: [citedRow({ metric: 'revenue' })] },
    });
    assert.deepEqual(rules(report), ['DUP_KEY']);
  });
});

describe('BAD_UNITS  -  as-reported units stay consistent', () => {
  test('an unknown unit is rejected', () => {
    const report = auditDataset(dataset([citedRow({ units: 'euros' })]));
    assert.deepEqual(rules(report), ['BAD_UNITS']);
    assert.match(report.violations[0].message, /not a recognised unit/);
  });

  test('a scale that disagrees with its unit is rejected', () => {
    const report = auditDataset(dataset([citedRow({ units: 'thousands_usd', scale: 1 })]));
    assert.deepEqual(rules(report), ['BAD_UNITS']);
    assert.match(report.violations[0].message, /does not match the scale factor 1000/);
  });

  test('millions_usd with scale 1000000 is accepted', () => {
    const report = auditDataset(dataset([citedRow({ units: 'millions_usd', scale: 1_000_000 })]));
    assert.equal(report.ok, true);
  });
});

describe('SOURCE_NOT_IN_LEDGER  -  injected ledger enforcement', () => {
  test('a citation present in the ledger passes', () => {
    const report = auditDataset(dataset([citedRow()]), {
      requireLedger: true,
      ledger: ['https://www.sec.gov/example-filing.htm'],
    });
    assert.equal(report.ok, true);
  });

  test('a citation absent from the ledger is rejected', () => {
    const report = auditDataset(dataset([citedRow()]), {
      requireLedger: true,
      ledger: ['https://www.sec.gov/some-other-filing.htm'],
    });
    assert.equal(report.ok, false);
    assert.deepEqual(rules(report), ['SOURCE_NOT_IN_LEDGER']);
    assert.match(report.violations[0].message, /no entry in the source ledger/);
  });

  test('enforcement without a ledger fails closed rather than passing silently', () => {
    const report = auditDataset(dataset([citedRow()]), { requireLedger: true });
    assert.equal(report.ok, false);
    assert.deepEqual(rules(report), ['SOURCE_NOT_IN_LEDGER']);
    assert.match(report.violations[0].message, /refusing to pass an unverified citation/);
  });

  test('unknown citations pass when ledger enforcement is off', () => {
    const report = auditDataset(dataset([citedRow()]));
    assert.equal(report.ok, true, 'ledger gate is opt-in until P0.3 supplies SOURCE_LEDGER_REQUIRED');
  });

  test('accepts ledger entries shaped as objects carrying a url', () => {
    const report = auditDataset(dataset([citedRow()]), {
      requireLedger: true,
      ledger: [{ entity: 'Duolingo, Inc.', url: 'https://www.sec.gov/example-filing.htm' }],
    });
    assert.equal(report.ok, true);
  });
});

describe('AuditReport shape & determinism', () => {
  test('exposes ok, violations, and flags', () => {
    const report = auditDataset(dataset([citedRow()]));
    assert.deepEqual(Object.keys(report).sort(), ['flags', 'ok', 'violations']);
  });

  test('registers exactly the six contracted rules plus the EST flag', () => {
    assert.deepEqual([...AUDIT_RULES], [
      'HIST_NO_SOURCE',
      'HIST_MARKED_ESTIMATE',
      'DUP_KEY',
      'BAD_UNITS',
      'SOURCE_URL_MISSING',
      'SOURCE_NOT_IN_LEDGER',
    ]);
    assert.deepEqual([...AUDIT_FLAGS], ['EST_ROW']);
  });

  test('every violation names its metric, period, and rule', () => {
    const uncited = citedRow();
    delete uncited.source;
    const badUnits = citedRow({ metric: 'net_income', period: 'FY2024', units: 'euros' });

    const report = auditDataset(dataset([uncited, badUnits, citedRow(), citedRow()]));
    assert.equal(report.ok, false);

    for (const violation of report.violations) {
      assert.match(violation.message, new RegExp(violation.metric), 'message must name the metric');
      assert.match(violation.message, new RegExp(violation.period), 'message must name the period');
      assert.match(violation.message, new RegExp(violation.rule), 'message must name the rule');
      assert.doesNotMatch(violation.message, /invalid record/i, 'no generic messages');
    }
  });

  test('is total: unrecognized dataset shapes are skipped, never thrown', () => {
    for (const input of [null, undefined, {}, { income: null }, { income: 42 }, { income: {} }]) {
      const report = auditDataset(input);
      assert.equal(report.ok, true, `must not throw on ${JSON.stringify(input)}`);
      assert.deepEqual(report.violations, []);
    }
  });

  test('accepts a dataset given as a bare array of rows', () => {
    const report = auditDataset({ income: [citedRow()] });
    assert.equal(report.ok, true);
  });
});

describe('End-to-end  -  the gate is wired into loadHistorical()', () => {
  /**
   * @param {Object.<string, Array<object>>} datasets
   * @returns {Object.<string, string>}
   */
  function filesFrom(datasets) {
    return Object.fromEntries(
      Object.entries(datasets).map(([name, rows]) => [name, JSON.stringify({ rows })]),
    );
  }

  /**
   * @param {Object.<string, string>} files
   * @returns {(location: string) => Promise<string>}
   */
  function readerFor(files) {
    return async (location) => {
      const name = path.basename(location, '.json');
      if (!(name in files)) throw new Error(`no fixture available for ${location}`);
      return files[name];
    };
  }

  const FULL_DATASET = {
    income: [citedRow({ metric: 'revenue' })],
    balance: [citedRow({ metric: 'cash_and_equivalents', klass: 'stock' })],
    cashflow: [citedRow({ metric: 'operating_cash_flow' })],
    kpis: [
      {
        ...citedRow({ metric: 'dau', klass: 'kpi', value: 24200000 }),
        definition: 'Daily active users, as defined in the annual report.',
        category: 'Engagement',
      },
    ],
  };

  test('a fully-cited fixture dataset loads and audits clean', async () => {
    const loaded = await loadHistorical({
      readText: readerFor(filesFrom(FULL_DATASET)),
    });
    assert.deepEqual(Object.keys(loaded).sort(), ['balance', 'cashflow', 'income', 'kpis']);
  });

  test('ONE uncited record makes loadHistorical() throw, naming that record', async () => {
    const broken = {
      ...FULL_DATASET,
      income: [citedRow({ metric: 'revenue' }), (() => {
        const row = citedRow({ metric: 'cost_of_revenue', period: 'FY2024' });
        delete row.source;
        return row;
      })()],
    };

    await assert.rejects(
      () => loadHistorical({ readText: readerFor(filesFrom(broken)) }),
      (error) => {
        assert.ok(error instanceof DataValidationError);
        // The schema layer rejects the missing `source` before the audit engine
        // sees the row  -  defence in depth, with HIST_NO_SOURCE as the second
        // line of defence for any caller that audits without validating first.
        assert.ok(
          error.records.some((record) => record.metric === 'cost_of_revenue'),
          'the uncited record must be named',
        );
        assert.equal(
          error.records.filter((record) => record.metric === 'cost_of_revenue').length,
          1,
        );
        assert.match(error.message, /cost_of_revenue/);
        assert.match(error.message, /FY2024/);
        return true;
      },
    );
  });

  test('the audit stage is reachable end-to-end  -  citation alone is not enough', async () => {
    // Both rows are fully cited and schema-valid; only the audit engine can
    // catch this, proving auditDataset is genuinely wired into the pipeline.
    const broken = {
      ...FULL_DATASET,
      income: [citedRow({ metric: 'revenue' }), citedRow({ metric: 'revenue' })],
    };

    await assert.rejects(
      () => loadHistorical({ readText: readerFor(filesFrom(broken)) }),
      (error) => {
        assert.ok(error instanceof DataValidationError);
        assert.ok(
          error.records.some((record) => record.rule === 'DUP_KEY'),
          'a cited duplicate must still be rejected by the audit engine',
        );
        assert.match(error.message, /revenue @ FY2023 violates DUP_KEY/);
        return true;
      },
    );
  });

  test('schema failures and audit failures are reported together', async () => {
    const broken = {
      ...FULL_DATASET,
      kpis: [
        (() => {
          const row = citedRow({ metric: 'dau', klass: 'kpi' });
          delete row.definition;
          return row;
        })(),
      ],
      income: [citedRow({ metric: 'revenue' }), citedRow({ metric: 'revenue' })],
    };

    await assert.rejects(
      () => loadHistorical({ readText: readerFor(filesFrom(broken)) }),
      (error) => {
        assert.ok(error instanceof DataValidationError);
        const reported = error.records.map((record) => record.rule);
        assert.ok(reported.includes('SCHEMA_VIOLATION'), 'missing KPI definition must be reported');
        assert.ok(reported.includes('DUP_KEY'), 'duplicate rows must still be audited');
        assert.match(error.message, /field `definition`/);
        return true;
      },
    );
  });

  test('a malformed dataset file is rejected before the audit runs', async () => {
    const files = filesFrom(FULL_DATASET);
    files.balance = JSON.stringify({ notRows: true });

    await assert.rejects(
      () => loadHistorical({ readText: readerFor(files) }),
      (error) => {
        assert.ok(error instanceof DataValidationError);
        assert.ok(error.records.some((record) => record.rule === 'DATASET_SHAPE'));
        return true;
      },
    );
  });

  test('the ledger gate is reachable through the loader', async () => {
    const url = citedRow().source.url;
    const resolved = await loadHistorical({
      readText: readerFor(filesFrom(FULL_DATASET)),
      requireLedger: true,
      ledger: [url],
    });
    assert.ok(resolved);

    await assert.rejects(
      () =>
        loadHistorical({
          readText: readerFor(filesFrom(FULL_DATASET)),
          requireLedger: true,
          ledger: ['https://www.sec.gov/unrelated.htm'],
        }),
      (error) => {
        assert.ok(error instanceof DataValidationError);
        assert.ok(error.records.some((record) => record.rule === 'SOURCE_NOT_IN_LEDGER'));
        return true;
      },
    );
  });
});
