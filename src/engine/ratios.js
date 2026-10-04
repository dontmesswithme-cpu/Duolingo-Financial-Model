/**
 * Historical Ratio Engine (Redesign Phase 10, Task RP10.1).
 *
 * Computes the 20 Director-approved historical ratios across FY2021-FY2025 and
 * the derivable discrete quarters, from cited corpus rows only. No filed figure
 * is ever a literal in this module: every value is a division of two corpus
 * lines resolved through `extractRows`, and a missing or zero denominator fails
 * closed to `null` (rendered as the shared dash by the UI layer).
 *
 * Resolution policy (binding, per the RP10.1 artifact contract):
 *  - `short_term_investments` resolves to zero where the corpus files no such
 *    line (the all-cash years before FY2024). This is the only zero-substitution
 *    in the catalogue and it is declared per ratio in `basis`.
 *  - Every other absent input resolves to `null`, and a ratio with any `null`
 *    input is itself `null`.
 *  - Average-balance ratios (ROE, ROA, asset turnover) divide by the mean of the
 *    current and prior year-end balance. The earliest annual column has no prior
 *    year in the corpus and falls back to the year-end stock, declared in `basis`.
 *  - Quarterly columns exist only for ratios whose every input is a `flow`
 *    metric; balance-sheet ratios are annual-only. `fcf_conversion` is
 *    additionally annual-only per the Director-approved grouping.
 *  - Not-meaningful (`NM`) cases are `null`, never a fabricated number:
 *    `effective_tax_rate` when pretax income is not positive, `fcf_conversion`
 *    when net income is not positive.
 *
 * PURE MODULE: deterministic pure functions, zero side effects (no DOM, no
 * network, no clock reads, no RNG, no node builtins).
 *
 * @module engine/ratios
 */

import { EngineError } from '../data/errors.js';
import { extractRows } from '../data/schema.js';
import { DAYS_IN_YEAR } from '../data/constants.js';
import { deriveDiscreteQuarters } from './ttm.js';

/**
 * Annual columns of the ratio matrix (FY2021-FY2025 actuals).
 * @type {ReadonlyArray<string>}
 */
export const RATIO_ANNUAL_PERIODS = Object.freeze([
  'FY2021',
  'FY2022',
  'FY2023',
  'FY2024',
  'FY2025',
]);

/**
 * Discrete quarterly columns of the ratio matrix (the trailing-twelve-month
 * quarters).
 * @type {ReadonlyArray<string>}
 */
export const RATIO_QUARTERLY_PERIODS = Object.freeze([
  'Q3 FY2025',
  'Q4 FY2025',
  'Q1 FY2026',
  'Q2 FY2026',
]);

/**
 * Every ratio column, annual first then quarterly.
 * @type {ReadonlyArray<string>}
 */
export const RATIO_PERIODS = Object.freeze([
  ...RATIO_ANNUAL_PERIODS,
  ...RATIO_QUARTERLY_PERIODS,
]);

/**
 * The balance-sheet (stock) metric keys the catalogue may read. A metric outside
 * this set is a flow line and therefore carries quarterly columns. The corpus
 * `klass` of every key here is cross-checked against this classification by
 * `tests/ratios.test.js`, so the two cannot drift silently.
 * @type {ReadonlySet<string>}
 */
const BALANCE_METRICS = Object.freeze(
  new Set([
    'total_assets',
    'total_current_assets',
    'total_current_liabilities',
    'total_liabilities',
    'total_stockholders_equity',
    'cash_and_cash_equivalents',
    'short_term_investments',
    'accounts_receivable',
    'accounts_payable',
  ]),
);

/**
 * The only metric permitted to resolve as zero when the corpus files no row.
 * @type {ReadonlySet<string>}
 */
const ZERO_WHEN_ABSENT = Object.freeze(new Set(['short_term_investments']));

/**
 * Ratios the Director grouping keeps annual-only even though every input is a
 * flow line (the quarterly net-income base is too small for the ratio to read).
 * @type {ReadonlySet<string>}
 */
const ANNUAL_ONLY_RATIOS = Object.freeze(new Set(['fcf_conversion']));

/**
 * @param {string} metric
 * @returns {boolean} True when the metric is a flow line.
 */
function isFlowMetric(metric) {
  return !BALANCE_METRICS.has(metric);
}

/**
 * @typedef {object} RatioDef
 * @property {string} id Stable ratio key (e.g. `gross_margin`).
 * @property {string} label Display label.
 * @property {string} category Catalogue group (Profitability, Returns, ...).
 * @property {'percent'|'multiple'|'days'} kind Display unit family.
 * @property {number} decimals Display precision for this ratio.
 * @property {'income'|'balance'|'cashflow'} statement Owning statement footer.
 * @property {string} definition Plain-language definition (user-visible).
 * @property {string} formula The division the ratio performs, in metric keys.
 * @property {string} basis Resolution basis notes (user-visible).
 */

/**
 * @typedef {object} RatioSeries
 * @property {RatioDef} def The frozen definition.
 * @property {Readonly<Record<string, number|null>>} values Value per column.
 */

/**
 * @typedef {object} HistoricalRatios
 * @property {ReadonlyArray<string>} periods All columns, annual then quarterly.
 * @property {ReadonlyArray<string>} annualPeriods Annual columns only.
 * @property {ReadonlyArray<string>} quarterlyPeriods Quarterly columns only.
 * @property {Readonly<Record<string, RatioSeries>>} ratios Ratio keyed series.
 * @property {Readonly<Record<string, Readonly<Record<string, number|null>>>>} byPeriod
 *   Column keyed map of every ratio value.
 */

/**
 * Divides two resolved inputs, failing closed to `null` when either side is not
 * a finite number or the denominator is exactly zero.
 *
 * @param {number|null} numerator
 * @param {number|null} denominator
 * @returns {number|null}
 */
function divide(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}

/**
 * Sums resolved inputs, failing closed to `null` when any term is not finite.
 *
 * @param {Array<number|null>} terms
 * @returns {number|null}
 */
function sumOf(terms) {
  let total = 0;
  for (const term of terms) {
    if (!Number.isFinite(term)) return null;
    total += term;
  }
  return total;
}

/**
 * Free cash flow from the two capex lines, carried as filed (negative outflows).
 *
 * @param {{ get: (metric: string) => number|null }} ctx
 * @returns {number|null}
 */
function freeCashFlow(ctx) {
  return sumOf([
    ctx.get('cash_from_operating_activities'),
    ctx.get('purchase_of_property_and_equipment'),
    ctx.get('capitalized_software_and_intangibles'),
  ]);
}

/**
 * The internal catalogue. `RATIO_DEFS` is projected from this list, so the
 * published shape and the executable definition can never drift apart.
 *
 * `inputs` names every corpus metric the computation reads; it drives the
 * quarterly-capability rule. `compute` receives a resolver bound to the column
 * class (annual or quarterly).
 *
 * @type {ReadonlyArray<object>}
 */
const CATALOGUE = Object.freeze([
  Object.freeze({
    id: 'gross_margin',
    label: 'Gross Margin',
    category: 'Profitability',
    kind: 'percent',
    decimals: 1,
    statement: 'income',
    definition: 'Gross profit as a percentage of total revenue.',
    formula: 'gross_profit / revenue_total',
    basis: 'Reported flow lines. Quarterly columns are filed discrete quarters and derived by year-to-date differencing.',
    inputs: Object.freeze(['gross_profit', 'revenue_total']),
    compute: (ctx) => divide(ctx.get('gross_profit'), ctx.get('revenue_total')),
  }),
  Object.freeze({
    id: 'operating_margin',
    label: 'Operating Margin',
    category: 'Profitability',
    kind: 'percent',
    decimals: 1,
    statement: 'income',
    definition: 'Operating income as a percentage of total revenue.',
    formula: 'operating_income / revenue_total',
    basis: 'Reported flow lines. Quarterly columns are filed discrete quarters and derived by year-to-date differencing.',
    inputs: Object.freeze(['operating_income', 'revenue_total']),
    compute: (ctx) => divide(ctx.get('operating_income'), ctx.get('revenue_total')),
  }),
  Object.freeze({
    id: 'net_margin',
    label: 'Net Margin',
    category: 'Profitability',
    kind: 'percent',
    decimals: 1,
    statement: 'income',
    definition: 'Net income as a percentage of total revenue.',
    formula: 'net_income / revenue_total',
    basis: 'Reported flow lines. Quarterly columns are filed discrete quarters and derived by year-to-date differencing.',
    inputs: Object.freeze(['net_income', 'revenue_total']),
    compute: (ctx) => divide(ctx.get('net_income'), ctx.get('revenue_total')),
  }),
  Object.freeze({
    id: 'adjusted_ebitda_margin',
    label: 'Adjusted EBITDA Margin',
    category: 'Profitability',
    kind: 'percent',
    decimals: 1,
    statement: 'income',
    definition: 'Adjusted EBITDA as a percentage of total revenue.',
    formula: 'adjusted_ebitda / revenue_total',
    basis: 'Adjusted EBITDA is a cited company KPI flow line; revenue is the income statement total.',
    inputs: Object.freeze(['adjusted_ebitda', 'revenue_total']),
    compute: (ctx) => divide(ctx.get('adjusted_ebitda'), ctx.get('revenue_total')),
  }),
  Object.freeze({
    id: 'effective_tax_rate',
    label: 'Effective Tax Rate',
    category: 'Profitability',
    kind: 'percent',
    decimals: 1,
    statement: 'income',
    definition: 'Income tax expense as a percentage of pretax income. Not meaningful when pretax income is not positive.',
    formula: 'income_tax / pretax_income',
    basis: 'Not meaningful (dash) whenever pretax income is zero or negative: the sign of a tax benefit on a loss has no rate interpretation.',
    inputs: Object.freeze(['income_tax', 'pretax_income']),
    compute: (ctx) => {
      const pretax = ctx.get('pretax_income');
      if (!Number.isFinite(pretax) || pretax <= 0) return null;
      return divide(ctx.get('income_tax'), pretax);
    },
  }),
  Object.freeze({
    id: 'roe',
    label: 'Return on Equity',
    category: 'Returns',
    kind: 'percent',
    decimals: 1,
    statement: 'balance',
    definition: 'Net income as a percentage of average stockholders equity.',
    formula: 'net_income / avg(total_stockholders_equity)',
    basis: 'Average-balance basis: mean of current and prior year-end equity. FY2021 has no prior year in the corpus and uses year-end equity. Annual only.',
    inputs: Object.freeze(['net_income', 'total_stockholders_equity']),
    compute: (ctx) => divide(ctx.get('net_income'), ctx.average('total_stockholders_equity')),
  }),
  Object.freeze({
    id: 'roa',
    label: 'Return on Assets',
    category: 'Returns',
    kind: 'percent',
    decimals: 1,
    statement: 'balance',
    definition: 'Net income as a percentage of average total assets.',
    formula: 'net_income / avg(total_assets)',
    basis: 'Average-balance basis: mean of current and prior year-end assets. FY2021 has no prior year in the corpus and uses year-end assets. Annual only.',
    inputs: Object.freeze(['net_income', 'total_assets']),
    compute: (ctx) => divide(ctx.get('net_income'), ctx.average('total_assets')),
  }),
  Object.freeze({
    id: 'current_ratio',
    label: 'Current Ratio',
    category: 'Liquidity',
    kind: 'multiple',
    decimals: 2,
    statement: 'balance',
    definition: 'Current assets over current liabilities.',
    formula: 'total_current_assets / total_current_liabilities',
    basis: 'Year-end balance lines only, so the column set is annual.',
    inputs: Object.freeze(['total_current_assets', 'total_current_liabilities']),
    compute: (ctx) => divide(ctx.get('total_current_assets'), ctx.get('total_current_liabilities')),
  }),
  Object.freeze({
    id: 'quick_ratio',
    label: 'Quick Ratio',
    category: 'Liquidity',
    kind: 'multiple',
    decimals: 2,
    statement: 'balance',
    definition: 'Cash, short-term investments and receivables over current liabilities.',
    formula: '(cash_and_cash_equivalents + short_term_investments + accounts_receivable) / total_current_liabilities',
    basis: 'Short-term investments resolve to zero in periods where the corpus files no such line (the all-cash years before FY2024). Year-end balance lines only, so the column set is annual.',
    inputs: Object.freeze([
      'cash_and_cash_equivalents',
      'short_term_investments',
      'accounts_receivable',
      'total_current_liabilities',
    ]),
    compute: (ctx) => divide(
      sumOf([
        ctx.get('cash_and_cash_equivalents'),
        ctx.get('short_term_investments'),
        ctx.get('accounts_receivable'),
      ]),
      ctx.get('total_current_liabilities'),
    ),
  }),
  Object.freeze({
    id: 'cash_ratio',
    label: 'Cash Ratio',
    category: 'Liquidity',
    kind: 'multiple',
    decimals: 2,
    statement: 'balance',
    definition: 'Cash and short-term investments over current liabilities.',
    formula: '(cash_and_cash_equivalents + short_term_investments) / total_current_liabilities',
    basis: 'Short-term investments resolve to zero in periods where the corpus files no such line (the all-cash years before FY2024). Year-end balance lines only, so the column set is annual.',
    inputs: Object.freeze([
      'cash_and_cash_equivalents',
      'short_term_investments',
      'total_current_liabilities',
    ]),
    compute: (ctx) => divide(
      sumOf([ctx.get('cash_and_cash_equivalents'), ctx.get('short_term_investments')]),
      ctx.get('total_current_liabilities'),
    ),
  }),
  Object.freeze({
    id: 'liabilities_to_equity',
    label: 'Liabilities to Equity',
    category: 'Leverage',
    kind: 'multiple',
    decimals: 2,
    statement: 'balance',
    definition: 'Total liabilities over total stockholders equity.',
    formula: 'total_liabilities / total_stockholders_equity',
    basis: 'Duolingo carries no funded debt; the numerator is operating liabilities as filed. Year-end balance lines only, so the column set is annual.',
    inputs: Object.freeze(['total_liabilities', 'total_stockholders_equity']),
    compute: (ctx) => divide(ctx.get('total_liabilities'), ctx.get('total_stockholders_equity')),
  }),
  Object.freeze({
    id: 'liabilities_to_assets',
    label: 'Liabilities to Assets',
    category: 'Leverage',
    kind: 'percent',
    decimals: 1,
    statement: 'balance',
    definition: 'Total liabilities as a percentage of total assets.',
    formula: 'total_liabilities / total_assets',
    basis: 'Duolingo carries no funded debt; the numerator is operating liabilities as filed. Year-end balance lines only, so the column set is annual.',
    inputs: Object.freeze(['total_liabilities', 'total_assets']),
    compute: (ctx) => divide(ctx.get('total_liabilities'), ctx.get('total_assets')),
  }),
  Object.freeze({
    id: 'equity_ratio',
    label: 'Equity Ratio',
    category: 'Leverage',
    kind: 'percent',
    decimals: 1,
    statement: 'balance',
    definition: 'Total stockholders equity as a percentage of total assets.',
    formula: 'total_stockholders_equity / total_assets',
    basis: 'Year-end balance lines only, so the column set is annual.',
    inputs: Object.freeze(['total_stockholders_equity', 'total_assets']),
    compute: (ctx) => divide(ctx.get('total_stockholders_equity'), ctx.get('total_assets')),
  }),
  Object.freeze({
    id: 'asset_turnover',
    label: 'Asset Turnover',
    category: 'Efficiency',
    kind: 'multiple',
    decimals: 2,
    statement: 'balance',
    definition: 'Total revenue over average total assets.',
    formula: 'revenue_total / avg(total_assets)',
    basis: 'Average-balance basis: mean of current and prior year-end assets. FY2021 has no prior year in the corpus and uses year-end assets. Annual only.',
    inputs: Object.freeze(['revenue_total', 'total_assets']),
    compute: (ctx) => divide(ctx.get('revenue_total'), ctx.average('total_assets')),
  }),
  Object.freeze({
    id: 'dso',
    label: 'Days Sales Outstanding',
    category: 'Efficiency',
    kind: 'days',
    decimals: 0,
    statement: 'balance',
    definition: 'Days sales outstanding: receivables over revenue, scaled to a calendar year.',
    formula: 'accounts_receivable / revenue_total * DAYS_IN_YEAR',
    basis: 'Divides a year-end balance by an annual flow, so the column set is annual. Uses the shared DAYS_IN_YEAR constant.',
    inputs: Object.freeze(['accounts_receivable', 'revenue_total']),
    compute: (ctx) => {
      const ratio = divide(ctx.get('accounts_receivable'), ctx.get('revenue_total'));
      return ratio === null ? null : ratio * DAYS_IN_YEAR;
    },
  }),
  Object.freeze({
    id: 'dpo',
    label: 'Days Payable Outstanding',
    category: 'Efficiency',
    kind: 'days',
    decimals: 0,
    statement: 'balance',
    definition: 'Days payable outstanding: payables over cost of revenue, scaled to a calendar year.',
    formula: 'accounts_payable / cost_of_revenue * DAYS_IN_YEAR',
    basis: 'Divides a year-end balance by an annual flow, so the column set is annual. Uses the shared DAYS_IN_YEAR constant.',
    inputs: Object.freeze(['accounts_payable', 'cost_of_revenue']),
    compute: (ctx) => {
      const ratio = divide(ctx.get('accounts_payable'), ctx.get('cost_of_revenue'));
      return ratio === null ? null : ratio * DAYS_IN_YEAR;
    },
  }),
  Object.freeze({
    id: 'ocf_margin',
    label: 'Operating Cash Flow Margin',
    category: 'Cash Flow',
    kind: 'percent',
    decimals: 1,
    statement: 'cashflow',
    definition: 'Cash from operating activities as a percentage of total revenue.',
    formula: 'cash_from_operating_activities / revenue_total',
    basis: 'Reported flow lines. Quarterly columns are filed discrete quarters and derived by year-to-date differencing.',
    inputs: Object.freeze(['cash_from_operating_activities', 'revenue_total']),
    compute: (ctx) => divide(ctx.get('cash_from_operating_activities'), ctx.get('revenue_total')),
  }),
  Object.freeze({
    id: 'fcf_margin',
    label: 'Free Cash Flow Margin',
    category: 'Cash Flow',
    kind: 'percent',
    decimals: 1,
    statement: 'cashflow',
    definition: 'Free cash flow as a percentage of total revenue.',
    formula: '(cash_from_operating_activities + purchase_of_property_and_equipment + capitalized_software_and_intangibles) / revenue_total',
    basis: 'Both capex lines are carried as filed (negative outflows) and added to operating cash flow. Quarterly columns are derived by year-to-date differencing.',
    inputs: Object.freeze([
      'cash_from_operating_activities',
      'purchase_of_property_and_equipment',
      'capitalized_software_and_intangibles',
      'revenue_total',
    ]),
    compute: (ctx) => divide(freeCashFlow(ctx), ctx.get('revenue_total')),
  }),
  Object.freeze({
    id: 'fcf_conversion',
    label: 'Free Cash Flow Conversion',
    category: 'Cash Flow',
    kind: 'percent',
    decimals: 0,
    statement: 'cashflow',
    definition: 'Free cash flow as a percentage of net income. Not meaningful when net income is not positive.',
    formula: '(cash_from_operating_activities + purchase_of_property_and_equipment + capitalized_software_and_intangibles) / net_income',
    basis: 'Annual only per the Director-approved grouping. Not meaningful (dash) whenever net income is zero or negative: a loss has no conversion interpretation.',
    inputs: Object.freeze([
      'cash_from_operating_activities',
      'purchase_of_property_and_equipment',
      'capitalized_software_and_intangibles',
      'net_income',
    ]),
    compute: (ctx) => {
      const netIncome = ctx.get('net_income');
      if (!Number.isFinite(netIncome) || netIncome <= 0) return null;
      return divide(freeCashFlow(ctx), netIncome);
    },
  }),
  Object.freeze({
    id: 'capex_intensity',
    label: 'Capex Intensity',
    category: 'Cash Flow',
    kind: 'percent',
    decimals: 1,
    statement: 'cashflow',
    definition: 'Capital expenditure as a percentage of total revenue.',
    formula: '-(purchase_of_property_and_equipment + capitalized_software_and_intangibles) / revenue_total',
    basis: 'Both capex lines are carried as filed (negative outflows); the ratio negates the sum so intensity reads positive. Quarterly columns are derived by year-to-date differencing.',
    inputs: Object.freeze([
      'purchase_of_property_and_equipment',
      'capitalized_software_and_intangibles',
      'revenue_total',
    ]),
    compute: (ctx) => {
      const capex = sumOf([
        ctx.get('purchase_of_property_and_equipment'),
        ctx.get('capitalized_software_and_intangibles'),
      ]);
      if (!Number.isFinite(capex)) return null;
      return divide(-capex, ctx.get('revenue_total'));
    },
  }),
]);

/**
 * The frozen ratio catalogue: 20 entries, each `{ id, label, category, kind,
 * decimals, statement, definition, formula, basis }`.
 * @type {ReadonlyArray<RatioDef>}
 */
export const RATIO_DEFS = Object.freeze(
  CATALOGUE.map((entry) =>
    Object.freeze({
      id: entry.id,
      label: entry.label,
      category: entry.category,
      kind: entry.kind,
      decimals: entry.decimals,
      statement: entry.statement,
      definition: entry.definition,
      formula: entry.formula,
      basis: entry.basis,
    }),
  ),
);

/**
 * Ratio ids grouped by the statement whose footer carries them.
 * @type {Readonly<{ income: ReadonlyArray<string>, balance: ReadonlyArray<string>, cashflow: ReadonlyArray<string> }>}
 */
export const RATIOS_BY_STATEMENT = Object.freeze({
  income: Object.freeze(CATALOGUE.filter((e) => e.statement === 'income').map((e) => e.id)),
  balance: Object.freeze(CATALOGUE.filter((e) => e.statement === 'balance').map((e) => e.id)),
  cashflow: Object.freeze(CATALOGUE.filter((e) => e.statement === 'cashflow').map((e) => e.id)),
});

/**
 * Ratio definitions keyed by id.
 * @type {Readonly<Record<string, RatioDef>>}
 */
const DEFS_BY_ID = Object.freeze(
  Object.fromEntries(RATIO_DEFS.map((def) => [def.id, def])),
);

/**
 * @param {object} entry A catalogue entry.
 * @returns {boolean} True when the ratio has a quarterly column set.
 */
function hasQuarterlyColumns(entry) {
  if (ANNUAL_ONLY_RATIOS.has(entry.id)) return false;
  return entry.inputs.every(isFlowMetric);
}

/**
 * Reports whether a ratio has a quarterly column set: every input is a flow
 * metric and the Director grouping does not hold it annual-only.
 *
 * @param {string} ratioId
 * @returns {boolean}
 */
export function isRatioQuarterlyCapable(ratioId) {
  const entry = CATALOGUE.find((candidate) => candidate.id === ratioId);
  if (!entry) return false;
  return hasQuarterlyColumns(entry);
}

/**
 * @param {object} historical The loaded historical dataset.
 * @returns {{ annualIndex: Map<string, Map<string, number>>, quarterlyIndex: Map<string, Map<string, number>> }}
 */
function buildIndex(historical) {
  const annualIndex = new Map();
  const quarterlyIndex = new Map();

  /** @type {ReadonlyArray<ReadonlyArray<object>>} */
  const datasets = [
    extractRows(historical?.income) || [],
    extractRows(historical?.balance) || [],
    extractRows(historical?.cashflow) || [],
    extractRows(historical?.kpis) || [],
  ];

  for (const rows of datasets) {
    for (const row of rows) {
      if (!row || typeof row.metric !== 'string' || row.metric === '') continue;
      if (row.periodType !== 'fiscal_year') continue;
      if (!Number.isFinite(row.value)) continue;
      if (!annualIndex.has(row.metric)) annualIndex.set(row.metric, new Map());
      annualIndex.get(row.metric).set(row.period, row.value);
    }
  }

  // Quarterly columns exist only for flow metrics: a balance-sheet row filed on
  // a quarter date is a point-in-time reading, not a period flow, and must never
  // leak into a quarterly ratio.
  for (const rows of datasets) {
    const metrics = new Set(
      rows
        .filter((r) => r && typeof r.metric === 'string' && r.metric !== '')
        .map((r) => r.metric),
    );
    for (const metric of metrics) {
      if (!isFlowMetric(metric)) continue;
      if (quarterlyIndex.has(metric)) continue;
      const derived = deriveDiscreteQuarters(rows, metric);
      const series = new Map();
      derived.forEach((entry, period) => {
        if (Number.isFinite(entry.value)) series.set(period, entry.value);
      });
      if (series.size > 0) quarterlyIndex.set(metric, series);
    }
  }

  return { annualIndex, quarterlyIndex };
}

/**
 * Reads one resolved input for a column, applying the declared zero-substitution
 * and failing closed to `null` for every other absent metric.
 *
 * @param {Map<string, Map<string, number>>} index
 * @param {string} metric
 * @param {string} period
 * @returns {number|null}
 */
function readInput(index, metric, period) {
  const series = index.get(metric);
  const value = series ? series.get(period) : undefined;
  if (Number.isFinite(value)) return value;
  if (ZERO_WHEN_ABSENT.has(metric)) return 0;
  return null;
}

/**
 * Builds the resolver handed to each ratio computation for one column class.
 *
 * @param {Map<string, Map<string, number>>} index
 * @param {Map<string, Map<string, number>>} annualIndex
 * @param {boolean} annualMode
 * @returns {{ get: (metric: string) => number|null, average: (metric: string) => number|null, setPeriod: (period: string) => void }}
 */
function buildResolver(index, annualIndex, annualMode) {
  /** @type {string} */
  let period = '';
  return {
    /**
     * @param {string} metric
     * @returns {number|null}
     */
    get(metric) {
      return readInput(index, metric, period);
    },
    /**
     * Mean of the current and prior year-end balance. Annual columns only: the
     * earliest year has no prior year in the corpus and uses the year-end stock.
     *
     * @param {string} metric
     * @returns {number|null}
     */
    average(metric) {
      if (!annualMode) return null;
      const current = readInput(annualIndex, metric, period);
      if (!Number.isFinite(current)) return null;
      const idx = RATIO_ANNUAL_PERIODS.indexOf(period);
      if (idx <= 0) return current;
      const prior = readInput(annualIndex, metric, RATIO_ANNUAL_PERIODS[idx - 1]);
      if (!Number.isFinite(prior)) return current;
      return (current + prior) / 2;
    },
    /**
     * Binds the resolver to a column before each computation.
     * @param {string} nextPeriod
     * @returns {void}
     */
    setPeriod(nextPeriod) {
      period = nextPeriod;
    },
  };
}

/**
 * Computes the 20 historical ratios for every column.
 *
 * @param {object} historical Loaded historical dataset `{ income, balance, cashflow, kpis }`.
 * @returns {HistoricalRatios} Deeply frozen ratio matrix.
 */
export function computeHistoricalRatios(historical) {
  const { annualIndex, quarterlyIndex } = buildIndex(historical);

  /** @type {Record<string, { def: RatioDef, values: Record<string, number|null> }>} */
  const ratios = {};
  /** @type {Record<string, Record<string, number|null>>} */
  const byPeriod = {};
  for (const period of RATIO_PERIODS) byPeriod[period] = {};

  const annualResolver = buildResolver(annualIndex, annualIndex, true);
  const quarterlyResolver = buildResolver(quarterlyIndex, annualIndex, false);

  for (const entry of CATALOGUE) {
    const capable = hasQuarterlyColumns(entry);
    const values = {};

    for (const period of RATIO_ANNUAL_PERIODS) {
      annualResolver.setPeriod(period);
      const value = entry.compute(annualResolver);
      values[period] = Number.isFinite(value) ? value : null;
    }

    for (const period of RATIO_QUARTERLY_PERIODS) {
      let value = null;
      if (capable) {
        quarterlyResolver.setPeriod(period);
        const computed = entry.compute(quarterlyResolver);
        value = Number.isFinite(computed) ? computed : null;
      }
      values[period] = value;
    }

    const frozenValues = Object.freeze(values);
    ratios[entry.id] = Object.freeze({
      def: DEFS_BY_ID[entry.id],
      values: frozenValues,
    });

    for (const period of RATIO_PERIODS) {
      byPeriod[period][entry.id] = frozenValues[period];
    }
  }

  for (const period of RATIO_PERIODS) {
    byPeriod[period] = Object.freeze(byPeriod[period]);
  }

  return Object.freeze({
    periods: RATIO_PERIODS,
    annualPeriods: RATIO_ANNUAL_PERIODS,
    quarterlyPeriods: RATIO_QUARTERLY_PERIODS,
    ratios: Object.freeze(ratios),
    byPeriod: Object.freeze(byPeriod),
  });
}

/**
 * Formats a ratio value for display. Non-finite input fails closed to the shared
 * dash, so a `null` ratio and an absent ratio render identically.
 *
 * @param {number|null|undefined} value
 * @param {'percent'|'multiple'|'days'} kind
 * @param {number} decimals
 * @returns {string}
 */
export function formatRatioValue(value, kind, decimals) {
  if (value === null || value === undefined || !Number.isFinite(value)) return ' - ';
  const precision = Number.isFinite(decimals) ? decimals : 0;
  if (kind === 'percent') {
    const pct = value * 100;
    const abs = Math.abs(pct).toFixed(precision);
    return pct < 0 ? `-${abs}%` : `${abs}%`;
  }
  if (kind === 'multiple') {
    const abs = Math.abs(value).toFixed(precision);
    return value < 0 ? `-${abs}x` : `${abs}x`;
  }
  if (kind === 'days') {
    const abs = Math.abs(value).toFixed(precision);
    return value < 0 ? `-${abs}d` : `${abs}d`;
  }
  throw new EngineError(
    'unknown_ratio_kind',
    `formatRatioValue received an unknown ratio kind: ${String(kind)}.`,
    'kind',
  );
}

/**
 * Formats one ratio value using its catalogue definition.
 *
 * @param {string} ratioId
 * @param {number|null|undefined} value
 * @returns {string}
 */
export function formatRatioById(ratioId, value) {
  const def = DEFS_BY_ID[ratioId];
  if (!def) {
    throw new EngineError(
      'unknown_ratio_id',
      `formatRatioById received an unknown ratio id: ${String(ratioId)}.`,
      'ratioId',
    );
  }
  return formatRatioValue(value, def.kind, def.decimals);
}

/**
 * Formats the movement between two ratio values in the ratio's own unit family:
 * percentage points for percent ratios, multiples for multiple ratios, days for
 * day ratios.
 *
 * @param {string} ratioId
 * @param {number|null|undefined} earliest
 * @param {number|null|undefined} latest
 * @returns {string}
 */
export function formatRatioChange(ratioId, earliest, latest) {
  const def = DEFS_BY_ID[ratioId];
  if (!def) {
    throw new EngineError(
      'unknown_ratio_id',
      `formatRatioChange received an unknown ratio id: ${String(ratioId)}.`,
      'ratioId',
    );
  }
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) return ' - ';

  const delta = def.kind === 'percent' ? (latest - earliest) * 100 : latest - earliest;
  const rounded = Number(delta.toFixed(def.decimals));
  const unit = def.kind === 'percent' ? ' pp' : def.kind === 'multiple' ? 'x' : 'd';
  if (rounded === 0) return `0${unit}`;

  const abs = Math.abs(rounded).toFixed(def.decimals);
  return `${rounded > 0 ? '+' : '-'}${abs}${unit}`;
}

export default Object.freeze({
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
});
