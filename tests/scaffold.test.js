/**
 * P0.1 Artifact Contract gates  -  repository scaffolding integrity probes.
 *
 * These are the mechanical, greppable invariants of the P0.1 contract that unit
 * tests on behaviour alone cannot prove:
 *   - `index.html` carries all eight tab anchors in spec order (§3.4).
 *   - `src/app.js` never reads the wall clock (injected-clock purity rule).
 *   - No bare `throw new Error()` anywhere in `src/`.
 *   - `package.json` carries zero runtime dependencies.
 *   - `src/data/loader.js` fails loudly and completely on unreadable data.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadHistorical, HISTORICAL_DATASETS } from '../src/data/loader.js';
import { DataValidationError } from '../src/data/errors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

/**
 * The eight model tabs, in the exact order mandated by `docs/spec.md` §3.4.
 * @type {ReadonlyArray<string>}
 */
const EXPECTED_TABS = Object.freeze([
  'cover',
  'assumptions',
  'historicals',
  'schedules',
  'projections',
  'valuation',
  'summary',
  'sensitivity',
]);

/**
 * @param {string} relativePath
 * @returns {string}
 */
function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

/**
 * @param {string} sourceRoot
 * @returns {string[]} Paths of every `.js` file under `sourceRoot`.
 */
function collectSourceFiles(sourceRoot) {
  const absolute = path.join(repoRoot, sourceRoot);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}

/**
 * @param {string} html
 * @param {string} tagName
 * @param {string} markerAttribute
 * @returns {string[]} `data-tab` keys in document order.
 */
function extractTabKeys(html, tagName, markerAttribute) {
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*\\b${markerAttribute}\\b[^>]*>`, 'g');
  const keys = [];
  for (const [tag] of html.matchAll(tagPattern)) {
    const key = /\bdata-tab(?:-link|-pane)?="([^"]+)"/.exec(tag) || /\bdata-tab="([^"]+)"/.exec(tag);
    assert.ok(key, `tab element is missing a data-tab key: ${tag}`);
    keys.push(key[1]);
  }
  return keys;
}

describe('index.html  -  8-tab shell (spec §3.4)', () => {
  const html = readRepoFile('index.html');

  test('declares all eight tab controls in the mandated order', () => {
    assert.deepEqual(extractTabKeys(html, 'button', 'data-tab-link'), [...EXPECTED_TABS]);
  });

  test('declares all eight tab panes in the same order', () => {
    assert.deepEqual(extractTabKeys(html, 'section', 'data-tab-pane'), [...EXPECTED_TABS]);
  });

  test('wires every control to its pane via aria-controls / id', () => {
    const controlPattern = /<button\b[^>]*\bdata-tab-link\b[^>]*>/g;
    const panePattern = /<section\b[^>]*\bdata-tab-pane\b[^>]*>/g;

    const controls = [...html.matchAll(controlPattern)].map(
      ([tag]) => /\baria-controls="([^"]+)"/.exec(tag)[1],
    );
    const panes = [...html.matchAll(panePattern)].map(([tag]) => /\bid="([^"]+)"/.exec(tag)[1]);

    assert.deepEqual(controls, panes, 'each tab control must point at its pane id');
    assert.equal(controls.length, EXPECTED_TABS.length);
    assert.equal(new Set(panes).size, panes.length, 'pane ids must be unique');
  });

  test('boots through a native ESM module script with no bundler', () => {
    assert.match(html, /<script type="module">/, 'expected an inline ESM module bootstrap');
    assert.match(html, /from '\.\/src\/app\.js'/, 'expected the app module boundary import');
  });

  test('references no external CDN or network resource', () => {
    assert.doesNotMatch(html, /<script[^>]+src=["']https?:\/\//i, 'no CDN scripts');
    assert.doesNotMatch(html, /<link[^>]+href=["']https?:\/\//i, 'no CDN stylesheets');
  });
});

describe('Source-level purity & quality gates', () => {
  test('src/app.js never reads the wall clock directly', () => {
    const source = readRepoFile('src/app.js');
    assert.doesNotMatch(
      source,
      /\bDate\s*\.\s*now\b/,
      'the current time must arrive through the injected `now` dependency',
    );
  });

  test('no bare Error is thrown anywhere under src/', () => {
    const offenders = collectSourceFiles('src').filter((file) =>
      /throw\s+new\s+Error\s*\(/.test(fs.readFileSync(file, 'utf8')),
    );
    assert.deepEqual(offenders, [], 'all throws must use the typed error hierarchy');
  });

  test('package.json declares zero runtime dependencies', () => {
    const pkg = JSON.parse(readRepoFile('package.json'));
    assert.equal(
      pkg.dependencies,
      undefined,
      'the static app must ship with no runtime dependencies',
    );
    assert.equal(pkg.type, 'module', 'native ESM is required for the zero-build app');
  });
});

describe('loadHistorical scaffold  -  discovery & parse with typed errors', () => {
  /**
   * @param {Record<string, string>} fixtures
   * @returns {(location: string) => Promise<string>}
   */
  function readerFrom(fixtures) {
    return async (location) => {
      const name = path.basename(location, '.json');
      if (!(name in fixtures)) {
        throw new Error(`no fixture available for ${location}`);
      }
      return fixtures[name];
    };
  }

  const validFixtures = Object.freeze({
    income: '{"rows": []}',
    balance: '{"rows": []}',
    cashflow: '{"rows": []}',
    kpis: '{"rows": []}',
  });

  test('exposes the canonical dataset manifest from spec §3.1', () => {
    assert.deepEqual([...HISTORICAL_DATASETS], ['income', 'balance', 'cashflow', 'kpis']);
  });

  test('resolves every dataset when all files read and parse cleanly', async () => {
    const dataset = await loadHistorical({ readText: readerFrom(validFixtures) });
    assert.deepEqual(Object.keys(dataset).sort(), ['balance', 'cashflow', 'income', 'kpis']);
    assert.deepEqual(dataset.income, { rows: [] });
  });

  test('rejects with DataValidationError naming an unreadable file', async () => {
    const fixtures = { ...validFixtures };
    delete fixtures.income;

    await assert.rejects(
      () => loadHistorical({ readText: readerFrom(fixtures) }),
      (error) => {
        assert.ok(error instanceof DataValidationError);
        assert.equal(error.records.length, 1);
        assert.equal(error.records[0].rule, 'FILE_UNREADABLE');
        assert.match(error.records[0].file, /income\.json$/);
        assert.match(error.message, /income\.json/);
        return true;
      },
    );
  });

  test('rejects with DataValidationError naming an unparseable file', async () => {
    const fixtures = { ...validFixtures, balance: '{ not valid json' };

    await assert.rejects(
      () => loadHistorical({ readText: readerFrom(fixtures) }),
      (error) => {
        assert.ok(error instanceof DataValidationError);
        assert.equal(error.records.length, 1);
        assert.equal(error.records[0].rule, 'FILE_UNPARSEABLE');
        assert.match(error.records[0].file, /balance\.json$/);
        return true;
      },
    );
  });

  test('collects every offender instead of failing on the first', async () => {
    const fixtures = { ...validFixtures, balance: '{ not valid json' };
    delete fixtures.income;
    delete fixtures.kpis;

    await assert.rejects(
      () => loadHistorical({ readText: readerFrom(fixtures) }),
      (error) => {
        assert.ok(error instanceof DataValidationError);
        assert.equal(error.records.length, 3);
        const files = error.records.map((record) => path.basename(record.file));
        assert.deepEqual(files.sort(), ['balance.json', 'income.json', 'kpis.json']);
        for (const name of ['income.json', 'balance.json', 'kpis.json']) {
          assert.match(error.message, new RegExp(name), `summary must name ${name}`);
        }
        return true;
      },
    );
  });

  test('serializes deterministically for assertions and error pages', async () => {
    await assert.rejects(
      () => loadHistorical({ readText: readerFrom({}) }),
      (error) => {
        const payload = JSON.parse(JSON.stringify(error));
        assert.equal(payload.name, 'DataValidationError');
        assert.equal(payload.records.length, HISTORICAL_DATASETS.length);
        assert.ok(payload.message.length > 0);
        return true;
      },
    );
  });

  test('the default browser reader fails as DataValidationError off-browser', async () => {
    // No `readText` injected and no fetchable URL: every dataset must be
    // reported rather than crashing with an untyped transport error.
    await assert.rejects(
      () => loadHistorical(),
      (error) => {
        assert.ok(error instanceof DataValidationError);
        assert.equal(error.records.length, HISTORICAL_DATASETS.length);
        return true;
      },
    );
  });
});
