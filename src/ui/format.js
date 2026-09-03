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
  if (!units || isRatioUnit(units)) return '';
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
    return '—';
  }
  if (isRatioUnit(units)) {
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
  if (typeof input === 'number') {
    return clampDriverValue(input, driver);
  }
  if (!input || typeof input !== 'string') return driver?.value ?? 0;
  const str = input.trim();
  const isRatio = isRatioUnit(driver?.units);
  let parsed;

  if (isRatio) {
    if (str.endsWith('%')) {
      const num = Number(str.slice(0, -1).trim());
      parsed = Number.isFinite(num) ? num / 100 : driver?.value;
    } else {
      const num = Number(str);
      if (!Number.isFinite(num)) return driver?.value ?? 0;
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
    parsed = Number.isFinite(num) ? num : driver?.value;
  }

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
  SCENARIO_DISPLAY_NAMES,
});


