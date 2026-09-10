/**
 * Pin Genesis Regenerator (Economy Phase EP.3) — tools/regen_pins.mjs.
 *
 * Runs the full engine (loader → schedules → forecast → three-statement →
 * WACC → DCF → recommend → sensitivity → scenarios) and emits the pin table:
 * every e2e pin plus the docstring header numbers, from one machine pass, so
 * header and assertions agree by construction (F4 can never recur).
 *
 * The emitted run carries a hash stamp over assumptions.json plus every engine
 * source (comments stripped, key-sorted JSON): tests verify stored hash ==
 * recomputed hash, and any hand-typed pin fails loudly against live engine
 * output with a diff of what moved. Hand edits are a rejection condition —
 * move pins only by running this tool.
 *
 * Idempotent: running twice with unchanged inputs rewrites nothing (the file
 * is left untouched when pins and stamp already match, so mtime is stable).
 * Usage: `node tools/regen_pins.mjs [--check]` (`--check` exits 1 on drift).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { readLedgerUrls } from '../tests/_ledger.js';
import schedulesEngine from '../src/engine/schedules.js';
import forecastEngine from '../src/engine/forecast.js';
import threeStatementEngine from '../src/engine/threeStatement.js';
import { build as buildWacc } from '../src/engine/wacc.js';
import { valuate as valuateDcf } from '../src/engine/dcf.js';
import {
  evaluate as evaluateRec,
  buildSensitivityGrid,
  runFullValuation,
} from '../src/engine/recommend.js';
import { compute as computeTtm } from '../src/engine/ttm.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const E2E_REL = 'tests/e2e.accuracy.test.js';

/** Stamp block markers (single-line JSON payload between them). */
export const STAMP_BEGIN = '/* PIN-GENESIS-STAMP-BEGIN';
export const STAMP_END = 'PIN-GENESIS-STAMP-END */';

/**
 * Recursively key-sorts a JSON value for deterministic hashing.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function stableSortJson(value) {
  if (Array.isArray(value)) {
    return value.map(stableSortJson);
  }
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = stableSortJson(value[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Normalizes file text for hashing: JSON gets key-sorted compaction,
 * JavaScript gets comment stripping; line endings normalize to LF.
 *
 * @param {string} relPath Repo-relative path.
 * @param {string} text Raw file text.
 * @returns {string}
 */
export function normalizeForHash(relPath, text) {
  const normalized = text.replace(/\r\n/g, '\n');
  if (relPath.endsWith('.json')) {
    return JSON.stringify(stableSortJson(JSON.parse(normalized)));
  }
  return normalized.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Hashes a file set and returns the aggregate stamp payload inputs.
 *
 * @param {string} rootDir Repo root directory.
 * @param {Array<string>} relPaths Repo-relative file paths.
 * @returns {{ hash: string, files: Record<string, string> }}
 */
export function hashSources(rootDir, relPaths) {
  const files = {};
  for (const rel of relPaths) {
    const text = fs.readFileSync(path.join(rootDir, rel), 'utf8');
    files[rel] = crypto.createHash('sha256').update(normalizeForHash(rel, text), 'utf8').digest('hex');
  }
  const aggregate = Object.keys(files)
    .sort()
    .map((rel) => `${rel}\n${files[rel]}`)
    .join('\n');
  return {
    hash: crypto.createHash('sha256').update(aggregate, 'utf8').digest('hex'),
    files,
  };
}

/**
 * Lists every engine source plus the assumptions file (the stamp's
 * generatedFrom set, economy_phase.md §7).
 *
 * @param {string} rootDir Repo root directory.
 * @returns {Array<string>} Sorted repo-relative paths with forward slashes.
 */
export function listStampSources(rootDir) {
  const found = ['src/data/assumptions.json'];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        found.push(path.relative(rootDir, full).split(path.sep).join('/'));
      }
    }
  };
  walk(path.join(rootDir, 'src', 'engine'));
  return found.sort();
}

/**
 * Formats a thousands-scale money value with comma grouping and 2dp.
 *
 * @param {number} value
 * @returns {string}
 */
function formatMoney2(value) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Builds the live pin bundle from one full machine pass.
 *
 * @param {string} rootDir Repo root directory.
 * @returns {Promise<object>} Frozen live values keyed for the pin map.
 */
async function buildLiveBundle(rootDir) {
  const readText = (location) => fs.promises.readFile(location, 'utf8');
  const ledger = readLedgerUrls();
  const dataDir = path.join(rootDir, 'src', 'data', 'historical') + path.sep;
  const assumptionsPath = path.join(rootDir, 'src', 'data', 'assumptions.json');
  const historical = await loadHistorical({ dir: dataDir, readText, requireLedger: true, ledger });
  const assumptions = await loadAssumptions({ location: assumptionsPath, readText });
  const schedules = schedulesEngine.build(historical, assumptions);
  const forecast = forecastEngine.project({ historical, assumptions });
  const threeStatement = threeStatementEngine.project(schedules, assumptions, forecast);
  const wacc = buildWacc({ assumptions, debtSchedule: schedules.debt });
  const dcf = valuateDcf(threeStatement, wacc, { assumptions, corpus: historical });
  const marketPrice = assumptions.get('market_share_price').value;
  const recommendation = evaluateRec(dcf.perShare, marketPrice);
  const sensGrid = buildSensitivityGrid({ threeStatement, assumptions, wacc, corpus: historical });
  const scenarios = {
    bear: runFullValuation(historical, assumptions, 'bear'),
    bull: runFullValuation(historical, assumptions, 'bull'),
  };
  const ttm = computeTtm(historical);
  const rows = [
    ...extractRows(historical.income),
    ...extractRows(historical.balance),
    ...extractRows(historical.cashflow),
    ...extractRows(historical.kpis),
  ];
  const row = (metric, period) => {
    const found = rows.find((r) => r.metric === metric && r.period === period);
    if (!found || !Number.isFinite(found.value)) {
      throw new Error(`Regen needs corpus row ${metric}@${period}.`);
    }
    return found.value;
  };

  const rev2030 = forecast.byPeriod.FY2030.revenue.total.value;
  const rev2025 = row('revenue_total', 'FY2025');
  const fcf2030 = threeStatement.cashFlow.byPeriod.FY2030.free_cash_flow.value;
  const cagr = Math.pow(rev2030 / rev2025, 1 / 5) - 1;
  const fcfMargin = fcf2030 / rev2030;

  return {
    rf: assumptions.get('risk_free_rate').value,
    beta: assumptions.get('beta').value,
    erp: assumptions.get('equity_risk_premium').value,
    tax: assumptions.get('effective_tax_rate').value,
    sharesBop: assumptions.get('shares_outstanding').value,
    price: assumptions.get('market_share_price').value,
    costOfEquity: wacc.costOfEquity.value,
    wacc: wacc.wacc.value,
    df0: dcf.schedule[0].discountFactor,
    df4: dcf.schedule[4].discountFactor,
    pvExplicit: dcf.pvExplicit,
    terminalFcfUnnorm: dcf.schedule[4].fcf * (1 + dcf.terminalGrowthRate),
    terminalValue: dcf.terminalValue,
    pvTerminal: dcf.pvTerminal,
    enterpriseValue: dcf.enterpriseValue,
    netCash: dcf.netCash,
    equityValue: dcf.equityValue,
    perShare: dcf.perShare,
    upsidePct: recommendation.upsidePct,
    label: recommendation.label,
    bear: scenarios.bear.dcf.perShare,
    base: dcf.perShare,
    bull: scenarios.bull.dcf.perShare,
    bearLabel: scenarios.bear.recommendation.label,
    baseLabel: recommendation.label,
    bullLabel: scenarios.bull.recommendation.label,
    h1Revenue: forecast.byPeriod.FY2026.revenue.total.h1.value,
    h1OperatingIncome: forecast.byPeriod.FY2026.operating_income.h1.value,
    h1NetIncome: threeStatement.incomeStatement.byPeriod.FY2026.net_income.h1.value,
    h1Ocf: threeStatement.cashFlow.byPeriod.FY2026.operating_activities.total.h1.value,
    h2Revenue: forecast.byPeriod.FY2026.revenue.total.h2.value,
    fy2026Revenue: forecast.byPeriod.FY2026.revenue.total.value,
    cagr,
    fcfMargin,
    ruleOf40: (cagr + fcfMargin) * 100,
    rev2025,
    corpusCount: rows.length,
    dau: row('dau', 'Q2 FY2026'),
    mau: row('mau', 'FY2025'),
    subs: row('paid_subscribers', 'Q2 FY2026'),
    bookings: row('total_bookings', 'FY2025'),
    sensWaccCount: sensGrid.waccValues.length,
    sensGrowthCount: sensGrid.growthValues.length,
    sensCellCount: sensGrid.cells.length,
  };
}

/**
 * Capitalizes a recommendation label for docstring prose.
 *
 * @param {string} label Lowercase label.
 * @returns {string}
 */
function proseLabel(label) {
  return label.slice(0, 1).toUpperCase() + label.slice(1);
}

/**
 * The pin map: anchored replacements from live values. Each entry carries a
 * `locate` pattern matching the CURRENT pin text (whatever value it holds, so
 * reruns are idempotent) and a `format(match, live)` builder returning the
 * full replacement for the matched span. Patterns never carry pin literals.
 */
const PIN_MAP = [
  // ── Docstring header: valuation pin set ────────────────────────────────
  { id: 'doc-rf', locate: /(\brf )[\d.]+(%)/, format: (m, v) => `${m[1]}${(v.rf * 100).toFixed(2)}${m[2]}` },
  { id: 'doc-beta', locate: /(\bbeta )[\d.]+/, format: (m, v) => `${m[1]}${v.beta.toFixed(2)}` },
  { id: 'doc-erp', locate: /(\bERP )[\d.]+(%)/, format: (m, v) => `${m[1]}${(v.erp * 100).toFixed(2)}${m[2]}` },
  { id: 'doc-re', locate: /(\bRe )[\d.]+(%)/, format: (m, v) => `${m[1]}${(v.costOfEquity * 100).toFixed(4)}${m[2]}` },
  { id: 'doc-wacc', locate: /(WACC = )[\d.]+(%)/, format: (m, v) => `${m[1]}${(v.wacc * 100).toFixed(4)}${m[2]}` },
  { id: 'doc-pvExplicit', locate: /(pvExplicit )[\d,]+\.\d{2}/, format: (m, v) => `${m[1]}${formatMoney2(v.pvExplicit)}` },
  { id: 'doc-tv', locate: /(Gordon TV )[\d,]+\.\d{2}/, format: (m, v) => `${m[1]}${formatMoney2(v.terminalValue)}` },
  { id: 'doc-ev', locate: /(\bEV )[\d,]+\.\d{2}/, format: (m, v) => `${m[1]}${formatMoney2(v.enterpriseValue)}` },
  { id: 'doc-netCash', locate: /(Net Cash )[\d,]+\.\d{2}/, format: (m, v) => `${m[1]}${formatMoney2(v.netCash)}` },
  { id: 'doc-equity', locate: /(\bEquity )[\d,]+\.\d{2}/, format: (m, v) => `${m[1]}${formatMoney2(v.equityValue)}` },
  { id: 'doc-perShare', locate: /(perShare \$)[\d.]+/, format: (m, v) => `${m[1]}${String(v.perShare)}` },
  {
    id: 'doc-upside',
    locate: /([+-]?[\d.]+)% (Undervalued|Fair|Overvalued)\)/,
    format: (m, v) => {
      const pct = v.upsidePct * 100;
      return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% ${proseLabel(v.label)})`;
    },
  },
  { id: 'doc-bear', locate: /(\bBear \$)[\d.]+/, format: (m, v) => `${m[1]}${v.bear.toFixed(2)}` },
  { id: 'doc-base', locate: /(\bBase \$)[\d.]+/, format: (m, v) => `${m[1]}${v.base.toFixed(2)}` },
  { id: 'doc-bull', locate: /(\bBull \$)[\d.]+/, format: (m, v) => `${m[1]}${v.bull.toFixed(2)}` },
  // ── Driver pins ────────────────────────────────────────────────────────
  { id: 'pin-rf', locate: /(\(assumptions\.get\('risk_free_rate'\)\.value, )[\d.]+(,)/, format: (m, v) => `${m[1]}${String(v.rf)}${m[2]}` },
  { id: 'pin-beta', locate: /(\(assumptions\.get\('beta'\)\.value, )[\d.]+(,)/, format: (m, v) => `${m[1]}${String(v.beta)}${m[2]}` },
  { id: 'pin-erp', locate: /(\(assumptions\.get\('equity_risk_premium'\)\.value, )[\d.]+(,)/, format: (m, v) => `${m[1]}${String(v.erp)}${m[2]}` },
  { id: 'pin-tax', locate: /(\(assumptions\.get\('effective_tax_rate'\)\.value, )[\d.]+(,)/, format: (m, v) => `${m[1]}${String(v.tax)}${m[2]}` },
  { id: 'pin-shares', locate: /(\(assumptions\.get\('shares_outstanding'\)\.value, )\d+(,)/, format: (m, v) => `${m[1]}${String(v.sharesBop)}${m[2]}` },
  { id: 'pin-price', locate: /(\(assumptions\.get\('market_share_price'\)\.value, )[\d.]+(,)/, format: (m, v) => `${m[1]}${String(v.price)}${m[2]}` },
  { id: 'pin-re', locate: /(wacc\.costOfEquity\.value \* 1000000\) \/ 1000000, )[\d.]+/, format: (m, v) => `${m[1]}${String(v.costOfEquity)}` },
  { id: 'pin-wacc', locate: /(wacc\.wacc\.value \* 1000000\) \/ 1000000, )[\d.]+/, format: (m, v) => `${m[1]}${String(v.wacc)}` },
  // ── DCF pins ───────────────────────────────────────────────────────────
  { id: 'pin-df0', locate: /(dcf\.schedule\[0\]\.discountFactor - )[\d.]+/, format: (m, v) => `${m[1]}${String(v.df0)}` },
  { id: 'pin-df4', locate: /(dcf\.schedule\[4\]\.discountFactor - )[\d.]+/, format: (m, v) => `${m[1]}${String(v.df4)}` },
  { id: 'pin-pvExplicit', locate: /(dcf\.pvExplicit - )[\d.]+/, format: (m, v) => `${m[1]}${v.pvExplicit.toFixed(2)}` },
  { id: 'pin-terminalFcf', locate: /(terminalFcf - )[\d.]+/, format: (m, v) => `${m[1]}${v.terminalFcfUnnorm.toFixed(2)}` },
  { id: 'pin-tv', locate: /(dcf\.terminalValue - )[\d.]+/, format: (m, v) => `${m[1]}${v.terminalValue.toFixed(2)}` },
  { id: 'pin-pvTerminal', locate: /(dcf\.pvTerminal - )[\d.]+/, format: (m, v) => `${m[1]}${v.pvTerminal.toFixed(2)}` },
  { id: 'pin-ev', locate: /(dcf\.enterpriseValue - )[\d.]+/, format: (m, v) => `${m[1]}${v.enterpriseValue.toFixed(2)}` },
  { id: 'pin-netCash', locate: /(dcf\.netCash - )[\d.]+/, format: (m, v) => `${m[1]}${v.netCash.toFixed(2)}` },
  { id: 'pin-equity', locate: /(dcf\.equityValue - )[\d.]+/, format: (m, v) => `${m[1]}${v.equityValue.toFixed(2)}` },
  { id: 'pin-perShare', locate: /(dcf\.perShare - )[\d.]+/, format: (m, v) => `${m[1]}${String(v.perShare)}` },
  { id: 'pin-label', locate: /(recommendation\.label, ')(fair|overvalued|undervalued)(')/, format: (m, v) => `${m[1]}${v.label}${m[3]}` },
  { id: 'pin-upside', locate: /(recommendation\.upsidePct - \()-?[\d.]+(\))/, format: (m, v) => `${m[1]}${v.upsidePct.toFixed(6)}${m[2]}` },
  // ── Scenario pins ──────────────────────────────────────────────────────
  { id: 'pin-bear', locate: /(bearPrice - )[\d.]+/, format: (m, v) => `${m[1]}${v.bear.toFixed(2)}` },
  { id: 'pin-base', locate: /(basePrice - )[\d.]+/, format: (m, v) => `${m[1]}${v.base.toFixed(2)}` },
  { id: 'pin-bull', locate: /(bullPrice - )[\d.]+/, format: (m, v) => `${m[1]}${v.bull.toFixed(2)}` },
  { id: 'pin-bear-label', locate: /(scenarios\.bear\.recommendation\.label, ')(fair|overvalued|undervalued)(')/, format: (m, v) => `${m[1]}${v.bearLabel}${m[3]}` },
  { id: 'pin-base-label', locate: /(scenarios\.base\.recommendation\.label, ')(fair|overvalued|undervalued)(')/, format: (m, v) => `${m[1]}${v.baseLabel}${m[3]}` },
  { id: 'pin-bull-label', locate: /(scenarios\.bull\.recommendation\.label, ')(fair|overvalued|undervalued)(')/, format: (m, v) => `${m[1]}${v.bullLabel}${m[3]}` },
  {
    id: 'pin-scenario-name',
    locate: /(Scenario Range satisfies strict ordering: Bear \()\$(?:[\d.]+)(\) < Base \()\$(?:[\d.]+)(\) < Bull \()\$(?:[\d.]+)(\))/,
    format: (m, v) => `${m[1]}$${v.bear.toFixed(2)}${m[2]}$${v.base.toFixed(2)}${m[3]}$${v.bull.toFixed(2)}${m[4]}`,
  },
  // ── Assertion message texts (pins echoed in messages move together) ──────
  { id: 'msg-tv', locate: /(Gordon TV matches pin )[\d,]+\.\d{2}/, format: (m, v) => `${m[1]}${formatMoney2(v.terminalValue)}` },
  { id: 'msg-pvTerminal', locate: /(pvTerminal matches pin )[\d,]+\.\d{2}/, format: (m, v) => `${m[1]}${formatMoney2(v.pvTerminal)}` },
  { id: 'msg-ev', locate: /(EV matches pin )[\d,]+\.\d{2}/, format: (m, v) => `${m[1]}${formatMoney2(v.enterpriseValue)}` },
  { id: 'msg-equity', locate: /(Equity Value matches pin )[\d,]+\.\d{2}/, format: (m, v) => `${m[1]}${formatMoney2(v.equityValue)}` },
  { id: 'msg-perShare', locate: /(perShare matches exact pin )[\d.]+/, format: (m, v) => `${m[1]}${String(v.perShare)}` },
  { id: 'msg-upside', locate: /(Upside % matches )-?[\d.]+(%)/, format: (m, v) => `${m[1]}${(v.upsidePct * 100).toFixed(2)}${m[2]}` },
  { id: 'msg-label', locate: /(Recommendation label is )(fair|overvalued|undervalued)/, format: (m, v) => `${m[1]}${v.label}` },
  { id: 'msg-bear', locate: /(Bear price \$\{bearPrice\} matches ~)[\d.]+/, format: (m, v) => `${m[1]}${v.bear.toFixed(2)}` },
  { id: 'msg-base', locate: /(Base price \$\{basePrice\} matches ~)[\d.]+/, format: (m, v) => `${m[1]}${v.base.toFixed(2)}` },
  { id: 'msg-bull', locate: /(Bull price \$\{bullPrice\} matches ~)[\d.]+/, format: (m, v) => `${m[1]}${v.bull.toFixed(2)}` },
  { id: 'msg-bear-label', locate: /(Bear scenario recommendation is )(fair|overvalued|undervalued)/, format: (m, v) => `${m[1]}${v.bearLabel}` },
  { id: 'msg-base-label', locate: /(Base scenario recommendation is )(fair|overvalued|undervalued)/, format: (m, v) => `${m[1]}${v.baseLabel}` },
  { id: 'msg-bull-label', locate: /(Bull scenario recommendation is )(fair|overvalued|undervalued)/, format: (m, v) => `${m[1]}${v.bullLabel}` },
  // ── Hybrid invariants ───────────────────────────────────────────────────
  { id: 'pin-h1rev', locate: /(revenue\.total\.h1\.value, )\d+/, format: (m, v) => `${m[1]}${String(v.h1Revenue)}` },
  { id: 'pin-h1oi', locate: /(operating_income\.h1\.value, )\d+/, format: (m, v) => `${m[1]}${String(v.h1OperatingIncome)}` },
  { id: 'pin-h1ni', locate: /(net_income\.h1\.value, )\d+/, format: (m, v) => `${m[1]}${String(v.h1NetIncome)}` },
  { id: 'pin-h1ocf', locate: /(operating_activities\.total\.h1\.value, )\d+/, format: (m, v) => `${m[1]}${String(v.h1Ocf)}` },
  { id: 'pin-h2rev', locate: /(revenue\.total\.h2\.value \* 100\) \/ 100, )[\d.]+/, format: (m, v) => `${m[1]}${v.h2Revenue.toFixed(2)}` },
  { id: 'pin-fy2026rev', locate: /(revenue\.total\.value \* 100\) \/ 100, )[\d.]+/, format: (m, v) => `${m[1]}${v.fy2026Revenue.toFixed(2)}` },
  // ── Rule of 40 ─────────────────────────────────────────────────────────
  { id: 'pin-rev2025', locate: /(const rev2025 = )\d+/, format: (m, v) => `${m[1]}${String(v.rev2025)}` },
  { id: 'pin-cagr', locate: /(\(cagr - )[\d.]+/, format: (m, v) => `${m[1]}${v.cagr.toFixed(4)}` },
  { id: 'pin-margin', locate: /(\(fcfMargin - )[\d.]+/, format: (m, v) => `${m[1]}${v.fcfMargin.toFixed(4)}` },
  { id: 'pin-r40', locate: /(\(ruleOf40 - )[\d.]+/, format: (m, v) => `${m[1]}${v.ruleOf40.toFixed(2)}` },
  // ── KPI truths + corpus + sensitivity dims ──────────────────────────────
  { id: 'pin-dau', locate: /(dauQ2_26\?\.value, )\d+/, format: (m, v) => `${m[1]}${String(v.dau)}` },
  { id: 'pin-mau', locate: /(mau2025\?\.value, )\d+/, format: (m, v) => `${m[1]}${String(v.mau)}` },
  { id: 'pin-subs', locate: /(subsQ2_26\?\.value, )\d+/, format: (m, v) => `${m[1]}${String(v.subs)}` },
  { id: 'pin-bookings', locate: /(bookings2025\?\.value, )\d+/, format: (m, v) => `${m[1]}${String(v.bookings)}` },
  { id: 'pin-corpus', locate: /(CORPUS_RECORD_COUNT = )\d+/, format: (m, v) => `${m[1]}${String(v.corpusCount)}` },
  { id: 'pin-sensW', locate: /(waccValues\.length, )\d+/, format: (m, v) => `${m[1]}${String(v.sensWaccCount)}` },
  { id: 'pin-sensG', locate: /(growthValues\.length, )\d+/, format: (m, v) => `${m[1]}${String(v.sensGrowthCount)}` },
  { id: 'pin-sensCells', locate: /(cells\.length, )\d+/, format: (m, v) => `${m[1]}${String(v.sensCellCount)}` },
];

/**
 * Applies the pin map to the e2e source text.
 *
 * @param {string} source Current file text.
 * @param {object} live Live pin bundle from buildLiveBundle().
 * @returns {{ text: string, replaced: Array<string>, missing: Array<string> }}
 */
export function applyPinMap(source, live) {
  let text = source;
  const replaced = [];
  const missing = [];
  for (const entry of PIN_MAP) {
    const pattern = new RegExp(entry.locate.source);
    const match = pattern.exec(text);
    if (!match) {
      missing.push(entry.id);
      continue;
    }
    const built = entry.format(match, live);
    const next = text.slice(0, match.index) + built + text.slice(match.index + match[0].length);
    if (next !== text) {
      replaced.push(entry.id);
      text = next;
    }
  }
  return { text, replaced, missing };
}

/**
 * Reads the stored stamp payload from the e2e source, if present.
 *
 * @param {string} source File text.
 * @returns {object|null} Parsed stamp or null when absent.
 */
export function readStamp(source) {
  const match = source.match(/\/\* PIN-GENESIS-STAMP-BEGIN\n([\s\S]*?)\nPIN-GENESIS-STAMP-END \*\//);
  if (!match) {
    return null;
  }
  return JSON.parse(match[1]);
}

/**
 * Renders the stamp block for the given payload.
 *
 * @param {object} stamp Stamp payload.
 * @returns {string}
 */
export function renderStamp(stamp) {
  return `${STAMP_BEGIN}\n${JSON.stringify(stamp)}\n${STAMP_END}`;
}

/**
 * Regenerates pins, docstring header numbers, and the hash stamp.
 *
 * @param {object} [options]
 * @param {string} [options.rootDir] Repo root (defaults to the enclosing repo).
 * @param {boolean} [options.check] When true, report drift without writing.
 * @returns {Promise<{ changed: boolean, replaced: Array<string>, missing: Array<string>, hash: string }>}
 */
export async function regenPins(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const rootDir = typeof opts.rootDir === 'string' ? opts.rootDir : ROOT;
  const e2ePath = path.join(rootDir, E2E_REL);
  const live = await buildLiveBundle(rootDir);
  const sources = listStampSources(rootDir);
  const { hash, files } = hashSources(rootDir, sources);

  let text = fs.readFileSync(e2ePath, 'utf8');
  const { text: pinned, replaced, missing } = applyPinMap(text, live);
  if (missing.length > 0) {
    throw new Error(`Pin map anchors missing in ${E2E_REL}: ${missing.join(', ')}.`);
  }
  text = pinned;

  const createdAt = new Date().toISOString();
  const stamp = { hash, generatedFrom: sources, createdAt, files };
  const rendered = renderStamp(stamp);
  const stored = readStamp(text);
  let stampChanged = true;
  if (stored && stored.hash === hash) {
    stampChanged = false;
    text = text.replace(
      /\/\* PIN-GENESIS-STAMP-BEGIN\n[\s\S]*?\nPIN-GENESIS-STAMP-END \*\//,
      rendered.replace(createdAt, stored.createdAt),
    );
  } else if (stored) {
    text = text.replace(
      /\/\* PIN-GENESIS-STAMP-BEGIN\n[\s\S]*?\nPIN-GENESIS-STAMP-END \*\//,
      rendered,
    );
  } else {
    const headerEnd = text.indexOf('*/');
    if (headerEnd === -1) {
      throw new Error(`Cannot locate the header docstring in ${E2E_REL}.`);
    }
    text = `${text.slice(0, headerEnd + 2)}\n\n${rendered}\n${text.slice(headerEnd + 2)}`;
  }

  const original = fs.readFileSync(e2ePath, 'utf8');
  const changed = replaced.length > 0 || stampChanged || text !== original;
  const fullyChanged = text !== original;
  if (!opts.check && fullyChanged) {
    fs.writeFileSync(e2ePath, text, 'utf8');
  }
  return { changed: fullyChanged, replaced, missing, hash };
}

const invokedDirectly =
  typeof process !== 'undefined' &&
  process.argv &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const check = process.argv.includes('--check');
  regenPins({ check })
    .then((result) => {
      if (result.changed) {
        console.log(
          check
            ? `PIN DRIFT: ${result.replaced.length} pin(s) differ from live engine output (hash ${result.hash}).`
            : `PINS REGENERATED: ${result.replaced.length} pin replacement(s) applied (hash ${result.hash}).`,
        );
        process.exit(check ? 1 : 0);
      }
      console.log(`PINS IN SYNC: e2e pins match live engine output (hash ${result.hash}).`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`PIN REGEN FAILED: ${err && err.message ? err.message : err}`);
      process.exit(2);
    });
}
