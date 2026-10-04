/**
 * Redesign Phase 10 — Task RP10.1 Artifact Contract tests.
 *
 * Deliverables: `src/engine/ratios.js`, `tests/ratios.test.js`.
 *
 * What this suite proves (and what it deliberately refuses to do):
 *  - Every ratio is re-derived HERE, from raw corpus rows, by independent
 *    arithmetic that never calls the engine under test. A value that only agrees
 *    with itself is not evidence, so the expected side of every comparison is
 *    built from `income.json` / `balance.json` / `cashflow.json` / `kpis.json`.
 *  - Quarterly columns are re-derived here too: filed discrete quarters, plus
 *    year-to-date differencing written out longhand. The engine's own
 *    `deriveDiscreteQuarters` is never imported by this file.
 *  - The Director-approved published pins (RP10 spec §4) are asserted as
 *    formatted strings, so a display regression is as loud as an arithmetic one.
 *  - The fail-closed policy is asserted directly: not-meaningful cases, zero
 *    denominators, absent inputs, the declared zero-substitution, and the
 *    balance-line leak guard each get an adjacent negative control that proves
 *    the guard is live rather than masked by absent data.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadHistorical } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { DAYS_IN_YEAR } from '../src/data/constants.js';
import { EngineError } from '../src/data/errors.js';
import {
  RATIO_DEFS,
  RATIOS_BY_STATEMENT,
  RATIO_PERIODS,
  RATIO_ANNUAL_PERIODS,
  RATIO_QUARTERLY_PERIODS,
  computeHistoricalRatios,
  isRatioQuarterlyCapable,
  formatRatioById,
  formatRatioValue,
  formatRatioChange,
} from '../src/engine/ratios.js';
import { readLedgerUrls } from './_ledger.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATIOS_PATH = path.join(ROOT, 'src', 'engine', 'ratios.js');
const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const readText = (loc) => fs.promises.readFile(loc, 'utf8');

/** The five annual columns, restated independently of the module under test. */
const ANNUAL_COLUMNS = ['FY2021', 'FY2022', 'FY2023', 'FY2024', 'FY2025'];

/** Grammar tokens that appear in `formula` strings but are not corpus metrics. */
const FORMULA_GRAMMAR_TOKENS = new Set(['avg', 'DAYS_IN_YEAR']);

/** Dataset files walked to build the raw corpus index. */
const DATASETS = ['income', 'balance', 'cashflow', 'kpis'];

let historicalPromise = null;
function getHistorical() {
  if (!historicalPromise) {
    historicalPromise = loadHistorical({
      dir: DATA_DIR,
      readText,
      requireLedger: true,
      ledger: readLedgerUrls(),
    });
  }
  return historicalPromise;
}

/**
 * Builds `metric -> period -> row` straight from the corpus files.
 *
 * @param {object} historical
 * @returns {Map<string, Map<string, object>>}
 */
function corpusIndex(historical) {
  const index = new Map();
  for (const dataset of DATASETS) {
    for (const row of extractRows(historical[dataset]) || []) {
      if (!row || typeof row.metric !== 'string') continue;
      if (!index.has(row.metric)) index.set(row.metric, new Map());
      index.get(row.metric).set(row.period, row);
    }
  }
  return index;
}

/**
 * Reads a raw filed value (null when the row is absent or non-finite).
 *
 * @param {Map<string, Map<string, object>>} index
 * @param {string} metric
 * @param {string} period
 * @returns {number|null}
 */
function rawValue(index, metric, period) {
  const row = index.get(metric)?.get(period);
  return row && Number.isFinite(row.value) ? row.value : null;
}

/**
 * Reads the raw row (used by tests that assert on `periodType` / `klass`).
 *
 * @param {Map<string, Map<string, object>>} index
 * @param {string} metric
 * @param {string} period
 * @returns {object|null}
 */
function rawRow(index, metric, period) {
  return index.get(metric)?.get(period) || null;
}

/**
 * Reads a year-to-date filed value.
 *
 * @param {Map<string, Map<string, object>>} index
 * @param {string} metric
 * @param {string} period
 * @returns {number|null}
 */
function ytdValue(index, metric, period) {
  const row = rawRow(index, metric, period);
  if (!row || row.periodType !== 'ytd') return null;
  return Number.isFinite(row.value) ? row.value : null;
}

/**
 * Independently derives one discrete quarter from the corpus: a filed discrete
 * quarter when the statement publishes one, otherwise the year-to-date
 * differencing spelled out longhand. Deliberately does NOT reuse the engine's
 * `deriveDiscreteQuarters`.
 *
 * @param {Map<string, Map<string, object>>} index
 * @param {string} metric
 * @param {string} period
 * @returns {number|null}
 */
function deriveQuarter(index, metric, period) {
  const direct = rawRow(index, metric, period);
  if (direct && direct.periodType === 'quarter' && Number.isFinite(direct.value)) {
    return direct.value;
  }
  const subtract = (a, b) => (a === null || b === null ? null : a - b);
  if (period === 'Q1 FY2026') return ytdValue(index, metric, '3M FY2026');
  if (period === 'Q2 FY2026') {
    return subtract(ytdValue(index, metric, '6M FY2026'), ytdValue(index, metric, '3M FY2026'));
  }
  if (period === 'Q3 FY2025') {
    return subtract(ytdValue(index, metric, '9M FY2025'), ytdValue(index, metric, '6M FY2025'));
  }
  if (period === 'Q4 FY2025') {
    return subtract(rawValue(index, metric, 'FY2025'), ytdValue(index, metric, '9M FY2025'));
  }
  return null;
}

/**
 * Declared zero-substitution: short-term investments read as zero where the
 * corpus files no such line; every other absent input stays null.
 *
 * @param {number|null} value
 * @param {string} metric
 * @returns {number|null}
 */
function applyZeroSubstitution(value, metric) {
  if (value !== null) return value;
  return metric === 'short_term_investments' ? 0 : null;
}

/**
 * @param {number|null} numerator
 * @param {number|null} denominator
 * @returns {number|null}
 */
function div(numerator, denominator) {
  if (numerator === null || denominator === null) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}

/**
 * @param {Array<number|null>} terms
 * @returns {number|null}
 */
function add(terms) {
  if (terms.some((term) => term === null)) return null;
  return terms.reduce((total, term) => total + term, 0);
}

/**
 * Builds a raw-corpus resolver for one column.
 *
 * @param {Map<string, Map<string, object>>} index
 * @param {string} period
 * @param {'annual'|'quarterly'} mode
 * @returns {(metric: string) => number|null}
 */
function resolverFor(index, period, mode) {
  return (metric) => {
    const raw = mode === 'annual' ? rawValue(index, metric, period) : deriveQuarter(index, metric, period);
    return applyZeroSubstitution(raw, metric);
  };
}

/**
 * Independent mean-of-current-and-prior year-end balance.
 *
 * @param {Map<string, Map<string, object>>} index
 * @param {string} metric
 * @param {string} period
 * @returns {number|null}
 */
function averageBalance(index, metric, period) {
  const current = rawValue(index, metric, period);
  if (current === null) return null;
  const position = ANNUAL_COLUMNS.indexOf(period);
  if (position <= 0) return current;
  const prior = rawValue(index, metric, ANNUAL_COLUMNS[position - 1]);
  if (prior === null) return current;
  return (current + prior) / 2;
}

/**
 * Independent re-derivation of one ratio from raw corpus rows.
 *
 * @param {string} ratioId
 * @param {(metric: string) => number|null} get
 * @param {(metric: string) => number|null} average
 * @returns {number|null}
 */
function reDerive(ratioId, get, average) {
  switch (ratioId) {
    case 'gross_margin':
      return div(get('gross_profit'), get('revenue_total'));
    case 'operating_margin':
      return div(get('operating_income'), get('revenue_total'));
    case 'net_margin':
      return div(get('net_income'), get('revenue_total'));
    case 'adjusted_ebitda_margin':
      return div(get('adjusted_ebitda'), get('revenue_total'));
    case 'effective_tax_rate': {
      const pretax = get('pretax_income');
      if (pretax === null || pretax <= 0) return null;
      return div(get('income_tax'), pretax);
    }
    case 'roe':
      return div(get('net_income'), average('total_stockholders_equity'));
    case 'roa':
      return div(get('net_income'), average('total_assets'));
    case 'current_ratio':
      return div(get('total_current_assets'), get('total_current_liabilities'));
    case 'quick_ratio':
      return div(
        add([get('cash_and_cash_equivalents'), get('short_term_investments'), get('accounts_receivable')]),
        get('total_current_liabilities'),
      );
    case 'cash_ratio':
      return div(
        add([get('cash_and_cash_equivalents'), get('short_term_investments')]),
        get('total_current_liabilities'),
      );
    case 'liabilities_to_equity':
      return div(get('total_liabilities'), get('total_stockholders_equity'));
    case 'liabilities_to_assets':
      return div(get('total_liabilities'), get('total_assets'));
    case 'equity_ratio':
      return div(get('total_stockholders_equity'), get('total_assets'));
    case 'asset_turnover':
      return div(get('revenue_total'), average('total_assets'));
    case 'dso': {
      const ratio = div(get('accounts_receivable'), get('revenue_total'));
      return ratio === null ? null : ratio * DAYS_IN_YEAR;
    }
    case 'dpo': {
      const ratio = div(get('accounts_payable'), get('cost_of_revenue'));
      return ratio === null ? null : ratio * DAYS_IN_YEAR;
    }
    case 'ocf_margin':
      return div(get('cash_from_operating_activities'), get('revenue_total'));
    case 'fcf_margin':
      return div(
        add([
          get('cash_from_operating_activities'),
          get('purchase_of_property_and_equipment'),
          get('capitalized_software_and_intangibles'),
        ]),
        get('revenue_total'),
      );
    case 'fcf_conversion': {
      const netIncome = get('net_income');
      if (netIncome === null || netIncome <= 0) return null;
      return div(
        add([
          get('cash_from_operating_activities'),
          get('purchase_of_property_and_equipment'),
          get('capitalized_software_and_intangibles'),
        ]),
        netIncome,
      );
    }
    case 'capex_intensity': {
      const capex = add([
        get('purchase_of_property_and_equipment'),
        get('capitalized_software_and_intangibles'),
      ]);
      return capex === null ? null : div(-capex, get('revenue_total'));
    }
    default:
      throw new Error(`reDerive has no independent derivation for ratio "${ratioId}"`);
  }
}

/**
 * Asserts two numbers agree to float slack, or that both are null.
 *
 * @param {number|null} actual
 * @param {number|null} expected
 * @param {string} label
 * @returns {void}
 */
function assertSameNumber(actual, expected, label) {
  if (expected === null) {
    assert.equal(actual, null, `${label}: expected a fail-closed null`);
    return;
  }
  assert.ok(actual !== null, `${label}: expected ${expected}, received null`);
  const slack = Math.abs(expected) * 1e-12 + 1e-12;
  assert.ok(
    Math.abs(actual - expected) <= slack,
    `${label}: expected ${expected}, received ${actual} (slack ${slack})`,
  );
}

/** The Director-approved published pins (RP10 spec §4), FY2021 and FY2025. */
const PUBLISHED_PINS = Object.freeze({
  gross_margin: Object.freeze(['72.4%', '72.2%']),
  operating_margin: Object.freeze(['-23.9%', '13.1%']),
  net_margin: Object.freeze(['-24.0%', '39.9%']),
  adjusted_ebitda_margin: Object.freeze(['-0.4%', '29.5%']),
  effective_tax_rate: Object.freeze([' - ', '-127.0%']),
  roe: Object.freeze(['-11.7%', '38.1%']),
  roa: Object.freeze(['-9.1%', '25.1%']),
  current_ratio: Object.freeze(['5.20x', '2.61x']),
  quick_ratio: Object.freeze(['4.93x', '2.36x']),
  cash_ratio: Object.freeze(['4.65x', '2.07x']),
  liabilities_to_equity: Object.freeze(['0.29x', '0.48x']),
  liabilities_to_assets: Object.freeze(['22.4%', '32.4%']),
  equity_ratio: Object.freeze(['77.6%', '67.6%']),
  asset_turnover: Object.freeze(['0.38x', '0.63x']),
  dso: Object.freeze(['48d', '57d']),
  dpo: Object.freeze(['41d', '10d']),
  ocf_margin: Object.freeze(['3.7%', '37.4%']),
  fcf_margin: Object.freeze(['1.2%', '34.7%']),
  fcf_conversion: Object.freeze([' - ', '87%']),
  capex_intensity: Object.freeze(['2.5%', '2.6%']),
});

describe('RP10.1 — Ratio catalogue freeze', () => {
  test('RATIO_DEFS is a frozen 20-entry catalogue with exactly the contracted shape', () => {
    assert.ok(Object.isFrozen(RATIO_DEFS), 'catalogue must be frozen');
    assert.equal(RATIO_DEFS.length, 20, 'the Director approved 20 ratios');
    assert.throws(() => {
      RATIO_DEFS.push({ id: 'extra' });
    }, TypeError);

    const contractedKeys = [
      'basis',
      'category',
      'decimals',
      'definition',
      'formula',
      'id',
      'kind',
      'label',
      'statement',
    ];
    for (const def of RATIO_DEFS) {
      assert.ok(Object.isFrozen(def), `${def.id} must be frozen`);
      assert.deepEqual(Object.keys(def).sort(), contractedKeys, `${def.id} shape`);
      assert.match(def.id, /^[a-z][a-z0-9_]*$/, `${def.id} id form`);
      assert.ok(['percent', 'multiple', 'days'].includes(def.kind), `${def.id} kind`);
      assert.ok(['income', 'balance', 'cashflow'].includes(def.statement), `${def.id} statement`);
      assert.ok(Number.isInteger(def.decimals) && def.decimals >= 0, `${def.id} decimals`);
      assert.ok(def.definition.length > 0 && def.formula.length > 0 && def.basis.length > 0);
      assert.ok(!def.definition.includes('—') && !def.basis.includes('—'), `${def.id} no em dashes`);
      assert.throws(() => {
        def.id = 'mutated';
      }, TypeError);
    }
  });

  test('ids are unique and RATIOS_BY_STATEMENT partitions them exactly', () => {
    const ids = RATIO_DEFS.map((d) => d.id);
    assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
    assert.ok(Object.isFrozen(RATIOS_BY_STATEMENT));
    const grouped = [
      ...RATIOS_BY_STATEMENT.income,
      ...RATIOS_BY_STATEMENT.balance,
      ...RATIOS_BY_STATEMENT.cashflow,
    ];
    assert.equal(grouped.length, ids.length, 'every ratio is filed under exactly one statement');
    assert.deepEqual([...grouped].sort(), [...ids].sort());
    for (const def of RATIO_DEFS) {
      assert.ok(
        RATIOS_BY_STATEMENT[def.statement].includes(def.id),
        `${def.id} must appear under ${def.statement}`,
      );
    }
  });

  test('statement split is 5 income / 11 balance / 4 cash flow (spec §3.B counts diverge)', () => {
    // RP10 spec §3.B summarises the split as `{ income: [...6], balance: [...10],
    // cashflow: [...4] }` while §4 attributes every ratio explicitly. §4 is the
    // catalogue the Director approved (5 + 11 + 4 = 20), so §4 governs and the
    // §3.B bracket counts are a summary defect. Pinned here so the divergence is
    // visible in the suite rather than buried in prose.
    assert.equal(RATIOS_BY_STATEMENT.income.length, 5);
    assert.equal(RATIOS_BY_STATEMENT.balance.length, 11);
    assert.equal(RATIOS_BY_STATEMENT.cashflow.length, 4);
  });

  test('every formula metric token is a real corpus metric', async () => {
    const index = corpusIndex(await getHistorical());
    for (const def of RATIO_DEFS) {
      const tokens = def.formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
      for (const token of tokens) {
        if (FORMULA_GRAMMAR_TOKENS.has(token)) continue;
        assert.ok(
          index.has(token),
          `${def.id}: formula names "${token}", which is not a corpus metric key`,
        );
      }
    }
  });

  test('quarterly capability matches the corpus klass of every formula metric', async () => {
    const index = corpusIndex(await getHistorical());
    for (const def of RATIO_DEFS) {
      const tokens = (def.formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []).filter(
        (token) => !FORMULA_GRAMMAR_TOKENS.has(token),
      );
      const allFlow = tokens.every((metric) => {
        const row = [...(index.get(metric)?.values() || [])][0];
        return row && row.klass === 'flow';
      });
      const expected = allFlow && def.id !== 'fcf_conversion';
      assert.equal(
        isRatioQuarterlyCapable(def.id),
        expected,
        `${def.id}: quarterly capability must follow the corpus klass of ${tokens.join(', ')}`,
      );
    }
  });
});

describe('RP10.1 — Independent corpus re-derivation', () => {
  test('all 20 ratios equal raw-corpus arithmetic in every annual column', async () => {
    const historical = await getHistorical();
    const index = corpusIndex(historical);
    const computed = computeHistoricalRatios(historical);

    for (const def of RATIO_DEFS) {
      for (const period of ANNUAL_COLUMNS) {
        const get = resolverFor(index, period, 'annual');
        const average = (metric) => averageBalance(index, metric, period);
        const expected = reDerive(def.id, get, average);
        assertSameNumber(computed.ratios[def.id].values[period], expected, `${def.id} ${period}`);
      }
    }
  });

  test('all 8 quarterly-capable ratios equal raw-corpus quarterly arithmetic', async () => {
    const historical = await getHistorical();
    const index = corpusIndex(historical);
    const computed = computeHistoricalRatios(historical);
    const capable = RATIO_DEFS.filter((def) => isRatioQuarterlyCapable(def.id));
    assert.equal(capable.length, 8, 'five profitability ratios plus three cash-flow ratios');

    for (const def of capable) {
      for (const period of RATIO_QUARTERLY_PERIODS) {
        const get = resolverFor(index, period, 'quarterly');
        const expected = reDerive(def.id, get, () => null);
        assertSameNumber(computed.ratios[def.id].values[period], expected, `${def.id} ${period}`);
      }
    }
  });

  test('Q4 FY2025 is derived by differencing, not filed as a discrete quarter', async () => {
    const index = corpusIndex(await getHistorical());
    // The derivation is only meaningful if the corpus really lacks a filed Q4.
    assert.equal(rawRow(index, 'revenue_total', 'Q4 FY2025'), null);
    assert.equal(rawRow(index, 'cash_from_operating_activities', 'Q4 FY2025'), null);
    const revenue = rawValue(index, 'revenue_total', 'FY2025') - ytdValue(index, 'revenue_total', '9M FY2025');
    const ocf = rawValue(index, 'cash_from_operating_activities', 'FY2025')
      - ytdValue(index, 'cash_from_operating_activities', '9M FY2025');
    assert.ok(revenue > 0 && ocf > 0, 'derived Q4 legs must be real');
    const computed = computeHistoricalRatios(await getHistorical());
    assertSameNumber(
      computed.ratios.ocf_margin.values['Q4 FY2025'],
      ocf / revenue,
      'ocf_margin Q4 FY2025',
    );
  });

  test('published pins reproduce exactly as formatted strings', async () => {
    const computed = computeHistoricalRatios(await getHistorical());
    for (const [id, [fy21, fy25]] of Object.entries(PUBLISHED_PINS)) {
      assert.equal(formatRatioById(id, computed.ratios[id].values.FY2021), fy21, `${id} FY2021 pin`);
      assert.equal(formatRatioById(id, computed.ratios[id].values.FY2025), fy25, `${id} FY2025 pin`);
    }
    assert.equal(Object.keys(PUBLISHED_PINS).length, 20, 'every ratio carries a published pin');
  });

  test('byPeriod mirrors ratios and every column is present and frozen', async () => {
    const computed = computeHistoricalRatios(await getHistorical());
    assert.deepEqual([...computed.periods], [...RATIO_PERIODS]);
    assert.deepEqual([...computed.annualPeriods], ANNUAL_COLUMNS);
    assert.deepEqual([...computed.quarterlyPeriods], [...RATIO_QUARTERLY_PERIODS]);
    for (const period of RATIO_PERIODS) {
      assert.ok(Object.isFrozen(computed.byPeriod[period]), `${period} frozen`);
      for (const def of RATIO_DEFS) {
        assert.equal(
          computed.byPeriod[period][def.id],
          computed.ratios[def.id].values[period],
          `${def.id} ${period} byPeriod mirror`,
        );
      }
    }
  });
});

describe('RP10.1 — Fail-closed policy with adjacent negative controls', () => {
  test('effective tax rate is NM exactly where pretax income is not positive', async () => {
    const index = corpusIndex(await getHistorical());
    const computed = computeHistoricalRatios(await getHistorical());
    for (const period of ANNUAL_COLUMNS) {
      const pretax = rawValue(index, 'pretax_income', period);
      const value = computed.ratios.effective_tax_rate.values[period];
      if (pretax <= 0) {
        assert.equal(value, null, `${period}: a loss has no tax rate (pretax ${pretax})`);
      } else {
        assert.ok(Number.isFinite(value), `${period}: pretax ${pretax} must produce a rate`);
      }
    }
    // Negative control: the corpus DOES carry an income-tax row for FY2021, so
    // the null is the NM guard firing, not an absent input.
    assert.ok(rawRow(index, 'income_tax', 'FY2021'));
    assert.ok(rawValue(index, 'income_tax', 'FY2021') !== null);
  });

  test('free cash flow conversion is NM exactly where net income is not positive', async () => {
    const index = corpusIndex(await getHistorical());
    const computed = computeHistoricalRatios(await getHistorical());
    for (const period of ANNUAL_COLUMNS) {
      const netIncome = rawValue(index, 'net_income', period);
      const value = computed.ratios.fcf_conversion.values[period];
      if (netIncome <= 0) assert.equal(value, null, `${period}: net income ${netIncome}`);
      else assert.ok(Number.isFinite(value), `${period}: net income ${netIncome}`);
    }
    // Negative control: every input of the ratio is present and positive-based
    // for FY2021, so the null comes from the NM guard.
    assert.ok(rawValue(index, 'cash_from_operating_activities', 'FY2021') !== null);
    assert.ok(rawValue(index, 'net_income', 'FY2021') < 0);
  });

  test('zero denominators fail closed to null instead of Infinity', () => {
    const synthetic = {
      income: [
        { metric: 'revenue_total', label: 'Revenue', klass: 'flow', period: 'FY2021', periodType: 'fiscal_year', value: 0 },
        { metric: 'gross_profit', label: 'Gross profit', klass: 'flow', period: 'FY2021', periodType: 'fiscal_year', value: 0 },
      ],
      balance: [],
      cashflow: [],
      kpis: [],
    };
    const computed = computeHistoricalRatios(synthetic);
    assert.equal(computed.ratios.gross_margin.values.FY2021, null, 'zero denominator is not a rate');
    assert.equal(computed.ratios.operating_margin.values.FY2021, null, 'absent numerator is null');
    assert.equal(computed.ratios.net_margin.values.FY2021, null, 'absent input is null');
  });

  test('short-term investments resolve to zero only where the corpus files no line', async () => {
    const index = corpusIndex(await getHistorical());
    const computed = computeHistoricalRatios(await getHistorical());
    // The substitution is only exercised because the corpus really omits the row.
    assert.equal(rawRow(index, 'short_term_investments', 'FY2021'), null);
    assert.equal(rawRow(index, 'short_term_investments', 'FY2023'), null);
    assert.ok(rawValue(index, 'short_term_investments', 'FY2025') > 0);

    const cash = rawValue(index, 'cash_and_cash_equivalents', 'FY2021');
    const receivables = rawValue(index, 'accounts_receivable', 'FY2021');
    const currentLiabilities = rawValue(index, 'total_current_liabilities', 'FY2021');
    assertSameNumber(
      computed.ratios.cash_ratio.values.FY2021,
      cash / currentLiabilities,
      'cash ratio FY2021 (no STI row)',
    );
    assertSameNumber(
      computed.ratios.quick_ratio.values.FY2021,
      (cash + receivables) / currentLiabilities,
      'quick ratio FY2021 (no STI row)',
    );

    // Negative control: an absent metric that is NOT on the zero list stays null
    // even though the other side of the division is present.
    const absentReceivables = computeHistoricalRatios({
      income: [
        { metric: 'revenue_total', label: 'Revenue', klass: 'flow', period: 'FY2021', periodType: 'fiscal_year', value: 100 },
      ],
      balance: [],
      cashflow: [],
      kpis: [],
    });
    assert.equal(
      absentReceivables.ratios.dso.values.FY2021,
      null,
      'absent receivables are null, never zero-substituted',
    );
    // And the same dataset WITH the row resolves, so the null above is the
    // fail-closed guard rather than a broken synthetic fixture.
    const presentReceivables = computeHistoricalRatios({
      income: [
        { metric: 'revenue_total', label: 'Revenue', klass: 'flow', period: 'FY2021', periodType: 'fiscal_year', value: 100 },
      ],
      balance: [
        { metric: 'accounts_receivable', label: 'AR', klass: 'stock', period: 'FY2021', periodType: 'fiscal_year', value: 10 },
      ],
      cashflow: [],
      kpis: [],
    });
    assertSameNumber(presentReceivables.ratios.dso.values.FY2021, 10 / 100 * DAYS_IN_YEAR, 'dso control');
  });

  test('average-balance ratios are live, and FY2021 falls back to year-end stock', async () => {
    const index = corpusIndex(await getHistorical());
    const computed = computeHistoricalRatios(await getHistorical());

    const equity21 = rawValue(index, 'total_stockholders_equity', 'FY2021');
    const equity25 = rawValue(index, 'total_stockholders_equity', 'FY2025');
    const equity24 = rawValue(index, 'total_stockholders_equity', 'FY2024');

    assertSameNumber(
      computed.ratios.roe.values.FY2021,
      rawValue(index, 'net_income', 'FY2021') / equity21,
      'roe FY2021 uses year-end equity',
    );
    assertSameNumber(
      computed.ratios.roe.values.FY2025,
      rawValue(index, 'net_income', 'FY2025') / ((equity25 + equity24) / 2),
      'roe FY2025 uses average equity',
    );
    // Negative control: the year-end-only basis would give a visibly different
    // number, so the average path is genuinely in force rather than a no-op.
    const yearEndOnly = rawValue(index, 'net_income', 'FY2025') / equity25;
    assert.ok(
      Math.abs(yearEndOnly - computed.ratios.roe.values.FY2025) > 1e-4,
      'average basis must differ from the year-end basis',
    );

    const assets21 = rawValue(index, 'total_assets', 'FY2021');
    assertSameNumber(
      computed.ratios.asset_turnover.values.FY2021,
      rawValue(index, 'revenue_total', 'FY2021') / assets21,
      'asset turnover FY2021 uses year-end assets',
    );
  });

  test('balance-line values never leak into a quarterly ratio column', async () => {
    const historical = await getHistorical();
    const index = corpusIndex(historical);
    const computed = computeHistoricalRatios(historical);

    // Negative control first: the corpus DOES publish a quarter-dated balance
    // row, so the all-null quarterly balance ratios prove the guard, not an
    // empty corpus.
    assert.equal(rawRow(index, 'total_assets', 'Q2 FY2026')?.periodType, 'quarter');
    assert.ok(rawValue(index, 'total_assets', 'Q2 FY2026') > 0);

    for (const def of RATIO_DEFS) {
      if (isRatioQuarterlyCapable(def.id)) continue;
      for (const period of RATIO_QUARTERLY_PERIODS) {
        assert.equal(
          computed.ratios[def.id].values[period],
          null,
          `${def.id} ${period} must be annual-only`,
        );
      }
    }
  });

  test('fcf_conversion stays annual-only although every input is quarterly-capable', async () => {
    const index = corpusIndex(await getHistorical());
    const computed = computeHistoricalRatios(await getHistorical());
    for (const metric of ['cash_from_operating_activities', 'purchase_of_property_and_equipment', 'net_income']) {
      assert.ok(deriveQuarter(index, metric, 'Q2 FY2026') !== null, `${metric} is derivable quarterly`);
    }
    assert.equal(computed.ratios.fcf_conversion.values['Q2 FY2026'], null, 'annual-only override holds');
  });
});

describe('RP10.1 — Formatting contract', () => {
  test('formatRatioValue renders the three unit families and the shared dash', () => {
    assert.equal(formatRatioValue(0.7223, 'percent', 1), '72.2%');
    assert.equal(formatRatioValue(-0.2392, 'percent', 1), '-23.9%');
    assert.equal(formatRatioValue(2.6066, 'multiple', 2), '2.61x');
    assert.equal(formatRatioValue(0.28896, 'multiple', 2), '0.29x');
    assert.equal(formatRatioValue(57.27, 'days', 0), '57d');
    for (const bad of [null, undefined, NaN, Infinity, -Infinity]) {
      assert.equal(formatRatioValue(bad, 'percent', 1), ' - ', `dash for ${String(bad)}`);
    }
  });

  test('formatRatioValue rejects an unknown kind with a typed error', () => {
    assert.throws(
      () => formatRatioValue(1, 'currency', 2),
      (err) => err instanceof EngineError && err.code === 'unknown_ratio_kind',
    );
  });

  test('formatRatioById rejects an unknown ratio id with a typed error', () => {
    assert.throws(
      () => formatRatioById('not_a_ratio', 1),
      (err) => err instanceof EngineError && err.code === 'unknown_ratio_id',
    );
    assert.throws(
      () => formatRatioChange('not_a_ratio', 1, 2),
      (err) => err instanceof EngineError && err.code === 'unknown_ratio_id',
    );
  });

  test('formatRatioChange speaks percentage points, multiples and days', async () => {
    const computed = computeHistoricalRatios(await getHistorical());
    const change = (id) =>
      formatRatioChange(id, computed.ratios[id].values.FY2021, computed.ratios[id].values.FY2025);
    assert.equal(change('gross_margin'), '-0.2 pp');
    assert.equal(change('current_ratio'), '-2.59x');
    assert.equal(change('dso'), '+9d');
    assert.equal(change('ocf_margin'), '+33.7 pp');
    assert.equal(formatRatioChange('dso', null, 10), ' - ');
    assert.equal(formatRatioChange('dso', 10, null), ' - ');
    assert.equal(formatRatioChange('dso', 10, 10), '0d');
    assert.equal(formatRatioChange('gross_margin', 0.5, 0.5), '0 pp');
  });

  test('every ratio has a formattable FY2021-to-FY2025 change or an explicit dash', async () => {
    const computed = computeHistoricalRatios(await getHistorical());
    for (const def of RATIO_DEFS) {
      const text = formatRatioChange(
        def.id,
        computed.ratios[def.id].values.FY2021,
        computed.ratios[def.id].values.FY2025,
      );
      assert.ok(typeof text === 'string' && text.length > 0, `${def.id} change text`);
      assert.ok(!text.includes('NaN') && !text.includes('undefined'), `${def.id} change text is clean`);
    }
  });
});

describe('RP10.1 — Determinism, immutability, purity and static gates', () => {
  test('repeated computation is byte-identical and deeply frozen', async () => {
    const historical = await getHistorical();
    const first = computeHistoricalRatios(historical);
    const second = computeHistoricalRatios(historical);
    assert.equal(JSON.stringify(first), JSON.stringify(second), 'deterministic output');
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.ratios));
    assert.ok(Object.isFrozen(first.byPeriod));
    for (const def of RATIO_DEFS) {
      assert.ok(Object.isFrozen(first.ratios[def.id]));
      assert.ok(Object.isFrozen(first.ratios[def.id].values));
      assert.throws(() => {
        first.ratios[def.id].values.FY2021 = 0;
      }, TypeError);
    }
  });

  test('the module is pure: no DOM, no fetch, no clock, no RNG, no node builtins', () => {
    const source = fs.readFileSync(RATIOS_PATH, 'utf8');
    assert.doesNotMatch(source, /\bwindow\b/);
    assert.doesNotMatch(source, /\bdocument\b/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /\bDate\.now\s*\(/);
    assert.doesNotMatch(source, /\bMath\.random\s*\(/);
    assert.doesNotMatch(source, /\blocalStorage\b/);
    assert.doesNotMatch(source, /from\s+['"]node:/);
  });

  test('the module respects the layer boundary (data + engine only)', () => {
    const source = fs.readFileSync(RATIOS_PATH, 'utf8');
    const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.ok(specifiers.length > 0, 'the module must import its inputs explicitly');
    for (const specifier of specifiers) {
      assert.ok(
        specifier.startsWith('../data/') || specifier.startsWith('./'),
        `unexpected import "${specifier}" escapes the engine layer`,
      );
      assert.ok(!specifier.includes('/ui/') && !specifier.includes('/app'), `"${specifier}" crosses upward`);
    }
  });

  test('zero bare numeric literals > 999 outside comments (raw and normalized scans)', () => {
    const source = fs.readFileSync(RATIOS_PATH, 'utf8');
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    const raw = [...withoutComments.matchAll(/(?<![a-zA-Z0-9_$])([1-9][0-9]{3,})(?![a-zA-Z0-9_$])/g)].map((m) => m[1]);
    assert.deepEqual(raw, [], `raw scan found: ${raw.join(', ')}`);

    const normalized = withoutComments.replace(/['"`]/g, '').replace(/,/g, '');
    const stripped = [...normalized.matchAll(/(?<![a-zA-Z0-9_$.])([1-9][0-9]{3,})(?![a-zA-Z0-9_$.%])/g)].map((m) => m[1]);
    assert.deepEqual(stripped, [], `normalized scan found: ${stripped.join(', ')}`);

    assert.doesNotMatch(withoutComments, /\?\?\s*[\d.]/, 'no numeric nullish fallbacks');
  });

  test('every catalogue ratio carries a distinct published pin and a live derivation', async () => {
    const computed = computeHistoricalRatios(await getHistorical());
    for (const def of RATIO_DEFS) {
      assert.ok(PUBLISHED_PINS[def.id], `${def.id} has no published pin`);
      const values = computed.ratios[def.id].values;
      const populated = ANNUAL_COLUMNS.filter((period) => values[period] !== null);
      assert.ok(populated.length >= 3, `${def.id} must resolve in most annual columns`);
    }
  });
});
