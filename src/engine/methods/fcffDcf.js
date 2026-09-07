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

  const impliedEnterpriseValue = fcffBlock.enterpriseValue ?? dcfOutput.enterpriseValue ?? dcfOutput.ev;
  const impliedEquityValue = fcffBlock.equityValue ?? dcfOutput.equityValue;
  const fcfePerShare = fcfeBlock.perShare ?? impliedPerShare;

  const minPerShare = Math.min(fcfePerShare, impliedPerShare);
  const maxPerShare = Math.max(fcfePerShare, impliedPerShare);

  const leaseConvention = Object.freeze({
    duolingoLeaseBasis: 'operating_flow',
    note: 'DCF reflects lease expenses directly within operating cash flows (rent included in operating expenses) rather than capitalizing lease liabilities into Enterprise Value. Cross-method convention difference vs relative valuation methods (which capitalize lease liabilities into EV and add back rent to EBITDAR).'
  });

  const result = {
    method: 'fcff_dcf',
    label: '2-Stage FCFF DCF',
    basis: 'FY2026-FY2030 + Gordon',
    impliedEnterpriseValue,
    impliedEquityValue,
    impliedPerShare,
    rangePerShare: Object.freeze({ min: minPerShare, max: maxPerShare }),
    fcff: dcfOutput.fcff ?? null,
    fcfe: dcfOutput.fcfe ?? null,
    waccRate: dcfOutput.wacc ?? null,
    terminalGrowthRate: dcfOutput.terminalGrowthRate ?? null,
    sharesOutstanding: dcfOutput.sharesOutstanding ?? null,
    leaseConvention,
    inputsProvenance: Object.freeze({
      model: '2-stage_fcff',
      waccRate: dcfOutput.wacc ?? null,
      terminalGrowthRate: dcfOutput.terminalGrowthRate ?? null,
      sharesOutstanding: dcfOutput.sharesOutstanding ?? null,
      leaseConvention: leaseConvention.note
    })
  };

  return deepFreeze(result);
}

export default {
  valuateFcffDcf,
};
