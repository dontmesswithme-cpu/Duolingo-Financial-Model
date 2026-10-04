/**
 * Vercel Serverless Function; /api/price (Phase 6R2 Task P6R2.5; Finding G).
 *
 * Server-side proxy for live market share price retrieval from stockanalysis.com.
 * Bypasses browser CORS restrictions while strictly enforcing:
 *  1. Provider pinning: stockanalysis.com (S&P Global-sourced data).
 *  2. Zero secrets / zero API keys policy.
 *  3. `Cache-Control: no-store` header passthrough.
 *  4. Close-only contract: official closes ONLY (in-hours resolves upstream prior close
 *     or falls back to snapshot). Intraday quotes and statuses are completely eliminated.
 *  5. Upstream date parsing: parses official date stamp from page; fails closed to snapshot
 *     if date cannot be verified (never a dateless live price).
 *  6. Fail-closed error handling: returns clean JSON with error or snapshot fallback.
 */

export const config = {
  runtime: 'nodejs',
};

/** Pinned provider details. */
const PROVIDER_NAME = 'stockanalysis.com';
const PROVIDER_URL = 'https://stockanalysis.com/stocks/duol/';
const SYMBOL = 'DUOL';

/**
 * Snapshot fallback values if provider is unreachable, malformed, or date unparseable.
 *
 * NOTE ON COUPLING:
 * These constants MUST remain synchronized with the benchmark driver in `src/data/assumptions.json`
 * ('market_share_price'). Any future market anchor refresh must update BOTH assumptions.json
 * and FALLBACK_PRICE / FALLBACK_AS_OF here.
 */
const FALLBACK_PRICE = 157.85;
const FALLBACK_AS_OF = '2026-09-02';

/**
 * Parses upstream page date string (e.g., "Sep 3, 2026" or "Sep 3, 2026, 3:29 PM EDT - Market open")
 * into canonical ISO date string YYYY-MM-DD.
 *
 * @param {string} text
 * @returns {string|null}
 */
export function parseUpstreamDate(text) {
  if (typeof text !== 'string' || !text) return null;
  const match = text.match(/([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})/);
  if (!match) return null;
  const [, mon, day, year] = match;
  const months = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  const m = months[mon];
  if (!m) return null;
  return `${year}-${m}-${day.padStart(2, '0')}`;
}

/**
 * Parses in-hours prior completed close price and date from upstream page HTML.
 *
 * P10.9: When the market is open or in extended hours, the server resolves the
 * last completed official close from upstream (the prior close and its date).
 *
 * @param {string} html
 * @returns {{ price: number|null, asOf: string|null }}
 */
export function parseUpstreamPriorClose(html) {
  if (typeof html !== 'string' || !html) return { price: null, asOf: null };

  let price = null;
  const priceMatch =
    html.match(/"(?:previousClose|priorClose)":\s*([0-9]+\.[0-9]+)/i) ||
    html.match(/"close":\s*([0-9]+\.[0-9]+)/i) ||
    html.match(/(?:Previous|Prior)\s+Close<\/[^>]+>\s*<[^>]+>([0-9]+\.[0-9]+)</i) ||
    html.match(/(?:Previous|Prior)\s+Close[^\n<]*>([0-9]+\.[0-9]+)</i) ||
    html.match(/(?:Previous|Prior)\s+Close[^0-9]*([0-9]+\.[0-9]+)/i);

  if (priceMatch && priceMatch[1]) {
    const p = parseFloat(priceMatch[1]);
    if (Number.isFinite(p) && p > 0) {
      price = p;
    }
  }

  let asOf = null;
  const dateMatch =
    html.match(/"(?:previousCloseDate|priorCloseDate|lastOfficialCloseAsOf|closeDate)":\s*"([^"]+)"/i) ||
    html.match(/(?:Previous|Prior)\s+Close\s+Date<\/[^>]+>\s*<[^>]+>([^<]+)</i) ||
    html.match(/(?:Previous|Prior)\s+Close[^\n<]*as\s+of\s+([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/i) ||
    html.match(/Close\s+as\s+of\s+([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/i);

  if (dateMatch && dateMatch[1]) {
    asOf = parseUpstreamDate(dateMatch[1]) || (/^\d{4}-\d{2}-\d{2}$/.test(dateMatch[1]) ? dateMatch[1] : null);
  }

  return { price, asOf };
}

/**
 * Approved browser origins for CORS.
 *
 * P10.6: CORS is an allowlist, not a reflection of the request Origin. The GitHub
 * Pages origin is the only browser that calls this in production; the Vercel
 * production domain is permitted so a same-provider direct visit works. Anything
 * else gets no CORS headers, so the browser blocks the read.
 */
const ALLOWED_ORIGINS = Object.freeze([
  'https://<pages-owner>.github.io',
  process.env.PAGES_ORIGIN || '',
  'https://duolingo-valuation.vercel.app',
]);

/**
 * Minimal fixed-window rate limiter, in-process.
 *
 * P10.6: the function proxies an upstream fetch, so an unbounded caller could use
 * it to amplify traffic against the provider. The window is per client address and
 * deliberately simple: this is a guard against casual abuse, not a distributed
 * quota. Serverless instances are ephemeral, so the window resets on cold start
 * rather than being shared, which is why the limit is set generously.
 */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;

/**
 * P10.6: hard cap on the upstream body this function will buffer. The provider
 * page is a few hundred KB; 2 MiB is generous and still bounded. Exceeding it
 * falls back to the snapshot rather than buffering without limit.
 */
const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;
const rateBuckets = new Map();

function rateLimited(key) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { start: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

/**
 * Applies CORS headers for an allowed origin, or omits them entirely.
 *
 * @returns {boolean} Whether the origin is allowed.
 */
function applyCors(req, res) {
  const origin = req?.headers?.origin || req?.headers?.Origin || '';
  if (!origin) return true; // same-origin / non-browser caller
  const allowed = ALLOWED_ORIGINS.filter(Boolean).some((o) => origin.toLowerCase() === o.toLowerCase());
  if (!allowed) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  return true;
}

export default async function handler(req, res) {
  // Set required no-store caching headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Content-Type', 'application/json');

  // P10.6: CORS allowlist. A disallowed origin gets no CORS headers, so the
  // browser blocks the response rather than the server leaking data to it.
  if (!applyCors(req, res)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  // P10.6: GET-only. Vercel routes this as a serverless function, so a POST or
  // DELETE would otherwise reach the upstream fetch.
  const method = (req?.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // P10.6: rate limit before spending an upstream fetch.
  const clientKey = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown';
  if (rateLimited(String(clientKey).split(',')[0].trim())) {
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const nowIso = new Date().toISOString();

  try {
    // Attempt upstream fetch from stockanalysis.com with timeout
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 5000) : null;

    const response = await fetch(PROVIDER_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DuolingoValuationModel/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller ? controller.signal : undefined,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      return res.status(200).json({
        symbol: SYMBOL,
        price: FALLBACK_PRICE,
        asOf: FALLBACK_AS_OF,
        isOfficialClose: true,
        intradayPrice: null,
        provider: PROVIDER_NAME,
        retrievedAt: nowIso,
        status: 'fallback',
        error: `Upstream returned status ${response.status}`,
        source: {
          provider: PROVIDER_NAME,
          url: PROVIDER_URL,
        },
      });
    }

    // P10.6: the upstream body is BOUNDED before it is read. An unbounded
    // `response.text()` lets a hostile or malfunctioning upstream force this
    // function to buffer an arbitrary amount of memory per request, which is
    // exactly what the contract's "bounded" requirement rules out. A declared
    // content-length over the cap is refused up front; otherwise the stream is
    // read with a running byte budget and abandoned if it exceeds the cap.
    const declaredLength = Number(response.headers?.get?.('content-length') ?? NaN);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPSTREAM_BYTES) {
      return res.status(200).json({
        symbol: SYMBOL,
        price: FALLBACK_PRICE,
        asOf: FALLBACK_AS_OF,
        isOfficialClose: true,
        intradayPrice: null,
        provider: PROVIDER_NAME,
        retrievedAt: nowIso,
        status: 'fallback',
        error: 'Upstream body exceeded the size bound',
        source: { provider: PROVIDER_NAME, url: PROVIDER_URL },
      });
    }

    let html;
    if (typeof response.text === 'function' && typeof response.body?.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_UPSTREAM_BYTES) {
          try { await reader.cancel(); } catch { /* already closed */ }
          return res.status(200).json({
            symbol: SYMBOL,
            price: FALLBACK_PRICE,
            asOf: FALLBACK_AS_OF,
            isOfficialClose: true,
            intradayPrice: null,
            provider: PROVIDER_NAME,
            retrievedAt: nowIso,
            status: 'fallback',
            error: 'Upstream body exceeded the size bound',
            source: { provider: PROVIDER_NAME, url: PROVIDER_URL },
          });
        }
        chunks.push(value);
      }
      const merged = new Uint8Array(total);
      let at = 0;
      for (const c of chunks) { merged.set(c, at); at += c.byteLength; }
      html = new TextDecoder('utf-8').decode(merged);
    } else {
      html = await response.text();
      // Belt-and-braces for transports without a readable stream.
      if (typeof html === 'string' && html.length > MAX_UPSTREAM_BYTES) {
        return res.status(200).json({
          symbol: SYMBOL,
          price: FALLBACK_PRICE,
          asOf: FALLBACK_AS_OF,
          isOfficialClose: true,
          intradayPrice: null,
          provider: PROVIDER_NAME,
          retrievedAt: nowIso,
          status: 'fallback',
          error: 'Upstream body exceeded the size bound',
          source: { provider: PROVIDER_NAME, url: PROVIDER_URL },
        });
      }
    }

    // Parse price and metadata from stockanalysis HTML
    let extractedPrice = null;
    const priceMatch = html.match(/"price":\s*([0-9]+\.[0-9]+)/) ||
                       html.match(/class="[^"]*text-4xl[^"]*font-bold[^"]*">([0-9]+\.[0-9]+)</);

    if (priceMatch && priceMatch[1]) {
      const p = parseFloat(priceMatch[1]);
      if (Number.isFinite(p) && p > 0) {
        extractedPrice = p;
      }
    }

    if (extractedPrice === null) {
      return res.status(200).json({
        symbol: SYMBOL,
        price: FALLBACK_PRICE,
        asOf: FALLBACK_AS_OF,
        isOfficialClose: true,
        intradayPrice: null,
        provider: PROVIDER_NAME,
        retrievedAt: nowIso,
        status: 'fallback',
        error: 'Price pattern not found in upstream HTML',
        source: {
          provider: PROVIDER_NAME,
          url: PROVIDER_URL,
        },
      });
    }

    // Upstream date parsing: fail-closed if date stamp cannot be verified
    const parsedAsOf = parseUpstreamDate(html);
    if (!parsedAsOf) {
      return res.status(200).json({
        symbol: SYMBOL,
        price: FALLBACK_PRICE,
        asOf: FALLBACK_AS_OF,
        isOfficialClose: true,
        intradayPrice: null,
        provider: PROVIDER_NAME,
        retrievedAt: nowIso,
        status: 'fallback',
        error: 'Upstream date stamp could not be parsed; falling back to snapshot close',
        source: {
          provider: PROVIDER_NAME,
          url: PROVIDER_URL,
        },
      });
    }

    // Case-insensitive market state detection (handles "Market open", "Market Open", etc.)
    const isMarketOpen = /market\s+open/i.test(html) ||
                         /extended\s+hours/i.test(html) ||
                         /pre-market/i.test(html) ||
                         /after\s+hours/i.test(html);
    const isOfficialClose = !isMarketOpen;

    if (!isOfficialClose) {
      // P10.9: In-hours market session. Resolve the last completed close from
      // upstream (prior-close field + its date); unresolvable -> snapshot fallback.
      const prior = parseUpstreamPriorClose(html);
      if (prior.price !== null && prior.asOf !== null) {
        return res.status(200).json({
          symbol: SYMBOL,
          price: prior.price,
          asOf: prior.asOf,
          isOfficialClose: true,
          intradayPrice: null,
          provider: PROVIDER_NAME,
          retrievedAt: nowIso,
          status: 'live_close',
          source: {
            provider: PROVIDER_NAME,
            url: PROVIDER_URL,
          },
        });
      }

      return res.status(200).json({
        symbol: SYMBOL,
        price: FALLBACK_PRICE,
        asOf: FALLBACK_AS_OF,
        isOfficialClose: true,
        intradayPrice: null,
        provider: PROVIDER_NAME,
        retrievedAt: nowIso,
        status: 'fallback',
        error: 'In-hours prior close could not be resolved from upstream; falling back to snapshot close',
        source: {
          provider: PROVIDER_NAME,
          url: PROVIDER_URL,
        },
      });
    }

    // Case: Official completed close
    return res.status(200).json({
      symbol: SYMBOL,
      price: extractedPrice,
      asOf: parsedAsOf,
      isOfficialClose: true,
      intradayPrice: null,
      provider: PROVIDER_NAME,
      retrievedAt: nowIso,
      status: 'live_close',
      source: {
        provider: PROVIDER_NAME,
        url: PROVIDER_URL,
      },
    });
  } catch (err) {
    // Network / abort / parse error -> clean 200 fallback response
    return res.status(200).json({
      symbol: SYMBOL,
      price: FALLBACK_PRICE,
      asOf: FALLBACK_AS_OF,
      isOfficialClose: true,
      intradayPrice: null,
      provider: PROVIDER_NAME,
      retrievedAt: nowIso,
      status: 'fallback',
      error: err?.message || 'Upstream fetch failed',
      source: {
        provider: PROVIDER_NAME,
        url: PROVIDER_URL,
      },
    });
  }
}
