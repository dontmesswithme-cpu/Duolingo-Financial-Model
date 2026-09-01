/**
 * WACC Build Engine (P4.1).
 *
 * Implements the spec §3.2 frozen interface
 * `wacc.build(input: WaccInput): WaccBuild`.
 *
 * The build is CAPM top to bottom:
 *   Re = rf + beta x ERP
 *   WACC = (E/V) x Re + (D/V) x Rd x (1 - t)
 *
 * Two properties the contract insists on and that this module is written to
 * protect:
 *
 *  1. **Every market input is a driver.** Nothing market-shaped is typed into
 *     this file. `risk_free_rate`, `beta`, `equity_risk_premium`,
 *     `market_share_price`, and `shares_outstanding` are read through
 *     `requireDriverValue`, and each must carry `marking: "MKT"`, an `asOf`
 *     date, and a `source.provider` or the build refuses the whole set with a
 *     `ConfigError` naming every offender. There is no default value and no
 *     `?? 0` anywhere on this path.
 *
 *  2. **The debt-free collapse is a theorem, not a branch.** Duolingo carries
 *     zero funded debt (P2.3), so today `D = 0` and WACC reduces to the cost of
 *     equity. The general weighted formula is evaluated unconditionally with
 *     real weights and a real after-tax cost of debt; it simply happens to
 *     reduce. A levered debt schedule does not take a different code path — it
 *     supplies a non-zero `totalDebt`, and the build then *requires* a
 *     `cost_of_debt` driver rather than inventing one.
 *
 * Purity: no DOM, no fetch, no `Date.now`, no `Math.random`. As-of dates arrive
 * on the drivers, never from a wall clock, so two runs are byte-identical.
 *
 * @module src/engine/wacc
 */

import { EngineError, ConfigError } from '../data/errors.js';
import { MARKING_VALUES } from '../data/constants.js';

/** Market-sourced marking. */
const MKT = 'MKT';

/** Derived / judgment marking. */
const EST = 'EST';

/** As-of date shape required on every MKT leg. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Market drivers that must carry MKT discipline (marking + asOf + provider).
 * `terminal_growth_rate` is deliberately absent: it is an EST judgment with no
 * market observation behind it, so demanding an as-of date for it would be a
 * fiction.
 * @type {ReadonlyArray<string>}
 */
const MARKET_DRIVER_NAMES = Object.freeze([
  'risk_free_rate',
  'beta',
  'equity_risk_premium',
  'market_share_price',
  'shares_outstanding',
]);

/** Normalized tax rate driver (P3.1 tax group). */
const TAX_RATE_DRIVER = 'effective_tax_rate';

/** Required only when a levered debt schedule supplies a non-zero balance. */
const COST_OF_DEBT_DRIVER = 'cost_of_debt';

/**
 * Reads a driver, failing closed.
 *
 * The P2.1 lesson is binding here: a buried fallback literal is what turned a
 * missing denominator into a silently wrong schedule. A missing or non-finite
 * driver is a hard stop that names the driver.
 *
 * @param {object} assumptions AssumptionSet (base or scenario-applied).
 * @param {string} name Driver name.
 * @returns {object} The driver record.
 * @throws {EngineError} `missing_driver` when absent or non-finite.
 */
function requireDriverValue(assumptions, name) {
  const driver =
    assumptions && typeof assumptions.get === 'function' ? assumptions.get(name) : null;

  if (!driver || typeof driver !== 'object' || !Number.isFinite(driver.value)) {
    throw new EngineError(
      'missing_driver',
      `Required driver "${name}" is missing or non-finite in the assumption set.`,
      name,
    );
  }

  return driver;
}

/**
 * Enforces the MKT labeling regime before any arithmetic runs.
 *
 * Collects every offender rather than failing on the first, so one run reports
 * the full state of the market inputs.
 *
 * @param {object} assumptions AssumptionSet.
 * @returns {void}
 * @throws {ConfigError} When any market driver is unmarked, undated, or unsourced.
 */
function assertMarketDriverDiscipline(assumptions) {
  const offenders = [];

  for (const name of MARKET_DRIVER_NAMES) {
    const driver =
      assumptions && typeof assumptions.get === 'function' ? assumptions.get(name) : null;

    if (!driver) {
      offenders.push(`${name}: driver is absent from the assumption set`);
      continue;
    }
    if (driver.marking !== MKT) {
      offenders.push(`${name}: marking must be "${MKT}" (received ${JSON.stringify(driver.marking ?? null)})`);
    }
    if (typeof driver.asOf !== 'string' || !ISO_DATE_PATTERN.test(driver.asOf)) {
      offenders.push(`${name}: asOf must be a YYYY-MM-DD date (received ${JSON.stringify(driver.asOf ?? null)})`);
    }
    if (
      !driver.source ||
      typeof driver.source !== 'object' ||
      typeof driver.source.provider !== 'string' ||
      driver.source.provider.trim() === ''
    ) {
      offenders.push(`${name}: source.provider (non-empty string) is required`);
    }
  }

  if (offenders.length > 0) {
    throw new ConfigError(
      `wacc.build() rejected the assumption set with ${offenders.length} MKT market-input violation(s):\n${offenders
        .map((entry) => `  - ${entry}`)
        .join('\n')}`,
      'assumptions.market',
    );
  }
}

/**
 * Provenance record for a driver, so every leg's `derivedFrom` chain names the
 * source it actually came from.
 *
 * @param {object} driver
 * @returns {object} Frozen provenance record.
 */
function driverProvenance(driver) {
  return Object.freeze({
    kind: 'assumptionDriver',
    name: driver.name ?? null,
    label: driver.label ?? null,
    group: driver.group ?? null,
    marking: driver.marking ?? null,
    asOf: driver.asOf ?? null,
    provider: driver.source?.provider ?? null,
    url: driver.source?.url ?? null,
    notes: driver.notes ?? null,
  });
}

/**
 * Builds one immutable output leg.
 *
 * @param {object} spec
 * @param {number|null} spec.value
 * @param {string} spec.marking `MKT` or `EST`.
 * @param {string|null} [spec.asOf]
 * @param {object|null} [spec.source]
 * @param {ReadonlyArray<object>} [spec.derivedFrom]
 * @param {boolean} [spec.isEstimate]
 * @param {string|null} [spec.notes]
 * @returns {object} Frozen leg.
 * @throws {EngineError} `invalid_marking` on an unknown marking.
 */
function makeLeg({ value, marking, asOf = null, source = null, derivedFrom = [], isEstimate = false, notes = null }) {
  if (!MARKING_VALUES.includes(marking)) {
    throw new EngineError(
      'invalid_marking',
      `Leg marking must be one of: ${MARKING_VALUES.join(', ')} (received ${JSON.stringify(marking)}).`,
    );
  }

  return Object.freeze({
    value,
    marking,
    asOf,
    source: source && typeof source === 'object' ? Object.freeze({ ...source }) : null,
    derivedFrom: Object.freeze(Array.isArray(derivedFrom) ? [...derivedFrom] : [derivedFrom]),
    isComputed: true,
    isEstimate: isEstimate === true,
    notes,
  });
}

/**
 * Resolves the funded-debt balance that enters the capital weights.
 *
 * Omitting the debt schedule is legal and means "apply the debt-free invariant
 * proven in P2.3", i.e. `D = 0`. Declaring `hasDebt: true` without a finite
 * `totalDebt` is *not* legal: that is the silent-fallback shape, so it throws
 * instead of quietly collapsing to zero.
 *
 * @param {object|null|undefined} debtSchedule
 * @returns {number} Funded debt balance (0 when absent or debt-free).
 * @throws {EngineError} `invalid_debt_schedule` on a malformed schedule.
 */
function resolveDebtBalance(debtSchedule) {
  if (debtSchedule === null || debtSchedule === undefined) return 0;

  if (typeof debtSchedule !== 'object' || Array.isArray(debtSchedule)) {
    throw new EngineError(
      'invalid_debt_schedule',
      'debtSchedule must be an object (or omitted entirely).',
      'debtSchedule',
    );
  }

  if (debtSchedule.hasDebt === true) {
    if (!Number.isFinite(debtSchedule.totalDebt)) {
      throw new EngineError(
        'invalid_debt_schedule',
        'debtSchedule.hasDebt is true but debtSchedule.totalDebt is missing or non-finite.',
        'debtSchedule.totalDebt',
      );
    }
    return debtSchedule.totalDebt;
  }

  return 0;
}

/**
 * Builds the WACC from an assumption set and (optionally) a debt schedule.
 *
 * @param {object} input
 * @param {object} input.assumptions AssumptionSet from `loadAssumptions()` or `scenarios.apply()`.
 * @param {object} [input.debtSchedule] `schedules.build(...).debt`; omitted means debt-free.
 * @returns {object} Frozen `WaccBuild`.
 * @throws {EngineError} On missing input or a missing/non-finite driver.
 * @throws {ConfigError} On a market driver lacking MKT discipline.
 */
export function build(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new EngineError(
      'missing_input',
      'wacc.build() requires an input object of the shape { assumptions, debtSchedule? }.',
      'input',
    );
  }

  const { assumptions, debtSchedule } = input;

  if (!assumptions || typeof assumptions !== 'object' || !Array.isArray(assumptions.drivers)) {
    throw new EngineError(
      'missing_input',
      'wacc.build() requires a valid AssumptionSet carrying a drivers array.',
      'assumptions',
    );
  }

  assertMarketDriverDiscipline(assumptions);

  const rfDriver = requireDriverValue(assumptions, 'risk_free_rate');
  const betaDriver = requireDriverValue(assumptions, 'beta');
  const erpDriver = requireDriverValue(assumptions, 'equity_risk_premium');
  const taxDriver = requireDriverValue(assumptions, TAX_RATE_DRIVER);
  const priceDriver = requireDriverValue(assumptions, 'market_share_price');
  const sharesDriver = requireDriverValue(assumptions, 'shares_outstanding');

  const riskFreeRate = rfDriver.value;
  const beta = betaDriver.value;
  const erp = erpDriver.value;
  const taxRate = taxDriver.value;
  const sharePrice = priceDriver.value;
  const sharesOutstanding = sharesDriver.value;

  // ── CAPM: Re = rf + beta x ERP ──────────────────────────────────────────
  const costOfEquity = riskFreeRate + beta * erp;
  if (!Number.isFinite(costOfEquity)) {
    throw new EngineError(
      'invalid_wacc',
      'CAPM cost of equity (rf + beta x ERP) is not finite.',
      'costOfEquity',
    );
  }

  // ── Capital structure ───────────────────────────────────────────────────
  const debtBalance = resolveDebtBalance(debtSchedule);
  const debtFree = debtBalance === 0;

  let costOfDebtPretax = null;
  if (debtBalance > 0) {
    costOfDebtPretax = requireDriverValue(assumptions, COST_OF_DEBT_DRIVER).value;
  }

  const marketCap = sharePrice * sharesOutstanding;
  if (!Number.isFinite(marketCap) || marketCap <= 0) {
    throw new EngineError(
      'invalid_capital_structure',
      'Market capitalisation (share price x shares outstanding) must be a positive finite number.',
      'market_share_price',
    );
  }

  const totalCapital = marketCap + debtBalance;
  if (!Number.isFinite(totalCapital) || totalCapital <= 0) {
    throw new EngineError(
      'invalid_capital_structure',
      'Total capital (E + D) must be a positive finite number.',
      'totalCapital',
    );
  }

  const equityWeight = marketCap / totalCapital;
  const debtWeight = debtBalance / totalCapital;

  // The after-tax cost of debt is 0 when there is no debt to price. It is
  // multiplied by a weight of 0 in that case, so it contributes nothing either
  // way — the term is retained so the formula stays visible and correct.
  const afterTaxCostOfDebt = costOfDebtPretax === null ? 0 : costOfDebtPretax * (1 - taxRate);

  // ── WACC = (E/V) x Re + (D/V) x Rd x (1 - t) ────────────────────────────
  const wacc = equityWeight * costOfEquity + debtWeight * afterTaxCostOfDebt;
  if (!Number.isFinite(wacc)) {
    throw new EngineError('invalid_wacc', 'Computed WACC is not finite.', 'wacc');
  }

  const rfProv = driverProvenance(rfDriver);
  const betaProv = driverProvenance(betaDriver);
  const erpProv = driverProvenance(erpDriver);
  const taxProv = driverProvenance(taxDriver);
  const priceProv = driverProvenance(priceDriver);
  const sharesProv = driverProvenance(sharesDriver);
  const debtProv = Object.freeze({
    kind: 'debtSchedule',
    hasDebt: debtSchedule ? debtSchedule.hasDebt === true : false,
    status: debtSchedule?.status ?? 'not_supplied',
    totalDebt: debtSchedule ? debtBalance : 0,
  });

  const riskFreeRateLeg = makeLeg({
    value: riskFreeRate,
    marking: MKT,
    asOf: rfDriver.asOf ?? null,
    source: rfDriver.source ?? null,
    derivedFrom: [rfProv],
    isEstimate: false,
    notes: 'CAPM risk-free leg — long-dated government yield, MKT snapshot.',
  });

  const betaLeg = makeLeg({
    value: beta,
    marking: MKT,
    asOf: betaDriver.asOf ?? null,
    source: betaDriver.source ?? null,
    derivedFrom: [betaProv],
    isEstimate: false,
    notes: 'Levered equity beta, MKT snapshot.',
  });

  const erpLeg = makeLeg({
    value: erp,
    marking: MKT,
    asOf: erpDriver.asOf ?? null,
    source: erpDriver.source ?? null,
    derivedFrom: [erpProv],
    isEstimate: false,
    notes: 'Equity risk premium, MKT snapshot.',
  });

  const sharePriceLeg = makeLeg({
    value: sharePrice,
    marking: MKT,
    asOf: priceDriver.asOf ?? null,
    source: priceDriver.source ?? null,
    derivedFrom: [priceProv],
    isEstimate: false,
    notes: 'Market snapshot close price — the benchmark the DCF is measured against.',
  });

  const sharesLeg = makeLeg({
    value: sharesOutstanding,
    marking: MKT,
    asOf: sharesDriver.asOf ?? null,
    source: sharesDriver.source ?? null,
    derivedFrom: [sharesProv],
    isEstimate: false,
    notes: 'Diluted shares outstanding from the latest cited filing.',
  });

  const taxRateLeg = makeLeg({
    value: taxRate,
    marking: EST,
    derivedFrom: [taxProv],
    isEstimate: true,
    notes: 'Normalized effective tax rate — EST judgment (P3.1 tax group).',
  });

  const costOfEquityLeg = makeLeg({
    value: costOfEquity,
    marking: EST,
    derivedFrom: [rfProv, betaProv, erpProv],
    isEstimate: true,
    notes: 'CAPM: rf + beta x ERP.',
  });

  const costOfDebtLeg = makeLeg({
    value: costOfDebtPretax,
    marking: EST,
    derivedFrom: [debtProv],
    isEstimate: true,
    notes: debtFree
      ? 'No funded debt exists in the corpus (P2.3), so the pre-tax cost of debt is undefined — null, not zero. Zero would assert a 0% borrowing rate that no filing supports.'
      : 'Pre-tax cost of debt from the debt schedule; tax-affected by (1 - t) in the WACC formula.',
  });

  const marketCapLeg = makeLeg({
    value: marketCap,
    marking: MKT,
    derivedFrom: [priceProv, sharesProv],
    isEstimate: false,
    notes: 'Equity market value E = share price x diluted shares outstanding.',
  });

  const equityWeightLeg = makeLeg({
    value: equityWeight,
    marking: EST,
    derivedFrom: [priceProv, sharesProv, debtProv],
    isEstimate: true,
    notes: 'E / (E + D).',
  });

  const debtWeightLeg = makeLeg({
    value: debtWeight,
    marking: EST,
    derivedFrom: [priceProv, sharesProv, debtProv],
    isEstimate: true,
    notes: 'D / (E + D).',
  });

  const waccLeg = makeLeg({
    value: wacc,
    marking: EST,
    derivedFrom: [rfProv, betaProv, erpProv, taxProv, priceProv, sharesProv, debtProv],
    isEstimate: true,
    notes: 'WACC = (E/V) x Re + (D/V) x Rd x (1 - t). Under D = 0 this reduces to Re as a theorem, not a branch.',
  });

  const asOfByLeg = Object.freeze({
    riskFreeRate: riskFreeRateLeg.asOf,
    beta: betaLeg.asOf,
    equityRiskPremium: erpLeg.asOf,
    marketSharePrice: sharePriceLeg.asOf,
    sharesOutstanding: sharesLeg.asOf,
  });

  return Object.freeze({
    // ── Contract legs (spec §3.2 WaccBuild) ───────────────────────────────
    riskFreeRate: riskFreeRateLeg,
    beta: betaLeg,
    equityRiskPremium: erpLeg,
    /** Alias of `equityRiskPremium` — see the disclosure note in the submission. */
    erp: erpLeg,
    costOfEquity: costOfEquityLeg,
    costOfDebt: costOfDebtLeg,
    taxRate: taxRateLeg,
    marketCap: marketCapLeg,
    equityWeight: equityWeightLeg,
    debtWeight: debtWeightLeg,
    wacc: waccLeg,

    // ── Additive legs for the P5 build table ──────────────────────────────
    sharePrice: sharePriceLeg,
    sharesOutstanding: sharesLeg,

    // ── Build-level metadata ──────────────────────────────────────────────
    debtFree,
    marking: MKT,
    asOf: asOfByLeg,
    derivedFrom: Object.freeze([rfProv, betaProv, erpProv, taxProv, priceProv, sharesProv, debtProv]),
    isComputed: true,
    isEstimate: false,
  });
}

export default Object.freeze({ build });
