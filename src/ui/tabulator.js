/**
 * Vendor ESM entry point for Tabulator.
 *
 * Imports the pinned Tabulator ESM release asset from vendor/tabulator/ without modification.
 *
 * @module src/ui/tabulator
 */

import { Tabulator, TabulatorFull } from '../../vendor/tabulator/tabulator_esm.min.js';

export { Tabulator, TabulatorFull };
export default TabulatorFull;
