/**
 * P10.4 F2 — lease input citation gate.
 *
 * The lease legs feed Enterprise Value (capitalised liability) and EBITDAR (the
 * cost add-back), so they are filed inputs and must be cited like any other. The
 * defect this guards against is specific: a bare constant in the engine that a
 * test then transcribes, producing an agreement that proves only that the code
 * agrees with itself.
 *
 * The gate requires a filing citation (accession, statement, rendered-table URL)
 * AND an explicit provenanceStatus on every lease input. That status is load
 * bearing: an input marked unverified must be disclosed as unverified, because
 * the alternative is a figure acquiring a filing citation it has not earned.
 */

import { EngineError } from './errors.js';

const REQUIRED_CITATION = Object.freeze(['accession', 'statement', 'renderedTableUrl']);

/**
 * @param {Object} artifact Parsed lease-input artifact.
 * @returns {Readonly<Object>} Normalised, frozen lease inputs.
 * @throws {EngineError} On a missing citation, missing status, or bad value.
 */
export function validateLeaseInputs(artifact) {
  if (!artifact || typeof artifact !== 'object') {
    throw new EngineError('missing_lease_artifact', 'A lease input artifact is required');
  }
  const filing = artifact.filing;
  if (!filing || typeof filing.accession !== 'string' || !filing.accession.trim()) {
    throw new EngineError('uncited_lease_input', 'Lease artifact must name the filing accession');
  }

  const out = { filing: Object.freeze({ ...filing }) };
  const unverified = [];

  for (const key of ['leaseCost', 'leaseLiability', 'annualReference']) {
    const block = artifact[key];
    if (!block) continue;

    if (typeof block.value !== 'number' || !Number.isFinite(block.value)) {
      throw new EngineError('malformed_lease_input', `Lease input ${key} must carry a finite value`);
    }
    if (typeof block.provenanceStatus !== 'string' || !block.provenanceStatus.trim()) {
      throw new EngineError(
        'uncited_lease_input',
        `Lease input ${key} must declare a provenanceStatus; a silent figure reads as a verified one`
      );
    }
    const citation = block.citation;
    if (key !== 'annualReference') {
      const missing = REQUIRED_CITATION.filter((f) => {
        const v = citation && citation[f];
        return typeof v !== 'string' || v.trim() === '';
      });
      if (missing.length > 0) {
        throw new EngineError(
          'uncited_lease_input',
          `Lease input ${key} citation is missing ${missing.join(', ')}`
        );
      }
    }
    if (/^unverified/.test(block.provenanceStatus)) {
      unverified.push(key);
    }

    out[key] = Object.freeze({
      label: block.label ?? key,
      value: block.value,
      units: block.units ?? 'USD thousands',
      provenanceStatus: block.provenanceStatus,
      citation: citation ? Object.freeze({ ...citation }) : null,
      disclosure: block.disclosure ?? null,
      unresolved: Object.freeze([...(block.unresolved ?? [])]),
    });
  }

  if (typeof out.leaseCost?.value !== 'number' || typeof out.leaseLiability?.value !== 'number') {
    throw new EngineError('malformed_lease_input', 'Both the lease cost and the lease liability are required');
  }

  out.unverifiedInputs = Object.freeze(unverified);
  out.isFullyVerified = unverified.length === 0;
  return Object.freeze(out);
}

export default Object.freeze({ validateLeaseInputs });
