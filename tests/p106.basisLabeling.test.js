/**
 * P10.6 — basis labeling (OP's P10.6 entry gate, test-asserted).
 *
 * OP required that every DISPLAYED per-share figure either be pinned to the
 * canonical recommendation value or be labelled intermediate explicitly, so no
 * surface implies the finite-roll intermediate is THE value. This gate pins both
 * halves of that decision:
 *
 *   canonical   : cover tile, valuation headline, summary cards, scenario spectrum
 *   intermediate: the WACC x g matrix cells, which are engine data by construction,
 *                 carrying an explicit basis note on the matrix card
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';

import { createApp } from '../src/app.js';
import { createTabRoot } from './_dom_stub.js';
import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { canonicalDcfPerShare } from '../src/engine/methods/fcffDcf.js';
import { usd } from '../src/ui/format.js';

const readText = (f) => fs.promises.readFile(f, 'utf8');
const TABS = ['cover', 'assumptions', 'historicals', 'schedules', 'projections', 'valuation', 'summary', 'sensitivity'];

const boot = async (horizon) => {
  const historical = await loadHistorical({ dir: './src/data/historical/', readText });
  const assumptions = await loadAssumptions({ location: path.resolve('src/data/assumptions.json'), readText });
  const { root, panes } = createTabRoot(TABS);
  const app = createApp({
    data: { loadHistorical, loadAssumptions }, engine: {}, historical, assumptions,
    root, now: () => 1725148800000, horizon,
  });
  const html = (k) => (panes.find((p) => p.id === `tab-${k}`) || {}).innerHTML || '';
  return { app, st: app.state(), html };
};

describe('P10.6 — canonical surfaces agree on one figure', () => {
  test('cover, valuation, summary and sensitivity all carry the canonical pin', async () => {
    const { app, st, html } = await boot(10);
    try {
      const canonical = canonicalDcfPerShare(st.dcf);
      assert.equal(canonical.basis, 'canonical', 'the resolver reports the canonical basis');
      const pin = usd(canonical.perShare, { decimals: 2 });
      for (const key of ['cover', 'valuation', 'summary', 'sensitivity']) {
        assert.ok(
          html(key).includes(pin),
          `${key} must carry the canonical pin ${pin}`,
        );
      }
      // The recommendation is on the same figure, so the headline and the tile agree.
      assert.equal(
        st.recommendation.dcfPerShare,
        canonical.perShare,
        'the recommendation is the canonical figure',
      );
    } finally {
      app.dispose();
    }
  });

  test('the canonical figure is genuinely distinct from the intermediate', async () => {
    const { app, st } = await boot(10);
    try {
      const canonical = canonicalDcfPerShare(st.dcf);
      assert.notEqual(
        canonical.perShare,
        st.dcf.perShare,
        'canonical and intermediate must differ, or this gate is vacuous',
      );
      // They differ by roughly the modelled future dilution, not by an arbitrary gap.
      const ratio = canonical.perShare / st.dcf.perShare;
      assert.ok(ratio > 0.97 && ratio < 1.0, `canonical sits just below the intermediate (ratio ${ratio.toFixed(4)})`);
    } finally {
      app.dispose();
    }
  });

  test('the matrix states its intermediate basis explicitly', async () => {
    const { app, html } = await boot(10);
    try {
      const sens = html('sensitivity');
      assert.match(sens, /matrix-basis-note/, 'the matrix card carries a basis note');
      assert.match(
        sens,
        /after explicit and fade dilution/i,
        'the note names the intermediate basis the cells are on',
      );
      assert.match(
        sens,
        /after modeled future dilution/i,
        'the note names the canonical basis the scenarios are on',
      );
    } finally {
      app.dispose();
    }
  });
});
