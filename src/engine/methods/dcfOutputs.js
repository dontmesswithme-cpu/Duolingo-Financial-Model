/**
 * The three DCF outputs, reported separately.
 *
 * P10.5 contract:
 *  1. FCFF DCF - Current-Share Value
 *     Present equity value divided by current fully diluted spot shares.
 *  2. FCFF DCF - After Modeled Future Dilution
 *     Canonical intrinsic result after explicit, fade, and perpetual dilution.
 *     ONLY the second is the canonical add-back DCF recommendation.
 *  3. SBC Expense Cross-Check
 *     Economic FCFF after SBC expense using current fully diluted shares.
 *
 * These are three DIFFERENT questions and collapsing them into one number is how a
 * reader ends up quoting a per-share figure whose denominator they cannot name. So
 * each carries its own divisor, its own basis string, and an explicit statement of
 * which one may be recommended.
 *
 * The current-share and future-diluted values must RECONCILE: the difference
 * between them is exactly the dilution the model adds, so the reconciliation is
 * reported as a derived quantity rather than asserted as a hidden identity.
 */

import { EngineError } from '../../data/errors.js';

/**
 * @param {number} value
 * @param {string} context
 * @returns {number}
 */
function requirePositive(value, context) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new EngineError(
      'invalid_dcf_output',
      `${context} must be a positive finite number (received ${value})`,
    );
  }
  return value;
}

/**
 * Builds the three-output contract.
 *
 * @param {Object} args
 * @param {number} args.equityValue Present equity value in $k.
 * @param {number} args.moneyScale Money scale converting $k to whole units.
 * @param {number} args.currentFullyDiluted Current point-in-time FD share count.
 * @param {number} args.futureDilutedShares Terminal count after modelled dilution.
 * @param {number} args.dilutionRatePerpetual Post-terminal dilution rate.
 * @param {number} [args.sbcExpenseEconomic] Economic FCFF after SBC expense, $k.
 * @returns {Readonly<Object>}
 */
export function buildDcfOutputs({
  equityValue,
  moneyScale,
  currentFullyDiluted,
  futureDilutedShares,
  perpetualDivisor = null,
  dilutionRatePerpetual,
  sbcExpenseEconomic = null,
}) {
  requirePositive(equityValue, 'DCF equityValue');
  requirePositive(moneyScale, 'DCF moneyScale');
  requirePositive(currentFullyDiluted, 'DCF currentFullyDiluted');
  requirePositive(futureDilutedShares, 'DCF futureDilutedShares');
  if (perpetualDivisor !== null) requirePositive(perpetualDivisor, 'DCF perpetualDivisor');

  const asPerShare = (shares) => (equityValue * moneyScale) / shares;

  const currentShare = asPerShare(currentFullyDiluted);
  const afterFiniteDilution = asPerShare(futureDilutedShares);
  // The finite roll covers the explicit and fade stages only. The contract's
  // canonical figure also carries perpetual post-terminal dilution, so the finite
  // count is carried as a disclosed intermediate rather than skipped: without it
  // the canonical number cannot be tied back to the engine's own perShare.
  const afterDilution = Number.isFinite(perpetualDivisor) && perpetualDivisor > 0
    ? asPerShare(perpetualDivisor)
    : afterFiniteDilution;

  // The difference IS the modelled dilution, expressed per share. Reporting it
  // makes the reconciliation auditable instead of leaving the reader to notice
  // that two "DCF" numbers disagree.
  const dilutionEffect = currentShare - afterDilution;

  const outputs = {
    currentShareValue: Object.freeze({
      key: 'current_share_value',
      label: 'FCFF DCF - Current-Share Value',
      perShare: currentShare,
      shares: currentFullyDiluted,
      basis: 'present equity value / current fully diluted spot shares',
      mayRecommend: false,
      note: 'Present equity over the shares outstanding today. It deliberately ignores the dilution the model itself projects, so it is an upper bound on the same equity, not the recommendation.',
    }),
    afterFiniteDilution: Object.freeze({
      key: 'after_finite_dilution',
      label: 'FCFF DCF - After Explicit and Fade Dilution',
      perShare: afterFiniteDilution,
      shares: perpetualDivisor ?? futureDilutedShares,
      basis: 'present equity value / terminal count after the explicit and fade stages only',
      mayRecommend: false,
      note:
        'A DISCLOSED INTERMEDIATE. This is the engine perShare and ties to the DCF headline, ' +
        'but a finite roll is not a complete terminal policy, so it is not the recommendation.',
    }),
    afterFutureDilution: Object.freeze({
      key: 'after_future_dilution',
      label: 'FCFF DCF - After Modeled Future Dilution',
      perShare: afterDilution,
      shares: perpetualDivisor ?? futureDilutedShares,
      basis: 'present equity value / terminal count after explicit, fade and perpetual dilution',
      mayRecommend: true,
      canonical: true,
      note: 'CANONICAL. This is the only add-back DCF output that may drive a recommendation, because it is the only one whose denominator matches the equity value being divided.',
      dilutionRatePerpetual: dilutionRatePerpetual ?? null,
    }),
  };

  if (typeof sbcExpenseEconomic === 'number' && Number.isFinite(sbcExpenseEconomic) && sbcExpenseEconomic > 0) {
    outputs.sbcExpenseCrossCheck = Object.freeze({
      key: 'sbc_expense_cross_check',
      label: 'SBC Expense Cross-Check',
      perShare: (sbcExpenseEconomic * moneyScale) / currentFullyDiluted,
      shares: currentFullyDiluted,
      basis: 'economic FCFF after SBC expense, on current fully diluted shares',
      mayRecommend: false,
      note: 'An economic cross-check that expenses SBC rather than adding it back, so it is NOT comparable to the add-back outputs above and is never averaged with them. It sits below them by construction.',
    });
  }

  return Object.freeze({
    ...outputs,
    canonicalKey: 'after_future_dilution',
    reconciliation: Object.freeze({
      currentSharePerShare: currentShare,
      afterFiniteDilutionPerShare: afterFiniteDilution,
      afterDilutionPerShare: afterDilution,
      dilutionEffectPerShare: dilutionEffect,
      dilutionEffectPct: currentShare > 0 ? dilutionEffect / currentShare : null,
      identity:
        'currentShare - afterDilution = present equity x (1/shares_now - 1/shares_terminal); ' +
        'the difference is exactly the dilution the model projects, not a modelling difference.',
      ordered: currentShare >= afterDilution,
    }),
  });
}

export default Object.freeze({ buildDcfOutputs });
