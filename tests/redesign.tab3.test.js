/**
 * Redesign Phase 3 Test Suite — Tab 03: Historical Financial Statements (Data Terminal).
 *
 * Covers Task RP3.1 Artifact Contract:
 *  - Deliverables: src/ui/historicalsTab.js, index.html, src/ui/format.js
 *  - Exported interfaces: renderHistoricalsWorkspace, computeHistoricalKpis, buildWorkspaceMarkup
 *  - Segmented Statement Control: [Income Statement] [Balance Sheet] [Cash Flow]
 *  - Instantaneous statement switching (< 16ms) without table re-instantiation overhead
 *  - View Mode Control: [Annual] (FY2021-FY2025) vs [Quarterly] (Q3 FY2025-Q2 FY2026)
 *  - CSS Freeze Panes: sticky header row and sticky left column
 *  - 100% of figures originate from audited JSON files; zero mock or un-cited values
 *  - Strict tabular-number formatting: positive, negative (parentheses), and zero/null
 *  - Export CSV functionality for active statement and period set
 *  - Top 4 headline KPI cards derived directly from audited dataset
 *  - Quality gates: zero inline style=, zero bare numbers > 999 outside comments, purity, zero /protocol/i
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  renderHistoricalsWorkspace,
  renderHistoricals,
  computeHistoricalKpis,
  computeOperatingKpis,
  buildWorkspaceMarkup,
  buildOperatingKpisMarkup,
  buildTrendExplorerMarkup,
  formatKpiValue,
  formatYoYPill,
  computeCagr,
  formatCagr,
  getMetricComposition,
  findFilingByUrl,
  buildAuditCenterMarkup,
  buildDrawerMarkup,
  AUDIT_FILINGS,
  METRIC_COMPOSITION_GROUPS,
  TREND_EXPLORER_METRICS,
  ANNUAL_PERIODS,
  QUARTERLY_PERIODS,
  ALL_PERIOD_COLUMNS,
  STATEMENT_TITLES,
  STATEMENT_ORDER,
} from '../src/ui/historicalsTab.js';
import {
  createTrendBarChart,
  createRevenueDonutChart,
  computeExactPercentages,
} from '../src/ui/charts.js';
import { formatTabularNumber } from '../src/ui/format.js';
import { extractRows } from '../src/data/schema.js';
import { loadHistorical } from '../src/data/loader.js';
import { LEDGER_URLS } from '../src/data/constants.js';
import { readLedgerUrls } from './_ledger.js';
import { StubElement } from './_dom_stub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const HISTORICALS_TAB_PATH = path.join(ROOT, 'src/ui/historicalsTab.js');
const FORMAT_PATH = path.join(ROOT, 'src/ui/format.js');
const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));

const readText = (loc) => fs.promises.readFile(loc, 'utf8');
const LEDGER = readLedgerUrls();

async function getHistorical() {
  return loadHistorical({ dir: DATA_DIR, readText, requireLedger: true, ledger: LEDGER });
}

/**
 * Creates an interactive DOM test container supporting querySelector,
 * querySelectorAll, and event dispatching for headless testing.
 */
function createInteractiveContainer() {
  const container = new StubElement();
  let _html = '';
  const elementList = [];

  function getOrCreateElement(tag, attrs, text = '') {
    const el = new StubElement(attrs);
    el.tagName = tag.toUpperCase();
    el.textContent = text;
    el.value = attrs.value || '';
    el.id = attrs.id || '';
    el.open = attrs.open !== undefined;
    el.scrollIntoView = () => {};
    el.focus = () => {};
    el._children = [];

    el.classList = {
      _classes: new Set((attrs.class || '').split(/\s+/).filter(Boolean)),
      contains(c) {
        return this._classes.has(c);
      },
      add(c) {
        this._classes.add(c);
      },
      remove(c) {
        this._classes.delete(c);
      },
      toggle(c, force) {
        if (force !== undefined) {
          if (force) this._classes.add(c);
          else this._classes.delete(c);
          return force;
        }
        if (this._classes.has(c)) {
          this._classes.delete(c);
          return false;
        }
        this._classes.add(c);
        return true;
      },
    };

    el.remove = () => {
      const idx = elementList.indexOf(el);
      if (idx !== -1) elementList.splice(idx, 1);
      if (el.parentNode && el.parentNode._children) {
        const cIdx = el.parentNode._children.indexOf(el);
        if (cIdx !== -1) el.parentNode._children.splice(cIdx, 1);
      }
    };

    el.insertAdjacentHTML = (pos, html) => {
      if (pos === 'beforeend') {
        el.innerHTML = (el.innerHTML || '') + html;
      }
    };

    el.querySelector = (sel) => {
      const child = el._children ? el._children.find((c) => matches(c, sel)) : null;
      if (child) return child;
      return elementList.find((c) => matches(c, sel)) || null;
    };
    el.querySelectorAll = (sel) => {
      const list = el._children && el._children.length > 0
        ? el._children.filter((c) => matches(c, sel))
        : elementList.filter((c) => matches(c, sel));
      return list;
    };

    Object.defineProperty(el, 'innerHTML', {
      get() {
        return el._html || '';
      },
      set(val) {
        el._html = String(val);
        el._children.length = 0;
        const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
        let match;
        while ((match = tagRegex.exec(el._html)) !== null) {
          const childTag = match[1];
          if (childTag.startsWith('/')) continue;
          const attrStr = match[2];
          const childAttrs = {};
          const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
          let attrMatch;
          while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
            childAttrs[attrMatch[1]] = attrMatch[2] !== undefined ? attrMatch[2] : '';
          }
          const childEl = getOrCreateElement(childTag, childAttrs);
          el._children.push(childEl);
          elementList.push(childEl);
        }
      },
    });

    return el;
  }

  Object.defineProperty(container, 'innerHTML', {
    get() {
      return _html;
    },
    set(val) {
      _html = String(val);
      elementList.length = 0;
      if (!_html) return;

      const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
      let match;
      while ((match = tagRegex.exec(_html)) !== null) {
        const tag = match[1];
        if (tag.startsWith('/')) continue;
        const attrStr = match[2];
        const attrs = {};
        const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
          attrs[attrMatch[1]] = attrMatch[2] !== undefined ? attrMatch[2] : '';
        }
        elementList.push(getOrCreateElement(tag, attrs));
      }
    },
  });

  function matches(el, selector) {
    const sel = selector.trim();
    if (sel.startsWith('#')) {
      return el.id === sel.slice(1);
    }
    const attrMatch = sel.match(/^\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\]$/);
    if (attrMatch) {
      const [, name, val] = attrMatch;
      return el.hasAttribute(name) && (val === undefined || el.getAttribute(name) === val);
    }
    if (sel.startsWith('.')) {
      const classes = sel.split('.').filter(Boolean);
      return classes.every((c) => el.classList.contains(c));
    }
    const tagMatch = sel.match(/^([a-zA-Z0-9-]+)/);
    if (tagMatch) {
      return el.tagName === tagMatch[1].toUpperCase();
    }
    return false;
  }

  container.querySelector = (selector) => {
    const matchesList = elementList.filter((el) => matches(el, selector));
    if (matchesList.length === 0) return null;
    const withListener = matchesList.find(
      (el) => typeof el.listenerCount === 'function' && (el.listenerCount('click') > 0 || el.listenerCount('keydown') > 0),
    );
    if (withListener) return withListener;
    return matchesList[0];
  };

  container.querySelectorAll = (selector) => {
    return elementList.filter((el) => matches(el, selector));
  };

  return container;
}

describe('RP3.1 — Strict Tabular Number Formatting (format.js)', () => {
  test('formats positive numbers with thousands separators and zero decimals', () => {
    assert.equal(formatTabularNumber(180698), '180,698');
    assert.equal(formatTabularNumber(1037589), '1,037,589');
    assert.equal(formatTabularNumber(42), '42');
  });

  test('formats negative numbers wrapped in parentheses without minus sign', () => {
    assert.equal(formatTabularNumber(-103833), '(103,833)');
    assert.equal(formatTabularNumber(-69186), '(69,186)');
    assert.equal(formatTabularNumber(-500), '(500)');
  });

  test('formats zero as 0', () => {
    assert.equal(formatTabularNumber(0), '0');
  });

  test('formats null, undefined, and non-finite values as dash', () => {
    assert.equal(formatTabularNumber(null), ' - ');
    assert.equal(formatTabularNumber(undefined), ' - ');
    assert.equal(formatTabularNumber(NaN), ' - ');
    assert.equal(formatTabularNumber(Infinity), ' - ');
  });

  test('supports custom decimal places when specified', () => {
    assert.equal(formatTabularNumber(1234.56, { decimals: 2 }), '1,234.56');
    assert.equal(formatTabularNumber(-1234.56, { decimals: 2 }), '(1,234.56)');
  });
});

describe('RP3.1 — Statement Workspace Component & View Switching (renderHistoricalsWorkspace)', () => {
  test('throws invalid_dependency if container is missing', () => {
    assert.throws(
      () => renderHistoricalsWorkspace({}),
      /renderHistoricalsWorkspace requires a container element/,
    );
  });

  test('renders all 3 primary statement tables with pre-rendered wrappers', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();

    const workspace = renderHistoricalsWorkspace({
      container,
      dataset: historical,
      activeStatement: 'income',
      periodMode: 'annual',
    });

    assert.ok(workspace);
    assert.equal(workspace.getActiveStatement(), 'income');
    assert.equal(workspace.getPeriodMode(), 'annual');

    const html = container.innerHTML;

    // All 3 statements present in pre-rendered wrappers
    assert.ok(html.includes('data-statement-wrapper="income"'));
    assert.ok(html.includes('data-statement-wrapper="balance"'));
    assert.ok(html.includes('data-statement-wrapper="cashflow"'));

    // Income is initially active, others have hidden class
    assert.ok(html.includes('class="statement-table-wrapper" data-statement-wrapper="income"'));
    assert.ok(html.includes('class="statement-table-wrapper hidden" data-statement-wrapper="balance"'));
    assert.ok(html.includes('class="statement-table-wrapper hidden" data-statement-wrapper="cashflow"'));

    workspace.dispose();
    assert.equal(container.innerHTML, '');
  });

  test('switching statements occurs instantaneously (< 16ms) without table re-instantiation', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();

    let statementChangedTo = null;
    const workspace = renderHistoricalsWorkspace({
      container,
      dataset: historical,
      activeStatement: 'income',
      onStatementChange: (stmt) => {
        statementChangedTo = stmt;
      },
    });

    // Time switching to balance sheet
    const t0 = performance.now();
    workspace.setStatement('balance');
    const t1 = performance.now();
    const switchElapsed = t1 - t0;

    assert.equal(workspace.getActiveStatement(), 'balance');
    assert.equal(statementChangedTo, 'balance');
    assert.ok(switchElapsed < 16, `Statement switch took ${switchElapsed.toFixed(2)}ms (must be < 16ms)`);

    // Switch to cash flow
    const t2 = performance.now();
    workspace.setStatement('cashflow');
    const t3 = performance.now();
    assert.equal(workspace.getActiveStatement(), 'cashflow');
    assert.equal(statementChangedTo, 'cashflow');
    assert.ok((t3 - t2) < 16, `Cash flow switch took ${(t3 - t2).toFixed(2)}ms (must be < 16ms)`);

    workspace.dispose();
  });

  test('Annual vs Quarterly view toggle switches periods and columns', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();

    let periodModeChangedTo = null;
    const workspace = renderHistoricalsWorkspace({
      container,
      dataset: historical,
      periodMode: 'annual',
      onPeriodModeChange: (mode) => {
        periodModeChangedTo = mode;
      },
    });

    assert.equal(workspace.getPeriodMode(), 'annual');

    // Switch to quarterly
    workspace.setPeriodMode('quarterly');
    assert.equal(workspace.getPeriodMode(), 'quarterly');
    assert.equal(periodModeChangedTo, 'quarterly');

    // Switch back to annual
    workspace.setPeriodMode('annual');
    assert.equal(workspace.getPeriodMode(), 'annual');
    assert.equal(periodModeChangedTo, 'annual');

    workspace.dispose();
  });

  test('exportCsv produces valid comma-separated data matching active statement and period set', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();

    const workspace = renderHistoricalsWorkspace({
      container,
      dataset: historical,
      activeStatement: 'income',
      periodMode: 'annual',
    });

    const csvAnnual = workspace.exportCsv();
    assert.ok(typeof csvAnnual === 'string');
    assert.ok(csvAnnual.includes('"Metric / Line Item","FY2021","FY2022","FY2023","FY2024","FY2025"'));
    assert.ok(csvAnnual.includes('"Subscription revenue",180698,273507,404684,607531,873442'));
    assert.ok(csvAnnual.includes('"Total revenues",250772,369495,531109,748024,1037589'));

    // Switch to quarterly and export
    workspace.setPeriodMode('quarterly');
    const csvQuarterly = workspace.exportCsv();
    assert.ok(csvQuarterly.includes('"Metric / Line Item","Q3 FY2025","Q4 FY2025","Q1 FY2026","Q2 FY2026"'));

    workspace.dispose();
  });
});

describe('RP3.1 — Top Headline 4 KPI Cards (computeHistoricalKpis)', () => {
  test('derives 100% of figures from audited JSON with correct YoY growth', async () => {
    const historical = await getHistorical();
    const kpis = computeHistoricalKpis(historical);

    assert.equal(kpis.length, 4);

    const [rev, ni, ta, cash] = kpis;

    // FY2025 Revenue
    assert.equal(rev.key, 'revenue');
    assert.equal(rev.label, 'Revenue (FY2025)');
    assert.equal(rev.rawValue, 1037589);
    assert.equal(rev.value, '$1,037.6M');
    assert.equal(rev.pillText, '+38.7% YoY');
    assert.equal(rev.isPositive, true);

    // FY2025 Net Income
    assert.equal(ni.key, 'net_income');
    assert.equal(ni.label, 'Net Income (FY2025)');
    assert.equal(ni.rawValue, 414065);
    assert.equal(ni.value, '$414.1M');
    assert.equal(ni.pillText, '+367.5% YoY');
    assert.equal(ni.isPositive, true);

    // FY2025 Total Assets
    assert.equal(ta.key, 'total_assets');
    assert.equal(ta.label, 'Total Assets (FY2025)');
    assert.equal(ta.rawValue, 1992182);
    assert.equal(ta.value, '$1.99B');
    assert.equal(ta.pillText, '+53.0% YoY');
    assert.equal(ta.isPositive, true);

    // FY2025 Cash & Cash Equivalents
    assert.equal(cash.key, 'cash');
    assert.equal(cash.label, 'Cash & Cash Equivalents (FY2025)');
    assert.equal(cash.rawValue, 1036389);
    assert.equal(cash.value, '$1.04B');
    assert.equal(cash.pillText, '+31.9% YoY');
    assert.equal(cash.isPositive, true);
  });

  test('empty dataset yields dashes for values and pills with isPositive false', () => {
    const kpis = computeHistoricalKpis({});
    assert.equal(kpis.length, 4);
    for (const card of kpis) {
      assert.equal(card.value, ' — ');
      assert.equal(card.pillText, ' — ');
      assert.equal(card.isPositive, false);
      assert.equal(card.rawValue, undefined);
    }
  });

  test('formatYoYPill formats positive, negative, zero, and null YoY sign-aware', () => {
    assert.equal(formatYoYPill(0.387), '+38.7% YoY');
    assert.equal(formatYoYPill(-0.052), '-5.2% YoY');
    assert.equal(formatYoYPill(0), '0.0% YoY');
    assert.equal(formatYoYPill(null), ' — ');
    assert.equal(formatYoYPill(undefined), ' — ');
  });

  test('formatKpiValue formats millions, billions, and invalid values correctly', () => {
    assert.equal(formatKpiValue(1037589, 'million'), '$1,037.6M');
    assert.equal(formatKpiValue(414065, 'million'), '$414.1M');
    assert.equal(formatKpiValue(1992182, 'billion'), '$1.99B');
    assert.equal(formatKpiValue(1036389, 'billion'), '$1.04B');
    assert.equal(formatKpiValue(null), ' — ');
    assert.equal(formatKpiValue(undefined), ' — ');
  });
});

describe('RP3.1 — Freeze Panes & CSS Architecture (index.html)', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  test('CSS declares sticky header and pinned metric column freeze panes', () => {
    assert.match(
      html,
      /\.statement-table\s+thead\s+th\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s,
      'Statement table header must declare position: sticky; top: 0;',
    );
    assert.match(
      html,
      /\.statement-table\s+thead\s+th:first-child\s*\{[^}]*position:\s*sticky;[^}]*left:\s*0;/s,
      'Statement header first column must declare position: sticky; left: 0;',
    );
    assert.match(
      html,
      /\.statement-table\s+tbody\s+td:first-child\s*\{[^}]*position:\s*sticky;[^}]*left:\s*0;/s,
      'Statement body first column must declare position: sticky; left: 0;',
    );
  });

  test('D2 Director fix: tab navigation text is left-aligned', () => {
    assert.match(
      html,
      /\.tab-link\s*\{[^}]*align-items:\s*flex-start/s,
      '.tab-link must declare align-items: flex-start',
    );
    assert.match(
      html,
      /\.tab-label\s*\{[^}]*text-align:\s*left/s,
      '.tab-label must declare text-align: left',
    );
  });

  test('DOM contains zero <aside> sidebar elements', () => {
    assert.doesNotMatch(html, /<aside\b/i, 'index.html must not contain <aside> sidebar');
  });

  test('index.html contains zero protocol mentions (case-insensitive)', () => {
    assert.doesNotMatch(html, /protocol/i);
  });

  test('zero inline style= attributes exist in index.html', () => {
    assert.doesNotMatch(html, /style\s*=/i);
  });
});

describe('RP3.1 — Quality Gates & Static Code Analysis', () => {
  test('zero bare numeric literals > 999 outside comments in src/ui/historicalsTab.js', () => {
    const code = fs.readFileSync(HISTORICALS_TAB_PATH, 'utf8');
    const withoutComments = code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

    const bareNumberRegex = /(?<![a-zA-Z0-9_$])([1-9][0-9]{3,})(?![a-zA-Z0-9_$])/g;
    const matches = [...withoutComments.matchAll(bareNumberRegex)];
    assert.equal(
      matches.length,
      0,
      `Found forbidden bare numeric literals > 999: ${matches.map((m) => m[1]).join(', ')}`,
    );
  });

  test('zero inline style= attributes across historicalsTab.js and format.js', () => {
    for (const p of [HISTORICALS_TAB_PATH, FORMAT_PATH]) {
      const code = fs.readFileSync(p, 'utf8');
      assert.doesNotMatch(code, /style\s*=/i, `${p} must contain zero inline styles`);
    }
  });

  test('purity: UI modules contain zero Date.now, Math.random, or fetch', () => {
    for (const p of [HISTORICALS_TAB_PATH, FORMAT_PATH]) {
      const code = fs.readFileSync(p, 'utf8');
      assert.doesNotMatch(code, /\bDate\.now\s*\(/, `No Date.now in ${p}`);
      assert.doesNotMatch(code, /\bMath\.random\s*\(/, `No Math.random in ${p}`);
      assert.doesNotMatch(code, /\bfetch\s*\(/, `No fetch in ${p}`);
    }
  });

  test('normalized literal scan: zero bare numbers > 999 with stripped quotes/commas in historicalsTab.js', () => {
    const code = fs.readFileSync(HISTORICALS_TAB_PATH, 'utf8');
    const strip = (c) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '').replace(/['"`]/g, '').replace(/,/g, '');
    const norm = strip(code);
    const bare = [...norm.matchAll(/(?<![a-zA-Z0-9_$.])([1-9][0-9]{3,})(?![a-zA-Z0-9_$.%])/g)].map((m) => m[1]);
    assert.equal(bare.length, 0, `Found normalized bare numbers > 999: ${bare.join(', ')}`);
  });

  test('renderHistoricals mounts live workspace and provides interactive statement switching', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({
      container,
      historical,
    });

    assert.ok(view);
    assert.ok(view.workspace);
    assert.equal(view.workspace.getActiveStatement(), 'income');

    // Switch to balance sheet via workspace
    view.workspace.setStatement('balance');
    assert.equal(view.workspace.getActiveStatement(), 'balance');

    // Verify workspace tables carry data-workspace-statement to prevent selector hijack
    const html = container.innerHTML;
    assert.ok(html.includes('data-workspace-statement="income"'));
    assert.ok(html.includes('data-workspace-statement="balance"'));
    assert.ok(html.includes('data-workspace-statement="cashflow"'));

    view.dispose();
  });
});

describe('RP3.2 — SEC Audit Center & Filing Cards Contract', () => {
  test('AUDIT_FILINGS has exactly 6 filing records matching LED-002 through LED-007', () => {
    assert.equal(AUDIT_FILINGS.length, 6);
    const ids = AUDIT_FILINGS.map((f) => f.id);
    assert.deepEqual(ids, ['LED-002', 'LED-003', 'LED-004', 'LED-005', 'LED-006', 'LED-007']);
    for (const f of AUDIT_FILINGS) {
      assert.ok(f.id, 'filing must have id');
      assert.ok(f.form, 'filing must have form');
      assert.ok(f.period, 'filing must have period');
      assert.ok(f.filed, 'filing must have filed date');
      assert.ok(f.accession, 'filing must have accession number');
      assert.ok(f.url, 'filing must have canonical url');
      assert.ok(Array.isArray(f.statements) && f.statements.length > 0, 'filing must cover statements');
    }
  });

  test('every audit filing URL is a verified member of canonical LEDGER_URLS', () => {
    for (const f of AUDIT_FILINGS) {
      assert.ok(
        LEDGER_URLS.has(f.url),
        `Filing ${f.id} url ${f.url} must exist in canonical LEDGER_URLS`,
      );
    }
  });

  test('buildAuditCenterMarkup renders 6 expandable filing cards with form badges and details', () => {
    const markup = buildAuditCenterMarkup(AUDIT_FILINGS);
    assert.ok(markup.includes('audit-center-header'));
    assert.ok(markup.includes('audit-cards-grid'));
    for (const f of AUDIT_FILINGS) {
      assert.ok(markup.includes(`data-filing="${f.id}"`));
      assert.ok(markup.includes(f.accession));
      assert.ok(markup.includes(f.url));
      assert.ok(markup.includes('btn-sec-link'));
    }
  });

  test('findFilingByUrl returns correct filing metadata or null for unknown', () => {
    const led002 = findFilingByUrl('https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm');
    assert.ok(led002);
    assert.equal(led002.id, 'LED-002');
    assert.equal(led002.period, 'FY2025');

    const unknown = findFilingByUrl('https://www.sec.gov/unknown.htm');
    assert.equal(unknown, null);
    assert.equal(findFilingByUrl(null), null);
  });
});

describe('RP3.2 — CAGR Calculation & Formatting Contract', () => {
  test('computeCagr calculates compound growth accurately across multi-year period', () => {
    // 100 to 200 over 4 years: 2^(0.25) - 1 ≈ 0.189207
    const cagr = computeCagr(100, 200, 4);
    assert.ok(cagr !== null);
    assert.ok(Math.abs(cagr - (Math.pow(2, 0.25) - 1)) < 1e-6);

    // Doubling in 1 year = 100%
    const cagr1 = computeCagr(50, 100, 1);
    assert.equal(cagr1, 1);
  });

  test('computeCagr returns null for non-positive or non-finite inputs', () => {
    assert.equal(computeCagr(-100, 200, 4), null, 'negative base must yield null');
    assert.equal(computeCagr(100, -200, 4), null, 'negative terminal must yield null');
    assert.equal(computeCagr(0, 100, 4), null, 'zero base must yield null');
    assert.equal(computeCagr(100, 0, 4), null, 'zero terminal must yield null');
    assert.equal(computeCagr(null, 100, 4), null);
    assert.equal(computeCagr(100, undefined, 4), null);
    assert.equal(computeCagr(100, 200, 0), null, 'zero periods must yield null');
  });

  test('formatCagr returns sign-aware formatted string or dash for null', () => {
    assert.equal(formatCagr(0.2872), '+28.7% CAGR');
    assert.equal(formatCagr(-0.052), '-5.2% CAGR');
    assert.equal(formatCagr(0), '+0.0% CAGR');
    assert.equal(formatCagr(null), ' — ');
    assert.equal(formatCagr(undefined), ' — ');
  });
});

describe('RP3.2 — Line-Item Inspector Drawer Markup & Composition', () => {
  test('getMetricComposition breaks down revenue_total into 5 component streams', async () => {
    const historical = await getHistorical();
    const comp = getMetricComposition('revenue_total', historical, 'FY2025');
    assert.ok(comp);
    assert.equal(comp.parentMetric, 'revenue_total');
    assert.ok(Number.isFinite(comp.totalValue) && comp.totalValue > 0);
    assert.equal(comp.items.length, 5);

    const shareSum = comp.items.reduce((sum, item) => sum + item.share, 0);
    // Shares sum approximately to 1.0
    assert.ok(Math.abs(shareSum - 1.0) < 0.05, `Share sum ${shareSum} should be ~1.0`);
  });

  test('getMetricComposition breaks down opex_total into R&D, S&M, and G&A', async () => {
    const historical = await getHistorical();
    const comp = getMetricComposition('opex_total', historical, 'FY2025');
    assert.ok(comp);
    assert.equal(comp.parentMetric, 'opex_total');
    assert.equal(comp.items.length, 3);
    const metricKeys = comp.items.map((i) => i.metric);
    assert.deepEqual(metricKeys, [
      'opex_research_and_development',
      'opex_sales_and_marketing',
      'opex_general_and_administrative',
    ]);
  });

  test('getMetricComposition resolves parent group when queried for a child segment', async () => {
    const historical = await getHistorical();
    const comp = getMetricComposition('revenue_subscription', historical, 'FY2025');
    assert.ok(comp);
    assert.equal(comp.parentMetric, 'revenue_total');
  });

  test('getMetricComposition breaks down balance sheet current assets and current liabilities with 100% coverage', async () => {
    const historical = await getHistorical();
    const assetsComp = getMetricComposition('total_current_assets', historical, 'FY2025');
    assert.ok(assetsComp);
    assert.equal(assetsComp.parentMetric, 'total_current_assets');
    assert.ok(assetsComp.items.some((i) => i.metric === 'income_tax_receivable'));
    const assetsSum = assetsComp.items.reduce((s, i) => s + (i.value || 0), 0);
    assert.equal(assetsSum, assetsComp.totalValue);
    for (const item of assetsComp.items) {
      assert.ok(item.value !== null && Number.isFinite(item.value), `Child ${item.metric} must not be null`);
    }

    const liabComp = getMetricComposition('total_current_liabilities', historical, 'FY2025');
    assert.ok(liabComp);
    assert.equal(liabComp.parentMetric, 'total_current_liabilities');
    assert.ok(liabComp.items.some((i) => i.metric === 'accrued_expenses_and_other_current_liabilities'));
    assert.ok(liabComp.items.some((i) => i.metric === 'income_tax_payable'));
    const liabSum = liabComp.items.reduce((s, i) => s + (i.value || 0), 0);
    assert.equal(liabSum, liabComp.totalValue);
    for (const item of liabComp.items) {
      assert.ok(item.value !== null && Number.isFinite(item.value), `Child ${item.metric} must not be null`);
    }
  });

  test('buildDrawerMarkup renders header, stat strip, mini table, progress bars, and provenance', async () => {
    const historical = await getHistorical();
    const rows = extractRows(historical.income);
    const metricMap = {};
    for (const r of rows) {
      if (!metricMap[r.metric]) metricMap[r.metric] = { label: r.label, periods: {}, source: r.source };
      metricMap[r.metric].periods[r.period] = r.value;
    }

    const markup = buildDrawerMarkup({
      metricKey: 'revenue_total',
      metricData: metricMap['revenue_total'],
      stmtKey: 'income',
      dataset: historical,
    });

    assert.ok(markup.includes('drawer-header'));
    assert.ok(markup.includes('id="drawer-metric-title"'));
    assert.ok(markup.includes('id="drawer-metric-tag"'));
    assert.ok(markup.includes('id="drawer-close-btn"'));
    assert.ok(markup.includes('drawer-stat-strip'));
    assert.ok(markup.includes('4-Year CAGR'));
    assert.ok(markup.includes('drawer-mini-table'));
    assert.ok(markup.includes('drawer-comp-progress'));
    assert.ok(markup.includes('drawer-provenance-card'));
    assert.ok(markup.includes('btn-sec-link'));
    assert.doesNotMatch(markup, /style\s*=/i, 'Drawer markup must contain zero inline styles');
  });

  test('buildDrawerMarkup anchors provenance card to latest-displayed-period row source (LED-002 for FY25)', async () => {
    const historical = await getHistorical();
    const rows = extractRows(historical.income);
    const fy25Row = rows.find((r) => r.metric === 'revenue_total' && r.period === 'FY2025');
    assert.ok(fy25Row?.source?.url);

    const markup = buildDrawerMarkup({
      metricKey: 'revenue_total',
      metricData: { label: 'Total Revenue', periods: { FY2021: 250772, FY2025: 1037589 } },
      stmtKey: 'income',
      dataset: historical,
    });

    assert.ok(
      markup.includes(fy25Row.source.url),
      'Drawer provenance card must anchor to FY2025 row source URL (LED-002)',
    );
    assert.ok(markup.includes('0001628280-26-012494'));
    assert.ok(markup.includes('10-K (FY2025)'));
  });

  test('buildDrawerMarkup falls back to first-seen source when latest period source is absent', () => {
    const fallbackUrl = 'https://www.sec.gov/Archives/edgar/data/1562088/000156208824000050/duol-20231231.htm';
    const markup = buildDrawerMarkup({
      metricKey: 'custom_metric',
      metricData: {
        label: 'Custom Metric',
        periods: {},
        source: { url: fallbackUrl, statement: 'Custom Statement' },
      },
      stmtKey: 'income',
      dataset: null,
    });

    assert.ok(markup.includes(fallbackUrl), 'Must fall back to first-seen source');
  });
});

describe('RP3.2 — Interactive Drawer DOM Lifecycle & Accessibility', () => {
  test('clicking a statement row opens inspector drawer and updates ARIA attributes', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({
      container,
      historical,
    });

    const overlay = container.querySelector('#line-item-drawer-overlay');
    assert.ok(overlay);
    assert.ok(overlay.classList.contains('hidden'));
    assert.equal(overlay.getAttribute('aria-hidden'), 'true');

    // Click revenue_total row
    const revRow = container.querySelector('[data-metric="revenue_total"]');
    assert.ok(revRow);
    revRow.dispatch('click');

    // Drawer should now be visible and accessible
    assert.ok(!overlay.classList.contains('hidden'));
    assert.equal(overlay.getAttribute('aria-hidden'), 'false');
    const state = view.getDrawerState();
    assert.equal(state.isOpen, true);
    assert.equal(state.activeMetric, 'revenue_total');

    // Title populated
    const title = container.querySelector('#drawer-metric-title');
    assert.ok(title);

    view.dispose();
  });

  test('activating row via keyboard (Enter) opens inspector drawer', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({
      container,
      historical,
    });

    const opexRow = container.querySelector('[data-metric="opex_total"]');
    assert.ok(opexRow);
    opexRow.dispatch('keydown', { key: 'Enter' });

    const state = view.getDrawerState();
    assert.equal(state.isOpen, true);
    assert.equal(state.activeMetric, 'opex_total');

    view.dispose();
  });

  test('pressing Escape key closes the inspector drawer', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({
      container,
      historical,
    });

    view.openDrawer('revenue_total', 'income');
    assert.equal(view.getDrawerState().isOpen, true);

    // Press Escape
    container.dispatch('keydown', { key: 'Escape' });

    assert.equal(view.getDrawerState().isOpen, false);
    const overlay = container.querySelector('#line-item-drawer-overlay');
    assert.ok(overlay.classList.contains('hidden'));
    assert.equal(overlay.getAttribute('aria-hidden'), 'true');

    view.dispose();
  });

  test('clicking drawer close button closes drawer', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({
      container,
      historical,
    });

    view.openDrawer('gross_profit', 'income');
    assert.equal(view.getDrawerState().isOpen, true);

    const closeBtn = container.querySelector('#drawer-close-btn');
    assert.ok(closeBtn);
    closeBtn.dispatch('click');

    assert.equal(view.getDrawerState().isOpen, false);

    view.dispose();
  });

  test('clicking drawer overlay background closes drawer', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({
      container,
      historical,
    });

    view.openDrawer('net_income', 'income');
    assert.equal(view.getDrawerState().isOpen, true);

    const overlay = container.querySelector('#line-item-drawer-overlay');
    assert.ok(overlay);
    overlay.dispatch('click', { target: overlay });

    assert.equal(view.getDrawerState().isOpen, false);

    view.dispose();
  });

  test('jump button #btn-jump-audit expands first filing card in audit center', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({
      container,
      historical,
    });

    const firstCard = container.querySelector('.filing-card');
    assert.ok(firstCard);
    assert.equal(firstCard.open, false);

    const jumpBtn = container.querySelector('#btn-jump-audit');
    assert.ok(jumpBtn);
    jumpBtn.dispatch('click');

    assert.equal(firstCard.open, true, 'First filing card must be opened on jump click');

    view.dispose();
  });

  /* =========================================================================
   * RP3.3 — Trend Explorer & Dynamic Charting Integration Tests
   * ========================================================================= */

  test('RP3.3: TREND_EXPLORER_METRICS defines exactly 6 metrics with frozen config', () => {
    const keys = Object.keys(TREND_EXPLORER_METRICS);
    assert.deepEqual(keys, ['revenue', 'gross_profit', 'operating_income', 'net_income', 'cash', 'daus']);
    assert.ok(Object.isFrozen(TREND_EXPLORER_METRICS));

    for (const key of keys) {
      const meta = TREND_EXPLORER_METRICS[key];
      assert.ok(Object.isFrozen(meta));
      assert.ok(meta.id);
      assert.ok(meta.name);
      assert.ok(meta.title);
      assert.ok(meta.unit);
      assert.ok(meta.statement);
      assert.ok(meta.metricKey);
      assert.ok(meta.divisor > 0);
      assert.equal(typeof meta.decimals, 'number');
    }

    assert.equal(TREND_EXPLORER_METRICS.revenue.divisor, 1e3);
    assert.equal(TREND_EXPLORER_METRICS.daus.divisor, 1e6);
  });

  test('RP3.3: computeExactPercentages guarantees displayed segment percentages sum strictly to 100.0%', async () => {
    // Fractional thirds test
    const rawItems = [
      { name: 'A', value: 10 },
      { name: 'B', value: 10 },
      { name: 'C', value: 10 },
    ];
    const exact = computeExactPercentages(rawItems, 1);
    const sum = exact.reduce((acc, item) => acc + item.percent, 0);
    assert.equal(Number(sum.toFixed(1)), 100.0);
    const strSum = exact.reduce((acc, item) => acc + parseFloat(item.percentStr), 0);
    assert.equal(Number(strSum.toFixed(1)), 100.0);

    // Live historical revenue breakdown test
    const historical = await getHistorical();
    const incRows = extractRows(historical.income) || [];
    const segmentsMeta = [
      { key: 'revenue_subscription', name: 'Subscription' },
      { key: 'revenue_advertising', name: 'Advertising' },
      { key: 'revenue_duolingo_english_test', name: 'Duolingo English Test' },
      { key: 'revenue_in_app_purchases', name: 'In-App Purchases' },
      { key: 'revenue_other', name: 'Other' },
    ];
    const segments = segmentsMeta.map((m) => {
      const r = incRows.find((row) => row.metric === m.key && row.period === 'FY2025');
      return { ...m, value: r?.value || 0 };
    });
    const exactSegments = computeExactPercentages(segments, 1);
    const segSum = exactSegments.reduce((acc, item) => acc + item.percent, 0);
    assert.equal(Number(segSum.toFixed(1)), 100.0);
    const segStrSum = exactSegments.reduce((acc, item) => acc + parseFloat(item.percentStr), 0);
    assert.equal(Number(segStrSum.toFixed(1)), 100.0);
  });

  test('RP3.3: createTrendBarChart renders pure SVG with bars and supports in-place update and dispose', async () => {
    const historical = await getHistorical();
    const container = new StubElement();
    const chart = createTrendBarChart({
      container,
      metric: 'revenue',
      historical,
    });

    assert.ok(chart);
    assert.ok(typeof chart.svg === 'string');
    assert.ok(chart.svg.includes('<svg'));
    assert.ok(chart.svg.includes('Total Revenue (Annual)'));
    assert.ok(chart.svg.includes('FY2021'));
    assert.ok(chart.svg.includes('FY2025'));

    // In-place update to operating_income (includes negative loss bars)
    const updatedSvg = chart.update('operating_income', historical);
    assert.ok(updatedSvg.includes('Operating Income (Annual)'));
    assert.ok(updatedSvg.includes('fill="#ef4444"'), 'Negative income must render red bar');
    assert.ok(updatedSvg.includes('fill="#2563eb"'), 'Positive income must render blue bar');

    chart.dispose();
    assert.equal(container.innerHTML, '');
  });

  test('RP3.3: createRevenueDonutChart renders pure SVG with donut ring and slices sum to 100.0%', async () => {
    const historical = await getHistorical();
    const container = new StubElement();
    const chart = createRevenueDonutChart({
      container,
      dataset: historical,
    });

    assert.ok(chart);
    assert.ok(typeof chart.svg === 'string');
    assert.ok(chart.svg.includes('<svg'));
    assert.ok(chart.svg.includes('Revenue Composition (FY2025)'));
    assert.ok(chart.svg.includes('$1,037.6M'));
    assert.ok(chart.svg.includes('Total'));

    const segments = chart.getSegments();
    assert.equal(segments.length, 5);
    const sum = segments.reduce((acc, s) => acc + s.percent, 0);
    assert.equal(Number(sum.toFixed(1)), 100.0, 'Segments must sum strictly to 100.0%');
    const strSum = segments.reduce((acc, s) => acc + parseFloat(s.percentStr), 0);
    assert.equal(Number(strSum.toFixed(1)), 100.0, 'Segment percent strings must sum strictly to 100.0%');

    chart.dispose();
    assert.equal(container.innerHTML, '');
  });

  test('RP3.3: computeOperatingKpis returns 6 institutional operating metrics tied to audited actuals', async () => {
    const historical = await getHistorical();
    const kpis = computeOperatingKpis(historical);

    assert.equal(kpis.length, 6);
    const byId = Object.fromEntries(kpis.map((k) => [k.id, k]));

    // 1. DAUs (Latest: Q2 FY2026) = 58.7M
    assert.equal(byId.daus.value, '58.7M');
    assert.equal(byId.daus.period, 'Latest: Q2 FY2026');
    assert.equal(byId.daus.targetMetric, 'daus');

    // 2. MAUs (FY2025) = 133.1M
    assert.equal(byId.maus.value, '133.1M');
    assert.equal(byId.maus.period, 'FY2025');
    assert.equal(byId.maus.targetMetric, 'daus');

    // 3. Paid Subscribers (Latest: Q2 FY2026) = 12.7M
    assert.equal(byId.paid_subscribers.value, '12.7M');
    assert.equal(byId.paid_subscribers.period, 'Latest: Q2 FY2026');
    assert.equal(byId.paid_subscribers.targetMetric, 'daus');

    // 4. Conversion (Q2 FY2026) = 9.5%
    assert.equal(byId.conversion.value, '9.5%');
    assert.equal(byId.conversion.period, 'Q2 FY2026');

    // 5. Rule of 40 (FY2025) = 51.8%
    assert.equal(byId.rule_of_40.value, '51.8%');
    assert.equal(byId.rule_of_40.period, 'FY2025');
    assert.equal(byId.rule_of_40.targetMetric, 'revenue');

    // 6. Subscription ARPU (FY2025) = $71.6
    assert.equal(byId.arpu.value, '$71.6');
    assert.equal(byId.arpu.period, 'FY2025');
    assert.equal(byId.arpu.targetMetric, 'revenue');
  });

  test('RP3-RW1.4: renderHistoricals mounts Trend Explorer & Operating KPIs with de-buttoned cards', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({
      container,
      historical,
    });

    // Check containers exist
    assert.ok(container.querySelector('#trend-explorer'));
    assert.ok(container.querySelector('#trend-explorer-section'));
    assert.ok(container.querySelector('#operating-kpis'));
    assert.ok(container.querySelector('#operating-kpis-section'));

    // Check charts initialized
    assert.ok(view.trendBarChart);
    assert.ok(view.revenueDonutChart);
    assert.equal(view.getTrendMetric(), 'revenue');

    // Assert all 6 Operating KPI cards are de-buttoned static divs
    const kpiCards = container.querySelectorAll('.operating-kpi-card');
    assert.equal(kpiCards.length, 6);
    for (const card of kpiCards) {
      assert.equal(card.tagName, 'DIV');
      assert.equal(card.getAttribute('role'), null);
      assert.equal(card.getAttribute('tabindex'), null);
      assert.equal(card.getAttribute('data-target-metric'), null);

      // Simulated click changes nothing on trend metric
      card.dispatch('click');
      assert.equal(view.getTrendMetric(), 'revenue');
    }

    // Explorer pills remain the sole metric switcher
    view.setTrendMetric('operating_income');
    assert.equal(view.getTrendMetric(), 'operating_income');

    // Clicking KPI card again leaves metric unchanged at operating_income
    kpiCards[0].dispatch('click');
    assert.equal(view.getTrendMetric(), 'operating_income');

    view.dispose();
  });

  test('RP3-RW1.1: Canonical unified header CSS rule declared app-wide across Tab 03 and gated tabs', () => {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');

    // Shared rule for title blocks
    assert.match(
      html,
      /\.trend-title-block[\s\S]*?\.operating-kpis-title-block[\s\S]*?\.statement-title-block[\s\S]*?\.audit-center-title-block[\s\S]*?\.cover-section-header[\s\S]*?\.cover-card-title[\s\S]*?\.scenario-picker-title[\s\S]*?\.driver-group-header[\s\S]*?\.statement-card-header\s*\{[^}]*border-left:\s*3px\s+solid\s+var\(--color-accent-blue\);[^}]*padding-left:\s*10px;/
    );

    // Shared rule for titles (15px, 700, var(--color-text-primary), 2px bottom margin)
    assert.match(
      html,
      /\.trend-main-title[\s\S]*?\.operating-kpis-main-title[\s\S]*?\.workspace-main-title[\s\S]*?\.statement-title-block\s+h3[\s\S]*?\.audit-center-title[\s\S]*?\.cover-section-title[\s\S]*?\.cover-card-title[\s\S]*?\{[^}]*font-size:\s*15px;[^}]*font-weight:\s*700;[^}]*color:\s*var\(--color-text-primary\);[^}]*margin:\s*0\s+0\s+2px\s+0;/
    );

    // Shared rule for subtitles (12px, var(--color-text-muted), 0 margin)
    assert.match(
      html,
      /\.trend-subtitle[\s\S]*?\.operating-kpis-subtitle[\s\S]*?\.workspace-subtitle[\s\S]*?\.statement-title-block\s+p[\s\S]*?\.audit-center-subtitle[\s\S]*?\.cover-section-subtitle\s*\{[^}]*font-size:\s*12px;[^}]*color:\s*var\(--color-text-muted\);[^}]*margin:\s*0;/
    );
  });

  test('RP3-RW1.5: Donut dynamics: year-follow, 100.0% decompositions, unmount/mount & bar expansion', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({
      container,
      historical,
    });

    // Default year is FY2025 on first mount
    assert.equal(view.getSelectedTrendYear(), 'FY2025');
    assert.ok(view.revenueDonutChart);
    assert.equal(view.revenueDonutChart.getSelectedYear(), 'FY2025');

    // Verify all 5 years (FY21-FY25) decompositions sum strictly to 100.0%
    const expectedSums = {
      FY2021: 250772,
      FY2022: 369495,
      FY2023: 531109,
      FY2024: 748024,
      FY2025: 1037589,
    };

    for (const [year, expectedSum] of Object.entries(expectedSums)) {
      const segments = view.revenueDonutChart.getSegments(year);
      assert.equal(segments.length, 5);
      const sumVal = segments.reduce((acc, s) => acc + s.value, 0);
      assert.equal(sumVal, expectedSum, `${year} segments must sum to parent total ${expectedSum}`);
      const sumPct = segments.reduce((acc, s) => acc + s.percent, 0);
      assert.equal(Number(sumPct.toFixed(1)), 100.0, `${year} percentage must sum strictly to 100.0%`);
    }

    // Switch to non-revenue pill (operating_income) -> donut unmounts, bar expands
    view.setTrendMetric('operating_income');
    assert.equal(view.revenueDonutChart, null, 'Donut chart must be null on non-revenue pill');
    assert.equal(container.querySelector('#revenue-donut-card'), null, 'Donut card DOM must be unmounted');
    const grid = container.querySelector('#trend-charts-grid');
    assert.ok(grid.classList.contains('single-chart'), 'Grid must have single-chart class');

    // Reselect revenue -> donut re-mounts with selected year preserved
    view.setTrendMetric('revenue');
    assert.ok(view.revenueDonutChart, 'Donut chart must re-mount on revenue selection');
    assert.ok(container.querySelector('#revenue-donut-card'), 'Donut card DOM must re-mount');
    assert.equal(view.getSelectedTrendYear(), 'FY2025', 'Selected year must be preserved');
    assert.ok(!grid.classList.contains('single-chart'), 'single-chart class must be removed');

    view.dispose();
  });

  test('RP3-RW1.6: Donut subtitle units and tooltip derivations against corpus arithmetic', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const donut = createRevenueDonutChart({
      container,
      dataset: historical,
      selectedYear: 'FY2025',
    });

    const svg = donut.svg;
    // Subtitle check
    assert.ok(svg.includes('Breakdown by reporting stream ($M)'));
    assert.ok(svg.includes('Revenue Composition (FY2025)'));

    // Verify FY2025 hover tooltip derivations: thousands ÷ 1e3
    // Subscription = 873,442 thousands -> $873.4M (84.2%)
    assert.ok(svg.includes('Subscription: 84.2% ($873.4M)'));
    // Advertising = 79,746 thousands -> $79.7M (7.7%)
    assert.ok(svg.includes('Advertising: 7.7% ($79.7M)'));
    // Center total: 1,037,589 thousands -> $1,037.6M
    assert.ok(svg.includes('$1,037.6M'));

    donut.dispose();
  });

  test('B2: donut legend entries carry button semantics; isolateSegment dims the rest', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const donut = createRevenueDonutChart({
      container,
      dataset: historical,
      selectedYear: 'FY2025',
    });

    const svg = donut.svg;
    assert.equal((svg.match(/<g class="donut-legend-entry/g) || []).length, 5, 'Must render 5 legend entries');
    assert.equal((svg.match(/role="button"/g) || []).length, 5, 'Legend entries must expose button semantics');
    assert.equal((svg.match(/tabindex="0"/g) || []).length, 5, 'Legend entries must be keyboard-focusable');

    // Isolate one segment: the other 4 slices + 4 entries dim, target stays full
    assert.equal(donut.isolateSegment('Subscription'), 'Subscription');
    assert.equal(donut.getIsolatedSegment(), 'Subscription');
    const iso = donut.svg;
    assert.equal((iso.match(/donut-dimmed/g) || []).length, 8, '4 slices + 4 legend entries dimmed');
    assert.ok(iso.includes('aria-pressed="true"'), 'Isolated entry reports pressed state');
    assert.doesNotMatch(iso, /<path[^>]*data-segment="Subscription"[^>]*donut-dimmed/, 'Isolated slice stays full');

    // Isolation survives a year-switch re-render
    donut.update(null, 'FY2024');
    assert.equal(donut.getIsolatedSegment(), 'Subscription');
    assert.equal((donut.svg.match(/donut-dimmed/g) || []).length, 8);

    // Unknown names are ignored; null clears
    donut.isolateSegment('Nope');
    assert.equal(donut.getIsolatedSegment(), 'Subscription');
    assert.equal(donut.isolateSegment(null), null);
    assert.doesNotMatch(donut.svg, /donut-dimmed/);

    donut.dispose();
  });

  test('B2: container click toggles legend isolation via delegation', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const donut = createRevenueDonutChart({
      container,
      dataset: historical,
      selectedYear: 'FY2025',
    });

    const cands = container.querySelectorAll('[data-segment="Advertising"]');
    const entry = cands.find((el) => el.classList && el.classList.contains('donut-legend-entry'));
    assert.ok(entry, 'Advertising legend entry must exist');
    entry.closest = () => entry;
    container.dispatch('click', { target: entry });
    assert.equal(donut.getIsolatedSegment(), 'Advertising', 'Legend click isolates the segment');

    // Second click on the same entry clears
    container.dispatch('click', { target: entry });
    assert.equal(donut.getIsolatedSegment(), null, 'Second click restores the full donut');

    // Keyboard Enter toggles as well
    container.dispatch('keydown', { target: entry, key: 'Enter', preventDefault: () => {} });
    assert.equal(donut.getIsolatedSegment(), 'Advertising', 'Enter isolates the segment');

    donut.dispose();
  });

  test('RP3-RW1.7: Audit Center single-open accordion discipline and jump button exclusivity', async () => {
    const historical = await getHistorical();
    const container = createInteractiveContainer();
    const view = renderHistoricals({
      container,
      historical,
    });

    const cards = container.querySelectorAll('.filing-card');
    assert.ok(cards.length >= 2, 'Audit Center must have at least 2 cards');

    // Open card 0
    cards[0].open = true;
    cards[0].dispatch('toggle');
    assert.equal(cards[0].open, true);

    // Open card 1 -> card 0 must close (single-open accordion)
    cards[1].open = true;
    cards[1].dispatch('toggle');
    assert.equal(cards[1].open, true);
    assert.equal(cards[0].open, false, 'Opening card 1 must close card 0');

    // Jump button #btn-jump-audit: opens card 0 and closes others
    const jumpBtn = container.querySelector('#btn-jump-audit');
    assert.ok(jumpBtn);
    jumpBtn.dispatch('click');
    assert.equal(cards[0].open, true, 'Jump button must open first card');
    for (let i = 1; i < cards.length; i++) {
      assert.equal(cards[i].open, false, `Card ${i} must be closed after jump button click`);
    }

    // Verify every card body is non-empty and contains SEC accession number
    const auditMarkup = buildAuditCenterMarkup(AUDIT_FILINGS);
    for (const f of AUDIT_FILINGS) {
      assert.ok(auditMarkup.includes(f.accession), `Audit Center markup must contain accession number for ${f.id}`);
    }

    view.dispose();
  });
});

