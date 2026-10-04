/**
 * Economic Invariants Module (Economy Phase EP.1) — Economic Identity Gates (EIG).
 *
 * Third verification tier in the project doctrine (docs/phases/economy_phase.md §1):
 *
 *   internal consistency  <  economic identity (EIG)  <  external truth (OP/EDGAR)
 *
 * This module hosts the indisputable identities — cash articulation, balance-sheet
 * balance, net-cash bridge re-derivation, pin-sync detection, and the OCF add-back
 * settlement registry. Policy-laden checks (EIG-A tolerance, EIG-B convention) live
 * in tests/_invariants.js so conventions stay visible for human review (R3).
 *
 * Standing rule for every gate: re-derive economics from raw lines (schedules, CF
 * lines, BS lines, BOP cites) and never re-implement an engine formula. Summing raw
 * statement component lines to an identity is a re-derivation, not a copy of the
 * code under test. The module consumes no engine output beyond the audited
 * ThreeStatement payload and cites no market figure — it carries zero bare numeric
 * literals > 999 outside comments and buries zero fallbacks on any path: missing or
 * non-finite lines throw typed EngineError fail-closed.
 *
 * EIG gate placement (EP designations, economy_phase.md §6):
 *  - EIG-A steady-state terminal normalisation — check lands EP.3 (red until then)
 *  - EIG-B share roll-forward settlement — check lands EP.2 (red until then)
 *  - EIG-C settlement registry coverage — table lands EP.1, enforcement EP.2
 *  - EIG-D forecast articulation + net-cash bridge — green on the current build
 *  - EIG-E pin sync — red by design until the EP.3 regen rewrites the e2e docstring
 *
 * FROZEN signatures per economy_phase.md §5 EP.1:
 *   checkForecastArticulation(threeStatement): InvariantReport
 *   checkNetCashBridge(threeStatement): BridgeReport
 *   checkPinSync(pinInput): PinSyncReport
 *   SETTLEMENT_REGISTRY: registry table
 *   checkSettlementRegistry(threeStatement): InvariantReport (EIG-C table + coverage)
 *
 * InvariantReport is the designated feed for RP7's Model Health card (§9); every
 * check returns deeply frozen reports. checkPinSync takes its evidence as an input
 * object (docstring text plus parsed claims plus live values) so this module stays
 * file-system free and keeps the frozen call shape in every runtime.
 *
 * PURE MODULE: zero DOM, zero fetch, zero Date.now, zero Math.random.
 * ZERO BARE NUMERIC LITERALS > 999 outside comments.
 *
 * @module src/engine/invariants
 */

import { EngineError } from '../data/errors.js';

/** Report entry status: the identity held. */
const PASS = 'pass';

/** Report entry status: the identity broke. */
const FAIL = 'fail';

/**
 * Absolute float slack for identity re-derivation. Mirrors the engine's own
 * 1e-6 balance guard so a legitimately balanced book can never false-fail.
 * @type {number}
 */
const IDENTITY_ABS_TOLERANCE = 1e-6;

/**
 * Relative float slack that lets tolerance scale with magnitude, so large
 * monetary sums keep tight-but-reachable bounds.
 * @type {number}
 */
const IDENTITY_REL_TOLERANCE = 1e-12;

/**
 * Settlement registry (EP.1 table, economy_phase.md §5). Every OCF add-back names
 * its settlement path: D&A settles through ICF capex (settled); SBC settles
 * through the EIG-B share roll-forward (pending until EP.2). EIG-C enforcement
 * (registry coverage of every OCF add-back) activates in EP.2.
 * @type {ReadonlyArray<object>}
 */
export const SETTLEMENT_REGISTRY = Object.freeze([
  Object.freeze({
    addBack: 'sbc',
    settlement: 'eig-b',
    status: 'settled',
  }),
  Object.freeze({
    addBack: 'd_and_a',
    settlement: 'icf-capex',
    status: 'settled',
  }),
]);

/**
 * Maps OCF construction line keys to registry add-back keys. Lines outside this
 * map that are neither the net-income base, the total, nor the working-capital
 * movement are undeclared add-backs and fail coverage by construction.
 * @type {Readonly<Record<string, string>>}
 */
const ADD_BACK_LINE_TO_REGISTRY_KEY = Object.freeze({
  depreciation_and_amortization: 'd_and_a',
  stock_based_compensation: 'sbc',
});

/**
 * Operating-activity lines that are not add-backs: the income base, the total
 * line itself, and the working-capital movement (which settles per period).
 * @type {ReadonlyArray<string>}
 */
const NON_ADD_BACK_OCF_LINES = Object.freeze(['net_income', 'total', 'change_in_working_capital']);

/** Current-asset component line keys in face-line order. */
const CURRENT_ASSET_LINES = Object.freeze([
  'cash_and_cash_equivalents',
  'short_term_investments',
  'accounts_receivable',
  'deferred_cost_of_revenues',
  'prepaid_expenses_and_other_current_assets',
  'income_tax_receivable',
]);

/** Non-current-asset component line keys in face-line order. */
const NON_CURRENT_ASSET_LINES = Object.freeze([
  'operating_lease_right_of_use_assets',
  'long_term_investments',
  'property_and_equipment_net',
  'intangible_assets_net',
  'goodwill',
  'restricted_cash',
  'deferred_tax_assets_net',
  'other_assets',
]);

/** Current-liability component line keys in face-line order. */
const CURRENT_LIABILITY_LINES = Object.freeze([
  'deferred_revenues',
  'accounts_payable',
  'accrued_expenses_and_other_current_liabilities',
  'income_tax_payable',
]);

/** Non-current-liability component line keys in face-line order. */
const NON_CURRENT_LIABILITY_LINES = Object.freeze([
  'long_term_operating_lease_liability',
  'deferred_tax_liabilities_net',
]);

/** Stockholders-equity component line keys in face-line order. */
const EQUITY_LINES = Object.freeze([
  'common_stock',
  'additional_paid_in_capital',
  'retained_earnings_accumulated_deficit',
  'treasury_stock',
]);

/** Corpus anchor labels for the hybrid H1 seam (mirror the engine's own anchors). */
const SEAM_PRIOR_FISCAL_YEAR = 'FY2025';
const SEAM_H1_CASHFLOW_PERIOD = '6M FY2026';
const SEAM_BOP_PERIOD = 'Q2 FY2026';

/**
 * Freezes an object graph recursively so no consumer can mutate a report.
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
 * Reads a required statement line value fail-closed (no silent fallback).
 *
 * @param {unknown} line Line object carrying a numeric `.value`.
 * @param {string} context Greppable line path for the typed error.
 * @returns {number}
 * @throws {EngineError} `missing_line` when absent or non-finite.
 */
function requireLineValue(line, context) {
  if (line === null || typeof line !== 'object' || !Number.isFinite(line.value)) {
    throw new EngineError(
      'missing_line',
      `Required statement line "${context}" is missing or non-finite in the three-statement output.`,
      context,
    );
  }
  return line.value;
}

/**
 * Reads a required half-year leg of a hybrid line fail-closed.
 *
 * @param {unknown} line Hybrid line object carrying `.h1` / `.h2` sub-lines.
 * @param {string} half Either `h1` or `h2`.
 * @param {string} context Greppable line path for the typed error.
 * @returns {number}
 * @throws {EngineError} `missing_line` when the leg is absent or non-finite.
 */
function requireHalfValue(line, half, context) {
  if (line === null || typeof line !== 'object') {
    throw new EngineError('missing_line', `Required hybrid line "${context}" is missing.`, context);
  }
  const leg = half === 'h1' ? line.h1 : line.h2;
  if (leg === null || typeof leg !== 'object' || !Number.isFinite(leg.value)) {
    throw new EngineError(
      'missing_line',
      `Required hybrid leg "${context}.${half}" is missing or non-finite.`,
      `${context}.${half}`,
    );
  }
  return leg.value;
}

/**
 * Reads a required finite plain number fail-closed.
 *
 * @param {unknown} value Candidate value.
 * @param {string} context Greppable path for the typed error.
 * @returns {number}
 * @throws {EngineError} `missing_input` when absent or non-finite.
 */
function requireFiniteNumber(value, context) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EngineError(
      'missing_input',
      `Required numeric field "${context}" is missing or non-finite.`,
      context,
    );
  }
  return value;
}

/**
 * Sums component line values in face-line order.
 *
 * @param {object} container Statement sub-block holding line objects.
 * @param {ReadonlyArray<string>} keys Line keys to sum, in face-line order.
 * @param {string} period Forecast period key for error context.
 * @returns {number}
 */
function sumComponentLines(container, keys, period) {
  if (container === null || typeof container !== 'object') {
    throw new EngineError(
      'missing_input',
      `Statement sub-block is missing while summing components for period "${period}".`,
      period,
    );
  }
  let total = 0;
  for (const key of keys) {
    total += requireLineValue(container[key], `${period}.${key}`);
  }
  return total;
}

/**
 * Float-safe identity comparison shared by every gate in this module.
 *
 * @param {number} stated Value as reported by the model.
 * @param {number} rebuilt Value re-derived from raw lines.
 * @returns {{ matches: boolean, difference: number }}
 */
function compareIdentity(stated, rebuilt) {
  const difference = stated - rebuilt;
  const scale = Math.max(Math.abs(stated), Math.abs(rebuilt));
  const allowance = Math.max(IDENTITY_ABS_TOLERANCE, IDENTITY_REL_TOLERANCE * scale);
  return { matches: Math.abs(difference) <= allowance, difference };
}

/**
 * Builds one frozen InvariantReport row.
 *
 * @param {string} id Stable greppable check id.
 * @param {string} description Human-readable identity statement.
 * @param {boolean} matches Whether the identity held.
 * @param {object} details Raw re-derived operands and the difference.
 * @returns {object}
 */
function invariantRow(id, description, matches, details) {
  return Object.freeze({
    id,
    description,
    status: matches ? PASS : FAIL,
    details: Object.freeze({ ...details }),
  });
}

/**
 * Resolves the cited beginning-of-period balance-sheet anchor block.
 *
 * @param {object} threeStatement ThreeStatementOutput from `threeStatement.project()`.
 * @returns {object}
 * @throws {EngineError} `missing_input` when the anchor block is absent.
 */
function requireBopBalanceSheet(threeStatement) {
  const bop =
    threeStatement.bopBalanceSheet ||
    (threeStatement.supporting && threeStatement.supporting.bopBalanceSheet);
  if (!bop || typeof bop !== 'object') {
    throw new EngineError(
      'missing_input',
      'invariants require a threeStatement payload carrying the cited bopBalanceSheet anchor block.',
      'bopBalanceSheet',
    );
  }
  return bop;
}

/**
 * Resolves the raw cited corpus row for one metric in one period.
 *
 * @param {Array<object>|null} rows Flat corpus rows (from options.historicalRows).
 * @param {string} metric Corpus metric key.
 * @param {string} period Corpus period label.
 * @returns {number}
 * @throws {EngineError} `missing_corpus_row` when the row is absent or non-finite.
 */
function requireCorpusValue(rows, metric, period) {
  if (!Array.isArray(rows)) {
    throw new EngineError(
      'missing_input',
      'Corpus-seam checks require options.historicalRows (flat corpus rows).',
      'historicalRows',
    );
  }
  const found = rows.find((r) => r && r.metric === metric && r.period === period);
  if (!found || !Number.isFinite(found.value)) {
    throw new EngineError(
      'missing_corpus_row',
      `Required corpus row for metric "${metric}" in period "${period}" is missing or non-finite.`,
      metric,
    );
  }
  return found.value;
}

/**
 * Checks forecast articulation per forecast period, re-derived from raw lines:
 * ending cash ≡ beginning + net change (hybrid periods roll the H2 leg from the
 * cited Q2 balance, where the H1 actual change is already embedded), net change ≡
 * OCF + ICF + CFF, BS cash on the balance sheet ≡ CF ending cash, component sums
 * re-derive group totals, assets ≡ liabilities + equity, and the equity rolls
 * (retained earnings by net income, APIC by SBC + options − settlement − buybacks)
 * close per period. With options.historicalRows, the hybrid H1 seam is tied to the
 * cited corpus rows (prior fiscal year-end cash + cited 6M net change ≡ cited Q2
 * cash; every hybrid H1 leg ≡ its cited 6M corpus row).
 *
 * FROZEN signature: checkForecastArticulation(threeStatement): InvariantReport
 * (options.historicalRows is additive for the corpus seam and changes no default).
 *
 * @param {object} threeStatement ThreeStatementOutput from `threeStatement.project()`.
 * @param {object} [options] Optional `{ historicalRows }` flat corpus rows for the seam.
 * @returns {Array<object>} Frozen InvariantReport rows for the RP7 Model Health feed.
 * @throws {EngineError} On structurally invalid input or non-finite lines (fail-closed).
 */
export function checkForecastArticulation(threeStatement, options) {
  if (!threeStatement || typeof threeStatement !== 'object') {
    throw new EngineError(
      'missing_input',
      'checkForecastArticulation() requires a valid ThreeStatementOutput object.',
      'threeStatement',
    );
  }
  const periods = threeStatement.periods;
  if (!Array.isArray(periods) || periods.length === 0) {
    throw new EngineError(
      'invalid_horizon',
      'checkForecastArticulation() requires a non-empty threeStatement.periods array.',
      'periods',
    );
  }
  const cfByPeriod =
    threeStatement.cashFlow && typeof threeStatement.cashFlow.byPeriod === 'object'
      ? threeStatement.cashFlow.byPeriod
      : null;
  const bsByPeriod =
    threeStatement.balanceSheet && typeof threeStatement.balanceSheet.byPeriod === 'object'
      ? threeStatement.balanceSheet.byPeriod
      : null;
  if (!cfByPeriod || !bsByPeriod) {
    throw new EngineError(
      'missing_input',
      'checkForecastArticulation() requires cashFlow.byPeriod and balanceSheet.byPeriod blocks.',
      'threeStatement',
    );
  }
  const bop = requireBopBalanceSheet(threeStatement);
  const bopCash = requireFiniteNumber(
    bop.cash_and_cash_equivalents,
    'bopBalanceSheet.cash_and_cash_equivalents',
  );
  const bopApic = requireFiniteNumber(bop.apic, 'bopBalanceSheet.apic');
  const bopRetained = requireFiniteNumber(
    bop.retained_earnings,
    'bopBalanceSheet.retained_earnings',
  );

  const wantsSeam =
    options !== null &&
    typeof options === 'object' &&
    Array.isArray(options.historicalRows);
  const historicalRows = wantsSeam ? options.historicalRows : null;

  const entries = [];
  let priorCash = bopCash;
  let priorApic = bopApic;
  let priorRetained = bopRetained;

  for (const period of periods) {
    const cf = cfByPeriod[period];
    const bs = bsByPeriod[period];
    if (!cf || typeof cf !== 'object') {
      throw new EngineError(
        'missing_period',
        `Cash-flow block for forecast period "${period}" is missing.`,
        period,
      );
    }
    if (!bs || typeof bs !== 'object') {
      throw new EngineError(
        'missing_period',
        `Balance-sheet block for forecast period "${period}" is missing.`,
        period,
      );
    }
    const isHybrid = cf.isHybrid === true;
    const operating = cf.operating_activities;
    const investing = cf.investing_activities;
    const financing = cf.financing_activities;
    if (!operating || !investing || !financing) {
      throw new EngineError(
        'missing_input',
        `Cash-flow activity blocks for "${period}" are incomplete.`,
        period,
      );
    }

    const beginningCash = requireLineValue(cf.beginning_cash, `beginning_cash.${period}`);
    const endingCash = requireLineValue(cf.ending_cash, `ending_cash.${period}`);
    const ocfLine = operating.total;
    const icfLine = investing.total;
    const cffLine = financing.total;
    const netChangeLine = cf.net_change_in_cash;

    // ── Cash roll: ending ≡ beginning + net change of the rolled frame ──────
    if (isHybrid) {
      const h2Change = requireHalfValue(netChangeLine, 'h2', `net_change_in_cash.${period}`);
      const rebuilt = beginningCash + h2Change;
      const check = compareIdentity(endingCash, rebuilt);
      entries.push(
        invariantRow(
          `EIG-D:cash-roll:${period}`,
          `Ending cash articulates from the cited Q2 balance plus the H2 net change in ${period}.`,
          check.matches,
          {
            period,
            frame: 'hybrid-h2',
            beginningCash,
            netChangeH2: h2Change,
            endingCashStated: endingCash,
            endingCashRebuilt: rebuilt,
            difference: check.difference,
          },
        ),
      );
      // Hybrid h2 three-flow: full-year line halves articulate per leg.
      const ocfH2 = requireHalfValue(ocfLine, 'h2', `operating_activities.total.${period}`);
      const icfH2 = requireHalfValue(icfLine, 'h2', `investing_activities.total.${period}`);
      const cffH2 = requireHalfValue(cffLine, 'h2', `financing_activities.total.${period}`);
      const rebuiltH2 = ocfH2 + icfH2 + cffH2;
      const checkH2 = compareIdentity(h2Change, rebuiltH2);
      entries.push(
        invariantRow(
          `EIG-D:flow-articulation:${period}:h2`,
          `H2 net change articulates as H2 OCF + ICF + CFF in ${period}.`,
          checkH2.matches,
          {
            period,
            frame: 'hybrid-h2',
            netChangeH2: h2Change,
            ocfH2,
            icfH2,
            cffH2,
            rebuiltH2,
            difference: checkH2.difference,
          },
        ),
      );
      // Hybrid h1 three-flow: cited actuals articulate among themselves.
      const ocfH1 = requireHalfValue(ocfLine, 'h1', `operating_activities.total.${period}`);
      const icfH1 = requireHalfValue(icfLine, 'h1', `investing_activities.total.${period}`);
      const cffH1 = requireHalfValue(cffLine, 'h1', `financing_activities.total.${period}`);
      const ncH1 = requireHalfValue(netChangeLine, 'h1', `net_change_in_cash.${period}`);
      const rebuiltH1 = ocfH1 + icfH1 + cffH1;
      const checkH1 = compareIdentity(ncH1, rebuiltH1);
      entries.push(
        invariantRow(
          `EIG-D:flow-articulation:${period}:h1`,
          `Cited H1 net change articulates as cited H1 OCF + ICF + CFF in ${period}.`,
          checkH1.matches,
          {
            period,
            frame: 'hybrid-h1-cited',
            netChangeH1: ncH1,
            ocfH1,
            icfH1,
            cffH1,
            rebuiltH1,
            difference: checkH1.difference,
          },
        ),
      );
      // Hybrid h2 OCF construction: H2 OCF ≡ H2 NI + H2 D&A + H2 SBC + H2 ΔWC leg.
      const niH2 = requireHalfValue(
        operating.net_income,
        'h2',
        `operating_activities.net_income.${period}`,
      );
      const daH2 = requireLineValue(
        operating.depreciation_and_amortization,
        `operating_activities.depreciation_and_amortization.${period}`,
      );
      const sbcH2 = requireLineValue(
        operating.stock_based_compensation,
        `operating_activities.stock_based_compensation.${period}`,
      );
      const wcH2 = requireLineValue(
        operating.change_in_working_capital,
        `operating_activities.change_in_working_capital.${period}`,
      );
      const rebuiltOcfH2 = niH2 + daH2 + sbcH2 + wcH2;
      const checkOcfH2 = compareIdentity(ocfH2, rebuiltOcfH2);
      entries.push(
        invariantRow(
          `EIG-D:ocf-construction:${period}:h2`,
          `H2 OCF articulates as H2 NI + D&A + SBC + working-capital leg in ${period}.`,
          checkOcfH2.matches,
          {
            period,
            frame: 'hybrid-h2',
            ocfH2,
            netIncomeH2: niH2,
            depreciationAndAmortization: daH2,
            stockBasedCompensation: sbcH2,
            workingCapitalLeg: wcH2,
            rebuiltOcfH2,
            difference: checkOcfH2.difference,
          },
        ),
      );
    } else {
      const netChange = requireLineValue(netChangeLine, `net_change_in_cash.${period}`);
      const rebuilt = priorCash + netChange;
      const check = compareIdentity(endingCash, rebuilt);
      entries.push(
        invariantRow(
          `EIG-D:cash-roll:${period}`,
          `Ending cash articulates from prior ending cash plus net change in ${period}.`,
          check.matches,
          {
            period,
            frame: 'estimate',
            priorEndingCash: priorCash,
            netChange,
            endingCashStated: endingCash,
            endingCashRebuilt: rebuilt,
            difference: check.difference,
          },
        ),
      );
      const ocf = requireLineValue(ocfLine, `operating_activities.total.${period}`);
      const icf = requireLineValue(icfLine, `investing_activities.total.${period}`);
      const cff = requireLineValue(cffLine, `financing_activities.total.${period}`);
      const rebuiltFlow = ocf + icf + cff;
      const checkFlow = compareIdentity(netChange, rebuiltFlow);
      entries.push(
        invariantRow(
          `EIG-D:flow-articulation:${period}:full`,
          `Net change articulates as OCF + ICF + CFF in ${period}.`,
          checkFlow.matches,
          {
            period,
            frame: 'estimate',
            netChange,
            ocf,
            icf,
            cff,
            rebuiltFlow,
            difference: checkFlow.difference,
          },
        ),
      );
      const ni = requireLineValue(
        operating.net_income,
        `operating_activities.net_income.${period}`,
      );
      const da = requireLineValue(
        operating.depreciation_and_amortization,
        `operating_activities.depreciation_and_amortization.${period}`,
      );
      const sbc = requireLineValue(
        operating.stock_based_compensation,
        `operating_activities.stock_based_compensation.${period}`,
      );
      const wc = requireLineValue(
        operating.change_in_working_capital,
        `operating_activities.change_in_working_capital.${period}`,
      );
      const rebuiltOcf = ni + da + sbc + wc;
      const checkOcf = compareIdentity(ocf, rebuiltOcf);
      entries.push(
        invariantRow(
          `EIG-D:ocf-construction:${period}:full`,
          `OCF articulates as NI + D&A + SBC + working-capital leg in ${period}.`,
          checkOcf.matches,
          {
            period,
            frame: 'estimate',
            ocf,
            netIncome: ni,
            depreciationAndAmortization: da,
            stockBasedCompensation: sbc,
            workingCapitalLeg: wc,
            rebuiltOcf,
            difference: checkOcf.difference,
          },
        ),
      );
    }

    // ── Beginning continuity: the roll carries the prior ending forward ─────
    const continuity = compareIdentity(beginningCash, priorCash);
    entries.push(
      invariantRow(
        `EIG-D:beginning-continuity:${period}`,
        `Beginning cash carries the prior ending balance into ${period}.`,
        continuity.matches,
        { period, beginningCash, priorEndingCash: priorCash, difference: continuity.difference },
      ),
    );

    // ── BS cash ties to CF ending cash ───────────────────────────────────────
    const bsCash = requireLineValue(
      bs.current_assets.cash_and_cash_equivalents,
      `current_assets.cash_and_cash_equivalents.${period}`,
    );
    const tieCash = compareIdentity(bsCash, endingCash);
    entries.push(
      invariantRow(
        `EIG-D:bs-cash-tie:${period}`,
        `Balance-sheet cash ties to cash-flow ending cash in ${period}.`,
        tieCash.matches,
        {
          period,
          balanceSheetCash: bsCash,
          cashFlowEndingCash: endingCash,
          difference: tieCash.difference,
        },
      ),
    );

    // ── Bottom-up component sums re-derive group totals ─────────────────────
    const currentAssetsSum = sumComponentLines(bs.current_assets, CURRENT_ASSET_LINES, period);
    const nonCurrentAssetsSum = sumComponentLines(
      bs.non_current_assets,
      NON_CURRENT_ASSET_LINES,
      period,
    );
    const assetsSum = currentAssetsSum + nonCurrentAssetsSum;
    const currentAssetsTotal = requireLineValue(
      bs.current_assets.total,
      `current_assets.total.${period}`,
    );
    const nonCurrentAssetsTotal = requireLineValue(
      bs.non_current_assets.total,
      `non_current_assets.total.${period}`,
    );
    const totalAssets = requireLineValue(bs.total_assets, `total_assets.${period}`);
    const assetsCheck = compareIdentity(totalAssets, assetsSum);
    entries.push(
      invariantRow(
        `EIG-D:assets-bottom-up:${period}`,
        `Asset component lines re-derive the reported total assets in ${period}.`,
        assetsCheck.matches,
        {
          period,
          currentAssetsSum,
          nonCurrentAssetsSum,
          assetsRebuilt: assetsSum,
          totalAssetsStated: totalAssets,
          difference: assetsCheck.difference,
        },
      ),
    );

    const currentLiabSum = sumComponentLines(
      bs.current_liabilities,
      CURRENT_LIABILITY_LINES,
      period,
    );
    const nonCurrentLiabSum = sumComponentLines(
      bs.non_current_liabilities,
      NON_CURRENT_LIABILITY_LINES,
      period,
    );
    const liabSum = currentLiabSum + nonCurrentLiabSum;
    const totalLiabilities = requireLineValue(
      bs.total_liabilities,
      `total_liabilities.${period}`,
    );
    const equity = bs.stockholders_equity;
    if (!equity || typeof equity !== 'object') {
      throw new EngineError(
        'missing_input',
        `Stockholders-equity block for "${period}" is missing.`,
        period,
      );
    }
    const equitySum = sumComponentLines(equity, EQUITY_LINES, period);
    const equityTotal = requireLineValue(equity.total, `stockholders_equity.total.${period}`);
    const liabCheck = compareIdentity(totalLiabilities, liabSum);
    entries.push(
      invariantRow(
        `EIG-D:liabilities-bottom-up:${period}`,
        `Liability component lines re-derive the reported total liabilities in ${period}.`,
        liabCheck.matches,
        {
          period,
          currentLiabilitiesSum: currentLiabSum,
          nonCurrentLiabilitiesSum: nonCurrentLiabSum,
          liabilitiesRebuilt: liabSum,
          totalLiabilitiesStated: totalLiabilities,
          difference: liabCheck.difference,
        },
      ),
    );
    const equityCheck = compareIdentity(equityTotal, equitySum);
    entries.push(
      invariantRow(
        `EIG-D:equity-bottom-up:${period}`,
        `Equity component lines re-derive the reported equity total in ${period}.`,
        equityCheck.matches,
        {
          period,
          equityRebuilt: equitySum,
          equityTotalStated: equityTotal,
          difference: equityCheck.difference,
        },
      ),
    );

    // ── Group subtotal lines agree with component sums ───────────────────────
    const subtotalLines = [
      ['current_assets', currentAssetsTotal, currentAssetsSum],
      ['non_current_assets', nonCurrentAssetsTotal, nonCurrentAssetsSum],
      [
        'current_liabilities',
        requireLineValue(bs.current_liabilities.total, `current_liabilities.total.${period}`),
        currentLiabSum,
      ],
      [
        'non_current_liabilities',
        requireLineValue(
          bs.non_current_liabilities.total,
          `non_current_liabilities.total.${period}`,
        ),
        nonCurrentLiabSum,
      ],
    ];
    let subtotalsHold = true;
    const subtotalDetails = { period };
    for (const [label, stated, rebuilt] of subtotalLines) {
      const checkSub = compareIdentity(stated, rebuilt);
      subtotalDetails[label] = {
        stated,
        rebuilt,
        difference: checkSub.difference,
        matches: checkSub.matches,
      };
      if (!checkSub.matches) {
        subtotalsHold = false;
      }
    }
    entries.push(
      invariantRow(
        `EIG-D:subtotal-tie:${period}`,
        `Group subtotal lines agree with component sums in ${period}.`,
        subtotalsHold,
        subtotalDetails,
      ),
    );

    // ── Assets ≡ Liabilities + Equity from bottom-up sums ───────────────────
    const liabPlusEquity = liabSum + equitySum;
    const balanceCheck = compareIdentity(assetsSum, liabPlusEquity);
    entries.push(
      invariantRow(
        `EIG-D:balance-identity:${period}`,
        `Assets equal liabilities plus equity, re-derived from raw component lines in ${period}.`,
        balanceCheck.matches,
        {
          period,
          assetsRebuilt: assetsSum,
          liabilitiesRebuilt: liabSum,
          equityRebuilt: equitySum,
          liabilitiesPlusEquity: liabPlusEquity,
          difference: balanceCheck.difference,
        },
      ),
    );

    // ── Equity rolls close per period ────────────────────────────────────────
    const niBase = isHybrid
      ? requireHalfValue(
          operating.net_income,
          'h2',
          `operating_activities.net_income.${period}`,
        )
      : requireLineValue(
          operating.net_income,
          `operating_activities.net_income.${period}`,
        );
    const retainedLine = requireLineValue(
      equity.retained_earnings_accumulated_deficit,
      `stockholders_equity.retained_earnings_accumulated_deficit.${period}`,
    );
    const retainedRebuilt = priorRetained + niBase;
    const retainedCheck = compareIdentity(retainedLine, retainedRebuilt);
    entries.push(
      invariantRow(
        `EIG-D:retained-earnings-roll:${period}`,
        `Retained earnings roll by net income in ${period}.`,
        retainedCheck.matches,
        {
          period,
          frame: isHybrid ? 'hybrid-h2' : 'estimate',
          priorRetainedEarnings: priorRetained,
          netIncomeBase: niBase,
          retainedEarningsStated: retainedLine,
          retainedEarningsRebuilt: retainedRebuilt,
          difference: retainedCheck.difference,
        },
      ),
    );

    const sbcBase = isHybrid
      ? requireLineValue(
          operating.stock_based_compensation,
          `operating_activities.stock_based_compensation.${period}`,
        )
      : requireLineValue(
          operating.stock_based_compensation,
          `operating_activities.stock_based_compensation.${period}`,
        );
    const optionProceeds = requireLineValue(
      financing.proceeds_from_stock_options_exercise,
      `financing_activities.proceeds_from_stock_options_exercise.${period}`,
    );
    const taxSettlement = requireLineValue(
      financing.taxes_paid_net_share_settlement,
      `financing_activities.taxes_paid_net_share_settlement.${period}`,
    );
    const repurchases = requireLineValue(
      financing.repurchase_of_common_stock,
      `financing_activities.repurchase_of_common_stock.${period}`,
    );
    const apicLine = requireLineValue(
      equity.additional_paid_in_capital,
      `stockholders_equity.additional_paid_in_capital.${period}`,
    );
    const apicRebuilt = priorApic + sbcBase + optionProceeds + taxSettlement + repurchases;
    const apicCheck = compareIdentity(apicLine, apicRebuilt);
    entries.push(
      invariantRow(
        `EIG-D:apic-roll:${period}`,
        `APIC rolls by SBC plus option proceeds less settlements and buybacks in ${period}.`,
        apicCheck.matches,
        {
          period,
          frame: isHybrid ? 'hybrid-h2' : 'estimate',
          priorApic,
          stockBasedCompensation: sbcBase,
          optionProceeds,
          taxSettlement,
          repurchases,
          apicStated: apicLine,
          apicRebuilt,
          difference: apicCheck.difference,
        },
      ),
    );

    priorCash = endingCash;
    priorApic = apicLine;
    priorRetained = retainedLine;
  }

  // ── Hybrid H1 seam against cited corpus rows (requires corpus rows) ───────
  if (wantsSeam) {
    const priorCash = requireCorpusValue(
      historicalRows,
      'cash_and_cash_equivalents',
      SEAM_PRIOR_FISCAL_YEAR,
    );
    const h1Change = requireCorpusValue(
      historicalRows,
      'net_change_in_cash',
      SEAM_H1_CASHFLOW_PERIOD,
    );
    const q2Cash = requireCorpusValue(
      historicalRows,
      'cash_and_cash_equivalents',
      SEAM_BOP_PERIOD,
    );
    const seamRebuilt = priorCash + h1Change;
    const seamCheck = compareIdentity(q2Cash, seamRebuilt);
    entries.push(
      invariantRow(
        'EIG-D:h1-seam:cash-base',
        'Prior fiscal year-end cash plus the cited 6M net change re-derives the cited Q2 cash anchor.',
        seamCheck.matches,
        {
          priorFiscalYearCash: priorCash,
          h1NetChangeCited: h1Change,
          q2CashStated: q2Cash,
          q2CashRebuilt: seamRebuilt,
          difference: seamCheck.difference,
        },
      ),
    );
    const bopTie = compareIdentity(bopCash, q2Cash);
    entries.push(
      invariantRow(
        'EIG-D:h1-seam:bop-cash-tie',
        'The forecast BOP cash anchor ties to the cited Q2 cash corpus row.',
        bopTie.matches,
        { bopCash, corpusQ2Cash: q2Cash, difference: bopTie.difference },
      ),
    );
    const firstPeriod = periods[0];
    const firstCf = cfByPeriod[firstPeriod];
    const h1TieSpecs = [
      ['ocf', firstCf.operating_activities.total, 'cash_from_operating_activities'],
      ['icf', firstCf.investing_activities.total, 'cash_from_investing_activities'],
      ['cff', firstCf.financing_activities.total, 'cash_from_financing_activities'],
      ['net-change', firstCf.net_change_in_cash, 'net_change_in_cash'],
    ];
    for (const [label, line, metric] of h1TieSpecs) {
      const h1Value = requireHalfValue(line, 'h1', `${label}.${firstPeriod}`);
      const corpusValue = requireCorpusValue(historicalRows, metric, SEAM_H1_CASHFLOW_PERIOD);
      const tie = compareIdentity(h1Value, corpusValue);
      entries.push(
        invariantRow(
          `EIG-D:h1-seam:${label}-tie`,
          `Hybrid H1 ${label} ties to its cited 6M corpus row.`,
          tie.matches,
          {
            period: firstPeriod,
            hybridH1Value: h1Value,
            corpusRowValue: corpusValue,
            difference: tie.difference,
          },
        ),
      );
    }
  }

  return deepFreeze(entries);
}

/**
 * Re-derives `dcf.netCashToday` from BOP_Q2_FY2026 raw cited lines: cash plus
 * short-term and long-term investments minus funded debt (the debt schedule's
 * proven-free result resolves to zero; a schedule that ever reports funded debt
 * without exposing a finite balance fails closed). The identity netCash + debt ≡
 * invested cash closes inside the cited BOP block itself.
 *
 * FROZEN signature: checkNetCashBridge(threeStatement): BridgeReport.
 *
 * @param {object} threeStatement ThreeStatementOutput from `threeStatement.project()`.
 * @returns {object} Frozen BridgeReport with re-derived components for the test
 *   harness to compare against the DCF net-cash claim.
 * @throws {EngineError} On structurally invalid input or non-finite raw lines.
 */
export function checkNetCashBridge(threeStatement) {
  if (!threeStatement || typeof threeStatement !== 'object') {
    throw new EngineError(
      'missing_input',
      'checkNetCashBridge() requires a valid ThreeStatementOutput object.',
      'threeStatement',
    );
  }
  const bop = requireBopBalanceSheet(threeStatement);
  const cashToday = requireFiniteNumber(
    bop.cash_and_cash_equivalents,
    'bopBalanceSheet.cash_and_cash_equivalents',
  );
  const shortTermInvestments = requireFiniteNumber(
    bop.short_term_investments,
    'bopBalanceSheet.short_term_investments',
  );
  const longTermInvestments = requireFiniteNumber(
    bop.long_term_investments,
    'bopBalanceSheet.long_term_investments',
  );
  const investedCash = requireFiniteNumber(
    bop.invested_cash,
    'bopBalanceSheet.invested_cash',
  );

  const supporting =
    threeStatement.supporting && typeof threeStatement.supporting === 'object'
      ? threeStatement.supporting
      : null;
  const debtSchedule = supporting && supporting.debt ? supporting.debt : null;
  if (!debtSchedule || typeof debtSchedule !== 'object') {
    throw new EngineError(
      'missing_input',
      'checkNetCashBridge() requires the cited debt schedule at supporting.debt.',
      'supporting.debt',
    );
  }
  let debtToday = 0;
  if (debtSchedule.hasDebt === true) {
    if (!Number.isFinite(debtSchedule.totalDebt)) {
      throw new EngineError(
        'missing_input',
        'The debt schedule reports funded debt but exposes no finite totalDebt balance.',
        'supporting.debt.totalDebt',
      );
    }
    debtToday = debtSchedule.totalDebt;
  }

  const netCashToday = cashToday + shortTermInvestments + longTermInvestments - debtToday;
  const identity = compareIdentity(netCashToday + debtToday, investedCash);
  return deepFreeze({
    id: 'EIG-BRIDGE:net-cash',
    description:
      'Net cash today re-derived from BOP cited raw lines (cash + STI + LTI − debt).',
    status: identity.matches ? PASS : FAIL,
    details: Object.freeze({
      basis: 'BOP cited raw balance lines',
      investedCashStated: investedCash,
      investedCashRebuilt: netCashToday + debtToday,
      difference: identity.difference,
    }),
    rederived: Object.freeze({
      cashToday,
      shortTermInvestments,
      longTermInvestments,
      debtToday,
      netCashToday,
    }),
  });
}

/**
 * Checks OCF add-back settlement coverage against the registry table: every
 * add-back present in OCF construction must name a registry settlement path.
 * Unmapped operating-activity keys fail coverage (the future-add-back tripwire).
 * Declared-but-pending settlements (SBC → EIG-B) are reported as pinned
 * non-green state until the roll-forward lands in EP.2.
 *
 * @param {object} threeStatement ThreeStatementOutput from `threeStatement.project()`.
 * @returns {Array<object>} Frozen InvariantReport rows for the RP7 feed.
 * @throws {EngineError} On structurally invalid input.
 */
export function checkSettlementRegistry(threeStatement) {
  if (!threeStatement || typeof threeStatement !== 'object') {
    throw new EngineError(
      'missing_input',
      'checkSettlementRegistry() requires a valid ThreeStatementOutput object.',
      'threeStatement',
    );
  }
  const periods = threeStatement.periods;
  if (!Array.isArray(periods) || periods.length === 0) {
    throw new EngineError(
      'invalid_horizon',
      'checkSettlementRegistry() requires a non-empty threeStatement.periods array.',
      'periods',
    );
  }
  const cfByPeriod =
    threeStatement.cashFlow && typeof threeStatement.cashFlow.byPeriod === 'object'
      ? threeStatement.cashFlow.byPeriod
      : null;
  if (!cfByPeriod) {
    throw new EngineError(
      'missing_input',
      'checkSettlementRegistry() requires the cashFlow.byPeriod block.',
      'threeStatement.cashFlow',
    );
  }

  const entries = [];
  for (const row of SETTLEMENT_REGISTRY) {
    const isPending = row.status !== 'settled';
    entries.push(
      invariantRow(
        `EIG-C:registry-declaration:${row.addBack}`,
        `Registry declares the ${row.addBack} add-back settlement path ${row.settlement} (${row.status}).`,
        !isPending,
        { addBack: row.addBack, settlement: row.settlement, status: row.status },
      ),
    );
  }

  for (const period of periods) {
    const cf = cfByPeriod[period];
    if (!cf || typeof cf !== 'object' || !cf.operating_activities) {
      throw new EngineError(
        'missing_period',
        `Operating-activities block for forecast period "${period}" is missing.`,
        period,
      );
    }
    for (const key of Object.keys(cf.operating_activities)) {
      if (NON_ADD_BACK_OCF_LINES.includes(key)) {
        continue;
      }
      const registryKey = ADD_BACK_LINE_TO_REGISTRY_KEY[key];
      if (registryKey === undefined) {
        entries.push(
          invariantRow(
            `EIG-C:undeclared-add-back:${period}:${key}`,
            `Operating-activity line ${key} in ${period} names no registry settlement path.`,
            false,
            { period, lineKey: key },
          ),
          );
        continue;
      }
      const declared = SETTLEMENT_REGISTRY.some((row) => row.addBack === registryKey);
      entries.push(
        invariantRow(
          `EIG-C:add-back-declared:${period}:${registryKey}`,
          `Add-back ${registryKey} in ${period} is declared in the settlement registry.`,
          declared,
          { period, lineKey: key, registryKey },
        ),
      );
    }
  }

  return deepFreeze(entries);
}

/**
 * Compares parsed e2e docstring numeric claims against live pin values and
 * reports the tie-out per claim. Claims are supplied by the caller (parsed in
 * tests/_invariants.js, where policy lives); this module applies the mechanical
 * comparison only. EP.3 adds stamp verification per §7.
 *
 * FROZEN shape: checkPinSync(pinInput): PinSyncReport.
 *
 * @param {object} pinInput Evidence bundle `{ docstring, claims, live }` where
 *   `docstring` is the e2e header text, `claims` is a non-empty array of
 *   `{ key, description, pattern, kind, liveKey?, liveNumberKey?, liveLabelKey?, tolerance }`,
 *   and `live` maps pin keys to live engine values.
 * @returns {Array<object>} Frozen PinSyncReport rows plus an overall summary row.
 * @throws {EngineError} On malformed evidence or unknown claim kinds (fail-closed).
 */
export function checkPinSync(pinInput) {
  if (!pinInput || typeof pinInput !== 'object') {
    throw new EngineError(
      'missing_input',
      'checkPinSync() requires an evidence bundle { docstring, claims, live }.',
      'pinInput',
    );
  }
  const { docstring, claims, live } = pinInput;
  if (typeof docstring !== 'string' || docstring.length === 0) {
    throw new EngineError(
      'missing_input',
      'checkPinSync() requires the e2e docstring text.',
      'docstring',
    );
  }
  if (!Array.isArray(claims) || claims.length === 0) {
    throw new EngineError(
      'missing_input',
      'checkPinSync() requires a non-empty claims array.',
      'claims',
    );
  }
  if (!live || typeof live !== 'object') {
    throw new EngineError(
      'missing_input',
      'checkPinSync() requires the live pin map.',
      'live',
    );
  }

  const entries = [];
  for (const claim of claims) {
    if (!claim || typeof claim.key !== 'string' || !(claim.pattern instanceof RegExp)) {
      throw new EngineError(
        'invalid_claim',
        'Every pin-sync claim needs a string key and a RegExp pattern.',
        'claims',
      );
    }
    if (
      typeof claim.kind !== 'string' ||
      (claim.kind !== 'percent' &&
        claim.kind !== 'plain' &&
        claim.kind !== 'moneyThousands' &&
        claim.kind !== 'perShare' &&
        claim.kind !== 'upsideAndLabel')
    ) {
      throw new EngineError(
        'invalid_claim_kind',
        `Pin-sync claim "${claim.key}" names an unknown kind "${claim.kind}".`,
        claim.key,
      );
    }
    if (!Number.isFinite(claim.tolerance) || claim.tolerance < 0) {
      throw new EngineError(
        'invalid_claim',
        `Pin-sync claim "${claim.key}" needs a finite non-negative tolerance.`,
        claim.key,
      );
    }
    const match = claim.pattern.exec(docstring);
    if (!match) {
      entries.push(
        invariantRow(
          `EIG-E:claim:${claim.key}`,
          `Docstring claim ${claim.key} is absent from the e2e header.`,
          false,
          { key: claim.key, reason: 'claim-pattern-absent' },
        ),
      );
      continue;
    }
    if (claim.kind === 'upsideAndLabel') {
      const parsedNumber = Number(String(match[1]).replace(/,/g, ''));
      const parsedLabel = String(match[2]);
      const liveNumber = live[claim.liveNumberKey];
      const liveLabel = live[claim.liveLabelKey];
      if (!Number.isFinite(parsedNumber) || !Number.isFinite(liveNumber)) {
        entries.push(
          invariantRow(
            `EIG-E:claim:${claim.key}`,
            `Docstring upside claim ${claim.key} is non-numeric or has no live pin.`,
            false,
            {
              key: claim.key,
              docstringValue: match[1],
              liveValue: liveNumber,
              reason: 'non-finite-claim',
            },
          ),
        );
        continue;
      }
      const numberMatches = Math.abs(parsedNumber - liveNumber * 100) <= claim.tolerance;
      const labelMatches =
        typeof liveLabel === 'string' &&
        parsedLabel.toLowerCase() === liveLabel.toLowerCase();
      const matches = numberMatches && labelMatches;
      entries.push(
        invariantRow(
          `EIG-E:claim:${claim.key}`,
          `Docstring upside claim ${claim.key} ties to the live upside and label.`,
          matches,
          {
            key: claim.key,
            docstringNumber: parsedNumber,
            docstringLabel: parsedLabel,
            liveNumberPct: liveNumber * 100,
            liveLabel,
            numberMatches,
            labelMatches,
            difference: parsedNumber - liveNumber * 100,
          },
        ),
      );
      continue;
    }
    const parsed = Number(String(match[1]).replace(/,/g, ''));
    const liveValue = live[claim.liveKey];
    if (!Number.isFinite(parsed) || !Number.isFinite(liveValue)) {
      entries.push(
        invariantRow(
          `EIG-E:claim:${claim.key}`,
          `Docstring claim ${claim.key} is non-numeric or has no live pin.`,
          false,
          { key: claim.key, docstringValue: match[1], liveValue, reason: 'non-finite-claim' },
        ),
      );
      continue;
    }
    const scaledLive = claim.kind === 'percent' ? liveValue * 100 : liveValue;
    const matches = Math.abs(parsed - scaledLive) <= claim.tolerance;
    entries.push(
      invariantRow(
        `EIG-E:claim:${claim.key}`,
        `Docstring claim ${claim.key} ties to the live pin.`,
        matches,
        {
          key: claim.key,
          docstringValue: parsed,
          liveValue: scaledLive,
          difference: parsed - scaledLive,
          tolerance: claim.tolerance,
        },
      ),
    );
  }

  const claimRows = entries.filter((row) => row.id !== 'EIG-E:pin-sync');
  const failed = claimRows.filter((row) => row.status !== PASS);
  entries.push(
    invariantRow(
      'EIG-E:pin-sync',
      'Every numeric claim in the e2e docstring ties to a live pin.',
      failed.length === 0 && claimRows.length > 0,
      {
        claimsTotal: claimRows.length,
        claimsPassed: claimRows.length - failed.length,
        claimsFailed: failed.length,
        failedKeys: failed.map((row) => row.details.key),
      },
    ),
  );

  return deepFreeze(entries);
}

export default Object.freeze({
  SETTLEMENT_REGISTRY,
  checkForecastArticulation,
  checkNetCashBridge,
  checkSettlementRegistry,
  checkPinSync,
});
