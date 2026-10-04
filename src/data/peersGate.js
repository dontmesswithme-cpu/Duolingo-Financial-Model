/**
 * P10.4 peer corpus validation gate.
 *
 * The contract requires that uncited or period-missing MATERIAL KPIs are
 * rejected, and that direct unvalidated JSON imports are removed. The failure
 * mode this guards against is specific: a peer KPI with a plausible number and
 * a bare-string source ("Q2 2026 Shareholder Deck") reads as sourced in a UI but
 * has no accession, no URL and no retrieval date, so nobody can re-verify it
 * and a stale figure cannot be distinguished from a current one.
 *
 * The gate is fail-closed and it validates MATERIAL KPIs only. Operating-metric
 * definitions (DAU, MAU, ARM) are not comparable across issuers, and requiring a
 * period match on them would reject the corpus for a reason that has nothing to
 * do with citation quality.
 */

import { EngineError } from './errors.js';

/** Peer KPIs that feed a relative valuation output and must be cited + periodised. */
export const MATERIAL_PEER_FIELDS = Object.freeze([
  'revenue',
  'ebitda',
  'freeCashFlow',
  'operatingLeaseCost',
  'operatingLeaseLiabilities',
  'debt',
  'cash',
]);

/** Citation fields required on a FILED material block. */
const FILED_CITATION_FIELDS = Object.freeze([
  'form',
  'accession',
  'url',
  'periodOfReport',
]);

/** Citation fields required on a CONSENSUS ESTIMATE block. */
const ESTIMATE_CITATION_FIELDS = Object.freeze([
  'provider',
  'url',
  'retrievedAt',
  'period',
]);

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * @param {Object} citation
 * @param {string} where
 * @param {string} symbol
 */
function assertCitation(citation, where, symbol) {
  if (!citation || typeof citation !== 'object') {
    throw new EngineError('uncited_peer_kpi', `${symbol}: ${where} carries no citation`);
  }
  if (citation.tier !== 'primary_filing' && citation.tier !== 'consensus_estimate') {
    throw new EngineError(
      'uncited_peer_kpi',
      `${symbol}: ${where} citation tier must be primary_filing or consensus_estimate (received ${citation.tier})`
    );
  }
  if (!isIsoDate(citation.retrievedAt)) {
    throw new EngineError(
      'uncited_peer_kpi',
      `${symbol}: ${where} retrieval date must be ISO (received ${citation.retrievedAt})`
    );
  }

  if (citation.tier === 'primary_filing') {
    const missing = FILED_CITATION_FIELDS.filter((f) => {
      const v = citation[f];
      return typeof v !== 'string' || v.trim() === '';
    });
    if (missing.length > 0) {
      throw new EngineError(
        'uncited_peer_kpi',
        `${symbol}: ${where} filed citation is missing ${missing.join(', ')}`
      );
    }
    if (!isIsoDate(citation.periodOfReport)) {
      throw new EngineError(
        'period_missing_peer_kpi',
        `${symbol}: ${where} must state the measurement period (received ${citation.periodOfReport})`
      );
    }
    return;
  }

  // A consensus estimate is not a filing, so it is held to a different and
  // honest standard: a named provider, a URL, a retrieval date, and an explicit
  // estimate label. It must NOT carry an accession, because presenting an
  // estimate as though it came from a filing is exactly the failure this gate
  // exists to prevent.
  const missing = ESTIMATE_CITATION_FIELDS.filter((f) => {
    const v = citation[f];
    return typeof v !== 'string' || v.trim() === '';
  });
  if (missing.length > 0) {
    throw new EngineError(
      'uncited_peer_kpi',
      `${symbol}: ${where} estimate citation is missing ${missing.join(', ')}`
    );
  }
  if (citation.accession !== undefined) {
    throw new EngineError(
      'uncited_peer_kpi',
      `${symbol}: ${where} is a consensus estimate and must not carry a filing accession`
    );
  }
}

/**
 * Validates the peer corpus. Returns the corpus unchanged on success so the
 * caller can use it directly.
 *
 * @param {Object} corpus Parsed peers corpus.
 * @returns {Readonly<Object>}
 * @throws {EngineError} On an uncited or period-missing material KPI.
 */
export function validatePeersCorpus(corpus) {
  if (!corpus || typeof corpus !== 'object') {
    throw new EngineError('missing_peers_corpus', 'A peers corpus is required');
  }
  const peers = corpus.peers;
  if (!peers || typeof peers !== 'object') {
    throw new EngineError('missing_peers_corpus', 'Peers corpus has no peers block');
  }

  const symbols = Object.keys(peers);
  if (symbols.length === 0) {
    throw new EngineError('empty_peers_corpus', 'Peers corpus contains no peers');
  }

  for (const symbol of symbols) {
    const peer = peers[symbol];
    if (!peer || typeof peer !== 'object') {
      throw new EngineError('malformed_peer', `${symbol}: peer entry is not an object`);
    }

    assertCitation(peer.filing, 'filing', symbol);

    for (const field of MATERIAL_PEER_FIELDS) {
      const block = peer[field];
      if (block === undefined || block === null) continue;
      if (typeof block !== 'object') {
        throw new EngineError('malformed_peer', `${symbol}: ${field} must be an object`);
      }
      assertCitation(block.source, field, symbol);
    }

    // Forward estimates must be labelled with a real period, never an offset.
    if (peer.revenue && typeof peer.revenue.basis === 'string') {
      if (/^FY\+\d+$/.test(peer.revenue.basis)) {
        throw new EngineError(
          'period_missing_peer_kpi',
          `${symbol}: forward basis "${peer.revenue.basis}" is an offset, not a period; use an explicit estimate label such as FY2026E`
        );
      }
    }

    // Per-user KPIs must be cited and periodised.
    for (const [kpi, v] of Object.entries(peer.kpis || {})) {
      if (!v || typeof v !== 'object') {
        throw new EngineError('malformed_peer', `${symbol}: kpi ${kpi} must be an object`);
      }
      assertCitation(v.citation, `kpis.${kpi}`, symbol);
      if (typeof v.period !== 'string' || v.period.trim() === '') {
        throw new EngineError(
          'period_missing_peer_kpi',
          `${symbol}: kpi ${kpi} must state its measurement period`
        );
      }
    }

    // The share count is a denominator and must be cited like any other KPI.
    if (typeof peer.sharesOutstanding !== 'number' || !Number.isFinite(peer.sharesOutstanding)) {
      throw new EngineError('malformed_peer', `${symbol}: sharesOutstanding must be a finite number`);
    }
    if (peer.sharesBasis) {
      assertCitation(peer.sharesCitation, 'sharesOutstanding', symbol);
    }
  }

  return Object.freeze(corpus);
}

export default Object.freeze({ validatePeersCorpus, MATERIAL_PEER_FIELDS });
