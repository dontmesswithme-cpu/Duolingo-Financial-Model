/**
 * P0.3 Artifact Contract tests — constants integrity (`src/data/constants.js`).
 *
 * Proves the single source of truth is complete, internally consistent, and
 * consistent with the modules that consume it: the units registry covers the
 * schema's legal units, scenario names match the spec, the loader's manifest
 * and schema mapping stay aligned, and every registry value is deep-frozen so
 * no consumer can mutate shared configuration.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  UNIT_KEYS,
  SCENARIO_NAMES,
  DEFAULT_SCENARIO,
  EST_BADGE_LABEL,
  FISCAL_CALENDAR_NOTES,
  SOURCE_LEDGER_REQUIRED,
  HISTORICAL_DIR,
  HISTORICAL_DATASETS,
  UNITS,
} from '../src/data/constants.js';
import { SCHEMAS } from '../src/data/schema.js';
import { SCHEMA_BY_DATASET, HISTORICAL_DATASETS as LOADER_MANIFEST } from '../src/data/loader.js';

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

describe('Units registry', () => {
  test('covers exactly the schema-declared units', () => {
    const schemaUnits = SCHEMAS.historicalStatement.fields.units.enum;
    assert.deepEqual([...UNIT_KEYS].sort(), [...schemaUnits].sort());
  });

  test('UNIT_KEYS is derived from UNITS (no drift possible)', () => {
    assert.deepEqual([...UNIT_KEYS], Object.keys(UNITS));
  });

  test('every unit exposes a positive finite scale and a string label', () => {
    for (const key of UNIT_KEYS) {
      const unit = UNITS[key];
      assert.equal(typeof unit.scale, 'number', `scale for ${key}`);
      assert.ok(Number.isFinite(unit.scale) && unit.scale > 0, `scale for ${key}`);
      assert.equal(typeof unit.label, 'string', `label for ${key}`);
    }
  });
});

describe('Scenario names', () => {
  test('match the spec exactly: bear | base | bull', () => {
    assert.deepEqual([...SCENARIO_NAMES], ['bear', 'base', 'bull']);
  });

  test('DEFAULT_SCENARIO is a member and is the neutral case', () => {
    assert.ok(SCENARIO_NAMES.includes(DEFAULT_SCENARIO));
    assert.equal(DEFAULT_SCENARIO, 'base');
  });

  test('the app scaffold boots on DEFAULT_SCENARIO', async () => {
    const { createApp } = await import('../src/app.js');
    const { createTabRoot } = await import('./_dom_stub.js');
    const TAB_KEYS = ['cover', 'assumptions', 'historicals', 'schedules', 'projections', 'valuation', 'summary', 'sensitivity'];
    const { root } = createTabRoot(TAB_KEYS);
    const app = createApp({
      data: Object.freeze({ loadHistorical: () => {} }),
      engine: Object.freeze({}),
      root,
      now: () => 0,
    });
    assert.equal(app.state().scenario, DEFAULT_SCENARIO);
    app.dispose();
  });
});

describe('Estimate marking constant', () => {
  test('EST_BADGE_LABEL is a non-empty visible label', () => {
    assert.equal(typeof EST_BADGE_LABEL, 'string');
    assert.ok(EST_BADGE_LABEL.length > 0);
    assert.equal(EST_BADGE_LABEL.trim(), EST_BADGE_LABEL);
  });
});

describe('Fiscal calendar notes', () => {
  test('cover the transcription-honesty facts', () => {
    const requiredKeys = [
      'fiscalYearEnd',
      'annualFilings',
      'quarterlyIncome',
      'quarterlyCashFlow',
      'ttm',
    ];
    for (const key of requiredKeys) {
      const note = FISCAL_CALENDAR_NOTES[key];
      assert.equal(typeof note, 'string', `note ${key}`);
      assert.ok(note.length > 0, `note ${key} is non-empty`);
    }
  });
});

describe('Ledger enforcement flag', () => {
  test('SOURCE_LEDGER_REQUIRED is enabled from P0.3 on', () => {
    assert.equal(SOURCE_LEDGER_REQUIRED, true);
  });
});


describe('Dataset manifest', () => {
  test('matches the spec §3.1 dataset list', () => {
    assert.deepEqual([...HISTORICAL_DATASETS], ['income', 'balance', 'cashflow', 'kpis']);
  });

  test('the loader consumes the same manifest (single source of truth)', () => {
    assert.equal(LOADER_MANIFEST, HISTORICAL_DATASETS);
  });

  test('every manifest entry maps to a schema and every mapping is bijective', () => {
    assert.deepEqual(Object.keys(SCHEMA_BY_DATASET), [...HISTORICAL_DATASETS]);
    for (const name of HISTORICAL_DATASETS) {
      assert.ok(SCHEMA_BY_DATASET[name] in SCHEMAS, `${name} → known schema`);
    }
  });

  test('HISTORICAL_DIR is a trailing-slash relative path', () => {
    assert.ok(HISTORICAL_DIR.endsWith('/'));
    assert.ok(!path.isAbsolute(HISTORICAL_DIR));
  });
});

describe('Freeze integrity', () => {
  test('every registry value is frozen so consumers cannot mutate configuration', () => {
    assert.ok(Object.isFrozen(UNITS));
    assert.ok(Object.isFrozen(SCENARIO_NAMES));
    assert.ok(Object.isFrozen(HISTORICAL_DATASETS));
    assert.ok(Object.isFrozen(FISCAL_CALENDAR_NOTES));
    for (const key of Object.keys(UNITS)) {
      assert.ok(Object.isFrozen(UNITS[key]), `UNITS.${key}`);
    }
  });
});

describe('Config-values grep gate', () => {
  test('no configuration values are defined outside constants.js under src/', () => {
    // Per the reviewer's binding ruling (inbox_ds.md, 2026-08-31): the gate is
    // scoped to configuration values — thresholds, scale factors, limits, URL
    // fragments. Structural literals (indices, length checks, row numbering,
    // regex quantifiers) are exempt.
    const forbidden = [
      // URL fragments / paths configured elsewhere.
      /['"`]https?:\/\//,
      /['"`]src\/data\//,
      // Hardcoded scenario names outside constants.js.
      /['"`]bear['"`]/,
      /['"`]bull['"`]/,
    ];
    const files = (function walk(dir) {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) =>
          entry.isDirectory()
            ? walk(path.join(dir, entry.name))
            : entry.name.endsWith('.js')
              ? [path.join(dir, entry.name)]
              : [],
        );
    })(srcDir);

    /**
     * Strips block (JSDoc) comments and whole-line `//` comments before
     * scanning. The gate targets *code*, and documentation prose legitimately
     * names values like `bear` — a comment mention is not a hardcoded value.
     * @param {string} source
     * @returns {string}
     */
    function stripComments(source) {
      return source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^[ \t]*\/\/.*$/gm, ' ');
    }

    for (const file of files) {
      if (file.endsWith('constants.js')) continue;
      const source = stripComments(fs.readFileSync(file, 'utf8'));
      for (const pattern of forbidden) {
        assert.ok(
          !pattern.test(source),
          `${path.relative(srcDir, file)} matches forbidden config pattern ${pattern}`,
        );
      }
    }
  });
});
