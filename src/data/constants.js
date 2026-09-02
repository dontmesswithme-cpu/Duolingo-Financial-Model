/**
 * Project constants — the single source of truth for shared values.
 *
 * `docs/conventions.md` requires every constant used in `src/data/` and
 * `src/engine/` to originate here, and the P0.3 grep gate (scoped per the
 * reviewer's binding ruling in `docs/inbox_ds.md` 2026-08-31) forbids bare
 * configuration values elsewhere: thresholds, scale factors, limits, URL
 * fragments, scenario names. Structural literals — array indices, `.length`
 * comparisons, `index + 1` row numbering, regex quantifiers — are exempt.
 * Scale factors below are the documented exception that lives here rather
 * than at the call sites.
 *
 * @module src/data/constants
 */

/**
 * Canonical unit registry.
 *
 * `scale` is the multiplier that converts a stored `value` into whole US dollars
 * (or whole units for `count`). As-reported filing units are preserved verbatim
 * in the data layer — `scale` documents them, it never converts them.
 *
 * @type {Readonly<Record<string, { scale: number, label: string }>>}
 */
export const UNITS = Object.freeze({
  thousands_usd: Object.freeze({ scale: 1000, label: '$ thousands' }),
  millions_usd: Object.freeze({ scale: 1_000_000, label: '$ millions' }),
  usd: Object.freeze({ scale: 1, label: '$' }),
  count: Object.freeze({ scale: 1, label: '' }),
});

/**
 * The set of legal `units` values, derived from `UNITS` so the two can never
 * drift apart.
 * @type {ReadonlyArray<string>}
 */
export const UNIT_KEYS = Object.freeze(Object.keys(UNITS));

/**
 * The three record classes. Drives TTM handling: `flow` metrics aggregate over
 * four discrete quarters, `stock` metrics report the latest balance date, and
 * `kpi` metrics report the latest reported value.
 * @type {ReadonlyArray<string>}
 */
export const KLASS_VALUES = Object.freeze(['flow', 'stock', 'kpi']);

/**
 * Legal `periodType` values. `ytd` exists so 10-Q cash-flow rows can be
 * transcribed exactly as filed and never relabelled as discrete quarters.
 * @type {ReadonlyArray<string>}
 */
export const PERIOD_TYPE_VALUES = Object.freeze(['fiscal_year', 'quarter', 'ytd']);

/**
 * The three scenario names, per the Assumptions/Drivers tab contract
 * (`docs/spec.md` §3.4). Rendered as the bear/base/bull selector in Phase 5.
 * @type {ReadonlyArray<string>}
 */
export const SCENARIO_NAMES = Object.freeze(['bear', 'base', 'bull']);

/**
 * Scenario applied until the user selects one (initial model state in
 * `src/app.js` and the neutral case of every scenario-dependent pipeline).
 * @type {string}
 */
export const DEFAULT_SCENARIO = 'base';

/**
 * Visible marking appended to every estimate/forecast value. `docs/conventions.md`
 * requires the mark to flow through `format.estSuffix` — this constant is the
 * canonical label text so the UI can never render an unmarked estimate.
 * @type {string}
 */
export const EST_BADGE_LABEL = 'EST';

/**
 * Fiscal calendar notes — the transcription-honesty facts the data layer is
 * built on (`docs/spec.md` §4.4). Recorded here so the loader, the engine, and
 * the UI render pipeline share one description instead of re-deriving it.
 * @type {Readonly<Record<string, string>>}
 */
export const FISCAL_CALENDAR_NOTES = Object.freeze({
  fiscalYearEnd:
    "Duolingo's fiscal year is the calendar year ending December 31.",
  annualFilings:
    'FY2021–FY2025 annuals come from 10-K filings; FY2026 is a hybrid year (H1 actual + H2 estimate).',
  quarterlyIncome:
    '10-Q income statements present discrete 3-month columns and are transcribed directly (cited).',
  quarterlyCashFlow:
    '10-Q cash-flow statements are year-to-date; transcribed as periodType "ytd" exactly as filed. Discrete quarters are derived by differencing (computed); Q4 discrete = FY minus 9M YTD.',
  ttm:
    'TTM = sum of 4 discrete quarters (computed). A computed value never replaces its cited constituents.',
});

/**
 * Ledger enforcement flag: when `true`, citation URLs must exist in
 * `docs/sources/sources.md` (`SOURCE_NOT_IN_LEDGER`). Consumed via dependency
 * injection — `loadHistorical({ requireLedger, ledger })` — so the audit engine
 * never imports project configuration and can be tested in an explicit
 * ledger-free mode (contract B, P0.3). From P0.3 on, the app boots with this
 * flag enabled.
 * @type {boolean}
 */
export const SOURCE_LEDGER_REQUIRED = true;

/**
 * Canonical verified SEC EDGAR filing URLs recorded in the project source ledger.
 * @type {ReadonlySet<string>}
 */
export const LEDGER_URLS = Object.freeze(
  new Set([
    'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001562088&type=10-K&dateb=&owner=include&count=40',
    'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    'https://www.sec.gov/Archives/edgar/data/1562088/000156208824000050/duol-20231231.htm',
    'https://www.sec.gov/Archives/edgar/data/1562088/000162828025049743/duol-20250930.htm',
    'https://www.sec.gov/Archives/edgar/data/1562088/000162828026029976/duol-20260331.htm',
    'https://www.sec.gov/Archives/edgar/data/1562088/000162828026053603/duol-20260630.htm',
    'https://www.sec.gov/Archives/edgar/data/1562088/000156208822000039/duol-20211231.htm',
  ]),
);

/**
 * Directory containing the historical dataset JSON files. Relative to the
 * document root when served statically. A URL fragment, so it is a
 * configuration value and lives here per the grep gate.
 * @type {string}
 */
export const HISTORICAL_DIR = 'src/data/historical/';

/**
 * Historical data directory alias.
 * @type {string}
 */
export const DATA_DIR = 'src/data/historical/';

/**
 * Assumptions file name and default relative path.
 * @type {string}
 */
export const ASSUMPTIONS_FILE = 'assumptions.json';
export const ASSUMPTIONS_PATH = 'src/data/assumptions.json';

/**
 * Number of days in a standard calendar year for financial ratio calculations.
 * @type {number}
 */
export const DAYS_IN_YEAR = 365;

/**
 * Supported scenario delta keys for assumption drivers.
 * @type {ReadonlyArray<string>}
 */
export const SCENARIO_DELTA_KEYS = Object.freeze(['bear', 'bull']);

/**
 * Driver groups for model assumptions.
 *
 * `workingCapital` … `market` are the P2 groups. `revenue`, `costs`, `tax`, and
 * `financing` are appended additively by the P3.1 artifact contract (frozen
 * surface permits additive extension only).
 * @type {ReadonlyArray<string>}
 */
export const DRIVER_GROUPS = Object.freeze([
  'workingCapital',
  'capexDna',
  'debt',
  'sbc',
  'market',
  'revenue',
  'costs',
  'tax',
  'financing',
]);

/**
 * First forecast fiscal year. FY2026 is the hybrid year: H1 actual (cited
 * Q1/Q2 FY2026 rows) + H2 engine estimate.
 * @type {number}
 */
export const FORECAST_BASE_YEAR = 2026;

/**
 * Forecast horizon bounds and default, per `docs/spec.md` §7 decision 1
 * (5 forward years FY2026–FY2030, user-extensible 3–10).
 * @type {number}
 */
export const FORECAST_HORIZON_MIN = 3;
export const FORECAST_HORIZON_MAX = 10;
export const FORECAST_HORIZON_DEFAULT = 5;

/**
 * Prefix used to build forecast period keys (`FY` + year).
 * @type {string}
 */
export const FORECAST_PERIOD_PREFIX = 'FY';

/**
 * Number of half-year segments in a fiscal year. Drives the hybrid FY2026
 * per-half provenance split and the half-period growth exponent.
 * @type {number}
 */
export const HALVES_PER_YEAR = 2;

/**
 * Cited corpus periods the forecast anchors on. Every key names a period that
 * exists in the P1 corpus — no forecast row is ever added to the data layer.
 *
 * - `baseFiscalYear`: last fully-reported fiscal year (FY2025) — the base every
 *   growth driver compounds from.
 * - `subscriberOpening` / `subscriberMidYear`: paid-subscriber stock anchors
 *   (FY2025 year-end and Q2 FY2026), the two cited points in the cascade.
 * - `priorH1Ytd` / `priorH1TailQuarter`: 9M FY2025 minus Q3 FY2025 yields H1
 *   FY2025, the like-for-like comparison base for H1 FY2026 actuals.
 * - `currentH1Quarters`: the two discrete FY2026 quarters whose sums are the
 *   H1 actuals carried in every hybrid line.
 *
 * @type {Readonly<Record<string, string|ReadonlyArray<string>>>}
 */
export const FORECAST_ANCHOR_PERIODS = Object.freeze({
  baseFiscalYear: 'FY2025',
  subscriberOpening: 'FY2025',
  subscriberMidYear: 'Q2 FY2026',
  priorH1Ytd: '9M FY2025',
  priorH1TailQuarter: 'Q3 FY2025',
  currentH1Quarters: Object.freeze(['Q1 FY2026', 'Q2 FY2026']),
});

/**
 * The known historical datasets, per `docs/spec.md` §3.1. Discovery is an
 * explicit manifest rather than a directory scan: a browser cannot enumerate a
 * directory, so the file list is the single source of truth in both Node and
 * the browser.
 * @type {ReadonlyArray<string>}
 */
export const HISTORICAL_DATASETS = Object.freeze(['income', 'balance', 'cashflow', 'kpis']);

/**
 * The marking taxonomy for valuation inputs and outputs, per
 * `docs/conventions.md` (Financial Data Integrity).
 *
 * `MKT` marks a value sourced from an external market-data provider and pinned
 * to an as-of date; `EST` marks a derived or judgment value. The two are the
 * only legal `marking` values anywhere in the engine, so they live here rather
 * than being re-typed in `wacc.js`, `dcf.js`, or `schema.js`.
 * @type {ReadonlyArray<string>}
 */
export const MARKING_VALUES = Object.freeze(['MKT', 'EST']);

/**
 * Documentation of the P4.1 WACC build — the method statement the Valuation tab
 * renders alongside the build table. Reference notes only; no engine reads a
 * number from here.
 *
 * `debtFreeNote` records why the debt-free collapse is a *theorem*: the build
 * always evaluates `WACC = (E/V)·Re + (D/V)·Rd·(1−t)`, and `D = 0` reduces it
 * to `Re`. No branch deletes the formula.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const WACC_BUILD_DEFAULTS = Object.freeze({
  method:
    'CAPM cost of equity = risk-free rate + beta × equity risk premium; WACC = (E/V)·Re + (D/V)·Rd·(1−t).',
  costOfEquitySource: 'CAPM — rf + beta × ERP, every leg a MKT-labeled driver with an as-of date.',
  weightsBasis:
    'Market-value weights: E = share price × diluted shares outstanding; D = funded debt balance resolved from the debt schedule.',
  debtFreeNote:
    'Duolingo is debt-free per P2.3 (zero funded borrowings across every cited balance sheet date; ASC 842 operating leases are not debt). D = 0 collapses WACC to the cost of equity as a theorem of the general formula, never as a deleted branch.',
  taxBasis:
    'The normalized effective_tax_rate driver (P3.1 tax group) tax-affects the pre-tax cost of debt.',
  terminalGrowthNote:
    'terminal_growth_rate is an EST judgment bounded above by long-run US nominal GDP growth and strictly below WACC (Gordon guard).',
});

/**
 * Bounds for the `terminal_growth_rate` driver. The `max` is the long-run US
 * nominal GDP growth ceiling — a perpetuity cannot outgrow the economy that
 * hosts it — and it stays far below any plausible WACC so the Gordon guard
 * `WACC > g` holds across the whole slider range.
 * @type {Readonly<{ min: number, max: number, step: number }>}
 */
export const TERMINAL_GROWTH_BOUNDS = Object.freeze({
  min: 0,
  max: 0.04,
  step: 0.0025,
});

/**
 * Mechanical recommendation thresholds, per `docs/spec.md` §7 (the model
 * states an output, never an opinion). `recommend.js` imports these — it never
 * re-types them — so the label boundaries have exactly one home.
 *
 * `upsidePct >= undervalued` → `undervalued`; `upsidePct <= overvalued` →
 * `overvalued`; anything between → `fair`.
 * @type {Readonly<{ undervalued: number, overvalued: number }>}
 */
export const RECOMMENDATION_THRESHOLDS = Object.freeze({
  undervalued: 0.15,
  overvalued: -0.15,
});

/**
 * Git tag prefix and fallback model version for Cover/TOC metadata.
 */
export const WORKFLOW_GIT_TAG_PREFIX = 'v1.0';
export const MODEL_VERSION_FALLBACK = 'v1.0-P4';


