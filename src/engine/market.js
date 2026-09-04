/**
 * Pure injectable market pricing client module (Phase 6R2 Task P6R2.5 — Finding G).
 *
 * Implements the live market price fetch client with:
 *  1. Injectable transport (fetch via dependency injection — zero global network coupling).
 *  2. Close-only staleness gate: verdict math consumes ONLY official completed close prices
 *     (isOfficialClose === true). Intraday prints update the banner display but NEVER verdict math.
 *  3. Fallback mechanism: network failures, non-200 responses, or malformed data fall back
 *     to the audited snapshot driver close with a persistent, unmissable staleness banner.
 *  4. Pure, deterministic, deeply frozen state representations.
 *
 * Synchronous Hot Path Compliance:
 *  - Zero async/await/new Promise inside engine module.
 *  - Zero hardcoded market driver numbers or bare numeric literals > 999.
 *
 * @module src/engine/market
 */

import { EngineError } from '../data/errors.js';
import { STOCKANALYSIS_DUOL_URL } from '../data/constants.js';

/**
 * Deeply freezes an object tree recursively.
 *
 * @template T
 * @param {T} obj
 * @returns {Readonly<T>}
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) {
    return obj;
  }
  for (const key of Object.getOwnPropertyNames(obj)) {
    deepFreeze(obj[key]);
  }
  return Object.freeze(obj);
}

/** Standard fallback banner text template. */
export function buildFallbackBanner(price, asOf) {
  const pStr = Number.isFinite(price) ? price.toFixed(2) : '—';
  const dStr = typeof asOf === 'string' && asOf.length > 0 ? asOf : '—';
  return `LIVE PRICE UNAVAILABLE — verdict computed against snapshot close $${pStr} (${dStr}). Snapshot may be stale.`;
}

/** Standard intraday banner text template. */
export function buildIntradayBanner(officialPrice, officialAsOf, intradayPrice) {
  const pStr = Number.isFinite(officialPrice) ? officialPrice.toFixed(2) : '—';
  const dStr = typeof officialAsOf === 'string' && officialAsOf.length > 0 ? officialAsOf : '—';
  const iStr = Number.isFinite(intradayPrice) ? intradayPrice.toFixed(2) : '—';
  return `last completed close $${pStr} (${dStr}) · intraday $${iStr}`;
}

/**
 * Creates the initial market price state from snapshot driver values.
 *
 * @param {number} snapshotPrice
 * @param {string} snapshotAsOf
 * @param {object} [options]
 * @returns {Readonly<object>}
 */
export function createMarketPriceState(snapshotPrice, snapshotAsOf, options = {}) {
  const price = Number.isFinite(snapshotPrice) && snapshotPrice > 0 ? snapshotPrice : 0;
  const asOf = typeof snapshotAsOf === 'string' ? snapshotAsOf : '';
  const provider = options.provider || 'stockanalysis.com';
  const url = options.url || STOCKANALYSIS_DUOL_URL;

  return deepFreeze({
    symbol: 'DUOL',
    price,
    asOf,
    isOfficialClose: true,
    intradayPrice: null,
    status: 'fallback',
    fallback: true,
    bannerText: buildFallbackBanner(price, asOf),
    retrievedAt: null,
    source: Object.freeze({
      provider,
      url,
    }),
  });
}

/**
 * Fetches the latest market price via an injected transport.
 * Uses Promise chaining (.then / .catch) to comply with the engine's zero-async requirement.
 *
 * @param {Function} transport Injected fetch-like function (url, options) => Promise<Response>
 * @param {object} options
 * @param {string} [options.endpoint='/api/price']
 * @param {number} options.fallbackPrice
 * @param {string} options.fallbackAsOf
 * @param {string} [options.nowIso] Injected ISO timestamp for retrievedAt
 * @returns {Promise<Readonly<object>>}
 */
export function fetchLatestPrice(transport, options = {}) {
  const fallbackPrice = Number.isFinite(options.fallbackPrice) && options.fallbackPrice > 0
    ? options.fallbackPrice
    : 0;
  const fallbackAsOf = typeof options.fallbackAsOf === 'string' ? options.fallbackAsOf : '';
  const endpoint = options.endpoint || '/api/price';

  if (typeof transport !== 'function') {
    return Promise.resolve(createMarketPriceState(fallbackPrice, fallbackAsOf));
  }

  try {
    return Promise.resolve(
      transport(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }),
    )
      .then((res) => {
        if (!res || !res.ok) {
          return createMarketPriceState(fallbackPrice, fallbackAsOf);
        }
        return res.json().then((data) => {
          if (!data || typeof data !== 'object') {
            return createMarketPriceState(fallbackPrice, fallbackAsOf);
          }

          const rawPrice = Number(data.price);
          const rawAsOf = typeof data.asOf === 'string' ? data.asOf : fallbackAsOf;
          const isClose = data.isOfficialClose === true;
          const rawIntraday = Number.isFinite(Number(data.intradayPrice)) ? Number(data.intradayPrice) : null;
          const retrievedAt = typeof data.retrievedAt === 'string' ? data.retrievedAt : options.nowIso || null;

          if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
            return createMarketPriceState(fallbackPrice, fallbackAsOf);
          }

          // Case 1: Official Close (verified completed trading day)
          if (isClose) {
            return deepFreeze({
              symbol: data.symbol || 'DUOL',
              price: rawPrice,
              asOf: rawAsOf,
              isOfficialClose: true,
              intradayPrice: rawIntraday,
              status: 'live_close',
              fallback: false,
              bannerText: null,
              retrievedAt,
              source: Object.freeze({
                provider: data.provider || 'stockanalysis.com',
                url: data.source?.url || STOCKANALYSIS_DUOL_URL,
              }),
            });
          }

          // Case 2: Intraday print (trading active or close unfinalized)
          // CLOSE-ONLY CONVENTION: Intraday prints update the banner, but the price
          // used for verdict math MUST remain the last official completed close!
          // Guard: if lastOfficialClose is missing, non-finite, or equal to the live
          // intraday print, reject it as misattributed and anchor to snapshot close.
          const candidateClose = Number.isFinite(Number(data.lastOfficialClose))
            ? Number(data.lastOfficialClose)
            : null;
          const isMisattributed = candidateClose !== null &&
            (candidateClose === (rawIntraday ?? rawPrice) || candidateClose === rawPrice);
          const officialPrice = (candidateClose !== null && !isMisattributed)
            ? candidateClose
            : fallbackPrice;
          const officialAsOf = typeof data.lastOfficialCloseAsOf === 'string' && !isMisattributed
            ? data.lastOfficialCloseAsOf
            : fallbackAsOf;

          return deepFreeze({
            symbol: data.symbol || 'DUOL',
            price: officialPrice,
            asOf: officialAsOf,
            isOfficialClose: false,
            intradayPrice: rawIntraday ?? rawPrice,
            status: 'intraday',
            fallback: false,
            bannerText: buildIntradayBanner(officialPrice, officialAsOf, rawIntraday ?? rawPrice),
            retrievedAt,
            source: Object.freeze({
              provider: data.provider || 'stockanalysis.com',
              url: data.source?.url || STOCKANALYSIS_DUOL_URL,
            }),
          });
        });
      })
      .catch(() => createMarketPriceState(fallbackPrice, fallbackAsOf));
  } catch (_err) {
    return Promise.resolve(createMarketPriceState(fallbackPrice, fallbackAsOf));
  }
}
