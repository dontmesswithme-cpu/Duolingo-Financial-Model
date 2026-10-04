/**
 * F-UI-6 — Rendered-DOM inline-style policy: authored zero, runtime allowlisted.
 *
 * - Authored source (`index.html`, every `src/ui/*.js`) must contain zero
 *   `style=` attributes and zero runtime style manipulation.
 * - The vendored Tabulator grid is the sole permitted runtime source of live
 *   `[style]` attributes (column widths, frozen offsets, virtual DOM).
 * - Any live-DOM `[style]` outside `.tabulator` is a violation; the Playwright
 *   rendered-DOM audit classifies per-tab counts as tabulator-runtime vs
 *   authored/other with acceptance authored/other == 0.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const UI_DIR = path.join(ROOT, 'src', 'ui');
const TABULATOR_WRAPPER = path.join(UI_DIR, 'tabulator.js');
const VENDOR_DIR = path.join(ROOT, 'vendor', 'tabulator');

describe('F-UI-6 — Authored source contains zero inline styles', () => {
  test('index.html has zero style= attributes', () => {
    const html = fs.readFileSync(INDEX_PATH, 'utf8');
    const matches = [...html.matchAll(/<[^>]+style\s*=\s*["'][^"']*["'][^>]*>/gi)];
    assert.equal(matches.length, 0, `index.html must have 0 inline style attributes; found ${matches.length}`);
  });

  test('every src/ui/*.js file has zero style= attributes', async () => {
    const files = await fs.promises.readdir(UI_DIR);
    for (const file of files) {
      if (!file.endsWith('.js')) continue;
      const content = await fs.promises.readFile(path.join(UI_DIR, file), 'utf8');
      assert.doesNotMatch(content, /style\s*=/i, `src/ui/${file} must contain zero inline style= (authored-source gate)`);
    }
  });

  test('no authored runtime style manipulation in src/ui/*.js', async () => {
    const files = await fs.promises.readdir(UI_DIR);
    for (const file of files) {
      if (!file.endsWith('.js')) continue;
      const content = await fs.promises.readFile(path.join(UI_DIR, file), 'utf8');
      assert.doesNotMatch(content, /\.style\b/, `src/ui/${file} must not manipulate el.style (runtime styles come only from Tabulator)`);
      assert.doesNotMatch(content, /setAttribute\(\s*['"]style['"]/, `src/ui/${file} must not setAttribute('style')`);
    }
  });
});

describe('F-UI-6 — Runtime inline-style allowlist is explicit and scoped', () => {
  test('Tabulator wrapper documents the runtime allowlist', () => {
    const content = fs.readFileSync(TABULATOR_WRAPPER, 'utf8');
    assert.match(content, /allowlist/i, 'src/ui/tabulator.js must document the runtime style allowlist');
    assert.match(content, /SOLE permitted runtime/i, 'wrapper must scope runtime styles to Tabulator only');
  });

  test('vendored Tabulator exists as the justified runtime style source', () => {
    assert.ok(fs.existsSync(VENDOR_DIR), 'vendor/tabulator/ must exist');
    const entries = fs.readdirSync(VENDOR_DIR);
    assert.ok(entries.length > 0, 'vendor/tabulator/ must contain the pinned release asset');
    assert.ok(
      entries.some((e) => /tabulator/i.test(e)),
      'vendor/tabulator/ must contain a Tabulator asset',
    );
  });

  test('conventions documents authored-zero vs Tabulator-allowlisted policy', () => {
    const convPath = path.join(ROOT, 'docs', 'conventions.md');
    const conv = fs.readFileSync(convPath, 'utf8');
    assert.match(conv, /Inline Styles Policy/, 'docs/conventions.md must carry the F-UI-6 policy section');
    assert.match(conv, /Authored source is zero-inline-style/, 'policy must state authored-source zero rule');
    assert.match(conv, /allowlist/i, 'policy must name the Tabulator allowlist');
  });

  test('only tabulator.js may import the vendor Tabulator bundle', async () => {
    const files = await fs.promises.readdir(UI_DIR);
    for (const file of files) {
      if (!file.endsWith('.js') || file === 'tabulator.js') continue;
      const content = await fs.promises.readFile(path.join(UI_DIR, file), 'utf8');
      assert.doesNotMatch(
        content,
        /vendor\/tabulator/,
        `src/ui/${file} must not import vendor/tabulator directly (goes via tabulator.js allowlist owner)`,
      );
    }
  });
});
