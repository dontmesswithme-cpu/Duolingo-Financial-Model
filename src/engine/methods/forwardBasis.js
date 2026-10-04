/**
 * Forward estimate period label, derived from the peer corpus.
 *
 * P10.4 finding F1: the relative methods shipped a hardcoded `basis: 'FY+1'`
 * string while the corpus peers were labelled FY2026E. The offset was also the
 * wrong KIND of label: "FY+1" is an offset from an as-of date, not a period, so
 * it silently changes meaning every time the corpus is refreshed. It also
 * rendered user-visibly, so the mismatch was on screen rather than buried.
 *
 * The label is therefore READ FROM THE CORPUS rather than typed here, and the
 * three peers must agree. If they disagree the methods fail closed instead of
 * computing a multiple across mismatched estimate periods, which is exactly the
 * condition the P10.4 period policy forbids.
 */

import { EngineError } from '../../data/errors.js';

/** Labels that are offsets rather than periods, and so are never acceptable. */
const OFFSET_PATTERN = /^FY\+\d+$/;

/**
 * @param {Object} peersCorpus The peers object from peers.json.
 * @returns {string} The agreed estimate period label, e.g. 'FY2026E'.
 * @throws {EngineError} When the label is missing, is an offset, or peers disagree.
 */
export function forwardBasisLabel(peersCorpus) {
  if (!peersCorpus || typeof peersCorpus !== 'object' || !peersCorpus.peers) {
    throw new EngineError('missing_peer_estimate_basis', 'A peers corpus is required to label the forward basis');
  }

  const labels = new Map();
  for (const [symbol, peer] of Object.entries(peersCorpus.peers)) {
    const label = peer?.revenue?.basis;
    if (typeof label !== 'string' || label.trim() === '') {
      throw new EngineError(
        'missing_peer_estimate_basis',
        `Peer ${symbol} declares no forward estimate period; the forward basis cannot be labelled`
      );
    }
    if (OFFSET_PATTERN.test(label.trim())) {
      throw new EngineError(
        'offset_forward_estimate_basis',
        `Peer ${symbol} forward basis "${label}" is an offset, not a period; use an explicit label such as FY2026E`
      );
    }
    labels.set(label.trim(), symbol);
  }

  if (labels.size !== 1) {
    throw new EngineError(
      'mixed_peer_estimate_basis',
      `Peer forward estimates cover different periods (${[...labels.keys()].sort().join(', ')}); ` +
        'a relative multiple across mismatched estimate periods is not meaningful'
    );
  }

  return [...labels.keys()][0];
}

export default Object.freeze({ forwardBasisLabel });
