/**
 * Formatting utilities for financial presentation.
 *
 * Universal rule (spec §3.2, §3.4):
 *  - Currency, percentages, compact notation, and EST/MKT/computed markings.
 *  - Fail-closed on NaN / Infinity (returns "—", never renders NaN).
 *  - Pure functions: zero DOM, zero fetch, zero Date.now, zero Math.random.
 *
 * @module src/ui/format
 */

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
    return '—';
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
    return '—';
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
    return '—';
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
  const badgeHtml = estSuffix('', 'MKT');
  const details = [];
  if (asOf) details.push(asOf);
  if (provider) details.push(provider);
  const detailText = details.length > 0 ? ` · ${details.join(' · ')}` : '';

  if (url) {
    return `<span class="mkt-badge-wrapper"><a href="${url}" target="_blank" rel="noopener noreferrer" class="mkt-source-link">${badgeHtml}<span class="mkt-details">${detailText}</span></a></span>`;
  }
  return `<span class="mkt-badge-wrapper">${badgeHtml}<span class="mkt-details">${detailText}</span></span>`;
}

export default Object.freeze({
  usd,
  percent,
  compact,
  estSuffix,
  mktBadge,
});
