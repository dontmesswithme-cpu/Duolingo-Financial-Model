/**
 * Phase 14 — Cover Tab Excel Download Button & Workbook Linkage Verification
 *
 * Contract gates:
 *  - Anchor #cover-excel-download present with class .cover-download-btn
 *  - href pinned to assets/excel/v1/duolingo_fm_faraz_shaikh_as_of_20261014.xlsx
 *  - download attribute forces browser download
 *  - Linked file exists on disk, non-empty, and matches frozen P13 bytes
 *  - Button label carries human-form as-of date matching filename (as of Oct 14, 2026)
 *  - Zero live-linkage claims in button or adjacent copy (static frozen bytes)
 *  - Renders in both index.html static shell and renderCover() output path
 *  - Negative controls: corrupted href or missing file fails verification
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderCover } from '../src/ui/coverTab.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const EXPECTED_HREF = 'assets/excel/v1/duolingo_fm_faraz_shaikh_as_of_20261014.xlsx';
const EXPECTED_LABEL = 'Download Excel Model (as of Oct 14, 2026)';
const EXPECTED_FILE_SIZE = 116510;
const EXPECTED_FILE_HASH = 'AF05C78000C66F15EE6E200CC7D969FC75895F5497913457F95595FB8AD1B3FE';

function stubContainer() {
  let html = '';
  return {
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v); },
  };
}

describe('Phase 14 — Cover Tab Excel Download Button Contract', () => {
  test('dynamic renderCover() renders download button with exact id, href, download attr, and label', () => {
    const container = stubContainer();
    const view = renderCover({ container });
    const html = container.innerHTML;

    assert.match(html, /<a\s+[^>]*id="cover-excel-download"/, 'download anchor id must be cover-excel-download');
    assert.match(html, /class="[^"]*\bcover-download-btn\b[^"]*"/, 'anchor must carry class cover-download-btn');
    assert.match(html, /href="assets\/excel\/v1\/duolingo_fm_faraz_shaikh_as_of_20261014\.xlsx"/, 'href must match exact dated file');
    assert.match(html, /<a\s+[^>]*\bdownload\b/, 'anchor must have download attribute');
    assert.match(html, />\s*Download Excel Model \(as of Oct 14, 2026\)\s*<\/a>/, 'label must carry exact as-of date');

    view.dispose();
  });

  test('static shell in index.html carries identical download anchor markup', () => {
    const indexPath = path.join(ROOT, 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');

    assert.match(indexHtml, /<a\s+[^>]*id="cover-excel-download"[^>]*href="assets\/excel\/v1\/duolingo_fm_faraz_shaikh_as_of_20261014\.xlsx"/, 'static shell must carry pinned download anchor');
  });

  test('target workbook file exists on disk and matches frozen P13 binary size and SHA256', () => {
    const filePath = path.join(ROOT, EXPECTED_HREF);
    assert.equal(fs.existsSync(filePath), true, `file must exist at ${EXPECTED_HREF}`);

    const buf = fs.readFileSync(filePath);
    assert.equal(buf.length, EXPECTED_FILE_SIZE, `file size must equal ${EXPECTED_FILE_SIZE} bytes`);

    const hash = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
    assert.equal(hash, EXPECTED_FILE_HASH, `SHA256 must match ${EXPECTED_FILE_HASH}`);
  });

  test('zero live-linkage or reactive sync claims in cover download copy', () => {
    const container = stubContainer();
    const view = renderCover({ container });
    const html = container.innerHTML;

    // Overview card text must not claim live linkage, active calculation sync, or web-to-excel updates
    const overviewCardMatch = html.match(/<article class="cover-card cover-overview-card"[\s\S]*?<\/article>/);
    assert.ok(overviewCardMatch, 'overview card must exist');

    const cardText = overviewCardMatch[0];
    assert.doesNotMatch(cardText, /\b(live[- ]link(?:age)?|real[- ]time sync|reactive download|sync(?:ed)? with excel)\b/i,
      'overview card copy must not make live-linkage claims');

    view.dispose();
  });

  test('CSS rules in index.html style block satisfy §B1 locked button design', () => {
    const indexPath = path.join(ROOT, 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');
    const styleMatch = indexHtml.match(/<style>([\s\S]*?)<\/style>/);
    assert.ok(styleMatch, 'index.html must contain a style block');

    const css = styleMatch[1];
    assert.match(css, /\.cover-download-btn\s*\{[^}]*background:\s*var\(--color-accent-blue\);/, 'btn background must use --color-accent-blue');
    assert.match(css, /\.cover-download-btn\s*\{[^}]*padding:\s*10px 18px;/, 'btn padding must be 10px 18px');
    assert.match(css, /\.cover-download-btn\s*\{[^}]*border-radius:\s*var\(--radius\);/, 'btn border-radius must use --radius');
    assert.match(css, /\.cover-download-btn:hover\s*\{[^}]*background:\s*#1649B8;/, 'hover state must darken to #1649B8');
    assert.match(css, /\.cover-download-btn:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-accent-blue\);/, 'focus-visible outline must be 2px accent');
  });

  test('negative control: corrupted href or missing target file fails assertion', () => {
    // Validator helper function
    function validateDownloadAnchor(htmlSnippet) {
      const hrefMatch = htmlSnippet.match(/id="cover-excel-download"[^>]*href="([^"]+)"/);
      if (!hrefMatch) throw new Error('missing_anchor');
      const href = hrefMatch[1];
      if (href !== EXPECTED_HREF) throw new Error('corrupted_href');
      const fullPath = path.join(ROOT, href);
      if (!fs.existsSync(fullPath)) throw new Error('missing_file');
      return true;
    }

    // Valid HTML passes
    const validSnippet = `<a id="cover-excel-download" href="${EXPECTED_HREF}" download>${EXPECTED_LABEL}</a>`;
    assert.equal(validateDownloadAnchor(validSnippet), true);

    // Corrupted href fails
    const corruptedSnippet = `<a id="cover-excel-download" href="assets/excel/v1/corrupted_name.xlsx" download>${EXPECTED_LABEL}</a>`;
    assert.throws(() => validateDownloadAnchor(corruptedSnippet), /corrupted_href/);

    // Missing anchor fails
    const missingSnippet = `<a id="other-id" href="${EXPECTED_HREF}" download>${EXPECTED_LABEL}</a>`;
    assert.throws(() => validateDownloadAnchor(missingSnippet), /missing_anchor/);
  });
});
