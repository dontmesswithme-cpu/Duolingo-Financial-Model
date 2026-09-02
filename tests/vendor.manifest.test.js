/**
 * P5.0 Vendor Manifest & Tabulator Integrity Gate.
 *
 * Verifies that:
 *   - docs/vendor/manifest.md exists and documents all vendored files
 *   - SHA-256 checksums match the exact on-disk byte content
 *   - All source URLs are valid absolute http(s) URLs
 *   - vendor/ directory contains only registered release assets (no .map, .patch, node_modules)
 *   - Tabulator JS file starts with official release banner
 *   - Zero runtime network / CDN dependencies exist in index.html and src/
 *   - src/ui/tabulator.js correctly imports and exports Tabulator
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function computeSha256(relativePath) {
  const buf = fs.readFileSync(path.join(repoRoot, relativePath));
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function parseManifest(markdown) {
  const entries = [];
  const lines = markdown.split('\n');
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      if (cells[0].toLowerCase() === 'project' || cells[0].startsWith('---')) {
        inTable = true;
        continue;
      }
      if (inTable && cells.length >= 6) {
        entries.push({
          project: cells[0],
          version: cells[1],
          license: cells[2],
          sourceUrl: cells[3],
          localPath: cells[4],
          sha256: cells[5],
        });
      }
    }
  }
  return entries;
}

function collectFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const files = [];
  const entries = fs.readdirSync(dirPath, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      const full = path.join(entry.parentPath ?? entry.path, entry.name);
      files.push(path.relative(repoRoot, full).replace(/\\/g, '/'));
    }
  }
  return files;
}

describe('P5.0 Vendor Manifest & Asset Integrity', () => {
  const manifestContent = readRepoFile('docs/vendor/manifest.md');
  const manifestEntries = parseManifest(manifestContent);

  test('manifest documents at least Tabulator JS and CSS assets', () => {
    assert.ok(manifestEntries.length >= 2, 'manifest should have at least 2 entries');
    const projects = new Set(manifestEntries.map((e) => e.project));
    assert.ok(projects.has('Tabulator'), 'manifest must include Tabulator');
  });

  test('every manifest entry specifies semver version, MIT license, and valid absolute source URL', () => {
    for (const entry of manifestEntries) {
      assert.match(entry.version, /^\d+\.\d+\.\d+/, `version must be semver: ${entry.version}`);
      assert.equal(entry.license, 'MIT', 'license must be MIT');
      assert.match(entry.sourceUrl, /^https?:\/\//, `source URL must be absolute: ${entry.sourceUrl}`);
      assert.match(entry.sha256, /^[a-f0-9]{64}$/i, `sha256 must be 64-character hex string: ${entry.sha256}`);
    }
  });

  test('SHA-256 checksums of vendored files match manifest exactly', () => {
    for (const entry of manifestEntries) {
      const localFile = path.join(repoRoot, entry.localPath);
      assert.ok(fs.existsSync(localFile), `vendored file must exist: ${entry.localPath}`);
      const actualHash = computeSha256(entry.localPath);
      assert.equal(
        actualHash,
        entry.sha256.toLowerCase(),
        `SHA-256 mismatch for ${entry.localPath}: expected ${entry.sha256}, got ${actualHash}`
      );
    }
  });

  test('vendor/ contains exactly the files registered in the manifest (no rogue files, patches, maps)', () => {
    const vendorFiles = collectFiles(path.join(repoRoot, 'vendor'));
    const manifestPaths = new Set(manifestEntries.map((e) => e.localPath.replace(/\\/g, '/')));

    for (const file of vendorFiles) {
      assert.ok(
        manifestPaths.has(file),
        `file in vendor/ is not registered in docs/vendor/manifest.md: ${file}`
      );
      assert.doesNotMatch(file, /\.map$/, 'vendor directory must not contain .map files');
      assert.doesNotMatch(file, /\.patch$/, 'vendor directory must not contain .patch files');
      assert.doesNotMatch(file, /node_modules/, 'vendor directory must not contain node_modules');
    }
  });

  test('vendored JS asset starts with official Tabulator release banner', () => {
    const jsEntry = manifestEntries.find((e) => e.localPath.endsWith('.js'));
    assert.ok(jsEntry, 'expected a JS entry in manifest');
    const jsContent = readRepoFile(jsEntry.localPath);
    assert.match(
      jsContent,
      /^\/\*\s*Tabulator\s+v\d+\.\d+\.\d+/i,
      'vendored JS must start with official Tabulator banner'
    );
  });
});

describe('P5.0 Zero Runtime Network Dependencies', () => {
  test('index.html contains no CDN links or remote scripts', () => {
    const html = readRepoFile('index.html');
    assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i, 'no remote script tags in index.html');
    assert.doesNotMatch(html, /<link[^>]+href=["']https?:/i, 'no remote link tags in index.html');
    assert.doesNotMatch(html, /cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/i, 'no CDN references in index.html');
  });

  test('src/ contains no CDN URLs', () => {
    const srcFiles = collectFiles(path.join(repoRoot, 'src'));
    for (const file of srcFiles) {
      if (file.endsWith('.js')) {
        const fileContent = readRepoFile(file);
        assert.doesNotMatch(
          fileContent,
          /https?:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)/i,
          `no CDN imports allowed in ${file}`
        );
      }
    }
  });
});

describe('P5.0 ESM Module Import Stub', () => {
  test('src/ui/tabulator.js exports Tabulator and TabulatorFull', async () => {
    const tabulatorModule = await import('../src/ui/tabulator.js');
    assert.ok(typeof tabulatorModule.Tabulator === 'function', 'Tabulator must be a function');
    assert.ok(typeof tabulatorModule.TabulatorFull === 'function', 'TabulatorFull must be a function');
    assert.equal(tabulatorModule.default, tabulatorModule.TabulatorFull, 'default export should be TabulatorFull');
  });
});
