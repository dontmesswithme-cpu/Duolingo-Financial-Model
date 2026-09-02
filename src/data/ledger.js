/**
 * Source-ledger module for runtime accuracy validation.
 *
 * Provides the verified SEC and market citation URLs recorded in docs/sources/sources.md.
 * Allows the browser runtime and test environments to enforce the Accuracy Gate
 * without throwing SOURCE_NOT_IN_LEDGER errors during historical loading.
 *
 * @module src/data/ledger
 */

import { LEDGER_URLS } from './constants.js';

/**
 * Regular expression matching `- **url**: <url>` lines in ledger markdown.
 * @type {RegExp}
 */
const URL_LINE = /^-\s+\*\*url\*\*:\s*(\S+)\s*$/gm;

/**
 * Parses markdown text to extract citation URLs.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
export function parseLedgerText(text) {
  const urls = new Set();
  if (typeof text !== 'string') return urls;
  let match;
  URL_LINE.lastIndex = 0;
  while ((match = URL_LINE.exec(text)) !== null) {
    urls.add(match[1]);
  }
  return urls;
}

export { LEDGER_URLS };
export default LEDGER_URLS;
