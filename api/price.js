/**
 * Vercel Serverless Function — /api/price (Phase 6R2 Task P6R2.5 — Finding G).
 *
 * Server-side proxy for live market share price retrieval from stockanalysis.com.
 * Bypasses browser CORS restrictions while strictly enforcing:
 *  1. Provider pinning: stockanalysis.com (S&P Global-sourced data).
 *  2. Zero secrets / zero API keys policy.
 *  3. `Cache-Control: no-store` header passthrough.
 *  4. Close-only staleness gate: intraday quotes omit lastOfficialClose so client math
 *     remains anchored to the audited snapshot driver close ($157.85).
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

export default async function handler(req, res) {
  // Set required no-store caching headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Content-Type', 'application/json');

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

    const html = await response.text();

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
      // Case: Intraday print / active market session
      // Spec B.3/C: lastOfficialClose is omitted so the client engine anchors verdict math
      // strictly to the snapshot close ($157.85), never the live quote.
      return res.status(200).json({
        symbol: SYMBOL,
        price: extractedPrice, // intraday quote
        asOf: parsedAsOf,
        isOfficialClose: false,
        lastOfficialClose: undefined,
        lastOfficialCloseAsOf: undefined,
        intradayPrice: extractedPrice,
        provider: PROVIDER_NAME,
        retrievedAt: nowIso,
        status: 'intraday',
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
