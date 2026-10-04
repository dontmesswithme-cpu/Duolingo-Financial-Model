/**
 * FCFF DCF Valuation Method  -  2-Stage FCFF / FCFE Wrapper
 *
 * Exposes the 6R2 FCFF 2-stage DCF valuation path as one method among six
 * per Phase 8 Director ruling #1, #9.
 *
 * Reads frozen dcf.valuate outputs (zero recomputation) and returns
 * the common frozen method shape:
 *  { method, label, basis, impliedEnterpriseValue, impliedEquityValue,
 *    impliedPerShare, rangePerShare, leaseConvention, inputsProvenance }
 *
 * Pure, deterministic, fail-closed, deeply frozen.
 */

import { EngineError } from '../../data/errors.js';
import { buildDcfOutputs } from './dcfOutputs.js';

/**
 * Freezes an object graph recursively.
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
 * Number of periods carried by the explicit stage before the fade stage begins.
 * Mirrors `dcf.valuate`'s stage split: periods 1-5 explicit, 6+ fade.
 * @type {number}
 */
const EXPLICIT_STAGE_PERIODS = 5;

/** Label retained by the P8 wrapper when the stage structure is undisclosed. */
const UNDISCLOSED_STRUCTURE_LABEL = '2-Stage FCFF DCF';

/** Label retained by the P8 wrapper when the stage structure is undisclosed. */
const UNDISCLOSED_STRUCTURE_BASIS = 'FY2026-FY2030 + Gordon';

/**
 * Describes the disclosed stage structure of a DCF output.
 *
 * The stage count is derived from the engine's own period list and stage
 * present-value block. Absent stage data is reported as an explicit
 * `undisclosed` / `three_stage_unquantified` state and disclosed in
 * `disclosure`; it never resolves into a quieter, different label.
 *
 * @param {Object} dcfOutput - Output from dcf.valuate()
 * @returns {Readonly<Object>} Frozen stage disclosure
 */
export function describeStageStructure(dcfOutput) {
  if (!dcfOutput || typeof dcfOutput !== 'object') {
    throw new EngineError('missing_dcf_output', 'dcfOutput is required and must be an object');
  }

  const periods = Array.isArray(dcfOutput.periods) ? dcfOutput.periods : [];
  const explicitPeriods = periods.length;
  const firstPeriod = explicitPeriods > 0 ? periods[0] : null;
  const terminalYear = typeof dcfOutput.terminalYear === 'string' ? dcfOutput.terminalYear : null;
  const stageBlock =
    dcfOutput.pvByStage && typeof dcfOutput.pvByStage === 'object' ? dcfOutput.pvByStage : null;
  const fadeValue = stageBlock ? stageBlock.fade : undefined;
  const hasFadePeriods = explicitPeriods > EXPLICIT_STAGE_PERIODS;
  // A fade present value of zero at a short horizon is an empty sum over a stage
  // that does not exist, not a disclosed fade. Requiring fade periods keeps an
  // absent stage from presenting as a real, quantified one.
  const fadePresent = hasFadePeriods && typeof fadeValue === 'number' && Number.isFinite(fadeValue);
  const valuationBasis =
    typeof dcfOutput.valuationBasis === 'string' ? dcfOutput.valuationBasis : null;

  let stageStructure;
  let label;
  let basis;
  let stageTag;
  let disclosure;

  if (explicitPeriods === 0) {
    stageStructure = 'undisclosed';
    label = UNDISCLOSED_STRUCTURE_LABEL;
    basis = UNDISCLOSED_STRUCTURE_BASIS;
    stageTag = 'Stage structure undisclosed';
    disclosure =
      'DCF output carries no period list, so the stage structure cannot be derived. ' +
      'The P8 wrapper default label is retained and the structure is disclosed as undisclosed.';
  } else if (hasFadePeriods && fadePresent) {
    stageStructure = 'three_stage';
    label = '3-Stage FCFF DCF';
    basis = `${firstPeriod}-${terminalYear} + Gordon`;
    stageTag = '3-Stage';
    disclosure = `Three stages disclosed: explicit (${firstPeriod}-${periods[EXPLICIT_STAGE_PERIODS - 1]}), fade (${periods[EXPLICIT_STAGE_PERIODS]}-${terminalYear}), Gordon terminal at ${terminalYear}.`;
  } else if (hasFadePeriods) {
    stageStructure = 'three_stage_unquantified';
    label = '3-Stage FCFF DCF (fade present-value not disclosed)';
    basis = `${firstPeriod}-${terminalYear} + Gordon`;
    stageTag = '3-Stage (fade PV undisclosed)';
    disclosure = `The period list runs to ${explicitPeriods} periods, so fade-stage cash flows exist, but pvByStage.fade is absent or non-finite. The fade present value is NOT disclosed and is never reported as zero; the model is presented as unquantified rather than relabelled 2-Stage.`;
  } else {
    stageStructure = 'single_explicit_stage_plus_terminal';
    label = '2-Stage FCFF DCF (single explicit stage + Gordon terminal)';
    basis = `${firstPeriod}-${terminalYear} + Gordon`;
    stageTag = '2-Stage';
    disclosure = `Two stages disclosed: a single explicit stage of ${explicitPeriods} period(s) (${firstPeriod}-${terminalYear}) plus a Gordon terminal value. No fade stage exists at this horizon.`;
  }

  return deepFreeze({
    stageStructure,
    isThreeStage: stageStructure === 'three_stage',
    label,
    stageTag,
    basis,
    disclosure,
    explicitPeriods,
    explicitLastPeriod: explicitPeriods > 0 ? periods[Math.min(EXPLICIT_STAGE_PERIODS, explicitPeriods) - 1] : null,
    fadeFirstPeriod:
      explicitPeriods > EXPLICIT_STAGE_PERIODS ? periods[EXPLICIT_STAGE_PERIODS] : null,
    firstPeriod,
    terminalYear,
    fadePresent,
    fadePresentValue: fadePresent ? fadeValue : null,
    valuationBasis,
  });
}

/**
 * Wraps frozen DCF valuation output into the common Phase 8 method contract.
 *
 * @param {Object} dcfOutput - Output from dcf.valuate()
 * @returns {Readonly<Object>} Common frozen method contract
 */
export function valuateFcffDcf(dcfOutput) {
  if (!dcfOutput || typeof dcfOutput !== 'object') {
    throw new EngineError('missing_dcf_output', 'dcfOutput is required and must be an object');
  }

  const impliedPerShare = dcfOutput.perShare ?? dcfOutput.fcff?.perShare;
  if (typeof impliedPerShare !== 'number' || !Number.isFinite(impliedPerShare) || impliedPerShare <= 0) {
    throw new EngineError(
      'invalid_dcf_per_share',
      `dcfOutput must contain a positive finite perShare value (received ${impliedPerShare})`
    );
  }

  const fcffBlock = dcfOutput.fcff || {};
  const fcfeBlock = dcfOutput.fcfe || {};
  const stages = describeStageStructure(dcfOutput);

  // The canonical figures are the top-level ones: they are the values produced
  // by the basis the engine declares in `valuationBasis`. The `fcff` sub-block
  // holds the integer-index path and is used only as a fallback when the
  // top-level figures are absent, so a dated production run can never report an
  // undated enterprise value beside a dated per-share value.
  const impliedEnterpriseValue =
    dcfOutput.enterpriseValue ?? dcfOutput.ev ?? fcffBlock.enterpriseValue;
  const impliedEquityValue = dcfOutput.equityValue ?? fcffBlock.equityValue;
  const fcfePerShare = fcfeBlock.perShare ?? impliedPerShare;

  // P10.4/P10.5: the FCFE figure is a DIAGNOSTIC and must not define this method's
  // range. Folding it into min/max silently widened the intrinsic DCF range
  // with a different valuation basis, which then propagated into the
  // aggregate's spread and rangePerShare consumers. The FCFF engine produces no
  // intrinsic low/high of its own, so the truthful intrinsic range is a point;
  // the FCFE figure is reported separately and is excluded by field name.
  const minPerShare = impliedPerShare;
  const maxPerShare = impliedPerShare;

  const fcfeDiagnostic = Object.freeze({
    perShare: fcfePerShare,
    role: 'diagnostic_only',
    excludedFrom: Object.freeze([
      'rangePerShare',
      'min',
      'max',
      'spread',
      'confidence',
      'observationCounts',
      'verdict',
    ]),
    note: 'The FCFE diagnostic discounts cash flow to equity rather than to the firm. It is a different valuation basis, so it is disclosed alongside the FCFF result and is never mixed into the intrinsic range, the cross-method spread, or the aggregate vote.',
  });

  const leaseConvention = Object.freeze({
    duolingoLeaseBasis: 'operating_flow',
    note: 'DCF reflects lease expenses directly within operating cash flows (rent included in operating expenses) rather than capitalizing lease liabilities into Enterprise Value. Cross-method convention difference vs relative valuation methods (which capitalize lease liabilities into EV and add back rent to EBITDAR).'
  });

  // P10.5: the three DCF outputs, reported separately with an explicit
  // reconciliation. Skipped when the engine did not supply a share schedule,
  // so a partial DCF result still renders rather than throwing.
  let dcfOutputs = null;
  const shareSchedule = dcfOutput.shares && typeof dcfOutput.shares === "object"
    ? dcfOutput.shares
    : null;
  if (shareSchedule && Number.isFinite(dcfOutput.equityValue)) {
    dcfOutputs = buildDcfOutputs({
      equityValue: dcfOutput.equityValue ?? dcfOutput.fcff?.equityValue,
      moneyScale: dcfOutput.moneyScale ?? 1e3,
      currentFullyDiluted:
        shareSchedule.bopShares ?? dcfOutput.bopSharesOutstanding ?? dcfOutput.sharesOutstanding,
      perpetualDivisor: shareSchedule.terminalDivisorPerpetual ?? null,
      futureDilutedShares:
        shareSchedule.sharesFiniteTerminal ?? shareSchedule.sharesDcf,
  dilutionRatePerpetual: shareSchedule.dilutionRatePerpetual ?? null,
  // P10.5: the SBC-expense cross-check output is deliberately NOT supplied.
  //
  // I briefly wired `dcfOutput.fcfe.equityValue` here, on the theory that the
  // FCFE path is "FCFF after SBC expense". That is wrong: FCFE also adds back
  // after-tax interest income, so it is a levered equity figure, not an
  // SBC-expensed FCFF. It rendered 150.54 against a canonical 113.70 — a
  // supposed *expensed* valuation coming in ABOVE the add-back one, which is
  // directionally impossible. Shipping that number would have been a plausible
  // looking wrong figure.
  //
  // The three reported outputs are the ones the contract names: current-share,
  // the finite-roll intermediate, and the canonical after-future-dilution
  // figure. A genuine SBC-expense cross-check needs the PV of the SBC expense
  // subtracted from the FCFF equity value, which the engine does not currently
  // expose. Left null and therefore absent rather than fabricated; the FCFE
  // diagnostic is already reported and labelled as a diagnostic elsewhere.
  sbcExpenseEconomic: null,
  });
  }

  const result = {
    method: 'fcff_dcf',
    label: stages.label,
    basis: stages.basis,
    impliedEnterpriseValue,
    impliedEquityValue,
    impliedPerShare,
    rangePerShare: Object.freeze({ min: minPerShare, max: maxPerShare }),
    rangeBasis: 'intrinsic_fcff_only',
    fcfeDiagnostic,
    dcfOutputs,
    // P10.5: only the after-future-dilution output may be recommended.
    isCanonicalAddBackDcf: dcfOutputs ? dcfOutputs.afterFutureDilution.perShare : impliedPerShare,
    fcff: dcfOutput.fcff ?? null,
    fcfe: dcfOutput.fcfe ?? null,
    waccRate: dcfOutput.wacc ?? null,
    terminalGrowthRate: dcfOutput.terminalGrowthRate ?? null,
    sharesOutstanding: dcfOutput.sharesOutstanding ?? null,
    leaseConvention,
    stageDisclosure: stages,
    inputsProvenance: Object.freeze({
      model: stages.stageStructure,
      waccRate: dcfOutput.wacc ?? null,
      terminalGrowthRate: dcfOutput.terminalGrowthRate ?? null,
      sharesOutstanding: dcfOutput.sharesOutstanding ?? null,
      valuationBasis: stages.valuationBasis,
      stageStructure: stages.stageStructure,
      stageDisclosure: stages.disclosure,
      leaseConvention: leaseConvention.note
    })
  };

  return deepFreeze(result);
}

/**
 * Resolves the CANONICAL add-back DCF per-share figure for a DCF result.
 *
 * P10.6. Several surfaces (the sensitivity spectrum, the cover fair-value tile and
 * the summary cards) were each independently reading `dcf.perShare`, which is the
 * finite-roll INTERMEDIATE. That produced two different "the" per-share numbers in
 * the product at once: the valuation headline and the recommendation used the
 * canonical figure, while these surfaces used the intermediate. Verdicts were
 * identical on either basis, so nothing was numerically wrong — but a surface
 * showing the intermediate with no basis label implies it is THE value.
 *
 * Routing every caller through one function makes the basis a single decision
 * rather than a per-file convention, which is what the P10.5 contract requires:
 * only the after-modelled-future-dilution output may drive a recommendation.
 *
 * @param {object|null|undefined} dcfOutput A DCF result.
 * @returns {{ perShare: number|null, basis: 'canonical'|'intermediate'|'unavailable',
 *             basisLabel: string }} The figure plus the basis it is stated on.
 */
export function canonicalDcfPerShare(dcfOutput) {
  if (!dcfOutput) {
    return { perShare: null, basis: 'unavailable', basisLabel: 'unavailable' };
  }
  const canonical = valuateFcffDcf(dcfOutput).isCanonicalAddBackDcf;
  if (typeof canonical === 'number' && Number.isFinite(canonical)) {
    return {
      perShare: canonical,
      basis: 'canonical',
      basisLabel: 'after modeled future dilution',
    };
  }
  // Unreachable while the engine's positivity guards hold; stated rather than
  // silently substituted so a surface never presents a figure of unknown basis.
  const intermediate = dcfOutput.perShare;
  if (typeof intermediate === 'number' && Number.isFinite(intermediate)) {
    return {
      perShare: intermediate,
      basis: 'intermediate',
      basisLabel: 'after explicit and fade dilution (intermediate)',
    };
  }
  return { perShare: null, basis: 'unavailable', basisLabel: 'unavailable' };
}

export default {
  valuateFcffDcf,
  describeStageStructure,
  canonicalDcfPerShare,
};
