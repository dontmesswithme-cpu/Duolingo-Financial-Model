/**
 * Source-ledger reader for tests.
 *
 * `docs/sources/sources.md` is the anchor of the Accuracy Gate: every
 * `source.url` in the data layer must join to a ledger entry. The ledger is
 * markdown for humans, so the join key is kept on a single greppable
 * `- **url**: …` line (see `docs/sources/README.md` §4). This helper turns those
 * lines back into the `Set<string>` that `loadHistorical({ ledger })` consumes —
 * the same set the production boot path builds, so tests exercise the real
 * gate rather than a hand-maintained copy.
 *
 * Convention: files prefixed with `_` are helpers, not test files, so the Node
 * test runner does not collect them.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Absolute path of the project's source ledger.
 * @type {string}
 */
export const LEDGER_PATH = fileURLToPath(new URL('../docs/sources/sources.md', import.meta.url));

/**
 * Matches the single-line join key of a ledger entry.
 * @type {RegExp}
 */
const URL_LINE = /^-\s+\*\*url\*\*:\s*(\S+)\s*$/gm;

/**
 * Reads every citation URL recorded in the source ledger.
 *
 * @param {string} [ledgerPath] Ledger location; defaults to the project ledger.
 * @returns {Set<string>} The ledger URL set, in document order.
 * @throws {Error} When the ledger is unreadable — a missing ledger is never a
 *   silent pass, because the gate fails closed.
 */
export function readLedgerUrls(ledgerPath = LEDGER_PATH) {
  const text = fs.readFileSync(ledgerPath, 'utf8');
  /** @type {Set<string>} */
  const urls = new Set();
  let match;
  URL_LINE.lastIndex = 0;
  while ((match = URL_LINE.exec(text)) !== null) {
    urls.add(match[1]);
  }
  if (urls.size === 0) {
    throw new Error(`No \`- **url**:\` entries found in ledger: ${ledgerPath}`);
  }
  return urls;
}

/**
 * Reads the ledger as an array of `{ url }` objects — the alternative shape
 * accepted by `auditDataset`, exercised by the unit-level gate tests.
 *
 * @param {string} [ledgerPath]
 * @returns {Array<{url: string}>}
 */
export function readLedgerEntries(ledgerPath = LEDGER_PATH) {
  return [...readLedgerUrls(ledgerPath)].map((url) => ({ url }));
}
