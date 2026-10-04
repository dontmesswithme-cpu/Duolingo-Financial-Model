/**
 * Redesign Phase 10 Test Suite — Tab 03: Ratio Analysis (Statement Line Items + Ratio Inspector).
 *
 * Covers Task RP10.2 Artifact Contract (§3.C invariants):
 *  - Ratio rows sort after all filed rows, never interleave; hidden Tabulator grids stay filed-only.
 *  - Workspace row clicks on `ratio:*` keys open the ratio drawer; filed-row drawer behaviour untouched.
 *  - Zero `style=`, zero bare >999 literals, keyboard (Enter/Space) + ARIA row semantics preserved.
 *
 * Anti-tautology discipline (inherited from RP10.1):
 *  - Every rendered ratio cell is compared cell-by-cell against the engine's own
 *    `formatRatioById` output, so a UI/engine drift is as loud as an arithmetic error.
 *  - The "annual-only" quarterly-dash assertion is paired with proof that a capable
 *    ratio *does* carry quarterly values, so a dash cannot be explained by an empty column set.
 *
 * NOTE ON SCOPE: `tests/redesign.tab3.test.js` is the frozen RP3 contract and stays
 * untouched (its 56 tests remain green as-is). These gates live in a separate file so
 * that neither the RP3 suite nor the approved RP10.1 `tests/ratios.test.js` is modified.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildWorkspaceMarkup,
  buildStatementRatioRows,
  buildRatioDrawerMarkup,
  buildRatioCsvLines,
  groupRatioIds,
  renderHistoricalsWorkspace,
  renderHistoricals,
  ANNUAL_PERIODS,
  QUARTERLY_PERIODS,
  RATIO_METRIC_PREFIX,
} from '../src/ui/historicalsTab.js';
import {
  RATIO_DEFS,
  RATIOS_BY_STATEMENT,
  computeHistoricalRatios,
  isRatioQuarterlyCapable,
  formatRatioById,
  formatRatioChange,
} from '../src/engine/ratios.js';
import { loadHistorical } from '../src/data/loader.js';
import { readLedgerUrls } from './_ledger.js';
import { StubElement } from './_dom_stub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const HISTORICALS_TAB_PATH = path.join(ROOT, 'src/ui/historicalsTab.js');
const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));

const readText = (loc) => fs.promises.readFile(loc, 'utf8');
const LEDGER = readLedgerUrls();
const ALL_RATIO_PERIODS = Object.freeze([...ANNUAL_PERIODS, ...QUARTERLY_PERIODS]);

async function getHistorical() {
  return loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
}

/* ---------------------------------------------------------------------------
 * Headless interactive container
 *
 * Mirrors the surface `renderHistoricalsWorkspace` / `renderHistoricals` touch:
 * `innerHTML` (with tag parsing), `querySelector(All)` for `#id` / `.class` /
 * `[attr="v"]` / comma groups, and attribute + listener plumbing. Kept local so
 * the frozen RP3 suite is not refactored to share it.
 * ------------------------------------------------------------------------- */

function matchesSelector(element, selector) {
  const sel = selector.trim();
  if (sel.startsWith('#')) return element.id === sel.slice(1);
  if (sel.startsWith('.')) {
    return sel.split('.').filter(Boolean).every((c) => element.classList.contains(c));
  }
  const attr = sel.match(/^\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\]$/);
  if (attr) {
    if (!element.hasAttribute(attr[1])) return false;
    return attr[2] === undefined || element.getAttribute(attr[1]) === attr[2];
  }
  const tag = sel.match(/^([a-zA-Z0-9-]+)/);
  if (tag) return element.tagName === tag[1].toUpperCase();
  return false;
}

function matchesAny(element, selector) {
  return selector.split(',').some((part) => matchesSelector(element, part));
}

function createInteractiveContainer() {
  const elements = [];
  let html = '';

  function makeElement(tag, attrs) {
    const el = new StubElement(attrs);
    el.tagName = tag.toUpperCase();
    el.id = attrs.id || '';
    el.textContent = '';
    el._classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
    el._kids = [];
    el.classList = {
      contains: (c) => el._classes.has(c),
      add: (c) => { el._classes.add(c); },
      remove: (c) => { el._classes.delete(c); },
      toggle: (c, force) => {
        const on = force === undefined ? !el._classes.has(c) : Boolean(force);
        if (on) el._classes.add(c);
        else el._classes.delete(c);
        return on;
      },
    };
    el.focus = () => {};
    el.scrollIntoView = () => {};
    el.remove = () => {
      const i = elements.indexOf(el);
      if (i !== -1) elements.splice(i, 1);
    };
    el.insertAdjacentHTML = (pos, chunk) => {
      if (pos === 'beforeend') el.innerHTML = `${el.innerHTML || ''}${chunk}`;
    };
    Object.defineProperty(el, 'innerHTML', {
      get() { return el._html || ''; },
      set(val) {
        el._html = String(val);
        el._kids.length = 0;
        parseTags(el._html, el._kids);
      },
    });
    return el;
  }

  function parseTags(source, sink) {
    const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
    let match;
    while ((match = tagRegex.exec(source)) !== null) {
      if (match[1].startsWith('/')) continue;
      const attrs = {};
      const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(match[2])) !== null) {
        attrs[attrMatch[1]] = attrMatch[2] !== undefined ? attrMatch[2] : '';
      }
      const el = makeElement(match[1], attrs);
      sink.push(el);
      // Nested parses (element.innerHTML) must also land in the global list so
      // container-level queries can reach drawer content; the container-level
      // parse passes the global list as its own sink and must not double-push.
      if (sink !== elements) elements.push(el);
    }
  }

  const container = new StubElement();
  Object.defineProperty(container, 'innerHTML', {
    get() { return html; },
    set(val) {
      html = String(val);
      elements.length = 0;
      if (html) parseTags(html, elements);
    },
  });
  container.querySelector = (sel) => elements.find((el) => matchesAny(el, sel)) || null;
  container.querySelectorAll = (sel) => elements.filter((el) => matchesAny(el, sel));

  return container;
}

/* ---------------------------------------------------------------------------
 * Markup slicing helpers
 * ------------------------------------------------------------------------- */

function statementTableMarkup(markup, statementKey) {
  const anchor = `data-workspace-statement="${statementKey}"`;
  const start = markup.indexOf(anchor);
  assert.ok(start !== -1, `workspace markup must contain the ${statementKey} table`);
  const end = markup.indexOf('</table>', start);
  assert.ok(end > start, `${statementKey} table must close`);
  return markup.slice(start, end);
}

function rowSequence(table) {
  return [...table.matchAll(/<tr class="([^"]*)"([^>]*)>/g)].map((m) => ({
    cls: m[1],
    attrs: m[2],
  }));
}

function ratioRowMarkup(table, ratioId) {
  const anchor = `data-metric="${RATIO_METRIC_PREFIX}${ratioId}"`;
  const at = table.indexOf(anchor);
  assert.ok(at !== -1, `ratio row ${ratioId} must render`);
  const rowStart = table.lastIndexOf('<tr', at);
  const rowEnd = table.indexOf('</tr>', at);
  return table.slice(rowStart, rowEnd);
}

function periodCells(row) {
  return [...row.matchAll(/<td class="td-period[^"]*"[^>]*>([^<]*)<\/td>/g)].map((m) => m[1]);
}

/* ---------------------------------------------------------------------------
 * RP10.2 — Statement Ratio Footer Rows
 * ------------------------------------------------------------------------- */

describe('RP10.2 — Statement Ratio Footer Rows', () => {
  test('groupRatioIds projects the frozen catalogue: balance into 4 categories, income/cashflow into 1', () => {
    const income = groupRatioIds('income');
    assert.equal(income.length, 1);
    assert.equal(income[0].category, 'Profitability');
    assert.deepEqual(income[0].ids, RATIOS_BY_STATEMENT.income);

    const balance = groupRatioIds('balance');
    assert.deepEqual(balance.map((g) => g.category), ['Returns', 'Liquidity', 'Leverage', 'Efficiency']);
    assert.deepEqual(
      balance.flatMap((g) => g.ids),
      RATIOS_BY_STATEMENT.balance,
      'grouping must preserve catalogue order without dropping or duplicating an id',
    );

    const cashflow = groupRatioIds('cashflow');
    assert.equal(cashflow.length, 1);
    assert.equal(cashflow[0].category, 'Cash Flow');
    assert.deepEqual(cashflow[0].ids, RATIOS_BY_STATEMENT.cashflow);

    assert.equal(groupRatioIds('unknown_statement').length, 0);
  });

  test('ratio rows sort strictly after all filed rows and never interleave (all three statements)', async () => {
    const historical = await getHistorical();
    const markup = buildWorkspaceMarkup(historical, 'income', 'annual');

    for (const statementKey of ['income', 'balance', 'cashflow']) {
      const rows = rowSequence(statementTableMarkup(markup, statementKey));
      assert.ok(rows.length > 0, `${statementKey} must render rows`);

      const isFiled = (r) => r.cls.includes('statement-row') && !r.cls.includes('row-ratio');
      const firstRatio = rows.findIndex((r) => !isFiled(r));

      assert.ok(firstRatio > 0, `${statementKey} must render filed rows before any ratio row`);
      assert.ok(
        rows.slice(0, firstRatio).every(isFiled),
        `${statementKey}: every row before the ratio block must be a filed row`,
      );
      assert.ok(
        rows.slice(firstRatio).every((r) => !isFiled(r)),
        `${statementKey}: no filed row may appear after the ratio block`,
      );

      const ratioRows = rows.slice(firstRatio).filter((r) => r.cls.includes('row-ratio'));
      const dividerRows = rows.slice(firstRatio).filter((r) => r.cls.includes('ratio-divider-row'));
      assert.equal(
        ratioRows.length,
        RATIOS_BY_STATEMENT[statementKey].length,
        `${statementKey} must render exactly its catalogue ratios`,
      );
      assert.equal(
        dividerRows.length,
        groupRatioIds(statementKey).length,
        `${statementKey} must render one divider row per category group`,
      );
    }
  });

  test('ratio rows carry the ratio key, computed badge, and keyboard/ARIA row semantics', async () => {
    const historical = await getHistorical();
    const table = statementTableMarkup(buildWorkspaceMarkup(historical, 'balance', 'annual'), 'balance');

    for (const id of RATIOS_BY_STATEMENT.balance) {
      const row = ratioRowMarkup(table, id);
      assert.ok(row.includes(`data-metric="${RATIO_METRIC_PREFIX}${id}"`), `${id} must carry the ratio metric key`);
      assert.ok(row.includes(`data-ratio="${id}"`), `${id} must carry data-ratio`);
      assert.ok(row.includes('tabindex="0"'), `${id} must stay keyboard reachable`);
      assert.ok(row.includes('role="row"'), `${id} must keep row semantics`);
      assert.ok(row.includes('badge-computed'), `${id} must be marked via the shared computed badge`);
      assert.ok(row.includes('row-ratio'), `${id} must carry the row-ratio class hook`);
      assert.equal((row.match(/<td/g) || []).length, 10, `${id} must emit one cell per column (metric + 5 + 4)`);
    }
  });

  test('every rendered ratio cell equals the engine formatter for that column (no UI/engine drift)', async () => {
    const historical = await getHistorical();
    const ratios = computeHistoricalRatios(historical);
    const markup = buildWorkspaceMarkup(historical, 'income', 'annual');

    let compared = 0;
    for (const statementKey of ['income', 'balance', 'cashflow']) {
      const table = statementTableMarkup(markup, statementKey);
      for (const id of RATIOS_BY_STATEMENT[statementKey]) {
        const entry = ratios.ratios[id];
        const expected = ALL_RATIO_PERIODS.map((p) => formatRatioById(id, entry.values[p]));
        assert.deepEqual(
          periodCells(ratioRowMarkup(table, id)),
          expected,
          `${statementKey}/${id} cells must equal the engine's own formatted values`,
        );
        compared += expected.length;
      }
    }
    assert.equal(compared, RATIO_DEFS.length * ALL_RATIO_PERIODS.length);
  });

  test('quarterly columns: annual-only ratios dash, capable ratios carry values (paired control)', async () => {
    const historical = await getHistorical();
    const ratios = computeHistoricalRatios(historical);
    const markup = buildWorkspaceMarkup(historical, 'income', 'annual');

    const annualOnly = RATIO_DEFS.filter((d) => !isRatioQuarterlyCapable(d.id));
    const capable = RATIO_DEFS.filter((d) => isRatioQuarterlyCapable(d.id));

    // Non-vacuous: the split must actually partition the catalogue.
    assert.equal(annualOnly.length, 12, '11 balance ratios plus the annual-only fcf_conversion override');
    assert.equal(capable.length, 8, '5 income ratios plus 3 quarterly cash-flow ratios');
    assert.equal(annualOnly.length + capable.length, RATIO_DEFS.length);

    let annualOnlyDashCount = 0;
    for (const statementKey of ['income', 'balance', 'cashflow']) {
      const table = statementTableMarkup(markup, statementKey);
      for (const id of RATIOS_BY_STATEMENT[statementKey]) {
        const quarterly = periodCells(ratioRowMarkup(table, id)).slice(ANNUAL_PERIODS.length);
        assert.equal(quarterly.length, QUARTERLY_PERIODS.length);
        if (!isRatioQuarterlyCapable(id)) {
          assert.deepEqual(
            quarterly,
            QUARTERLY_PERIODS.map(() => ' - '),
            `${id} is annual-only and must dash in every quarterly column`,
          );
          annualOnlyDashCount += 1;
        }
      }
    }
    assert.equal(annualOnlyDashCount, annualOnly.length);

    // Anti-tautology control: a capable ratio must NOT be all-dash, otherwise the
    // annual-only assertion above could be satisfied by an empty quarterly corpus.
    const grossMarginQuarterly = periodCells(ratioRowMarkup(statementTableMarkup(markup, 'income'), 'gross_margin'))
      .slice(ANNUAL_PERIODS.length);
    assert.ok(
      grossMarginQuarterly.some((cell) => cell !== ' - '),
      'gross_margin is quarterly-capable and must render real quarterly values',
    );
    assert.equal(
      periodCells(ratioRowMarkup(statementTableMarkup(markup, 'income'), 'gross_margin')).length,
      ALL_RATIO_PERIODS.length,
    );

    // And the engine's own quarterly matrix must agree with what was rendered.
    const engineQuarterly = QUARTERLY_PERIODS.map((p) => formatRatioById('gross_margin', ratios.ratios.gross_margin.values[p]));
    assert.deepEqual(grossMarginQuarterly, engineQuarterly);
  });

  test('divider rows label the group, stay non-interactive, and keep column alignment', async () => {
    const historical = await getHistorical();
    const table = statementTableMarkup(buildWorkspaceMarkup(historical, 'balance', 'annual'), 'balance');

    for (const group of groupRatioIds('balance')) {
      const at = table.indexOf(`<td class="td-metric ratio-divider-label">${group.category}</td>`);
      assert.ok(at !== -1, `divider row for ${group.category} must render its category label`);
      const rowStart = table.lastIndexOf('<tr', at);
      const rowEnd = table.indexOf('</tr>', at);
      const row = table.slice(rowStart, rowEnd);

      assert.ok(row.includes('ratio-divider-row'), 'divider row must carry the divider hook');
      assert.ok(!row.includes('data-ratio='), 'divider rows are not selectable ratios');
      assert.ok(!row.includes('data-metric='), 'divider rows must not masquerade as metric rows');
      assert.ok(!row.includes('tabindex'), 'divider rows must stay out of the tab order');
      assert.equal((row.match(/<td/g) || []).length, 10, 'divider row must emit one cell per column');
    }
  });

  test('buildStatementRatioRows fails closed when the ratio matrix is absent', () => {
    assert.equal(buildStatementRatioRows('income', null, 'annual'), '');
    assert.equal(buildStatementRatioRows('income', {}, 'annual'), '');
    assert.equal(buildStatementRatioRows('income', { ratios: {} }, 'annual'), '');
  });
});

/* ---------------------------------------------------------------------------
 * RP10.2 — Ratio Inspector Drawer
 * ------------------------------------------------------------------------- */

describe('RP10.2 — Ratio Inspector Drawer', () => {
  test('renders the FY2021 / FY2025 / Change strip, definition block, annual series, and provenance note', async () => {
    const historical = await getHistorical();
    const ratios = computeHistoricalRatios(historical);
    const markup = buildRatioDrawerMarkup({ ratioId: 'gross_margin', ratioMatrix: ratios });

    assert.ok(markup.includes('drawer-header'));
    assert.ok(markup.includes('id="drawer-metric-title"'));
    assert.ok(markup.includes('id="drawer-metric-tag"'));
    assert.ok(markup.includes('id="drawer-close-btn"'));
    assert.ok(markup.includes('drawer-stat-strip'));
    assert.ok(markup.includes('Gross Margin'));
    assert.ok(markup.includes('Definition &amp; Formula'));
    assert.ok(markup.includes('Annual Series'));
    assert.ok(markup.includes('Computed Provenance'));

    // Stat strip is exactly FY2021 / FY2025 / Change, no CAGR carry-over.
    for (const label of ['FY2021', 'FY2025', 'Change']) {
      assert.ok(markup.includes(`<div class="drawer-stat-label">${label}</div>`), `stat strip must carry ${label}`);
    }
    assert.ok(!markup.includes('CAGR'), 'the ratio drawer must not reuse the filing CAGR strip');

    // Annual series mini-table carries exactly the five annual columns.
    const miniPeriods = [...markup.matchAll(/<td class="drawer-mini-td-period">([^<]*)<\/td>/g)].map((m) => m[1]);
    assert.deepEqual(miniPeriods, [...ANNUAL_PERIODS]);

    // Provenance is honest: computed, no fabricated filing link.
    assert.ok(markup.includes('ratio-provenance-note'));
    assert.ok(!/sec\.gov/i.test(markup), 'the ratio drawer must not fabricate an EDGAR link');
    assert.ok(!markup.includes('btn-sec-link'), 'no SEC link button belongs in a computed ratio drawer');
    assert.doesNotMatch(markup, /style\s*=/i, 'ratio drawer markup must contain zero inline styles');
  });

  test('drawer values and change equal the engine formatters', async () => {
    const historical = await getHistorical();
    const ratios = computeHistoricalRatios(historical);

    for (const def of RATIO_DEFS) {
      const values = ratios.ratios[def.id].values;
      const markup = buildRatioDrawerMarkup({ ratioId: def.id, ratioMatrix: ratios });
      const earliest = Number.isFinite(values.FY2021) ? values.FY2021 : null;
      const latest = Number.isFinite(values.FY2025) ? values.FY2025 : null;

      assert.ok(
        markup.includes(`<div class="drawer-stat-val">${formatRatioById(def.id, earliest)}</div>`),
        `${def.id} FY2021 stat must equal the engine value`,
      );
      assert.ok(
        markup.includes(`<div class="drawer-stat-val">${formatRatioById(def.id, latest)}</div>`),
        `${def.id} FY2025 stat must equal the engine value`,
      );
      assert.ok(
        markup.includes(`<div class="drawer-stat-val">${formatRatioChange(def.id, earliest, latest)}</div>`),
        `${def.id} change stat must equal the engine change`,
      );
      assert.ok(markup.includes(def.formula), `${def.id} must print its catalogue formula`);
      assert.ok(markup.includes(def.definition), `${def.id} must print its catalogue definition`);
    }
  });

  test('unknown ratio id fails closed to the shared empty state', () => {
    const markup = buildRatioDrawerMarkup({ ratioId: 'not_a_ratio', ratioMatrix: {} });
    assert.equal(markup, '<div class="drawer-empty">No ratio selected.</div>');
    assert.doesNotMatch(buildRatioDrawerMarkup({}), /drawer-header/);
  });

  test('renderHistoricals routes ratio:* clicks to the ratio drawer and leaves the filing drawer intact', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({ container, historical });

    view.openDrawer(`${RATIO_METRIC_PREFIX}roe`, 'balance');
    const ratioState = view.getDrawerState();
    assert.equal(ratioState.isOpen, true);
    assert.equal(ratioState.activeMetric, `${RATIO_METRIC_PREFIX}roe`);
    assert.equal(ratioState.activeStatement, 'balance', 'the catalogue owns the ratio statement, not the caller default');

    const ratioHtml = container.querySelector('#line-item-drawer').innerHTML;
    assert.ok(ratioHtml.includes('Return on Equity'));
    assert.ok(ratioHtml.includes('Computed Provenance'));
    assert.ok(!ratioHtml.includes('SEC EDGAR Provenance'));

    // Filed rows keep the exact prior behaviour.
    view.openDrawer('revenue_total', 'income');
    const filedState = view.getDrawerState();
    assert.equal(filedState.isOpen, true);
    assert.equal(filedState.activeMetric, 'revenue_total');
    assert.equal(filedState.activeStatement, 'income');

    const filedHtml = container.querySelector('#line-item-drawer').innerHTML;
    assert.ok(filedHtml.includes('SEC EDGAR Provenance'));
    assert.ok(filedHtml.includes('4-Year CAGR'));
    assert.ok(!filedHtml.includes('Computed Provenance'));

    view.closeDrawer();
    assert.equal(view.getDrawerState().isOpen, false);
    view.dispose();
  });
});

/* ---------------------------------------------------------------------------
 * RP10.2 — Workspace Wiring, CSV, and Regression Guards
 * ------------------------------------------------------------------------- */

describe('RP10.2 — Workspace Wiring, CSV, and Regression Guards', () => {
  test('workspace routes ratio rows to onRowClick with a null corpus row; filed rows keep the pivot', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const calls = [];

    const workspace = renderHistoricalsWorkspace({
      container,
      dataset: historical,
      activeStatement: 'income',
      onRowClick: (metricKey, rowData, stmtKey) => calls.push({ metricKey, rowData, stmtKey }),
    });

    const ratioRow = container
      .querySelectorAll('.statement-row')
      .find((el) => String(el.getAttribute('data-metric')).startsWith(RATIO_METRIC_PREFIX));
    assert.ok(ratioRow, 'the income table must expose at least one ratio row');

    ratioRow.dispatch('click');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].metricKey, `${RATIO_METRIC_PREFIX}${ratioRow.getAttribute('data-ratio')}`);
    assert.equal(calls[0].rowData, null, 'a computed ratio has no corpus row to hand over');
    assert.equal(calls[0].stmtKey, 'income');

    // Keyboard activation is preserved for ratio rows.
    ratioRow.dispatch('keydown', { key: 'Enter', preventDefault: () => {} });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].metricKey, calls[0].metricKey);

    // Filed rows still receive their pivoted corpus row object.
    const filedRow = container
      .querySelectorAll('.statement-row')
      .find((el) => el.getAttribute('data-metric') === 'revenue_total');
    assert.ok(filedRow);
    filedRow.dispatch('click');
    assert.equal(calls.length, 3);
    assert.equal(calls[2].metricKey, 'revenue_total');
    assert.ok(calls[2].rowData && typeof calls[2].rowData === 'object', 'filed rows keep the pivoted row payload');

    workspace.dispose();
  });

  test('CSV export appends (computed) ratio rows after all filed rows for the active statement and period set', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();

    const workspace = renderHistoricalsWorkspace({
      container,
      dataset: historical,
      activeStatement: 'balance',
      periodMode: 'annual',
    });

    const csv = workspace.exportCsv();
    const lines = csv.split('\n');

    // The frozen RP3 contract strings are untouched.
    assert.equal(lines[0], '"Metric / Line Item","FY2021","FY2022","FY2023","FY2024","FY2025"');

    const filedLineCount = lines.findIndex((l) => l.includes('(computed)'));
    assert.ok(filedLineCount > 0, 'computed ratio rows must be appended');

    const ratioLines = lines.slice(filedLineCount);
    assert.equal(ratioLines.length, RATIOS_BY_STATEMENT.balance.length);
    assert.ok(!lines.slice(0, filedLineCount).some((l) => l.includes('(computed)')), 'filed rows must not be marked computed');

    const ratios = computeHistoricalRatios(historical);
    for (const [i, id] of RATIOS_BY_STATEMENT.balance.entries()) {
      const def = RATIO_DEFS.find((d) => d.id === id);
      const expected = [
        `"${def.label} (computed)"`,
        ...ANNUAL_PERIODS.map((p) => `"${formatRatioById(id, ratios.ratios[id].values[p])}"`),
      ].join(',');
      assert.equal(ratioLines[i], expected, `${id} CSV row must equal the engine values`);
    }

    // Quarterly export dashes the annual-only ratios rather than dropping the row.
    workspace.setPeriodMode('quarterly');
    const quarterlyLines = workspace.exportCsv().split('\n');
    const quarterlyRatioLines = quarterlyLines.slice(
      quarterlyLines.findIndex((l) => l.includes('(computed)')),
    );
    assert.equal(quarterlyRatioLines.length, RATIOS_BY_STATEMENT.balance.length);
    for (const line of quarterlyRatioLines) {
      assert.ok(line.endsWith('" - "," - "," - "," - "'), 'annual-only ratios dash in every quarterly CSV column');
    }

    workspace.dispose();
  });

  test('hidden Tabulator grids stay filed-only: no ratio key reaches a grid config', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({ container, historical });

    assert.equal(view.tabulatorConfigs.length, 4, 'income / balance / cashflow / kpis');
    for (const config of view.tabulatorConfigs) {
      const fields = config.columns.map((c) => c.field);
      assert.ok(fields.includes('label'), 'the metric column stays present');
      for (const row of config.data) {
        assert.ok(
          !String(row.id).startsWith(RATIO_METRIC_PREFIX) && !String(row.metric).startsWith(RATIO_METRIC_PREFIX),
          `${config.statement} grid must not contain computed ratio rows`,
        );
      }
    }

    // The visible workspace table, by contrast, does carry them.
    assert.ok(container.innerHTML.includes(`${RATIO_METRIC_PREFIX}gross_margin`));

    view.dispose();
  });

  test('buildRatioCsvLines returns an empty list for a statement with no ratios', async () => {
    const historical = await getHistorical();
    assert.deepEqual(buildRatioCsvLines('unknown_statement', historical, [...ANNUAL_PERIODS]), []);
    assert.deepEqual(buildRatioCsvLines('income', {}, [...ANNUAL_PERIODS]).length, RATIOS_BY_STATEMENT.income.length);
  });
});

/* ---------------------------------------------------------------------------
 * RP10.2 — index.html Freeze-Pane CSS & Standing Render Gates
 * ------------------------------------------------------------------------- */

describe('RP10.2 — index.html Freeze-Pane CSS & Standing Render Gates', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  test('ratio row and divider row classes are declared', () => {
    assert.match(html, /\.statement-table\s+tr\.ratio-divider-row\s+td\s*\{/);
    assert.match(html, /\.statement-table\s+tr\.row-ratio\s+td\s*\{/);
  });

  test('both ratio row families pin their first cell so the freeze pane never breaks', () => {
    assert.match(
      html,
      /\.statement-table\s+tr\.ratio-divider-row\s+td:first-child\s*\{[^}]*position:\s*sticky;[^}]*left:\s*0;/s,
      'divider rows must pin their label cell',
    );
    assert.match(
      html,
      /\.statement-table\s+tr\.row-ratio\s+td:first-child\s*\{[^}]*position:\s*sticky;[^}]*left:\s*0;/s,
      'ratio rows must pin their label cell',
    );
  });

  test('divider rows neutralise the filed-row hover affordance', () => {
    assert.match(
      html,
      /\.statement-table\s+tbody\s+tr\.ratio-divider-row:hover\s+td\s*\{[^}]*cursor:\s*default;/s,
      'divider rows are not clickable and must not inherit the row pointer cursor',
    );
  });

  test('standing render gates hold after the RP10.2 CSS addition', () => {
    assert.doesNotMatch(html, /style\s*=/i, 'zero inline style attributes');
    assert.doesNotMatch(html, /<aside\b/i, 'zero <aside> elements');
    assert.doesNotMatch(html, /protocol/i, 'zero protocol mentions');
  });

  test('historicalsTab.js carries no bare numeric literal > 999 outside comments', () => {
    const code = fs.readFileSync(HISTORICALS_TAB_PATH, 'utf8');
    const withoutComments = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    const bare = [...withoutComments.matchAll(/(?<![a-zA-Z0-9_$])([1-9][0-9]{3,})(?![a-zA-Z0-9_$])/g)].map((m) => m[1]);
    assert.equal(bare.length, 0, `forbidden bare numerics: ${bare.join(', ')}`);
  });
});
