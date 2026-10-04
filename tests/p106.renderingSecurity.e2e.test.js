/**
 * P10.6 — Rendering Security, end-to-end.
 *
 * The unit gate proves `escapeText()`/`safeUrl()` behave. This gate proves the
 * real render path reaches them: with the shipped 42-driver assumptions set,
 * two driver notes genuinely contain markup-significant characters (`beta` has
 * `->`; `paid_subscriber_fade_floor` has `a < b < c`). If the driver row
 * interpolated a note raw, those would land unescaped inside `aria-label` and
 * `title`, so asserting they arrive entity-encoded proves the call site escapes
 * real data rather than only passing a helper test in isolation.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

import { renderAssumptions } from '../src/ui/assumptionsTab.js';
import { loadAssumptions } from '../src/data/loader.js';
import { createInteractiveContainer } from './_interactive_container.js';
import { escapeText, safeUrl, mktBadge, formatDisplayText } from '../src/ui/format.js';

const ASSUMPTIONS_DATA_PATH = path.resolve('src/data/assumptions.json');
const XSS = '<img src=x onerror="alert(1)">';

const loadReal = () => loadAssumptions({
  location: ASSUMPTIONS_DATA_PATH,
  readText: (p) => fs.promises.readFile(p, 'utf8'),
});

describe('P10.6 — the real render path escapes, verified on real data', () => {
  test('driver notes carrying < and > arrive entity-encoded in the DOM', async () => {
    const assumptions = await loadReal();

    // Precondition: the shipped data really does contain the dangerous shapes.
    // Without this the gate could pass vacuously.
    const risky = assumptions.drivers.filter((d) => {
      const shown = formatDisplayText(d.notes || d.label || d.name || '');
      return /[<>]/.test(shown);
    });
    assert.ok(risky.length >= 2, `expected real notes containing < or >, found ${risky.length}`);

    const container = createInteractiveContainer();
    renderAssumptions({ container, assumptions });
    const html = container.innerHTML;

    for (const d of risky) {
      const shown = formatDisplayText(d.notes || d.label || d.name || '');
      assert.ok(
        html.includes(escapeText(shown)),
        `driver ${d.name}: its note must be present in escaped form`,
      );
      // The raw, unescaped note must not appear anywhere.
      assert.ok(
        !html.includes(shown),
        `driver ${d.name}: raw note text must not reach the DOM`,
      );
    }

    // No attribute may contain a raw markup-significant character from a note.
    const attrValues = [...html.matchAll(/(?:aria-label|title)="([^"]*)"/g)].map((m) => m[1]);
    for (const v of attrValues) {
      assert.ok(!v.includes('<'), `attribute value must not contain a raw <: ${v.slice(0, 60)}`);
      assert.ok(!v.includes('>'), `attribute value must not contain a raw >: ${v.slice(0, 60)}`);
    }
  });

  test('no driver row renders a live javascript: or data: href', async () => {
    const assumptions = await loadReal();
    const container = createInteractiveContainer();
    renderAssumptions({ container, assumptions });
    const html = container.innerHTML;
    for (const m of html.matchAll(/href="([^"]*)"/g)) {
      const href = m[1].trim();
      // Same-document fragments (`#sensitivity`, `#tab-assumptions`) are in-page
      // navigation, not external URLs, so they are out of scope for the
      // provider allowlist. Anything with a scheme must clear it.
      if (href === '' || href.startsWith('#')) continue;
      assert.ok(
        !/^(javascript|data|vbscript|file):/i.test(href),
        `dangerous scheme rendered: ${href.slice(0, 60)}`,
      );
      assert.ok(safeUrl(href) !== null, `href is not an approved URL: ${href.slice(0, 60)}`);
    }
  });
});

describe('P10.6 — badge boundary (provider, date, url)', () => {
  test('a hostile provider label stays text and a hostile URL produces no link', () => {
    const html = mktBadge({ asOf: XSS, provider: `<b>${XSS}</b>`, url: 'javascript:alert(1)' });
    assert.ok(!/<b>/i.test(html), 'the <b> wrapper did not survive as markup');
    assert.ok(!/href=/i.test(html), 'a refused URL produces no link at all');
    assert.ok(html.includes('&lt;b&gt;'), 'the provider label is entity-encoded');
    assert.ok(html.includes('&lt;img'), 'the as-of date is entity-encoded');
  });

  test('an approved provider URL links; a lookalike host does not', () => {
    const good = mktBadge({ asOf: '2026-09-05', provider: 'FRED', url: 'https://fred.stlouisfed.org/series/DGS10' });
    assert.match(good, /href="https:\/\/fred\.stlouisfed\.org\/series\/DGS10"/, 'FRED links');

    const lookalike = mktBadge({ asOf: '2026-09-05', provider: 'FRED', url: 'https://fred.stlouisfed.org.evil.com/x' });
    assert.ok(!/href=/i.test(lookalike), 'a lookalike host produces no link');
  });
});

describe('P10.6 — helper edges', () => {
  test('every escapeText metacharacter is encoded', () => {
    assert.equal(escapeText('&'), '&amp;');
    assert.equal(escapeText('<'), '&lt;');
    assert.equal(escapeText('>'), '&gt;');
    assert.equal(escapeText('"'), '&quot;');
    assert.equal(escapeText("'"), '&#39;');
    // Ampersand is encoded first, so an already-encoded entity is not decoded back.
    assert.equal(escapeText('&lt;'), '&amp;lt;');
    assert.equal(escapeText(null), '');
    assert.equal(escapeText(undefined), '');
  });

  test('safeUrl refuses every dangerous scheme', () => {
    for (const bad of [
      'javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>alert(1)<\/script>',
      'vbscript:x', 'file:///etc/passwd', 'blob:https://evil.com/x', 'about:blank',
    ]) {
      assert.equal(safeUrl(bad), null, `${bad} must be refused`);
    }
  });
});
