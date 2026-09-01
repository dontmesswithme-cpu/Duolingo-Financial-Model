/**
 * Driver-Based Forecast Core (P3.1).
 *
 * Projects the income statement FY2026–FY2030 from P2 assumptions drivers over
 * the verified P1 corpus:
 *  - Revenue cascade: paid subscribers → average subscribers → × ARPU →
 *    subscription revenue; advertising / DET / IAP / other as driver-driven
 *    segment paths off cited FY2025 bases.
 *  - Cost structure: CoR / R&D / S&M / G&A as %-of-revenue drivers.
 *  - Hybrid FY2026: H1 = engine-computed sum of the cited discrete Q1 FY2026 and
 *    Q2 FY2026 income rows; H2 = full-year driver estimate − H1; every FY2026
 *    line carries per-half provenance.
 *
 * `revenue_total = Σ segments` BY CONSTRUCTION — there is no residual plug and
 * no balancing line anywhere in this module (P2.2 anti-tautology rule).
 *
 * Engine-only phase: nothing here writes to the data layer. Every cited anchor
 * is read from the corpus; every forward value is emitted as `isEstimate: true`
 * in engine output only.
 *
 * PURE MODULE: zero DOM, zero fetch, zero wall-clock reads (Date.now), zero RNG.
 *
 * @module src/engine/forecast
 */

import { extractRows } from '../data/schema.js';
import {
  UNITS,
  FORECAST_BASE_YEAR,
  FORECAST_HORIZON_MIN,
  FORECAST_HORIZON_MAX,
  FORECAST_HORIZON_DEFAULT,
  FORECAST_PERIOD_PREFIX,
  FORECAST_ANCHOR_PERIODS,
  HALVES_PER_YEAR,
} from '../data/constants.js';
import { EngineError } from '../data/errors.js';

/**
 * Output units for every money line in the forecast. Mirrors the corpus
 * `units` so projected values are directly comparable to filed values.
 * @type {string}
 */
export const FORECAST_UNITS = UNITS.thousands_usd.label;
const MONEY_UNITS = 'thousands_usd';

/**
 * Revenue segment keys in cascade order. `subscription` is the cascade-driven
 * segment; the remaining four are growth-driven segment paths.
 * @type {ReadonlyArray<string>}
 */
export const REVENUE_SEGMENT_KEYS = Object.freeze([
  'subscription',
  'advertising',
  'duolingo_english_test',
  'in_app_purchases',
  'other',
]);

/**
 * Corpus metric key per revenue segment.
 * @type {Readonly<Record<string, string>>}
 */
export const SEGMENT_METRIC_BY_KEY = Object.freeze({
  subscription: 'revenue_subscription',
  advertising: 'revenue_advertising',
  duolingo_english_test: 'revenue_duolingo_english_test',
  in_app_purchases: 'revenue_in_app_purchases',
  other: 'revenue_other',
});

/**
 * Growth driver per non-cascade segment. `subscription` is absent by design —
 * it is driven by the subscriber cascade, never by an independent growth rate.
 * @type {Readonly<Record<string, string>>}
 */
export const SEGMENT_GROWTH_DRIVER_BY_KEY = Object.freeze({
  advertising: 'advertising_revenue_growth',
  duolingo_english_test: 'det_revenue_growth',
  in_app_purchases: 'iap_revenue_growth',
  other: 'other_revenue_growth',
});

/**
 * Cost line keys in income-statement order.
 * @type {ReadonlyArray<string>}
 */
export const COST_LINE_KEYS = Object.freeze([
  'cost_of_revenue',
  'research_and_development',
  'sales_and_marketing',
  'general_and_administrative',
]);

/**
 * Operating-expense keys — every cost line that is not cost of revenue.
 * @type {ReadonlyArray<string>}
 */
export const OPEX_LINE_KEYS = Object.freeze([
  'research_and_development',
  'sales_and_marketing',
  'general_and_administrative',
]);

/**
 * Corpus metric key per cost line.
 * @type {Readonly<Record<string, string>>}
 */
export const COST_METRIC_BY_KEY = Object.freeze({
  cost_of_revenue: 'cost_of_revenue',
  research_and_development: 'opex_research_and_development',
  sales_and_marketing: 'opex_sales_and_marketing',
  general_and_administrative: 'opex_general_and_administrative',
});

/**
 * %-of-revenue driver per cost line.
 * @type {Readonly<Record<string, string>>}
 */
export const COST_DRIVER_BY_KEY = Object.freeze({
  cost_of_revenue: 'cost_of_revenue_pct_revenue',
  research_and_development: 'rd_pct_revenue',
  sales_and_marketing: 'sm_pct_revenue',
  general_and_administrative: 'ga_pct_revenue',
});

/**
 * Forecast subscriber path metric key (KPI dataset).
 * @type {string}
 */
export const SUBSCRIBER_METRIC = 'paid_subscribers';

/**
 * Normalizes dataset input into a flat array of records.
 *
 * @param {object|Array} historical
 * @returns {Array<object>}
 */
function toFlatRows(historical) {
  if (!historical) return [];
  if (Array.isArray(historical)) return historical;

  const rows = [];
  if (historical.income) rows.push(...extractRows(historical.income));
  if (historical.balance) rows.push(...extractRows(historical.balance));
  if (historical.cashflow) rows.push(...extractRows(historical.cashflow));
  if (historical.kpis) rows.push(...extractRows(historical.kpis));
  if (historical.records && Array.isArray(historical.records)) {
    rows.push(...historical.records);
  }
  return rows;
}

/**
 * Finds a corpus row by metric and period (optionally by periodType).
 *
 * @param {Array<object>} rows
 * @param {string} metric
 * @param {string} period
 * @param {string} [periodType]
 * @returns {object|null}
 */
function findRow(rows, metric, period, periodType) {
  return (
    rows.find(
      (r) =>
        r.metric === metric &&
        r.period === period &&
        (periodType === undefined || r.periodType === periodType),
    ) || null
  );
}

/**
 * Resolves a required corpus row, failing closed with a typed EngineError.
 * A missing or non-finite anchor is a defect, never a silent zero (the P2.1
 * silent-fallback prohibition).
 *
 * @param {Array<object>} rows
 * @param {string} metric
 * @param {string} period
 * @param {string} [periodType]
 * @returns {object}
 */
function requireRow(rows, metric, period, periodType) {
  const row = findRow(rows, metric, period, periodType);
  if (!row) {
    throw new EngineError(
      'missing_corpus_row',
      `Required corpus row "${metric}" @ "${period}" is absent from the historical dataset.`,
      metric,
    );
  }
  if (!Number.isFinite(row.value)) {
    throw new EngineError(
      'invalid_corpus_row',
      `Corpus row "${metric}" @ "${period}" carries a non-finite value.`,
      metric,
    );
  }
  return row;
}

/**
 * Safely extracts a required driver value from an AssumptionSet, Map, or plain
 * driver object. Fails closed with a typed `missing_driver` EngineError.
 *
 * @param {object|Map} drivers
 * @param {string} name
 * @returns {number}
 */
function requireDriverValue(drivers, name) {
  let val;
  if (drivers) {
    if (typeof drivers.getValue === 'function') {
      val = drivers.getValue(name);
    } else if (typeof drivers.get === 'function') {
      const item = drivers.get(name);
      val = typeof item === 'number' ? item : item?.value;
    } else if (typeof drivers[name] === 'number') {
      val = drivers[name];
    } else if (drivers[name] && typeof drivers[name].value === 'number') {
      val = drivers[name].value;
    }
  }
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val;
  }
  throw new EngineError(
    'missing_driver',
    `Required driver "${name}" is missing or non-finite in the assumptions payload.`,
    name,
  );
}

/**
 * Freezes an object graph recursively so no consumer can mutate engine output.
 *
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

/**
 * Projects a corpus row into an immutable citation descriptor. Keeps the
 * `derivedFrom` chains auditable without leaking mutable corpus records into
 * engine output.
 *
 * @param {object|null} row
 * @returns {object|null}
 */
function citationOf(row) {
  if (!row) return null;
  const source = row.source
    ? Object.freeze({
        filing: row.source.filing,
        period: row.source.period,
        statement: row.source.statement,
        url: row.source.url,
      })
    : null;
  return Object.freeze({
    metric: row.metric,
    label: row.label ?? null,
    period: row.period,
    periodType: row.periodType ?? null,
    value: row.value,
    units: row.units,
    isEstimate: row.isEstimate === true,
    source,
  });
}

/**
 * Builds the forecast period keys, e.g. `FY2026 … FY2030`.
 *
 * @param {number} horizon
 * @returns {ReadonlyArray<string>}
 */
export function forecastPeriods(horizon) {
  const periods = [];
  for (let i = 0; i < horizon; i += 1) {
    periods.push(`${FORECAST_PERIOD_PREFIX}${FORECAST_BASE_YEAR + i}`);
  }
  return Object.freeze(periods);
}

/**
 * Validates and resolves the forecast horizon. Out-of-range or non-integer
 * input throws a typed EngineError naming the offending input — clamping is
 * only ever applied to produce the default, never to silently rescue bad input.
 *
 * @param {number|undefined} horizon
 * @returns {number}
 */
export function normalizeHorizon(horizon) {
  if (horizon === undefined || horizon === null) return FORECAST_HORIZON_DEFAULT;
  if (typeof horizon !== 'number' || !Number.isInteger(horizon)) {
    throw new EngineError(
      'invalid_horizon',
      `Forecast "horizon" must be an integer number of fiscal years, received ${typeof horizon}.`,
      'horizon',
    );
  }
  if (horizon < FORECAST_HORIZON_MIN || horizon > FORECAST_HORIZON_MAX) {
    throw new EngineError(
      'invalid_horizon',
      `Forecast "horizon" must be within [${FORECAST_HORIZON_MIN}, ${FORECAST_HORIZON_MAX}] fiscal years, received ${horizon}.`,
      'horizon',
    );
  }
  return horizon;
}

/**
 * Builds a full-estimate forecast line (every year after the hybrid base year).
 *
 * @param {number} value
 * @param {Array<object>} derivedFrom
 * @param {string} [units]
 * @returns {object}
 */
function estimateLine(value, derivedFrom, units = MONEY_UNITS) {
  if (!Number.isFinite(value)) {
    throw new EngineError(
      'non_finite_projection',
      'A forecast line resolved to a non-finite value; the driver input is invalid.',
    );
  }
  return Object.freeze({
    value,
    units,
    provenance: 'estimate',
    isComputed: true,
    isEstimate: true,
    derivedFrom: Object.freeze(derivedFrom.slice()),
  });
}

/**
 * Builds a hybrid FY2026 forecast line: H1 is the engine-computed sum of the
 * two cited discrete quarters (an actual, never an estimate); H2 is the
 * driver model estimate for H2 (full-year driver estimate less H1 driver estimate);
 * `value === h1 + h2` by construction.
 *
 * The full-year value carries the H1 actual surprise (actual H1 + estimated H2),
 * while each half carries its own honest `provenance` flag — a cited actual is
 * never relabelled as an estimate.
 *
 * @param {object} args
 * @param {number} args.h1Value Sum of the two cited quarter rows (actual)
 * @param {number} args.h2Value Driver model estimate for H2 (estimate)
 * @param {Array<object>} args.h1DerivedFrom Citations for the two quarter rows
 * @param {Array<object>} args.h2DerivedFrom Citations/drivers behind the estimate
 * @param {string} [args.units]
 * @returns {object}
 */
function hybridLine({
  h1Value,
  h2Value,
  h1DerivedFrom,
  h2DerivedFrom,
  units = MONEY_UNITS,
}) {
  if (!Number.isFinite(h1Value) || !Number.isFinite(h2Value)) {
    throw new EngineError(
      'non_finite_projection',
      'A hybrid FY2026 line resolved to a non-finite value; the corpus anchor or driver input is invalid.',
    );
  }
  return Object.freeze({
    value: h1Value + h2Value,
    units,
    provenance: 'hybrid',
    isComputed: true,
    isEstimate: true,
    h1: Object.freeze({
      value: h1Value,
      units,
      provenance: 'actual',
      isComputed: true,
      isEstimate: false,
      derivedFrom: Object.freeze(h1DerivedFrom.slice()),
    }),
    h2: Object.freeze({
      value: h2Value,
      units,
      provenance: 'estimate',
      isComputed: true,
      isEstimate: true,
      derivedFrom: Object.freeze(h2DerivedFrom.slice()),
    }),
    derivedFrom: Object.freeze([...h1DerivedFrom, ...h2DerivedFrom]),
  });
}

/**
 * Sums the `value` of a collection of forecast lines.
 *
 * @param {Array<object>} lines
 * @returns {number}
 */
function sumLines(lines) {
  return lines.reduce((acc, line) => acc + line.value, 0);
}

/**
 * Sums the H1 and H2 halves of a collection of hybrid lines.
 *
 * @param {Array<object>} lines
 * @returns {{ h1: number, h2: number }}
 */
function sumHalves(lines) {
  return lines.reduce(
    (acc, line) => ({
      h1: acc.h1 + line.h1.value,
      h2: acc.h2 + line.h2.value,
    }),
    { h1: 0, h2: 0 },
  );
}

/**
 * Driver-based forecast projection.
 *
 * FROZEN signature per `docs/spec.md` §3.2: `project(input): ForecastOutput`
 * where `ForecastInput` is `{ historical, assumptions, horizon? }`.
 *
 * @param {{ historical: object, assumptions: object, horizon?: number }} input
 * @returns {object} ForecastOutput
 * @throws {EngineError} On an invalid horizon, a missing corpus anchor, a
 *   missing driver, or a revenue-identity breach.
 */
export function project(input) {
  if (!input || typeof input !== 'object') {
    throw new EngineError(
      'invalid_forecast_input',
      'forecast.project(input) requires an object with `historical` and `assumptions`.',
      'input',
    );
  }

  const { historical, assumptions } = input;
  if (!historical) {
    throw new EngineError(
      'missing_historical',
      'forecast.project(input) requires a loaded `historical` dataset.',
      'historical',
    );
  }
  if (!assumptions) {
    throw new EngineError(
      'missing_assumptions',
      'forecast.project(input) requires a loaded `assumptions` set.',
      'assumptions',
    );
  }

  const horizon = normalizeHorizon(input.horizon);
  const periods = forecastPeriods(horizon);
  const rows = toFlatRows(historical);

  const baseYear = FORECAST_ANCHOR_PERIODS.baseFiscalYear;
  const h1Quarters = FORECAST_ANCHOR_PERIODS.currentH1Quarters;

  // ── Cited anchors ────────────────────────────────────────────────────────
  const subsOpeningRow = requireRow(rows, SUBSCRIBER_METRIC, FORECAST_ANCHOR_PERIODS.subscriberOpening);
  const subsMidRow = requireRow(rows, SUBSCRIBER_METRIC, FORECAST_ANCHOR_PERIODS.subscriberMidYear);
  const priorH1YtdRow = requireRow(rows, 'revenue_total', FORECAST_ANCHOR_PERIODS.priorH1Ytd);
  const priorH1TailRow = requireRow(rows, 'revenue_total', FORECAST_ANCHOR_PERIODS.priorH1TailQuarter);

  const segmentBaseRows = {};
  const segmentH1Rows = {};
  const segmentPriorH1Rows = {};
  const segmentAnchors = {};

  for (const key of REVENUE_SEGMENT_KEYS) {
    const metric = SEGMENT_METRIC_BY_KEY[key];
    const baseRow = requireRow(rows, metric, baseYear);
    const h1Rows = h1Quarters.map((q) => requireRow(rows, metric, q));
    const priorYtd = requireRow(rows, metric, FORECAST_ANCHOR_PERIODS.priorH1Ytd);
    const priorTail = requireRow(rows, metric, FORECAST_ANCHOR_PERIODS.priorH1TailQuarter);

    segmentBaseRows[key] = baseRow;
    segmentH1Rows[key] = h1Rows;
    segmentPriorH1Rows[key] = { ytd: priorYtd, tail: priorTail };

    const h1Prior = priorYtd.value - priorTail.value;
    const h1Current = h1Rows[0].value + h1Rows[1].value;
    segmentAnchors[key] = Object.freeze({
      base: citationOf(baseRow),
      h1PriorYear: Object.freeze({
        value: h1Prior,
        units: MONEY_UNITS,
        isComputed: true,
        isEstimate: false,
        derivedFrom: Object.freeze([citationOf(priorYtd), citationOf(priorTail)]),
      }),
      h1CurrentYear: Object.freeze({
        value: h1Current,
        units: MONEY_UNITS,
        isComputed: true,
        isEstimate: false,
        derivedFrom: Object.freeze([citationOf(h1Rows[0]), citationOf(h1Rows[1])]),
      }),
      h1LikeForLikeGrowth: h1Prior === 0 ? null : h1Current / h1Prior - 1,
    });
  }

  const costH1Rows = {};
  const costBaseRows = {};
  for (const key of COST_LINE_KEYS) {
    const metric = COST_METRIC_BY_KEY[key];
    costH1Rows[key] = h1Quarters.map((q) => requireRow(rows, metric, q));
    costBaseRows[key] = requireRow(rows, metric, baseYear);
  }

  const opexTotalH1Rows = h1Quarters.map((q) => requireRow(rows, 'opex_total', q));
  const grossProfitH1Rows = h1Quarters.map((q) => requireRow(rows, 'gross_profit', q));
  const operatingIncomeH1Rows = h1Quarters.map((q) => requireRow(rows, 'operating_income', q));
  const totalH1Rows = h1Quarters.map((q) => requireRow(rows, 'revenue_total', q));

  // ── Drivers (fail-closed) ────────────────────────────────────────────────
  const subsGrowth = requireDriverValue(assumptions, 'paid_subscriber_growth');
  const arpu = requireDriverValue(assumptions, 'subscription_arpu');

  const growthBySegment = {};
  for (const key of Object.keys(SEGMENT_GROWTH_DRIVER_BY_KEY)) {
    growthBySegment[key] = requireDriverValue(assumptions, SEGMENT_GROWTH_DRIVER_BY_KEY[key]);
  }
  const pctByCost = {};
  for (const key of COST_LINE_KEYS) {
    pctByCost[key] = requireDriverValue(assumptions, COST_DRIVER_BY_KEY[key]);
  }

  if (arpu <= 0) {
    throw new EngineError(
      'invalid_driver',
      `Driver "subscription_arpu" must be strictly positive to drive the revenue cascade, received ${arpu}.`,
      'subscription_arpu',
    );
  }
  if (subsGrowth <= -1) {
    throw new EngineError(
      'invalid_driver',
      `Driver "paid_subscriber_growth" must be greater than -1, received ${subsGrowth}.`,
      'paid_subscriber_growth',
    );
  }

  // ── Subscriber path ──────────────────────────────────────────────────────
  // The growth driver is an annual rate. FY2026 is hybrid: the mid-year stock
  // is a cited actual, so only the H2 leg is estimated and it carries a
  // half-year of the annual rate. Subsequent years apply the full annual rate.
  const halfYearGrowth = (1 + subsGrowth) ** (1 / HALVES_PER_YEAR);
  const h1AverageSubs = (subsOpeningRow.value + subsMidRow.value) / HALVES_PER_YEAR;

  const subscribers = {};
  let priorEndSubs = subsOpeningRow.value;

  periods.forEach((period, index) => {
    const isHybrid = index === 0;
    const beginning = priorEndSubs;
    let end;
    let average;
    let halves = null;

    if (isHybrid) {
      end = subsMidRow.value * halfYearGrowth;
      const h2Average = (subsMidRow.value + end) / HALVES_PER_YEAR;
      average = (h1AverageSubs + h2Average) / HALVES_PER_YEAR;
      halves = Object.freeze({
        h1: Object.freeze({
          beginning: subsOpeningRow.value,
          end: subsMidRow.value,
          average: h1AverageSubs,
          provenance: 'actual',
          isComputed: true,
          isEstimate: false,
          units: 'count',
          derivedFrom: Object.freeze([citationOf(subsOpeningRow), citationOf(subsMidRow)]),
        }),
        h2: Object.freeze({
          beginning: subsMidRow.value,
          end,
          average: h2Average,
          provenance: 'estimate',
          isComputed: true,
          isEstimate: true,
          units: 'count',
          derivedFrom: Object.freeze([
            citationOf(subsMidRow),
            Object.freeze({ driver: 'paid_subscriber_growth', value: subsGrowth }),
          ]),
        }),
      });
    } else {
      end = beginning * (1 + subsGrowth);
      average = (beginning + end) / HALVES_PER_YEAR;
    }

    subscribers[period] = Object.freeze({
      period,
      beginning,
      end,
      average,
      units: 'count',
      provenance: isHybrid ? 'hybrid' : 'estimate',
      isComputed: true,
      isEstimate: true,
      ...(halves ? { halves } : {}),
      derivedFrom: Object.freeze(
        isHybrid
          ? [citationOf(subsOpeningRow), citationOf(subsMidRow), Object.freeze({ driver: 'paid_subscriber_growth', value: subsGrowth })]
          : [Object.freeze({ driver: 'paid_subscriber_growth', value: subsGrowth })],
      ),
    });

    priorEndSubs = end;
  });

  // ── Per-period income statement ──────────────────────────────────────────
  const byPeriod = {};

  periods.forEach((period, index) => {
    const isHybrid = index === 0;
    const yearsFromBase = index + 1;
    const subs = subscribers[period];

    // 1. Revenue segments
    const segments = {};
    for (const key of REVENUE_SEGMENT_KEYS) {
      if (isHybrid) {
        let h2Value;
        let estimateBasis;

        if (key === 'subscription') {
          const modeledMid = subsOpeningRow.value * halfYearGrowth;
          const modeledH1Avg = (subsOpeningRow.value + modeledMid) / HALVES_PER_YEAR;
          const h1DriverEst = (modeledH1Avg * arpu / UNITS.thousands_usd.scale) / HALVES_PER_YEAR;
          const fullYearEst = (subs.average * arpu) / UNITS.thousands_usd.scale;
          h2Value = fullYearEst - h1DriverEst;
          estimateBasis = Object.freeze([
            Object.freeze({ driver: 'subscription_arpu', value: arpu }),
            Object.freeze({ driver: 'paid_subscriber_growth', value: subsGrowth }),
            Object.freeze({ from: `subscribers.${period}.average`, value: subs.average }),
            Object.freeze({ h1DriverEstimate: h1DriverEst, fullYearEstimate: fullYearEst }),
          ]);
        } else {
          const growth = growthBySegment[key];
          const fullYear = segmentBaseRows[key].value * (1 + growth);
          const h1DriverEst = fullYear / HALVES_PER_YEAR;
          h2Value = fullYear - h1DriverEst;
          estimateBasis = Object.freeze([
            citationOf(segmentBaseRows[key]),
            Object.freeze({ driver: SEGMENT_GROWTH_DRIVER_BY_KEY[key], value: growth }),
            Object.freeze({ h1DriverEstimate: h1DriverEst, fullYearEstimate: fullYear }),
          ]);
        }

        const h1Rows = segmentH1Rows[key];
        const h1Value = h1Rows[0].value + h1Rows[1].value;
        segments[key] = hybridLine({
          h1Value,
          h2Value,
          h1DerivedFrom: [citationOf(h1Rows[0]), citationOf(h1Rows[1])],
          h2DerivedFrom: [...estimateBasis],
        });
      } else {
        let fullYear;
        let estimateBasis;

        if (key === 'subscription') {
          fullYear = (subs.average * arpu) / UNITS.thousands_usd.scale;
          estimateBasis = Object.freeze([
            Object.freeze({ driver: 'subscription_arpu', value: arpu }),
            Object.freeze({ from: `subscribers.${period}.average`, value: subs.average }),
          ]);
        } else {
          const growth = growthBySegment[key];
          fullYear = segmentBaseRows[key].value * (1 + growth) ** yearsFromBase;
          estimateBasis = Object.freeze([
            citationOf(segmentBaseRows[key]),
            Object.freeze({ driver: SEGMENT_GROWTH_DRIVER_BY_KEY[key], value: growth }),
            Object.freeze({ yearsFromBase }),
          ]);
        }

        segments[key] = estimateLine(fullYear, estimateBasis);
      }
    }

    // 2. Total revenue — the sum of the segments, never an independent driver.
    const segmentLines = REVENUE_SEGMENT_KEYS.map((key) => segments[key]);
    const segmentSum = sumLines(segmentLines);
    let total;

    if (isHybrid) {
      const halves = sumHalves(segmentLines);
      const h1Value = totalH1Rows[0].value + totalH1Rows[1].value;
      const h2Value = halves.h2;
      total = hybridLine({
        h1Value,
        h2Value,
        h1DerivedFrom: [citationOf(totalH1Rows[0]), citationOf(totalH1Rows[1])],
        h2DerivedFrom: REVENUE_SEGMENT_KEYS.map((key) =>
          Object.freeze({
            from: `revenue.segments.${key}.h2`,
            value: segments[key].h2.value,
          }),
        ),
      });
      // Anti-tautology: the H1 actual assembled from the segment decomposition
      // must equal the H1 actual assembled from the cited revenue_total rows.
      const h1FromSegments = halves.h1;
      if (Math.abs(h1FromSegments - total.h1.value) > 1e-9) {
        throw new EngineError(
          'revenue_identity_failed',
          `FY2026 H1 revenue from the segment decomposition (${h1FromSegments}) does not equal H1 from the cited revenue_total rows (${total.h1.value}).`,
          period,
        );
      }
    } else {
      total = estimateLine(
        segmentSum,
        REVENUE_SEGMENT_KEYS.map((key) => citationOf(segmentBaseRows[key])),
      );
    }

    // Segment-sum totality is enforced on the constructed components: any drift
    // is a defect in the cascade, never a plug to be absorbed.
    if (Math.abs(segmentSum - total.value) > 1e-9) {
      throw new EngineError(
        'revenue_identity_failed',
        `Revenue segment sum (${segmentSum}) does not equal total revenue (${total.value}) in ${period}.`,
        period,
      );
    }

    // 3. Cost structure — %-of-revenue drivers on total revenue
    const costs = {};
    for (const key of COST_LINE_KEYS) {
      const pct = pctByCost[key];
      if (isHybrid) {
        const h1Rows = costH1Rows[key];
        const h1Value = h1Rows[0].value + h1Rows[1].value;
        const h2Value = total.h2.value * pct;
        const estimateBasis = [
          Object.freeze({ driver: COST_DRIVER_BY_KEY[key], value: pct }),
          Object.freeze({ from: `revenue.total.${period}.h2`, value: total.h2.value }),
        ];
        costs[key] = hybridLine({
          h1Value,
          h2Value,
          h1DerivedFrom: [citationOf(h1Rows[0]), citationOf(h1Rows[1])],
          h2DerivedFrom: estimateBasis,
        });
      } else {
        const fullYear = total.value * pct;
        const estimateBasis = [
          Object.freeze({ driver: COST_DRIVER_BY_KEY[key], value: pct }),
          Object.freeze({ from: `revenue.total.${period}`, value: total.value }),
        ];
        costs[key] = estimateLine(fullYear, estimateBasis);
      }
    }

    // 4. Operating-expense subtotal
    const opexLines = OPEX_LINE_KEYS.map((key) => costs[key]);
    const opexSum = sumLines(opexLines);
    let opexTotal;
    if (isHybrid) {
      const h1Value = opexTotalH1Rows[0].value + opexTotalH1Rows[1].value;
      const h2Value = sumLines(OPEX_LINE_KEYS.map((key) => costs[key].h2));
      opexTotal = hybridLine({
        h1Value,
        h2Value,
        h1DerivedFrom: [citationOf(opexTotalH1Rows[0]), citationOf(opexTotalH1Rows[1])],
        h2DerivedFrom: OPEX_LINE_KEYS.map((key) => Object.freeze({ driver: COST_DRIVER_BY_KEY[key], value: pctByCost[key] })),
      });
    } else {
      opexTotal = estimateLine(
        opexSum,
        OPEX_LINE_KEYS.map((key) => Object.freeze({ driver: COST_DRIVER_BY_KEY[key], value: pctByCost[key] })),
      );
    }

    // 5. Gross profit = total revenue − cost of revenue
    let grossProfit;
    if (isHybrid) {
      const h1Value = grossProfitH1Rows[0].value + grossProfitH1Rows[1].value;
      const h2Value = total.h2.value - costs.cost_of_revenue.h2.value;
      grossProfit = hybridLine({
        h1Value,
        h2Value,
        h1DerivedFrom: [citationOf(grossProfitH1Rows[0]), citationOf(grossProfitH1Rows[1])],
        h2DerivedFrom: [
          Object.freeze({ from: `revenue.total.${period}.h2`, value: total.h2.value }),
          Object.freeze({ driver: 'cost_of_revenue_pct_revenue', value: pctByCost.cost_of_revenue }),
        ],
      });
    } else {
      const grossProfitFull = total.value - costs.cost_of_revenue.value;
      grossProfit = estimateLine(grossProfitFull, [
        Object.freeze({ from: `revenue.total.${period}`, value: total.value }),
        Object.freeze({ from: `costs.cost_of_revenue.${period}`, value: costs.cost_of_revenue.value }),
      ]);
    }

    // 6. Operating income = gross profit − total operating expense
    let operatingIncome;
    if (isHybrid) {
      const h1Value = operatingIncomeH1Rows[0].value + operatingIncomeH1Rows[1].value;
      const h2Value = grossProfit.h2.value - opexTotal.h2.value;
      operatingIncome = hybridLine({
        h1Value,
        h2Value,
        h1DerivedFrom: [citationOf(operatingIncomeH1Rows[0]), citationOf(operatingIncomeH1Rows[1])],
        h2DerivedFrom: [
          Object.freeze({ from: `gross_profit.${period}.h2`, value: grossProfit.h2.value }),
          Object.freeze({ from: `costs.opex_total.${period}.h2`, value: opexTotal.h2.value }),
        ],
      });
    } else {
      const operatingIncomeFull = grossProfit.value - opexTotal.value;
      operatingIncome = estimateLine(operatingIncomeFull, [
        Object.freeze({ from: `gross_profit.${period}`, value: grossProfit.value }),
        Object.freeze({ from: `costs.opex_total.${period}`, value: opexTotal.value }),
      ]);
    }

    byPeriod[period] = Object.freeze({
      period,
      isHybrid,
      provenance: isHybrid ? 'hybrid' : 'estimate',
      revenue: Object.freeze({
        segments: Object.freeze({ ...segments }),
        total,
      }),
      costs: Object.freeze({ ...costs, opex_total: opexTotal }),
      gross_profit: grossProfit,
      operating_income: operatingIncome,
      subscribers: subs,
      isComputed: true,
      isEstimate: true,
      derivedFrom: Object.freeze([
        citationOf(subsOpeningRow),
        citationOf(subsMidRow),
        Object.freeze({ driver: 'paid_subscriber_growth', value: subsGrowth }),
        Object.freeze({ driver: 'subscription_arpu', value: arpu }),
      ]),
    });
  });

  // ── Context (non-cascade, disclosure only) ───────────────────────────────
  const mauRow = findRow(rows, 'mau', baseYear);
  const dauRow = findRow(rows, 'dau', h1Quarters[1]);

  const output = {
    horizon,
    baseYear: FORECAST_BASE_YEAR,
    periods: Object.freeze(periods),
    units: MONEY_UNITS,
    drivers: Object.freeze({
      paid_subscriber_growth: subsGrowth,
      subscription_arpu: arpu,
      ...growthBySegment,
      ...pctByCost,
    }),
    anchors: Object.freeze({
      baseFiscalYear: baseYear,
      segments: Object.freeze({ ...segmentAnchors }),
      revenueTotalH1PriorYear: Object.freeze({
        value: priorH1YtdRow.value - priorH1TailRow.value,
        units: MONEY_UNITS,
        isComputed: true,
        isEstimate: false,
        derivedFrom: Object.freeze([citationOf(priorH1YtdRow), citationOf(priorH1TailRow)]),
      }),
    }),
    subscribers: Object.freeze({ ...subscribers }),
    byPeriod: Object.freeze(byPeriod),
    context: Object.freeze({
      subscriberAnchors: Object.freeze({
        opening: citationOf(subsOpeningRow),
        midYear: citationOf(subsMidRow),
      }),
      // MAU/DAU are context only — the cascade is built on paid subscribers.
      // MAU reporting is stale in the corpus (last filed Q3 FY2025), so no
      // forecast is built from it.
      mau: mauRow
        ? Object.freeze({
            lastFiledPeriod: mauRow.period,
            value: mauRow.value,
            citation: citationOf(mauRow),
            note: 'Context only. MAU reporting is stale in the corpus (last filed Q3 FY2025); building the revenue cascade on MAU is prohibited by the P3.1 contract.',
          })
        : null,
      dau: dauRow
        ? Object.freeze({
            lastFiledPeriod: dauRow.period,
            value: dauRow.value,
            citation: citationOf(dauRow),
            note: 'Context only. DAU is not a cascade input.',
          })
        : null,
    }),
    historical,
    isComputed: true,
    isEstimate: true,
  };

  return deepFreeze(output);
}

export default {
  project,
  forecastPeriods,
  normalizeHorizon,
  FORECAST_UNITS,
  REVENUE_SEGMENT_KEYS,
  SEGMENT_METRIC_BY_KEY,
  SEGMENT_GROWTH_DRIVER_BY_KEY,
  COST_LINE_KEYS,
  OPEX_LINE_KEYS,
  COST_METRIC_BY_KEY,
  COST_DRIVER_BY_KEY,
  SUBSCRIBER_METRIC,
};
