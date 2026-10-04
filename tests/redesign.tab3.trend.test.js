/**
 * Redesign Phase 10 Test Suite — Tab 03: Trend Explorer Charts / Ratio Analysis Tabs.
 *
 * Covers Task RP10.3 Artifact Contract (§3.C invariants):
 *  - `TREND_EXPLORER_METRICS` exact-6 contract untouched (existing RP3.3 test green as-is).
 *  - Ratio bar charts handle nulls (dash labels, zero-height bars) and negatives (red, below-axis labels).
 *  - Year-select cross-talk preserved: bar clicks update `selectedTrendYear`; donut stays revenue-only
 *    and unmounts otherwise.
 *
 * Anti-tautology discipline (inherited from RP10.1 / RP10.2):
 *  - The catalogue projection is compared against the Director-approved §4 table transcribed here,
 *    not against the module's own output.
 *  - Every one of the 100 rendered period cells is compared cell-by-cell against the engine's
 *    `formatRatioById`, and every change cell against `formatRatioChange`.
 *  - Bar geometry is asserted against the chart's own zero grid line, so a regression in the
 *    null/negative handling cannot be explained away by a shifted baseline.
 *  - The `RATIO_TREND_METRICS` non-vacuity control sits adjacent to the exact-6 freeze: the frozen
 *    object must not grow while the additive projection must actually carry 20 trendable ratios.
 *
 * NOTE ON SCOPE: `tests/redesign.tab3.test.js` (frozen RP3 contract) and
 * `tests/redesign.tab3.ratios.test.js` (approved RP10.2 gate) are both left byte-untouched.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildTrendExplorerMarkup,
  buildRatioAnalysisMarkup,
  renderHistoricals,
  TREND_VIEWS,
  ANNUAL_PERIODS,
  RATIO_METRIC_PREFIX,
} from '../src/ui/historicalsTab.js';
import {
  createTrendBarChart,
  TREND_EXPLORER_METRICS,
  RATIO_TREND_METRICS,
} from '../src/ui/charts.js';
import {
  RATIO_DEFS,
  computeHistoricalRatios,
  formatRatioById,
  formatRatioChange,
} from '../src/engine/ratios.js';
import { loadHistorical } from '../src/data/loader.js';
import { readLedgerUrls } from './_ledger.js';
import {
  createInteractiveContainer,
  parseTrendBars,
  parseZeroLineY,
  parseAxisTicks,
} from './_interactive_container.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const CHARTS_PATH = path.join(ROOT, 'src/ui/charts.js');
const HISTORICALS_TAB_PATH = path.join(ROOT, 'src/ui/historicalsTab.js');
const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));

const readText = (loc) => fs.promises.readFile(loc, 'utf8');
const LEDGER = readLedgerUrls();

async function getHistorical() {
  return loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
}

/* ---------------------------------------------------------------------------
 * Independent anchors (transcribed from the phase contract, not from the module)
 * ------------------------------------------------------------------------- */

/** §4 catalogue table, in the order the Director approved it. */
const SECTION_4_CATALOGUE = Object.freeze({
  Profitability: ['gross_margin', 'operating_margin', 'net_margin', 'adjusted_ebitda_margin', 'effective_tax_rate'],
  Returns: ['roe', 'roa'],
  Liquidity: ['current_ratio', 'quick_ratio', 'cash_ratio'],
  Leverage: ['liabilities_to_equity', 'liabilities_to_assets', 'equity_ratio'],
  Efficiency: ['asset_turnover', 'dso', 'dpo'],
  'Cash Flow': ['ocf_margin', 'fcf_margin', 'fcf_conversion', 'capex_intensity'],
});

/** §4's FY2021 -> FY2025 column, as approved. */
const SECTION_4_SPOT_VALUES = Object.freeze([
  { id: 'gross_margin', fy2021: '72.4%', fy2025: '72.2%' },
  { id: 'current_ratio', fy2021: '5.20x', fy2025: '2.61x' },
  { id: 'dso', fy2021: '48d', fy2025: '57d' },
  { id: 'fcf_conversion', fy2021: ' - ', fy2025: '87%' },
  { id: 'effective_tax_rate', fy2021: ' - ', fy2025: '-127.0%' },
  { id: 'roe', fy2021: '-11.7%', fy2025: '38.1%' },
]);

/** The exact RP3.3 level-metric key set, frozen at 6. */
const FROZEN_LEVEL_KEYS = Object.freeze([
  'revenue', 'gross_profit', 'operating_income', 'net_income', 'cash', 'daus',
]);

/* ---------------------------------------------------------------------------
 * Markup slicing helpers
 * ------------------------------------------------------------------------- */

function analysisTableMarkup(markup) {
  const anchor = 'ratio-analysis-table';
  const start = markup.indexOf(anchor);
  assert.ok(start !== -1, 'analysis markup must contain the ratio analysis table');
  const end = markup.indexOf('</table>', start);
  assert.ok(end > start, 'analysis table must close');
  return markup.slice(start, end);
}

/**
 * Splits an analysis table into an ordered row list with kind + identity.
 *
 * @param {string} table
 * @returns {Array<{ kind: 'divider'|'ratio', category?: string, id?: string, raw: string }>}
 */
function analysisRowSequence(table) {
  const rowStarts = [...table.matchAll(/<tr class="([^"]*)"([^>]*)>/g)];
  return rowStarts.map((match, index) => {
    const next = rowStarts[index + 1];
    const raw = table.slice(match.index, next ? next.index : table.length);
    const cls = match[1];
    if (cls.includes('ratio-divider-row')) {
      const label = raw.match(/<td class="td-metric ratio-divider-label">([^<]*)<\/td>/);
      return { kind: 'divider', category: label ? label[1] : null, raw };
    }
    const id = (match[2].match(/data-ratio="([^"]+)"/) || [])[1];
    return { kind: 'ratio', id: id || null, raw };
  });
}

function periodCells(row) {
  return [...row.matchAll(/<td class="td-period[^"]*"[^>]*>([^<]*)<\/td>/g)].map((m) => m[1]);
}

/* ---------------------------------------------------------------------------
 * RP10.3 — Ratio Trend Metrics (charts.js projection)
 * ------------------------------------------------------------------------- */

describe('RP10.3 — Ratio Trend Metrics', () => {
  test('TREND_EXPLORER_METRICS stays frozen at exactly 6 (RP3.3 contract untouched)', () => {
    assert.deepEqual(Object.keys(TREND_EXPLORER_METRICS), [...FROZEN_LEVEL_KEYS]);
    assert.ok(Object.isFrozen(TREND_EXPLORER_METRICS), 'the level metric map must stay frozen');
  });

  test('RATIO_TREND_METRICS is a total projection of the frozen catalogue, in catalogue order', () => {
    const ratioKeys = Object.keys(RATIO_TREND_METRICS);
    assert.equal(ratioKeys.length, 20, 'every approved ratio must be trendable');
    assert.deepEqual(
      ratioKeys,
      RATIO_DEFS.map((def) => def.id),
      'projection order must equal catalogue order',
    );
    assert.ok(Object.isFrozen(RATIO_TREND_METRICS), 'the projection must be frozen');

    for (const def of RATIO_DEFS) {
      const entry = RATIO_TREND_METRICS[def.id];
      assert.ok(entry, `${def.id} must be present`);
      assert.equal(entry.name, def.label, `${def.id} name must come from the catalogue label`);
      assert.equal(entry.ratioId, def.id, `${def.id} must point back at its catalogue id`);
      assert.equal(entry.kind, def.kind, `${def.id} kind must come from the catalogue`);
      assert.equal(entry.decimals, def.decimals, `${def.id} decimals must come from the catalogue`);
      assert.equal(entry.statement, def.statement, `${def.id} statement must come from the catalogue`);
      assert.ok(Object.isFrozen(entry), `${def.id} entry must be frozen`);
    }

    // Non-vacuity control: the frozen level map did not absorb any ratio, so the
    // union the chart accepts is genuinely 6 + 20 and not 26 level metrics.
    for (const id of ratioKeys) {
      assert.ok(!(id in TREND_EXPLORER_METRICS), `${id} must not be smuggled into the frozen level map`);
    }
  });

  test('all three axis families are reachable through the public chart API', async () => {
    const historical = await getHistorical();
    const families = { '%': 'gross_margin', x: 'current_ratio', d: 'dso' };

    for (const [suffix, metricId] of Object.entries(families)) {
      const chart = createTrendBarChart({ container: null, metric: metricId, historical });
      const ticks = parseAxisTicks(chart.svg);
      assert.ok(ticks.length > 0, `${metricId} must render axis ticks`);
      assert.ok(
        ticks.every((tick) => tick.endsWith(suffix)),
        `${metricId} axis ticks must carry the "${suffix}" unit suffix, got: ${ticks.join(' ')}`,
      );
    }
  });

  test('the level-metric axis stays unitless and keeps the historical floor', async () => {
    const historical = await getHistorical();
    const chart = createTrendBarChart({ container: null, metric: 'revenue', historical });
    const ticks = parseAxisTicks(chart.svg);
    assert.ok(ticks.length > 0, 'revenue must render axis ticks');
    assert.ok(
      ticks.every((tick) => /^[0-9,]+$/.test(tick)),
      `level metric ticks must stay unitless, got: ${ticks.join(' ')}`,
    );
  });

  test('update() accepts ratio keys and still rejects unknown keys (adjacent negative control)', async () => {
    const historical = await getHistorical();
    const chart = createTrendBarChart({ container: null, metric: 'revenue', historical });

    chart.update('current_ratio');
    assert.equal(chart.getActiveMetric(), 'current_ratio');
    assert.ok(
      parseAxisTicks(chart.svg).every((tick) => tick.endsWith('x')),
      'switching to a multiple ratio must switch the axis to the x family',
    );

    chart.update('not_a_metric');
    assert.equal(chart.getActiveMetric(), 'current_ratio', 'an unknown key must not move the chart');
  });
});

/* ---------------------------------------------------------------------------
 * RP10.3 — Ratio bar geometry (nulls, negatives, baseline)
 * ------------------------------------------------------------------------- */

describe('RP10.3 — Ratio Bar Geometry', () => {
  test('null ratio periods render a zero-height bar with the shared dash label', async () => {
    const historical = await getHistorical();
    const ratios = computeHistoricalRatios(historical);
    const values = ratios.ratios.effective_tax_rate.values;

    const chart = createTrendBarChart({ container: null, metric: 'effective_tax_rate', historical });
    const svg = chart.svg;
    const bars = parseTrendBars(svg);
    const zeroY = parseZeroLineY(svg);

    assert.equal(bars.length, 5, 'every period must render a bar slot, including null ones');
    assert.ok(Number.isFinite(zeroY), 'the zero grid line must be present');

    const nullPeriods = ANNUAL_PERIODS.filter((period) => !Number.isFinite(values[period]));
    assert.equal(nullPeriods.length, 2, 'fixture precondition: two NM periods for the tax rate');

    for (const period of nullPeriods) {
      const bar = bars.find((entry) => entry.period === period);
      assert.equal(bar.height, 0, `${period} must render a zero-height bar, never a fabricated zero`);
      // The engine's shared dash is ` - `; SVG whitespace collapsing renders it as a
      // bare hyphen, so the comparison is against the engine render, not a literal.
      assert.equal(
        bar.label,
        formatRatioById('effective_tax_rate', values[period]).trim(),
        `${period} must carry the shared dash label`,
      );
      assert.ok(
        Math.abs(bar.labelY - (zeroY - 6)) < 0.05,
        `${period} dash label must sit just above the zero line (got ${bar.labelY} vs ${zeroY - 6})`,
      );
    }

    // Non-vacuity control: the same chart does render real bars in the same run.
    const realBars = bars.filter((bar) => bar.height > 0);
    assert.equal(realBars.length, 3, 'the three finite periods must still render real bars');
  });

  test('negative ratio periods render red, below the zero line; positives render blue above it', async () => {
    const historical = await getHistorical();
    const ratios = computeHistoricalRatios(historical);
    const values = ratios.ratios.effective_tax_rate.values;
    assert.ok(values.FY2025 < 0, 'fixture precondition: FY2025 tax rate is negative');

    const chart = createTrendBarChart({ container: null, metric: 'effective_tax_rate', historical });
    const bars = parseTrendBars(chart.svg);
    const zeroY = parseZeroLineY(chart.svg);

    const negative = bars.find((bar) => bar.period === 'FY2025');
    assert.equal(negative.fill, '#ef4444', 'a negative ratio bar must use the red-negative convention');
    assert.ok(negative.labelY > zeroY, 'a negative bar label must sit below the zero line');
    assert.equal(negative.label, formatRatioById('effective_tax_rate', values.FY2025).trim());

    const positive = bars.find((bar) => bar.period === 'FY2024');
    assert.equal(positive.fill, '#2563eb', 'a positive ratio bar must use the blue-positive convention');
    assert.ok(positive.labelY < zeroY, 'a positive bar label must sit above the zero line');
    assert.equal(positive.label, formatRatioById('effective_tax_rate', values.FY2024).trim());
  });

  test('every ratio bar label equals the engine formatter for that period', async () => {
    const historical = await getHistorical();
    const ratios = computeHistoricalRatios(historical);

    let compared = 0;
    for (const metricId of Object.keys(RATIO_TREND_METRICS)) {
      const chart = createTrendBarChart({ container: null, metric: metricId, historical });
      const bars = parseTrendBars(chart.svg);
      assert.equal(bars.length, ANNUAL_PERIODS.length, `${metricId} must render one bar per period`);
      for (const bar of bars) {
        const expected = formatRatioById(metricId, ratios.ratios[metricId].values[bar.period]).trim();
        assert.equal(bar.label, expected, `${metricId} ${bar.period} label must equal the engine render`);
        compared += 1;
      }
    }
    assert.equal(compared, 100, 'all 20 ratios x 5 periods must be compared');
  });

  test('ratio bar charts never emit an em dash or an unformatted value', async () => {
    const historical = await getHistorical();
    for (const metricId of Object.keys(RATIO_TREND_METRICS)) {
      const chart = createTrendBarChart({ container: null, metric: metricId, historical });
      const svg = chart.svg;
      assert.ok(!svg.includes('\u2014'), `${metricId} must not emit an em dash`);
      assert.ok(!svg.includes('NaN'), `${metricId} must not emit NaN`);
      assert.ok(!svg.includes('undefined'), `${metricId} must not emit undefined`);
    }
  });
});

/* ---------------------------------------------------------------------------
 * RP10.3 — Trend Explorer view switcher & ratio pill row
 * ------------------------------------------------------------------------- */

describe('RP10.3 — Trend Explorer View Switcher', () => {
  test('markup exposes a two-view switcher on the statement-switcher pill pattern', () => {
    const markup = buildTrendExplorerMarkup('revenue', 'charts', {});
    assert.deepEqual(TREND_VIEWS.map((view) => view.key), ['charts', 'ratio']);
    assert.deepEqual(TREND_VIEWS.map((view) => view.label), ['Charts', 'Ratio Analysis']);

    const tabs = [...markup.matchAll(/<button[^>]*class="([^"]*)"[^>]*data-trend-view="([^"]+)"[^>]*aria-selected="([^"]+)"/g)];
    assert.equal(tabs.length, 2, 'exactly two view tabs');
    for (const tab of tabs) {
      assert.ok(tab[1].includes('statement-pill-btn'), 'view tabs must reuse the statement pill button');
      assert.equal(tab[3], tab[2] === 'charts' ? 'true' : 'false');
    }
    assert.ok(/role="tablist"[^>]*aria-label="Trend Explorer View Switcher"/.test(markup));
  });

  test('the Charts panel carries 6 level pills plus 20 ratio pills, and the ratio row is additive', () => {
    const markup = buildTrendExplorerMarkup('revenue', 'charts', {});

    const levelGroup = markup.slice(
      markup.indexOf('aria-label="Trend Explorer Metric Switcher"'),
      markup.indexOf('aria-label="Trend Explorer Ratio Switcher"'),
    );
    const ratioGroup = markup.slice(markup.indexOf('aria-label="Trend Explorer Ratio Switcher"'));

    const levelPills = [...levelGroup.matchAll(/data-trend-metric="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(levelPills, [...FROZEN_LEVEL_KEYS], 'the level row must stay the frozen 6, in order');

    const ratioPills = [...ratioGroup.matchAll(/data-trend-metric="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ratioPills, Object.keys(RATIO_TREND_METRICS), 'the ratio row must project the catalogue');

    // The ratio hook is a grouping/spacing hook only: every ratio pill also carries
    // the shared `.trend-pill-btn`, and no level pill carries the ratio hook.
    const ratioPillTags = [...ratioGroup.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
    assert.equal(ratioPillTags.length, 20);
    for (const tag of ratioPillTags) {
      assert.ok(tag.includes('trend-pill-btn'), 'a ratio pill must reuse the shared trend pill button');
      assert.ok(tag.includes('trend-pill-btn-ratio'), 'a ratio pill must carry the ratio grouping hook');
    }
    const levelPillTags = [...levelGroup.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
    for (const tag of levelPillTags) {
      assert.ok(!tag.includes('trend-pill-btn-ratio'), 'a level pill must not carry the ratio hook');
    }
  });

  test('the inactive panel is the one marked hidden, and the default view is charts', () => {
    const chartsView = buildTrendExplorerMarkup('revenue', 'charts', {});
    const chartsPanel = chartsView.match(/<div class="([^"]*)" data-trend-view-panel="charts"/);
    const ratioPanel = chartsView.match(/<div class="([^"]*)" data-trend-view-panel="ratio"/);
    assert.ok(chartsPanel && !chartsPanel[1].includes('hidden'), 'the charts panel is active by default');
    assert.ok(ratioPanel && ratioPanel[1].includes('hidden'), 'the ratio panel starts hidden');

    const ratioView = buildTrendExplorerMarkup('revenue', 'ratio', {});
    assert.ok(!ratioView.match(/<div class="([^"]*)" data-trend-view-panel="ratio"/)[1].includes('hidden'));
    assert.ok(ratioView.match(/<div class="([^"]*)" data-trend-view-panel="charts"/)[1].includes('hidden'));

    // An unknown view key fails closed to the default rather than hiding both panels.
    const bogus = buildTrendExplorerMarkup('revenue', 'nope', {});
    assert.ok(!bogus.match(/<div class="([^"]*)" data-trend-view-panel="charts"/)[1].includes('hidden'));
  });

  test('renderHistoricals wires the view switcher without disturbing the chart instances', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({ container, historical });

    assert.equal(view.getTrendView(), 'charts');

    const ratioButton = container.querySelectorAll('.trend-view-btn').find(
      (btn) => btn.getAttribute('data-trend-view') === 'ratio',
    );
    assert.ok(ratioButton, 'the Ratio Analysis tab must be rendered');
    const barChartBefore = view.trendBarChart;
    const donutBefore = view.revenueDonutChart;
    assert.ok(barChartBefore && donutBefore);

    ratioButton.dispatch('click');
    assert.equal(view.getTrendView(), 'ratio');
    assert.equal(
      container.querySelector('[data-trend-view-panel="charts"]').classList.contains('hidden'),
      true,
      'the charts panel must hide',
    );
    assert.equal(
      container.querySelector('[data-trend-view-panel="ratio"]').classList.contains('hidden'),
      false,
      'the ratio panel must show',
    );
    // View switching is a visibility toggle only: the mounted charts survive it.
    assert.equal(view.trendBarChart, barChartBefore, 'the bar chart instance must not be re-created');
    assert.equal(view.revenueDonutChart, donutBefore, 'the donut instance must not be re-created');

    const chartsButton = container.querySelectorAll('.trend-view-btn').find(
      (btn) => btn.getAttribute('data-trend-view') === 'charts',
    );
    chartsButton.dispatch('click');
    assert.equal(view.getTrendView(), 'charts');
    assert.equal(container.querySelector('[data-trend-view-panel="ratio"]').classList.contains('hidden'), true);

    view.setTrendView('nope');
    assert.equal(view.getTrendView(), 'charts', 'an unknown view key must not move the switcher');

    view.dispose();
  });

  test('a ratio pill drives the chart, keeps the donut revenue-only, and preserves year cross-talk', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({ container, historical });

    const ratioPill = container.querySelectorAll('.trend-pill-btn').find(
      (btn) => btn.getAttribute('data-trend-metric') === 'current_ratio',
    );
    assert.ok(ratioPill, 'a ratio pill must be rendered');
    assert.ok(ratioPill.classList.contains('trend-pill-btn-ratio'));

    ratioPill.dispatch('click');
    assert.equal(view.getTrendMetric(), 'current_ratio');
    assert.equal(view.trendBarChart.getActiveMetric(), 'current_ratio', 'the pill must actually drive the chart');
    assert.equal(view.revenueDonutChart, null, 'the donut must unmount off revenue');
    assert.equal(container.querySelector('#revenue-donut-card'), null, 'the donut card DOM must be removed');
    assert.ok(container.querySelector('#trend-charts-grid').classList.contains('single-chart'));

    // Ratio pills share the statement pills' active-state contract.
    for (const btn of container.querySelectorAll('.trend-pill-btn')) {
      const isActive = btn.getAttribute('data-trend-metric') === 'current_ratio';
      assert.equal(btn.classList.contains('active'), isActive, 'exactly one pill may be active');
      assert.equal(btn.getAttribute('aria-selected'), isActive ? 'true' : 'false');
    }

    // Year cross-talk survives on a ratio chart.
    const barItem = container.querySelectorAll('.trend-bar-item').find(
      (el) => el.getAttribute('data-period') === 'FY2023',
    );
    assert.ok(barItem, 'ratio bar items must be rendered');
    barItem.dispatch('click');
    assert.equal(view.getSelectedTrendYear(), 'FY2023', 'bar clicks must still move the selected year');

    view.setTrendMetric('revenue');
    assert.ok(view.revenueDonutChart, 'the donut must re-mount on revenue');
    assert.equal(view.getSelectedTrendYear(), 'FY2023', 'the selected year must be preserved across the switch');

    view.dispose();
  });
});

/* ---------------------------------------------------------------------------
 * RP10.3 — Ratio Analysis table content
 * ------------------------------------------------------------------------- */

describe('RP10.3 — Ratio Analysis Table', () => {
  test('rows follow the approved §4 grouping and order exactly', async () => {
    const historical = await getHistorical();
    const sequence = analysisRowSequence(analysisTableMarkup(buildRatioAnalysisMarkup(historical)));

    const expected = [];
    for (const [category, ids] of Object.entries(SECTION_4_CATALOGUE)) {
      expected.push({ kind: 'divider', category });
      for (const id of ids) expected.push({ kind: 'ratio', id });
    }

    assert.deepEqual(
      sequence.map((row) => (row.kind === 'divider' ? { kind: 'divider', category: row.category } : { kind: 'ratio', id: row.id })),
      expected,
      'the table must render one band per category, immediately followed by that category rows',
    );

    const ratioIds = sequence.filter((row) => row.kind === 'ratio').map((row) => row.id);
    assert.equal(ratioIds.length, 20);
    assert.deepEqual(
      ratioIds,
      Object.values(SECTION_4_CATALOGUE).flat(),
      'row order must equal the approved §4 order',
    );
  });

  test('every rendered cell equals the engine render, and §4 spot values hold', async () => {
    const historical = await getHistorical();
    const ratios = computeHistoricalRatios(historical);
    const markup = buildRatioAnalysisMarkup(historical);
    const table = analysisTableMarkup(markup);

    let periodComparisons = 0;
    let changeComparisons = 0;

    for (const row of analysisRowSequence(table)) {
      if (row.kind !== 'ratio') continue;
      const cells = periodCells(row.raw);
      assert.equal(cells.length, 6, `${row.id} must emit 5 period cells plus the change cell`);

      ANNUAL_PERIODS.forEach((period, index) => {
        const expected = formatRatioById(row.id, ratios.ratios[row.id].values[period]);
        assert.equal(cells[index], expected, `${row.id} ${period} must equal the engine render`);
        periodComparisons += 1;
      });

      const values = ratios.ratios[row.id].values;
      const expectedChange = formatRatioChange(
        row.id,
        Number.isFinite(values.FY2021) ? values.FY2021 : null,
        Number.isFinite(values.FY2025) ? values.FY2025 : null,
      );
      assert.equal(cells[5], expectedChange, `${row.id} change cell must equal the engine render`);
      changeComparisons += 1;
    }

    assert.equal(periodComparisons, 100, 'all 20 ratios x 5 annual periods must be compared');
    assert.equal(changeComparisons, 20, 'all 20 change cells must be compared');

    // External truth: the §4 column, transcribed independently of the engine.
    for (const pin of SECTION_4_SPOT_VALUES) {
      const row = analysisRowSequence(table).find((entry) => entry.id === pin.id);
      const cells = periodCells(row.raw);
      assert.equal(cells[0], pin.fy2021, `${pin.id} FY2021 must match the approved §4 column`);
      assert.equal(cells[4], pin.fy2025, `${pin.id} FY2025 must match the approved §4 column`);
    }
  });

  test('rows carry row semantics and the computed badge; bands carry neither', async () => {
    const historical = await getHistorical();
    const table = analysisTableMarkup(buildRatioAnalysisMarkup(historical));

    for (const row of analysisRowSequence(table)) {
      if (row.kind === 'divider') {
        assert.ok(!row.raw.includes('data-metric'), 'a band must not carry a metric key');
        assert.ok(!row.raw.includes('tabindex'), 'a band must not be keyboard reachable');
        assert.ok(row.raw.includes('role="row"'), 'a band must keep row semantics');
        assert.equal(periodCells(row.raw).length, 6, 'a band must keep the full column count');
        continue;
      }
      assert.ok(row.raw.includes(`data-metric="${RATIO_METRIC_PREFIX}${row.id}"`), `${row.id} must carry the ratio key`);
      assert.ok(row.raw.includes('tabindex="0"'), `${row.id} must stay keyboard reachable`);
      assert.ok(row.raw.includes('role="row"'), `${row.id} must keep row semantics`);
      assert.ok(row.raw.includes('badge-computed'), `${row.id} must be marked via the shared computed badge`);
    }
  });

  test('the table header and footnote carry the RP10.3 title block and change column', () => {
    const markup = buildRatioAnalysisMarkup({});
    assert.ok(markup.includes('ratio-analysis-title-block'), 'the §5.1 title block must be present');
    assert.ok(markup.includes('ratio-analysis-main-title'), 'the §5.1 title must be present');
    assert.ok(markup.includes('ratio-analysis-subtitle'), 'the §5.1 subtitle must be present');
    assert.ok(markup.includes('Change FY21-25'), 'the change column header must be present');
    assert.ok(markup.includes('statement-footnote'), 'the standing footnote block must be present');
    assert.ok(!markup.includes('\u2014'), 'no em dash may appear in user-visible copy');
  });

  test('an empty dataset fails closed to dashes without throwing (with a non-vacuity control)', async () => {
    const empty = buildRatioAnalysisMarkup({});
    const emptyRows = analysisRowSequence(analysisTableMarkup(empty)).filter((row) => row.kind === 'ratio');
    assert.equal(emptyRows.length, 20, 'the catalogue still renders with no data');
    for (const row of emptyRows) {
      for (const cell of periodCells(row.raw)) {
        assert.equal(cell, ' - ', 'an absent value must render the shared dash, never a zero');
      }
    }

    const historical = await getHistorical();
    const populated = buildRatioAnalysisMarkup(historical);
    const populatedCells = analysisRowSequence(analysisTableMarkup(populated))
      .filter((row) => row.kind === 'ratio')
      .flatMap((row) => periodCells(row.raw));
    assert.ok(
      populatedCells.some((cell) => cell !== ' - '),
      'control: a populated dataset must render real values, so the all-dash result above is meaningful',
    );
  });

  test('renderHistoricals mounts the analysis table inside the ratio panel', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({ container, historical });

    const panel = container.querySelector('[data-trend-view-panel="ratio"]');
    assert.ok(panel, 'the ratio panel must be rendered');
    assert.ok(container.querySelector('.ratio-analysis-table'), 'the analysis table must be mounted');

    // The container-level markup is the ground truth for containment and counts:
    // descendant combinators are deliberately not implemented by the harness.
    const markup = container.innerHTML;
    const panelStart = markup.indexOf('data-trend-view-panel="ratio"');
    const panelEnd = markup.indexOf('data-trend-view-panel="charts"', panelStart + 1);
    const panelMarkup = panelEnd === -1 ? markup.slice(panelStart) : markup.slice(panelStart, panelEnd);
    assert.ok(
      panelMarkup.includes('ratio-analysis-table'),
      'the analysis table must sit inside the ratio panel',
    );
    assert.equal((panelMarkup.match(/class="statement-row row-ratio ratio-analysis-row"/g) || []).length, 20);
    assert.equal((panelMarkup.match(/ratio-divider-row/g) || []).length, 6);

    // Data-flow control: the live path must hand the corpus to the analysis
    // builder. A structural-only gate would pass with every cell dashed, so the
    // rendered panel is compared against the engine for a real value.
    const ratios = computeHistoricalRatios(historical);
    const firstRow = panelMarkup.match(/<tr class="statement-row row-ratio ratio-analysis-row"[\s\S]*?<\/tr>/)[0];
    const cells = periodCells(firstRow);
    ANNUAL_PERIODS.forEach((period, index) => {
      assert.equal(
        cells[index],
        formatRatioById('gross_margin', ratios.ratios.gross_margin.values[period]),
        `the live panel must render the engine value for gross_margin ${period}`,
      );
    });
    assert.ok(
      cells.some((cell) => cell !== ' - '),
      'the live analysis panel must not render as an all-dash table',
    );

    view.dispose();
  });
});

/* ---------------------------------------------------------------------------
 * RP10.3 (F1) — Ratio Analysis row wiring
 *
 * The first submission shipped the analysis rows as a dead skeleton: focusable,
 * hover-styled and keyed with `data-metric`, with a footnote promising selection,
 * but with no handler bound. The Trend Explorer card is a sibling of the
 * statement workspace container, so the workspace's own `.statement-row` binding
 * never reached them. These gates assert the *behaviour* (a click and an Enter
 * actually open the drawer) and the *inventory* (every row carries exactly one
 * click and one keydown handler), so a future unbound row cannot pass.
 * ------------------------------------------------------------------------- */

describe('RP10.3 (F1) — Ratio Analysis Row Wiring', () => {
  test('every analysis row carries exactly one click and one keydown handler', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({ container, historical });

    const rows = container.querySelectorAll('.ratio-analysis-row');
    assert.equal(rows.length, 20, 'all 20 catalogue ratios must be wired');
    for (const row of rows) {
      const id = row.getAttribute('data-ratio');
      assert.equal(row.listenerCount('click'), 1, `${id} must have exactly one click handler`);
      assert.equal(row.listenerCount('keydown'), 1, `${id} must have exactly one keydown handler`);
    }

    // No band may be wired, and no band may look selectable. The band count is
    // pinned against the panel markup in the mount gate above; here every band in
    // the container is checked, which also covers the statement footers.
    const bands = container.querySelectorAll('.ratio-divider-row');
    assert.ok(bands.length >= 6, 'control: the analysis bands must be present');
    for (const band of bands) {
      assert.equal(band.listenerCount('click'), 0, 'a band must stay inert');
      assert.equal(band.listenerCount('keydown'), 0, 'a band must stay inert');
      assert.equal(band.getAttribute('data-metric'), null, 'a band must carry no metric key');
      assert.equal(band.getAttribute('tabindex'), null, 'a band must stay out of the tab order');
      assert.ok(!band.classList.contains('ratio-analysis-row'), 'a band must not carry the row hook');
    }

    // Control: the workspace's own ratio footers must not be double-bound by the
    // new handler. The harness keeps the pre-render workspace copy as well, which
    // is never bound, so the gate is "no row carries more than one handler" plus
    // "the workspace binding is still live".
    const workspaceRatioRows = container.querySelectorAll('.row-ratio').filter(
      (row) => !row.classList.contains('ratio-analysis-row'),
    );
    assert.ok(workspaceRatioRows.length > 0, 'control: the statement footers must still render');
    const workspaceClickCounts = workspaceRatioRows.map((row) => row.listenerCount('click'));
    assert.ok(
      workspaceClickCounts.every((count) => count <= 1),
      'no statement footer ratio row may be double-bound by the analysis-row handler',
    );
    assert.ok(
      workspaceClickCounts.includes(1),
      'control: the workspace ratio-row binding must still be active',
    );

    view.dispose();
  });

  test('clicking an analysis row opens that ratio drawer with the catalogue owning the statement', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({ container, historical });

    const findRow = (ratioId) => container.querySelectorAll('.ratio-analysis-row')
      .find((row) => row.getAttribute('data-ratio') === ratioId);

    // Current Ratio belongs to the Balance Sheet; the drawer must say so even
    // though the workspace's active statement default is income.
    const row = findRow('current_ratio');
    assert.ok(row, 'the Current Ratio analysis row must be mounted');
    row.dispatch('click');

    const state = view.getDrawerState();
    assert.equal(state.isOpen, true, 'the click must open the drawer');
    assert.equal(state.activeMetric, `${RATIO_METRIC_PREFIX}current_ratio`);
    assert.equal(state.activeStatement, 'balance', 'the catalogue owns the ratio statement');

    const drawerHtml = container.querySelector('#line-item-drawer').innerHTML;
    assert.ok(drawerHtml.includes('Current Ratio'), 'the drawer must show the clicked ratio');
    assert.ok(drawerHtml.includes('Computed Provenance'), 'it must use the ratio inspector body');
    assert.ok(!drawerHtml.includes('SEC EDGAR Provenance'), 'a computed ratio has no filing link');

    // A second, differently-stated ratio proves the routing is per-row, not sticky.
    findRow('gross_margin').dispatch('click');
    const second = view.getDrawerState();
    assert.equal(second.activeMetric, `${RATIO_METRIC_PREFIX}gross_margin`);
    assert.equal(second.activeStatement, 'income');
    assert.ok(container.querySelector('#line-item-drawer').innerHTML.includes('Gross Margin'));

    view.closeDrawer();
    assert.equal(view.getDrawerState().isOpen, false);
    view.dispose();
  });

  test('Enter and Space on a focused analysis row open the drawer; bands stay inert', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({ container, historical });

    const findRow = (ratioId) => container.querySelectorAll('.ratio-analysis-row')
      .find((row) => row.getAttribute('data-ratio') === ratioId);

    let prevented = 0;
    const preventDefault = () => { prevented += 1; };

    findRow('dso').dispatch('keydown', { key: 'Enter', preventDefault });
    assert.equal(view.getDrawerState().activeMetric, `${RATIO_METRIC_PREFIX}dso`, 'Enter must open the drawer');
    assert.equal(view.getDrawerState().activeStatement, 'balance');
    assert.equal(prevented, 1, 'Enter must suppress the default activation');

    view.closeDrawer();
    findRow('ocf_margin').dispatch('keydown', { key: ' ', preventDefault });
    assert.equal(view.getDrawerState().activeMetric, `${RATIO_METRIC_PREFIX}ocf_margin`, 'Space must open the drawer');
    assert.equal(view.getDrawerState().activeStatement, 'cashflow');
    assert.equal(prevented, 2);

    // A non-activating key must do nothing.
    view.closeDrawer();
    findRow('roe').dispatch('keydown', { key: 'Tab', preventDefault });
    assert.equal(view.getDrawerState().isOpen, false, 'an unrelated key must not open the drawer');

    // A band click must do nothing, and must not throw.
    view.closeDrawer();
    const band = container.querySelector('.ratio-divider-row');
    band.dispatch('click');
    band.dispatch('keydown', { key: 'Enter', preventDefault });
    assert.equal(view.getDrawerState().isOpen, false, 'a band must never open the drawer');
    assert.equal(prevented, 2, 'a band must not consume a key event');

    view.dispose();
  });
});

/* ---------------------------------------------------------------------------
 * RP10.3 — Static / CSS / standing render gates
 * ------------------------------------------------------------------------- */

describe('RP10.3 — Static Gates', () => {
  test('the §5.1 ratio header classes join the existing shared selector groups', () => {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');

    assert.match(
      html,
      /\.trend-title-block,\s*\.ratio-analysis-title-block,[\s\S]*?\{[^}]*border-left:\s*3px\s+solid\s+var\(--color-accent-blue\);[^}]*padding-left:\s*10px;/,
      'the ratio title block must join the app-wide RW1.1 title-block group, not start a parallel style',
    );
    assert.match(
      html,
      /\.trend-main-title,\s*\.ratio-analysis-main-title,[\s\S]*?\{[^}]*font-size:\s*(?:15px|var\(--text-lg\));[^}]*font-weight:\s*700;[^}]*color:\s*var\(--color-text-primary\);/,
      'the ratio main title must join the shared title group',
    );
    assert.match(
      html,
      /\.trend-subtitle,\s*\.ratio-analysis-subtitle,[\s\S]*?\{[^}]*font-size:\s*(?:12px|var\(--text-sm\));[^}]*color:\s*var\(--color-text-muted\);[^}]*margin:\s*0;/,
      'the ratio subtitle must join the shared subtitle group',
    );
  });

  test('the view panels join the shared hidden-selector group and the CSS adds no colour literal', () => {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');
    assert.match(
      html,
      /\.statement-table-wrapper\.hidden,[\s\S]*?\.trend-view-panel\.hidden,[\s\S]*?\.th-quarterly\.hidden\s*\{[^}]*display:\s*none\s*!important;/,
      'the panel hidden state must join the standing hidden group',
    );
    const blockStart = html.indexOf('.trend-header-controls {');
    const blockEnd = html.indexOf('.trend-bar-chart-card,');
    assert.ok(blockStart !== -1 && blockEnd > blockStart, 'the RP10.3 CSS block must be present');
    const block = html.slice(blockStart, blockEnd);
    const elsewhere = (html.slice(0, blockStart) + html.slice(blockEnd)).toUpperCase();

    assert.match(block, /\.trend-ratio-pill-row\s*\{[^}]*display:\s*flex;/, 'the ratio pill row must be laid out');

    // "No new visual language": every colour the RP10.3 block names must already
    // exist elsewhere in the stylesheet, so the block cannot introduce a new one.
    const hexes = [...block.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => m[0].toUpperCase());
    assert.ok(hexes.length > 0, 'control: the block does declare backgrounds, so the check is not vacuous');
    for (const hex of hexes) {
      assert.ok(elsewhere.includes(hex), `${hex} must already exist elsewhere in the stylesheet`);
    }

    // §5.2: the ratio hook may only group and space, never restyle active/hover.
    const hook = block.match(/\.trend-pill-btn-ratio\s*\{([^}]*)\}/);
    assert.ok(hook, 'the ratio pill hook must be declared');
    assert.doesNotMatch(hook[1], /background|color|border/, 'the ratio hook must not restyle the pill');
    assert.match(hook[1], /padding|font-size|gap|margin/, 'the ratio hook must be a grouping/spacing hook');
  });

  test('standing render gates hold across the RP10.3 markup', async () => {
    const historical = await getHistorical();
    const markup = `${buildTrendExplorerMarkup('revenue', 'charts', historical)}${buildRatioAnalysisMarkup(historical)}`;
    assert.doesNotMatch(markup, /style\s*=/i, 'zero inline style attributes');
    assert.doesNotMatch(markup, /<aside\b/i, 'zero <aside> elements');
    assert.ok(!markup.includes('\u2014'), 'zero em dashes in user-visible copy');
  });

  test('charts.js carries zero em dashes; historicalsTab.js adds none and no bare numeric > 999', () => {
    const chartsCode = fs.readFileSync(CHARTS_PATH, 'utf8');
    assert.ok(!chartsCode.includes('\u2014'), 'charts.js must carry zero em dashes in user-visible copy');

    // FINDING (raised in the RP10.3 submission, not silently absorbed):
    // `historicalsTab.js` carries 9 pre-existing em dashes, all of them the frozen
    // KPI / CAGR null placeholder `' — '`, pinned by 8 assertions in the frozen RP3
    // suite (`tests/redesign.tab3.test.js:447,448,458,459,467,468,660,661`). §5.5
    // forbids user-visible em dashes, so the contract conflicts with itself; the
    // placeholder cannot be changed without breaking the frozen suite. This gate
    // therefore freezes the debt instead of hiding it: the count may not grow, and
    // no em dash may appear anywhere except that exact placeholder literal.
    const tabCode = fs.readFileSync(HISTORICALS_TAB_PATH, 'utf8');
    const emDashes = [...tabCode.matchAll(/\u2014/g)];
    assert.equal(emDashes.length, 9, 'no new em dash may be introduced into historicalsTab.js');
    const withoutPlaceholder = tabCode.replace(/' \u2014 '/g, '');
    assert.ok(
      !withoutPlaceholder.includes('\u2014'),
      'the only permitted em dashes are the frozen ` - ` placeholder literals',
    );

    // The bare-numeric scan is scoped to the module the approved RP10.2 gate scans:
    // charts.js legitimately carries the frozen DAU divisor (`1000000`) from RP3.3.
    const withoutComments = tabCode.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    const bare = [...withoutComments.matchAll(/(?<![a-zA-Z0-9_$])([1-9][0-9]{3,})(?![a-zA-Z0-9_$])/g)].map((m) => m[1]);
    assert.equal(bare.length, 0, `forbidden bare numerics: ${bare.join(', ')}`);
  });
});
