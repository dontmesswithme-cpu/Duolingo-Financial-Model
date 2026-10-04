/**
 * Vendor ESM entry point for Tabulator.
 *
 * Imports the pinned Tabulator ESM release asset from vendor/tabulator/ without modification.
 *
 * F-UI-6 runtime-style allowlist: Tabulator is the SOLE permitted runtime
 * source of `[style]` attributes in the live DOM (column widths, frozen
 * offsets, virtual-DOM positioning). Authored source (`index.html`,
 * `src/ui/*.js`) stays zero-inline-style; see `docs/conventions.md`
 * "Inline Styles Policy" and `tests/ui.inline_styles.test.js`.
 *
 * @module src/ui/tabulator
 */

import { Tabulator, TabulatorFull } from '../../vendor/tabulator/tabulator_esm.min.js';

export { Tabulator, TabulatorFull };
export default TabulatorFull;
