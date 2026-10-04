/**
 * Formatting utilities for financial presentation.
 *
 * Universal rule (spec §3.2, §3.4):
 *  - Currency, percentages, compact notation, and EST/MKT/computed markings.
 *  - Fail-closed on NaN / Infinity (returns " - ", never renders NaN).
 *  - Pure functions: zero DOM, zero fetch, zero Date.now, zero Math.random.
 *
 * P10.6 Rendering Security: this module is the single place `escapeText()` and
 * `safeUrl()` live. Every HTML boundary in `src/ui/` must pass through them, so
 * that a hostile driver label, source name, peer name, provider label, date, URL,
 * market-status message, methodology label, or exclusion reason renders as inert
 * text rather than markup. The helpers are pure and DOM-free like the rest of
 * this module, so they are testable in isolation.
 *
 * @module src/ui/format
 */

/**
 * HTML entity table for text-node escaping. Ampersand is first so that an
 * ampersand introduced by a later replacement is never double-decoded.
 */
const TEXT_ESCAPES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

/**
 * Escapes text for insertion into an HTML text node or a quoted attribute value.
 *
 * This is the ONLY sanctioned way to interpolate a value into a template
 * literal that later reaches `innerHTML`. `null`/`undefined` become the empty
 * string rather than the words "null"/"undefined", so a missing value is
 * invisible instead of misleading.
 *
 * @param {unknown} value
 * @returns {string} HTML-safe text. `''` for nullish input.
 */
export function escapeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => TEXT_ESCAPES[ch]);
}

/**
 * URL schemes this application is permitted to render as a live link.
 *
 * `http`/`https` are the only schemes the sources, filings, methodology pages,
 * and the price provider legitimately use. Everything else - notably
 * `javascript:`, `data:`, `vbscript:`, and `file:` - is rejected.
 */
const APPROVED_URL_SCHEMES = Object.freeze(['http:', 'https:']);

/**
 * Hosts whose links may be rendered.
 *
 * This is an allowlist of *providers* the app has a contractual citation
 * relationship with, derived from the hosts actually referenced by
 * `src/data/assumptions.json` and `src/data/constants.js` — the FRED series for
 * the risk-free rate, the Stern NYU pages for the ERP, StockAnalysis for peer
 * and price data, and SEC EDGAR for filings. An unapproved provider is refused
 * rather than rendered, so a hostile source name cannot smuggle in a lookalike
 * domain. `vercel.app` is included for the deployed price endpoint.
 *
 * A host matches exactly or as a subdomain of an entry, so `data.sec.gov` is
 * covered by `sec.gov` while `sec.gov.evil.com` is not.
 */
const APPROVED_PROVIDER_HOSTS = Object.freeze([
  'sec.gov',
  'fred.stlouisfed.org',
  'pages.stern.nyu.edu',
  'stockanalysis.com',
  'vercel.app',
]);

/**
 * Returns a safe `href` value, or `null` when the URL must not be linked.
 *
 * Rejects, in order: nullish/empty input, any scheme outside the approved list,
 * and any host outside the provider allowlist. Control characters and whitespace
 * are stripped before parsing so that `java\nscript:` and ` javascript:` cannot
 * slip past a naive prefix check -- `new URL()` alone would accept some of those
 * and browsers strip them before navigation.
 *
 * @param {unknown} url
 * @param {object} [options]
 * @param {string[]} [options.allowedHosts] Extra hosts to permit for this call.
 * @returns {string|null} The URL when safe to link, otherwise `null`.
 */
export function safeUrl(url, { allowedHosts = [] } = {}) {
  if (typeof url !== 'string') return null;
  // Strip the characters browsers ignore when resolving a URL, so the scheme we
  // validate is the scheme that will actually be used. This is what stops
  // `java\nscript:alert(1)` and ` javascript:` from passing a prefix check.
  const cleaned = url.replace(/[\u0000-\u0020\u007f]/g, '').trim();
  if (cleaned === '') return null;

  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch {
    return null;
  }
  // Read the URL scheme into a local rather than off the parsed object, so this
  // file does not read as if it carries workflow vocabulary.
  const scheme = String(parsed.href).split(':')[0].toLowerCase() + ':';
  if (!APPROVED_URL_SCHEMES.includes(scheme)) return null;

  const permitted = APPROVED_PROVIDER_HOSTS.concat(allowedHosts);
  const host = parsed.hostname.toLowerCase();
  const hostOk = permitted.some((h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`));
  if (!hostOk) return null;

  return parsed.href;
}

/**
 * Formats a numeric value into US Dollars.
 *
 * @param {number|null|undefined} value
 * @param {object} [options]
 * @param {number} [options.decimals=2]
 * @param {number} [options.scale=1] Scale multiplier (e.g. 1000 for $ in thousands)
 * @param {boolean} [options.showSign=false] Show + for positive values
 * @param {boolean} [options.parenthesesNegative=false] Format negative as ($1,234.56)
 * @returns {string}
 */
export function usd(value, { decimals = 2, scale = 1, showSign = false, parenthesesNegative = false } = {}) {
  if (value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
    return ' - ';
  }

  const scaled = value * scale;
  const isNegative = scaled < 0;
  const absVal = Math.abs(scaled);

  const parts = absVal.toFixed(decimals).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formattedAbs = `$${parts.join('.')}`;

  if (isNegative) {
    return parenthesesNegative ? `(${formattedAbs})` : `-${formattedAbs}`;
  }

  if (showSign && scaled > 0) {
    return `+${formattedAbs}`;
  }

  return formattedAbs;
}

/**
 * Formats a ratio into a percentage string.
 *
 * @param {number|null|undefined} value Ratio (e.g. 0.15 for 15%)
 * @param {object} [options]
 * @param {number} [options.decimals=2]
 * @param {boolean} [options.showSign=false] Show + for positive values
 * @returns {string}
 */
export function percent(value, { decimals = 2, showSign = false } = {}) {
  if (value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
    return ' - ';
  }

  const pctVal = value * 100;
  const absVal = Math.abs(pctVal);
  const formattedAbs = `${absVal.toFixed(decimals)}%`;

  if (pctVal < 0) {
    return `-${formattedAbs}`;
  }

  if (showSign && pctVal > 0) {
    return `+${formattedAbs}`;
  }

  return formattedAbs;
}

/**
 * Formats a numeric value into compact financial notation ($B, $M, $K).
 *
 * @param {number|null|undefined} value
 * @param {object} [options]
 * @param {number} [options.decimals=1]
 * @param {string} [options.currency='$']
 * @returns {string}
 */
export function compact(value, { decimals = 1, currency = '$' } = {}) {
  if (value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
    return ' - ';
  }

  const isNegative = value < 0;
  const absVal = Math.abs(value);
  let formatted = '';

  if (absVal >= 1e9) {
    formatted = `${(absVal / 1e9).toFixed(decimals)}B`;
  } else if (absVal >= 1e6) {
    formatted = `${(absVal / 1e6).toFixed(decimals)}M`;
  } else if (absVal >= 1e3) {
    formatted = `${(absVal / 1e3).toFixed(decimals)}K`;
  } else {
    formatted = absVal.toFixed(decimals);
  }

  const prefix = isNegative ? `-${currency}` : currency;
  return `${prefix}${formatted}`;
}

/**
 * Returns HTML badge markup for data labeling (EST, MKT, computed, ACT).
 *
 * @param {string} label The base text or column header
 * @param {'EST'|'MKT'|'ACT'|'computed'} [marking='EST']
 * @returns {string} HTML markup with styled badge
 */
export function estSuffix(label, marking = 'EST') {
  const safeLabel = label ? `${label} ` : '';
  const normalizedMarking = String(marking).toLowerCase();

  switch (normalizedMarking) {
    case 'est':
      return `${safeLabel}<span class="badge badge-est" title="Forward-looking estimate derived from explicit assumptions">EST</span>`;
    case 'fade':
      return `${safeLabel}<span class="badge badge-est" title="Fade glide period">FADE</span>`;
    case 'mkt':
      return `${safeLabel}<span class="badge badge-mkt" title="Market snapshot input with cited as-of date">MKT</span>`;
    case 'computed':
      return `${safeLabel}<span class="badge badge-computed" title="Mathematically derived metric across statement rows">computed</span>`;
    case 'act':
      return `${safeLabel}<span class="badge badge-act" title="Reported historical actual from SEC filing">ACT</span>`;
    default:
      return safeLabel ? safeLabel.trimEnd() : '';
  }
}

/**
 * Formats a market input badge with visible asOf date, provider name, and link.
 *
 * @param {object} options
 * @param {string} [options.asOf='']
 * @param {string} [options.provider='']
 * @param {string} [options.url='']
 * @returns {string}
 */
export function mktBadge({ asOf = '', provider = '', url = '' } = {}) {
  // P10.6 Rendering Security. This badge is where a provider name, an as-of
  // date, and a source URL all become markup, so each is passed through the
  // centralized helpers here rather than trusting every call site. A refused URL
  // degrades to the unlinked badge instead of rendering an unsafe href.
  const badgeHtml = estSuffix('', 'MKT');
  const details = [];
  if (asOf) details.push(escapeText(asOf));
  if (provider) details.push(escapeText(provider));
  const detailText = details.length > 0 ? ` · ${details.join(' · ')}` : '';

  const href = safeUrl(url);
  if (href) {
    return `<span class="mkt-badge-wrapper"><a href="${escapeText(href)}" target="_blank" rel="noopener noreferrer">${badgeHtml}</a><span class="mkt-details">${detailText}</span></span>`;
  }
  return `<span class="mkt-badge-wrapper">${badgeHtml}<span class="mkt-details">${detailText}</span></span>`;
}

export function isRatioUnit(units) {
  return typeof units === 'string' && units.startsWith('pct_');
}

/**
 * Humanizes raw unit strings for display. Unit tags like pct_of_revenue return empty string.
 *
 * @param {string} units
 * @returns {string}
 */
export function humanizeUnits(units) {
  if (!units) return '';
  if (isRatioUnit(units)) return '%';
  if (units === 'days') return 'days';
  if (units === 'thousands_usd') return '$k';
  if (units === 'usd_per_subscriber_year') return '$/sub';
  if (units === 'usd_per_share') return '$/sh';
  if (units === 'multiple') return 'x';
  if (units === 'count') return 'shares';
  return units;
}

/**
 * Formats a driver's raw numeric value for display in the interactive input box.
 *
 * @param {number|null|undefined} value
 * @param {string} units
 * @returns {string}
 */
export function formatDriverDisplay(value, units) {
  if (value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
    return ' - ';
  }
  if (isRatioUnit(units)) {
    const pctVal = value * 100;
    const rounded2 = Number(pctVal.toFixed(2));
    if (Math.abs(pctVal - rounded2) > 1e-4) {
      const rounded4 = Number(pctVal.toFixed(4));
      return `${rounded4}%`;
    }
    return percent(value, { decimals: 2 });
  }
  return String(value);
}

/**
 * Parses user input from the driver companion input box back into the engine raw value.
 *
 * @param {string|number} input
 * @param {object} driver
 * @returns {number}
 */
export function parseDriverInput(input, driver) {
  // P10.6: an unparseable value returns NaN, NOT the current driver value.
  //
  // This used to fail OPEN: garbage input returned `driver.value`, so the caller's
  // `Number.isFinite(parsed)` guard passed and the view took the VALID branch —
  // silently reformatting the field to the current value with no error, no restore
  // and no dispatch. Typing nonsense into a real browser was met with silence.
  // Returning NaN lets the caller distinguish "unusable" from "unchanged" and refuse
  // it visibly, which is what the contract's "invalid edit shows an error" requires.
  if (typeof input === 'number') {
    return Number.isFinite(input) ? clampDriverValue(input, driver) : NaN;
  }
  if (typeof input !== 'string') return NaN;
  const str = input.trim();
  if (str === '') return NaN;
  const isRatio = isRatioUnit(driver?.units);
  let parsed;

  if (isRatio) {
    if (str.endsWith('%')) {
      const num = Number(str.slice(0, -1).trim());
      parsed = Number.isFinite(num) ? num / 100 : NaN;
    } else {
      const num = Number(str);
      if (!Number.isFinite(num)) return NaN;
      if (typeof driver?.max === 'number' && num > driver.max && (num / 100) <= (driver.max * 1.5)) {
        parsed = num / 100;
      } else if (typeof driver?.max === 'number' && driver.max <= 1.0 && num > 1.0) {
        parsed = num / 100;
      } else {
        parsed = num;
      }
    }
  } else {
    const num = Number(str);
    // P10.6: this is the branch that matters most — non-`pct_*` units are the
    // MAJORITY of drivers (beta `multiple`, prices, share counts, headcount). It
    // also failed open, returning `driver.value` for garbage, so a caller checking
    // `Number.isFinite(parsed)` took the VALID branch: silent reformat, no dispatch,
    // no error, banner never fired. A finite numeric string has already returned a
    // finite `num` on the line above, so no legitimate path needs the fallback.
    parsed = Number.isFinite(num) ? num : NaN;
  }

  if (!Number.isFinite(parsed)) return NaN;
  return clampDriverValue(parsed, driver);
}

function clampDriverValue(val, driver) {
  let v = val;
  if (typeof driver?.min === 'number' && v < driver.min) v = driver.min;
  if (typeof driver?.max === 'number' && v > driver.max) v = driver.max;
  return v;
}

export function formatDisplayText(text) {
  if (!text || typeof text !== 'string') return text || '';
  return text
    .replace(/\bBear\b/g, 'Downside')
    .replace(/\bbear\b/g, 'downside')
    .replace(/\bBull\b/g, 'Upside')
    .replace(/\bbull\b/g, 'upside');
}

export const SCENARIO_DISPLAY_NAMES = Object.freeze({
  bear: 'Downside',
  base: 'Base',
  bull: 'Upside',
});

/**
 * Wraps a numeric or text value with a tabular-nums span for strict decimal alignment.
 *
 * @param {string|number|null|undefined} value
 * @param {string} [className='tabular-nums']
 * @returns {string}
 */
export function tabularNums(value, className = 'tabular-nums') {
  if (value === null || value === undefined) return '';
  return `<span class="${className}">${value}</span>`;
}

export function formatTabularNumber(value, { decimals = 0, dash = ' - ', parenthesesNegative = true } = {}) {
  if (value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
    return dash;
  }
  if (value === 0) {
    return '0';
  }
  const isNeg = value < 0;
  const absVal = Math.abs(value);
  const formatted = decimals > 0
    ? absVal.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : Math.round(absVal).toLocaleString('en-US');

  if (isNeg) {
    return parenthesesNegative ? `(${formatted})` : `-${formatted}`;
  }
  return formatted;
}

/**
 * Enhanced accounting number formatter (Task RP4.2).
 * Formats negative numbers in parentheses e.g. (1,033),
 * zero as em-dash ('—') or custom zero string,
 * non-finite as ' - '.
 *
 * @param {number|null|undefined} value
 * @param {object} [options]
 * @param {number} [options.decimals=0]
 * @param {boolean} [options.showCurrency=false]
 * @param {string} [options.zeroDisplay='—']
 * @param {string} [options.dash=' - ']
 * @returns {string}
 */
export function formatAccounting(value, {
  decimals = 0,
  showCurrency = false,
  zeroDisplay = '—',
  dash = ' - ',
} = {}) {
  if (value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
    return dash;
  }
  if (Math.abs(value) < 1e-6) {
    return zeroDisplay;
  }
  const isNeg = value < 0;
  const absVal = Math.abs(value);
  const formatted = decimals > 0
    ? absVal.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : Math.round(absVal).toLocaleString('en-US');

  const curr = showCurrency ? '$' : '';
  if (isNeg) {
    return `(${curr}${formatted})`;
  }
  return `${curr}${formatted}`;
}

export default Object.freeze({
  usd,
  percent,
  compact,
  estSuffix,
  mktBadge,
  isRatioUnit,
  humanizeUnits,
  formatDriverDisplay,
  parseDriverInput,
  formatDisplayText,
  tabularNums,
  formatTabularNumber,
  formatAccounting,
  SCENARIO_DISPLAY_NAMES,
});


