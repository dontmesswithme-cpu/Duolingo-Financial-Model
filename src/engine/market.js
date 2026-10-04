/**
 * Pure injectable market pricing client module (Phase 6R2 Task P6R2.5 — Finding G; Phase 10 Task P10.9).
 *
 * Implements the live market price fetch client with:
 *  1. Injectable transport (fetch via dependency injection — zero global network coupling).
 *  2. Official close-only contract: verdict math and live refresh consume ONLY official completed close prices.
 *     Intraday quotes and statuses are refused outright.
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
import {
  STOCKANALYSIS_DUOL_URL,
  PRICE_REQUEST_TIMEOUT_MS,
  PRICE_MAX_BODY_BYTES,
  PRICE_SYMBOL,
  PRICE_PROVIDER,
} from '../data/constants.js';

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

/**
 * Monotonic request-sequence allocator (P10.3 live-price lifecycle).
 *
 * "Latest" is defined as the HIGHEST request sequence, never arrival order, so a
 * slow older response can never overwrite a newer valid one. The counter is
 * owned by the caller (the controller) and passed in, which keeps this module
 * free of hidden state.
 *
 * @param {number} lastSequence Sequence of the most recently issued request.
 * @returns {number} The next sequence token.
 */
export function nextRequestSequence(lastSequence) {
  const last = Number.isFinite(lastSequence) ? lastSequence : 0;
  return last + 1;
}

/**
 * Reads a response body as text, accepting every shape a transport may expose.
 *
 * A real `Response` exposes `text()` as a METHOD; test doubles commonly expose
 * either a `text` string or a `json()` method. Reading only one of them would
 * silently reject a live response (or a double), so all three are accepted and
 * the body cap is measured on the consumed text either way.
 *
 * @param {object} res Response-like object.
 * @returns {{ text: string|null, promise: Promise<string>|null, error: string|null }}
 */
export function readResponseBody(res) {
  if (!res || typeof res !== 'object') {
    return { text: null, promise: null, error: 'Price response is not a response object.' };
  }
  if (typeof res.text === 'string') {
    return { text: res.text, promise: null, error: null };
  }
  if (typeof res.text === 'function') {
    return { text: null, promise: Promise.resolve(res.text()), error: null };
  }
  if (typeof res.json === 'function') {
    return { text: null, promise: Promise.resolve(res.json()).then((v) => JSON.stringify(v)), error: null };
  }
  return { text: null, promise: null, error: 'Price response exposed no readable body.' };
}

/**
 * Validates one live price response envelope and body (P10.3 "Validate method,
 * content type, body size, symbol, date, provider, URL, and market state").
 *
 * Every rejection carries a visible reason; the caller falls back without
 * mutating a held benchmark. `options.bodyText` supplies the already-consumed
 * body so the body-size cap covers consumption.
 *
 * The provider URL is validated when the response carries one (a wrong URL is
 * rejected); an absent URL is recorded as `null` and the documented snapshot URL
 * remains the provenance of record, because the upstream proxy omits it on some
 * legitimate responses.
 *
 * @param {object} res Response-like object (`ok`, `status`, `headers`).
 * @param {object} [options]
 * @param {string} [options.bodyText] Pre-consumed body text.
 * @param {number} options.maxBodyBytes Hard cap on the response body size.
 * @param {string} [options.expectedSymbol='DUOL']
 * @param {string} [options.expectedProvider='stockanalysis.com']
 * @param {RegExp} [options.urlPattern] Required provider-URL shape.
 * @param {string} [options.contentType='application/json']
 * @returns {{ ok: boolean, error: string|null, body: object|null, bytes: number }}
 */
export function validatePriceEnvelope(res, options = {}) {
  const maxBodyBytes = Number.isFinite(options.maxBodyBytes) && options.maxBodyBytes > 0
    ? options.maxBodyBytes
    : PRICE_MAX_BODY_BYTES;
  const expectedSymbol = options.expectedSymbol || PRICE_SYMBOL;
  const expectedProvider = options.expectedProvider || PRICE_PROVIDER;
  const contentType = options.contentType || 'application/json';

  // 1. Method / transport contract: a response must be an object with a boolean
  //    `ok` and a numeric `status`.
  if (!res || typeof res !== 'object' || typeof res.ok !== 'boolean' || !Number.isFinite(res.status)) {
    return { ok: false, error: 'Price response is not a valid HTTP response envelope.', body: null, bytes: 0 };
  }
  if (res.ok !== true || res.status < 200 || res.status >= 300) {
    return { ok: false, error: `Price endpoint returned HTTP ${res.status}.`, body: null, bytes: 0 };
  }

  // 2. Content type.
  const headerValue = (name) => {
    const headers = res.headers;
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? headers[key] : null;
  };
  const rawType = headerValue('content-type');
  if (typeof rawType === 'string' && rawType.length > 0 && !rawType.includes(contentType)) {
    return { ok: false, error: `Price response content-type "${rawType}" is not ${contentType}.`, body: null, bytes: 0 };
  }

  // 3. Body size, measured on the consumed text so the cap covers the body.
  const text = typeof options.bodyText === 'string' ? options.bodyText : null;
  if (text === null) {
    return { ok: false, error: 'Price response exposed no body text.', body: null, bytes: 0 };
  }
  const bytes = text.length;
  if (bytes > maxBodyBytes) {
    return {
      ok: false,
      error: `Price response body of ${bytes} bytes exceeds the ${maxBodyBytes}-byte cap.`,
      body: null,
      bytes,
    };
  }

  // 4. Body shape.
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (_err) {
    return { ok: false, error: 'Price response body is not valid JSON.', body: null, bytes };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'Price response body is not a JSON object.', body: null, bytes };
  }

  // 5. Symbol.
  if (typeof data.symbol !== 'string' || data.symbol.toUpperCase() !== expectedSymbol.toUpperCase()) {
    return {
      ok: false,
      error: `Price response symbol ${JSON.stringify(data.symbol)} does not match ${expectedSymbol}.`,
      body: null,
      bytes,
    };
  }

  // 6. Provider.
  const provider = typeof data.provider === 'string' ? data.provider : null;
  if (provider !== expectedProvider) {
    return {
      ok: false,
      error: `Price response provider ${JSON.stringify(provider)} is not the pinned ${expectedProvider}.`,
      body: null,
      bytes,
    };
  }

  // 7. URL, validated when the response carries one.
  const url = typeof data.source?.url === 'string' ? data.source.url : null;
  if (options.urlPattern) {
    if (url !== null && !options.urlPattern.test(url)) {
      return { ok: false, error: `Price response URL ${JSON.stringify(url)} failed the provider-URL check.`, body: null, bytes };
    }
  }

  // 8. Refusal of intraday shapes (P10.9 contract gate: refused even beside valid close fields).
  if (
    data.isOfficialClose === false ||
    (data.intradayPrice !== null && data.intradayPrice !== undefined) ||
    data.status === 'intraday'
  ) {
    return {
      ok: false,
      error: 'Intraday price quotes are unavailable; official close required.',
      body: null,
      bytes,
    };
  }

  // 9. Date. An official-close response must carry an ISO as-of date.
  const closeAsOf = typeof data.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.asOf)
    ? data.asOf
    : null;
  if (closeAsOf === null) {
    return {
      ok: false,
      error: `Price response carried no ISO as-of date (asOf ${JSON.stringify(data.asOf)}).`,
      body: null,
      bytes,
    };
  }

  // 10. Market state: verdict math consumes an official completed close only.
  if (data.isOfficialClose !== true || typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price <= 0) {
    return {
      ok: false,
      error: 'Price response does not carry a valid official close price.',
      body: null,
      bytes,
    };
  }

  return { ok: true, error: null, body: data, bytes };
}

/**
 * Resolves the benchmark-relevant price and date from a validated body,
 * preserving the close-only convention. Intraday shapes are refused.
 *
 * @param {object} data Validated body.
 * @param {object} options `{ fallbackPrice, fallbackAsOf }`
 * @returns {{ value: number, asOf: string, intradayPrice: null, isOfficialClose: true }}
 */
export function resolveCloseOnly(data, options = {}) {
  const fallbackPrice = Number.isFinite(options.fallbackPrice) ? options.fallbackPrice : null;
  const fallbackAsOf = typeof options.fallbackAsOf === 'string' ? options.fallbackAsOf : null;

  if (
    data.isOfficialClose === false ||
    (data.intradayPrice !== null && data.intradayPrice !== undefined) ||
    data.status === 'intraday'
  ) {
    return {
      value: fallbackPrice,
      asOf: fallbackAsOf,
      intradayPrice: null,
      isOfficialClose: true,
      error: 'Intraday price quotes are unavailable; official close required.',
    };
  }

  return {
    value: Number(data.price),
    asOf: typeof data.asOf === 'string' ? data.asOf : fallbackAsOf,
    intradayPrice: null,
    isOfficialClose: true,
  };
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
  const provider = options.provider || PRICE_PROVIDER;
  const url = options.url || STOCKANALYSIS_DUOL_URL;

  return Object.freeze({
    symbol: PRICE_SYMBOL,
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
 * Projects a canonical benchmark onto the legacy market-price-state shape that
 * the existing views already consume, so one benchmark object can drive every
 * view without any view inventing its own price.
 *
 * @param {Readonly<object>} benchmark Canonical benchmark.
 * @returns {Readonly<object>} Market-price-state-compatible projection.
 */
export function benchmarkToMarketState(benchmark) {
  const statusMap = {
    override: 'override',
    live: 'live_close',
    stale_live: 'stale_live',
    snapshot: 'fallback',
  };
  const mapped = statusMap[benchmark.status] || 'fallback';
  const isFallback = mapped === 'fallback' || mapped === 'stale_live';
  const bannerText = isFallback
    ? buildFallbackBanner(benchmark.value, benchmark.asOf)
    : null;

  return deepFreeze({
    symbol: PRICE_SYMBOL,
    price: benchmark.value,
    asOf: benchmark.asOf,
    isOfficialClose: true,
    intradayPrice: null,
    status: mapped,
    fallback: isFallback,
    // The P6R2.5 banner contract is canonical: a fallback or
    // stale-live benchmark shows the standard unmissable banner.
    bannerText,
    retrievedAt: null,
    isEdited: benchmark.isEdited,
    reason: benchmark.reason,
    benchmark,
    source: Object.freeze({
      provider: benchmark.source.provider,
      url: benchmark.source.url,
    }),
  });
}

/**
 * Explicit deployment configuration for the price endpoint.
 *
 * P10.6: on GitHub Pages the API is a different origin (Vercel), so the endpoint
 * cannot be resolved relatively. The build injects the absolute Vercel URL here;
 * `api/price.js` is never bundled into the static artifact. When nothing is
 * injected the resolver returns the relative path, which is correct for a
 * same-origin Vercel deployment and fails closed (snapshot fallback) rather than
 * guessing a host.
 *
 * @returns {string} An absolute URL when configured, else the relative path.
 */
export function resolvePriceEndpoint() {
  // Injected at build/deploy time (see tools/build_pages_artifact.mjs and
  // .github/workflows/deploy.yml). Global so a build step can set it without a
  // module edit.
  const configured = typeof globalThis !== 'undefined'
    ? globalThis.__PRICE_ENDPOINT__
    : undefined;
  if (typeof configured === 'string') {
    const trimmed = configured.trim();
    // Only an absolute http(s) URL is honoured; anything else is ignored so a
    // malformed or injected value cannot redirect the fetch to an unapproved host.
    if (/^https:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, '');
  }
  return '/api/price';
}

export default Object.freeze({
  buildFallbackBanner,
  createMarketPriceState,
  benchmarkToMarketState,
  nextRequestSequence,
  validatePriceEnvelope,
  resolveCloseOnly,
  fetchLatestPrice,
  resolvePriceEndpoint,
});

/**
 * Fetches the latest market price via an injected transport and validates it.
 *
 * The returned object is a validation OUTCOME, not state: the caller decides
 * precedence through `benchmark.applyLiveResponse`, so this module can never
 * mutate a held benchmark, an uncleared override, or a newer valid price.
 *
 * Promise chaining only (.then / .catch) to keep the engine free of async/await.
 * The DEADLINE is owned by the controller (which may use async/await): this
 * module deliberately constructs no Promise, so a caller can race this call
 * against its own timeout without a second timer hiding the transport abort.
 *
 * @param {Function} transport Injected fetch-like function (url, options) => Promise<Response>
 * @param {object} options
 * @param {string} [options.endpoint='/api/price']
 * @param {number} options.fallbackPrice Snapshot close used for close-only anchoring.
 * @param {string} options.fallbackAsOf Snapshot as-of date.
 * @param {number} [options.sequence=0] Request sequence token for this attempt.
 * @param {object} [options.abortController] Caller-owned controller for transport cancel.
 * @param {boolean} [options.isAborted=false] Probe consulted before mutating.
 * @param {number} [options.maxBodyBytes=65536]
 * @param {string} [options.expectedSymbol='DUOL']
 * @param {string} [options.expectedProvider='stockanalysis.com']
 * @param {RegExp} [options.urlPattern]
 * @returns {Promise<Readonly<object>>} `{ ok, sequence, value, asOf, provider, url, error, ... }`
 */
export function fetchLatestPrice(transport, options = {}) {
  const fallbackPrice = Number.isFinite(options.fallbackPrice) && options.fallbackPrice > 0
    ? options.fallbackPrice
    : 0;
  const fallbackAsOf = typeof options.fallbackAsOf === 'string' ? options.fallbackAsOf : '';

  const endpoint = options.endpoint || resolvePriceEndpoint();
  const sequence = Number.isFinite(options.sequence) ? options.sequence : 0;
  const controller = options.abortController && typeof options.abortController === 'object'
    ? options.abortController
    : (typeof AbortController === 'function' ? new AbortController() : null);
  const isAborted = typeof options.isAborted === 'function' ? options.isAborted : () => false;
  const rejection = (error) => {
    const provider = options.expectedProvider || PRICE_PROVIDER;
    const url = typeof options.expectedUrl === 'string' ? options.expectedUrl : STOCKANALYSIS_DUOL_URL;
    return deepFreeze({
      // ── P10.3 outcome fields ──────────────────────────────────────────
      ok: false,
      sequence,
      value: null,
      asOf: fallbackAsOf,
      provider,
      url: null,
      error,
      // ── P6R2.5 market-state fields: the visible snapshot fallback ─────
      symbol: PRICE_SYMBOL,
      price: fallbackPrice,
      isOfficialClose: true,
      intradayPrice: null,
      status: 'fallback',
      fallback: true,
      bannerText: buildFallbackBanner(fallbackPrice, fallbackAsOf),
      source: Object.freeze({ provider, url }),
    });
  };

  if (typeof transport !== 'function') {
    return Promise.resolve(rejection('No transport is available for the price request.'));
  }

  // No timer lives here: the controller races this call against its own
  // deadline (see `fetchPrice` in src/app.js), which keeps this module free of
  // Promise construction while still covering body consumption.
  const request = Promise.resolve()
    .then(() => transport(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      ...(controller ? { signal: controller.signal } : {}),
    }))
    .then((res) => {
      const body = readResponseBody(res);
      if (body.error) return rejection(body.error);
      return body.promise
        ? body.promise.then((text) => finish(res, text))
        : finish(res, body.text);
    })
    .catch((err) => rejection(err && err.message ? err.message : 'Price request failed.'));

  /**
   * Validates the envelope plus the consumed body and resolves the close-only
   * price, mirroring the P6R2.5 market-state shape alongside the outcome fields
   * the P10.3 controller consumes.
   */
  function finish(res, text) {
    const envelope = validatePriceEnvelope(res, { ...options, bodyText: text });
    if (!envelope.ok) return rejection(envelope.error);
    const close = resolveCloseOnly(envelope.body, { fallbackPrice, fallbackAsOf });
    if (!Number.isFinite(close.value) || close.value <= 0 || typeof close.asOf !== 'string' || close.asOf.length === 0) {
      return rejection('Price response carried no usable close price or date.');
    }
    const provider = envelope.body.provider;
    const url = typeof envelope.body.source?.url === 'string' ? envelope.body.source.url : null;
    return deepFreeze({
      // ── P10.3 outcome fields (what the controller applies) ─────────────
      ok: true,
      sequence,
      value: close.value,
      asOf: close.asOf,
      provider,
      url,
      error: null,
      bytes: envelope.bytes,
      // ── P6R2.5 market-state fields (what the views render) ────────────
      symbol: PRICE_SYMBOL,
      price: close.value,
      isOfficialClose: true,
      intradayPrice: null,
      status: 'live_close',
      fallback: false,
      bannerText: null,
      source: Object.freeze({ provider, url }),
    });
  }

  return request.then((outcome) => {
    // Post-dispose / post-abort guard: a response that arrives after the
    // controller is gone is reported as rejected, never as state.
    if (typeof isAborted === 'function' && isAborted()) {
      return rejection('Price response arrived after the controller was disposed or the request was superseded.');
    }
    return outcome;
  });
}
