/**
 * TTM (Trailing Twelve Months) calculation engine.
 *
 * Computes TTM values for flow metrics by differencing YTD rows and summing the
 * four discrete quarters of the TTM window (Q3 FY2025 + Q4 FY2025 [derived] +
 * Q1 FY2026 + Q2 FY2026).
 *
 * Stock metrics resolve to the latest reported balance date (e.g. Q2 FY2026).
 * KPI metrics resolve to the latest reported figure.
 *
 * All engine outputs are marked `isComputed: true` and carry the derived-from chain.
 *
 * PURE MODULE: deterministic pure functions, zero side effects (no DOM, no network, no injected clock reads, no RNG).
 *
 * @module engine/ttm
 */

import { extractRows } from '../data/schema.js';

/**
 * Standard TTM window quarter identifiers.
 */
export const TTM_WINDOW_QUARTERS = Object.freeze([
  'Q3 FY2025',
  'Q4 FY2025',
  'Q1 FY2026',
  'Q2 FY2026',
]);

/**
 * Normalizes dataset input into flat arrays of records.
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
 * Helper to look up a metric value by period and periodType.
 *
 * @param {Array<object>} rows
 * @param {string} metric
 * @param {string} period
 * @param {string} [periodType]
 * @returns {object|null}
 */
function findRow(rows, metric, period, periodType) {
  return rows.find(
    (r) =>
      r.metric === metric &&
      r.period === period &&
      (periodType === undefined || r.periodType === periodType)
  ) || null;
}

/**
 * Derives discrete quarterly values for a flow metric.
 *
 * Uses:
 * 1. Discrete quarters already present in data (periodType: 'quarter').
 * 2. 10-Q YTD differencing:
 *    - Q1 FY2026 = 3M FY2026 (ytd)
 *    - Q2 FY2026 = 6M FY2026 (ytd) - 3M FY2026 (ytd)
 *    - Q3 FY2025 = 9M FY2025 (ytd) - 6M FY2025 (ytd) (or discrete Q3 if filed)
 *    - Q4 FY2025 = FY2025 (annual) - 9M FY2025 (ytd)
 *
 * @param {Array<object>} rows All dataset rows for a given metric
 * @param {string} metric Metric name
 * @returns {Map<string, { value: number, isDerived: boolean, constituents: Array<object> }>}
 */
export function deriveDiscreteQuarters(rows, metric) {
  const metricRows = rows.filter((r) => r.metric === metric);
  const discreteMap = new Map();

  // 1. Direct discrete quarter rows
  for (const r of metricRows) {
    if (r.periodType === 'quarter') {
      discreteMap.set(r.period, {
        value: r.value,
        isDerived: false,
        constituents: [r],
      });
    }
  }

  // 2. Q1 FY2026 from 3M FY2026 YTD (if not already discrete)
  if (!discreteMap.has('Q1 FY2026')) {
    const r3m = findRow(metricRows, metric, '3M FY2026', 'ytd');
    if (r3m) {
      discreteMap.set('Q1 FY2026', {
        value: r3m.value,
        isDerived: true,
        constituents: [r3m],
      });
    }
  }

  // 3. Q2 FY2026 from 6M FY2026 - 3M FY2026 (if not already discrete)
  if (!discreteMap.has('Q2 FY2026')) {
    const r6m = findRow(metricRows, metric, '6M FY2026', 'ytd');
    const r3m = findRow(metricRows, metric, '3M FY2026', 'ytd');
    if (r6m && r3m) {
      discreteMap.set('Q2 FY2026', {
        value: r6m.value - r3m.value,
        isDerived: true,
        constituents: [r6m, r3m],
      });
    }
  }

  // 4. Q3 FY2025 from 9M FY2025 - 6M FY2025 (if not already discrete)
  if (!discreteMap.has('Q3 FY2025')) {
    const r9m = findRow(metricRows, metric, '9M FY2025', 'ytd');
    const r6m = findRow(metricRows, metric, '6M FY2025', 'ytd');
    if (r9m && r6m) {
      discreteMap.set('Q3 FY2025', {
        value: r9m.value - r6m.value,
        isDerived: true,
        constituents: [r9m, r6m],
      });
    }
  }

  // 5. Q4 FY2025 derived as FY2025 - 9M FY2025 (if not already discrete)
  if (!discreteMap.has('Q4 FY2025')) {
    const rFy = findRow(metricRows, metric, 'FY2025', 'fiscal_year');
    const r9m = findRow(metricRows, metric, '9M FY2025', 'ytd');
    if (rFy && r9m) {
      discreteMap.set('Q4 FY2025', {
        value: rFy.value - r9m.value,
        isDerived: true,
        constituents: [rFy, r9m],
      });
    }
  }

  return discreteMap;
}

/**
 * Period ordering comparator for finding the latest reported period.
 */
const PERIOD_SORT_ORDER = Object.freeze({
  'FY2021': 2021.4,
  'FY2022': 2022.4,
  'FY2023': 2023.4,
  'FY2024': 2024.4,
  'FY2025': 2025.4,
  '3M FY2025': 2025.1,
  'Q1 FY2025': 2025.1,
  '6M FY2025': 2025.2,
  'Q2 FY2025': 2025.2,
  '9M FY2025': 2025.3,
  'Q3 FY2025': 2025.3,
  'Q4 FY2025': 2025.4,
  '3M FY2026': 2026.1,
  'Q1 FY2026': 2026.1,
  '6M FY2026': 2026.2,
  'Q2 FY2026': 2026.2,
  '9M FY2026': 2026.3,
  'Q3 FY2026': 2026.3,
  'Q4 FY2026': 2026.4,
  'FY2026': 2026.4,
});

function periodScore(period) {
  if (PERIOD_SORT_ORDER[period] !== undefined) {
    return PERIOD_SORT_ORDER[period];
  }
  const match = period.match(/(?:FY)?(\d{4})/);
  return match ? Number(match[1]) : 0;
}

/**
 * Main TTM computation entrypoint.
 *
 * @param {object|Array} historical Loaded historical dataset
 * @returns {{
 *   records: Array<object>,
 *   byMetric: Map<string, object>,
 *   discreteQuarters: Map<string, Map<string, object>>,
 *   flow: Array<object>,
 *   stock: Array<object>,
 *   kpi: Array<object>
 * }}
 */
export function compute(historical) {
  const rows = toFlatRows(historical);
  const byMetricMap = new Map();
  const discreteQuartersByMetric = new Map();

  const flowRecords = [];
  const stockRecords = [];
  const kpiRecords = [];

  // Group rows by metric
  const metricGroups = new Map();
  for (const row of rows) {
    if (!metricGroups.has(row.metric)) {
      metricGroups.set(row.metric, []);
    }
    metricGroups.get(row.metric).push(row);
  }

  for (const [metric, mRows] of metricGroups.entries()) {
    const proto = mRows[0];
    const klass = proto.klass;

    if (klass === 'flow') {
      const discreteMap = deriveDiscreteQuarters(rows, metric);
      discreteQuartersByMetric.set(metric, discreteMap);

      // Check if all 4 TTM window quarters are available
      const hasAllQuarters = TTM_WINDOW_QUARTERS.every((q) => discreteMap.has(q));

      if (hasAllQuarters) {
        let ttmSum = 0;
        const derivedFrom = [];

        for (const q of TTM_WINDOW_QUARTERS) {
          const entry = discreteMap.get(q);
          ttmSum += entry.value;
          derivedFrom.push({
            period: q,
            value: entry.value,
            isDerived: entry.isDerived,
            constituents: entry.constituents.map((c) => ({
              metric: c.metric,
              period: c.period,
              periodType: c.periodType,
              value: c.value,
            })),
          });
        }

        const computedRow = {
          metric,
          label: proto.label,
          klass: 'flow',
          period: 'TTM',
          periodType: 'ttm',
          value: ttmSum,
          units: proto.units,
          scale: proto.scale,
          isComputed: true,
          derivedFrom,
          isEstimate: false,
        };

        flowRecords.push(computedRow);
        byMetricMap.set(metric, computedRow);
      }
    } else if (klass === 'stock') {
      // Stock metrics: take latest-dated balance sheet row
      let latestRow = mRows[0];
      let maxScore = periodScore(latestRow.period);

      for (let i = 1; i < mRows.length; i++) {
        const score = periodScore(mRows[i].period);
        if (score > maxScore) {
          maxScore = score;
          latestRow = mRows[i];
        }
      }

      const computedRow = {
        metric,
        label: latestRow.label,
        klass: 'stock',
        period: latestRow.period,
        periodType: latestRow.periodType,
        value: latestRow.value,
        units: latestRow.units,
        scale: latestRow.scale,
        isComputed: true,
        derivedFrom: [
          {
            period: latestRow.period,
            periodType: latestRow.periodType,
            value: latestRow.value,
            isDerived: false,
          },
        ],
        isEstimate: false,
      };

      stockRecords.push(computedRow);
      byMetricMap.set(metric, computedRow);
    } else if (klass === 'kpi') {
      // KPI metrics: take latest reported value
      let latestRow = mRows[0];
      let maxScore = periodScore(latestRow.period);

      for (let i = 1; i < mRows.length; i++) {
        const score = periodScore(mRows[i].period);
        if (score > maxScore) {
          maxScore = score;
          latestRow = mRows[i];
        }
      }

      const computedRow = {
        metric,
        label: latestRow.label,
        klass: 'kpi',
        period: latestRow.period,
        periodType: latestRow.periodType,
        value: latestRow.value,
        units: latestRow.units,
        scale: latestRow.scale,
        definition: latestRow.definition,
        category: latestRow.category,
        isComputed: true,
        derivedFrom: [
          {
            period: latestRow.period,
            periodType: latestRow.periodType,
            value: latestRow.value,
            isDerived: false,
          },
        ],
        isEstimate: false,
      };

      kpiRecords.push(computedRow);
      byMetricMap.set(metric, computedRow);
    }
  }

  const allRecords = [...flowRecords, ...stockRecords, ...kpiRecords];

  return {
    records: allRecords,
    byMetric: byMetricMap,
    discreteQuarters: discreteQuartersByMetric,
    flow: flowRecords,
    stock: stockRecords,
    kpi: kpiRecords,
  };
}

export default {
  compute,
  deriveDiscreteQuarters,
  TTM_WINDOW_QUARTERS,
};
