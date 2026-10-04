/**
 * F-UI-3 — Cover rail share semantics: filed MKT vs DCF EST are distinct.
 *
 * The rail must never silently swap the filed driver (50,031,000) with the
 * engine DCF divisor (~56.90M). Both values render with explicit labels and
 * data-source provenance.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCover } from '../src/ui/coverTab.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function stubContainer() {
  let html = '';
  return {
    get innerHTML() { return html; },
    set innerHTML(v) { html = String(v); },
  };
}

function assumptionsWithFiled(value) {
  const record = { value, asOf: '2026-08-06', source: { provider: 'SEC 10-Q' } };
  return {
    get: (name) => (name === 'shares_outstanding' ? record : null),
    byName: { shares_outstanding: record },
  };
}

describe('F-UI-3 — Cover share rail dual-source semantics', () => {
  test('renders filed 50.03M and DCF 56.90M with distinct labels and sources', () => {
    const container = stubContainer();
    const view = renderCover({
      container,
      dcf: { perShare: 100, sharesOutstanding: 56902469.78, bopSharesOutstanding: 50031000, bridge: { debt: 0 } },
      wacc: 0.086638,
      recommendation: { upsidePct: 0.1, recommendation: 'fair' },
      assumptions: assumptionsWithFiled(50031000),
      threeStatement: null,
      methods: [],
      verdict: null,
      marketPriceState: { price: 157.85, asOf: '2026-09-02' },
    });
    const html = container.innerHTML;
    assert.match(html, /Diluted Shares — Filed \(MKT\)/, 'filed row label must be explicit');
    assert.match(html, /DCF Divisor — Rolled \(EST\)/, 'DCF row label must be explicit');
    assert.match(html, /id="cover-assump-shares"[^>]*data-source="assumptions:shares_outstanding"/, 'filed value carries filed data-source');
    assert.match(html, /id="cover-assump-shares-dcf"[^>]*data-source="dcf:sharesOutstanding"/, 'DCF value carries DCF data-source');
    assert.match(html, /50\.03M/, 'filed 50,031,000 renders as 50.03M');
    assert.match(html, /56\.90M/, 'DCF 56,902,469 renders as 56.90M');
    view.dispose();
  });

  test('fallback reads shares_outstanding, never shares_diluted', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/ui/coverTab.js'), 'utf8');
    assert.doesNotMatch(source, /shares_diluted/, 'coverTab must not reference the non-existent shares_diluted key');
    assert.match(source, /shares_outstanding/, 'coverTab must read the filed shares_outstanding driver');
  });

  test('no silent swap: DCF missing still shows filed; filed missing still labels DCF', () => {
    const c1 = stubContainer();
    const v1 = renderCover({
      container: c1, dcf: null, wacc: null, recommendation: null,
      assumptions: assumptionsWithFiled(50031000), threeStatement: null, methods: [],
    });
    assert.match(c1.innerHTML, /50\.03M/, 'filed shows without DCF');
    assert.match(c1.innerHTML, /data-source="assumptions:shares_outstanding"/, 'filed source stays explicit');
    v1.dispose();

    const c2 = stubContainer();
    const v2 = renderCover({
      container: c2,
      dcf: { perShare: 100, sharesOutstanding: 56902469.78, bridge: { debt: 0 } },
      wacc: null, recommendation: null, assumptions: { get: () => null, byName: {} },
      threeStatement: null, methods: [],
    });
    assert.match(c2.innerHTML, /56\.90M/, 'DCF shows without filed driver');
    assert.match(c2.innerHTML, /DCF Divisor — Rolled/, 'DCF label stays explicit when filed is absent');
    v2.dispose();
  });

  test('index.html static rail carries the same dual-source labels', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.match(html, /Diluted Shares — Filed \(MKT\)/, 'static HTML must carry filed label');
    assert.match(html, /DCF Divisor — Rolled \(EST\)/, 'static HTML must carry DCF label');
    assert.match(html, /id="cover-assump-shares-dcf"/, 'static HTML must carry DCF value node');
  });
});
