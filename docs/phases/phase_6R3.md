# Phase 6R3: Cost-of-Capital Hardening — Monthly ERP & Peer Beta

> **Milestone**: Phase 6R3 — Cost-of-Capital Hardening (Director-directed; continues the 6R2 model-rigor lineage)
> **Protocol**: 1.0 (internal workflow only — no protocol mentions in the product UI, per standing Director ruling)
> **Status**: 🟢 Approved by Director — pending kick-off (no DS work starts before Director kick-off prompt)
> **Owner**: Drafted & audited by Reviewer (`OP`); implemented by Worker (`DS`); **final approval authority: Director**
> **Objective**: Retire the two standing cost-of-capital weaknesses (Director review): (1) the ERP rides an annual table (January 2026 — structurally stale by construction); (2) beta is a single noisy OLS estimate (t ≈ 1.72, R² 4.8%). Remediation: monthly Damodaran implied ERP with a locked smoothing rule, and a bottom-up median unlevered beta over the locked three-name peer set (Spotify / Roblox / Netflix — Coursera + Udemy removed from ALL peer uses per Director decision). Sequenced: **6R3 first, Phase 7 next** — Phase 7 consumes this phase's re-anchored cost of capital as its baseline. The `v1.0` release block carries forward unchanged.
>
> **Subscribe precision note**: this phase moves WACC/pins once, under a strict mini-ledger (two drivers). No other pins move.

---

## 1. Milestone Objective & Scope

Phase 6R3 exists because the Director ruled the Phase 6R2 cost of capital not yet shippable: a once-a-year ERP cannot price a live model, and a t≈1.7 single-stock beta is not an estimate to stand behind — even though both are honestly disclosed. The remediation follows the project's established compute-plus-cross-check pattern (P6R2.2 precedent).

**Director decisions encoded (this session, binding):**
1. **ERP**: Damodaran **monthly** implied-ERP series for the United States (not the annual country table), with a **trailing 3-month average** smoothing rule locked below. Self-computed implied ERP is NOT in scope (deferred follow-up, not rejected).
2. **Beta**: **bottom-up median unlevered beta** over **Spotify / Roblox / Netflix**. Each peer levered beta regressed with the frozen `beta.js` OLS module, Hamada-unlevered on filed D/E, median taken, applied directly at Duolingo's D = 0.
3. **Coursera + Udemy removed from ALL peer uses** — beta, trading multiples, SOTP, P/FCF. Rationale (Director): model mismatch (homework-help / narrow-demo vs. broad fun learning); their depressed multiples and high loading would distort medians. The single peer set everywhere is **SPOT / RBLX / NFLX**.
4. **Cross-checks retained**: Vasicek-shrunk own-regression (0.89 OLS) stays as the disclosed beta cross-check; historical realized ERP stays as the ERP context series. Nothing is asserted without a second lane.
5. **Beta-range display**: the model shows valuation across a beta range (not a point), reusing the sensitivity machinery.

**In scope** (frozen-surface lifts — ONLY these):
- `src/data/historical/peers_beta.json` (NEW, additive) — monthly price series (peer + S&P 500 benchmark, same corpus convention as `prices.json`) + filed D/E + tax inputs per peer, 100% cited with asOf
- `src/data/assumptions.json` — TWO driver records only: `equity_risk_premium` (value/asOf/notes → monthly rule), `beta` (value/asOf/notes/source → peer median; marking MKT kept; name/label/group/min/max/step/units/scenarioDeltas unchanged)
- `src/ui/valuationTab.js` — Beta Derivation block extended (peer-median derivation table + range + Vasicek cross-check; runtime-computed, never hardcoded)
- `src/ui/sensitivityTab.js` — beta-range readout text only (reuses grid mechanics; no new engine path)
- `tests/` — additive suites + mini-ledger-enumerated pin updates (WACC/pins only — enumerated in P6R3.2, executed with it)
- `docs/` — this spec, logs, mini-ledger, status (OP-owned)

**Out of scope**:
- `src/engine/*.js` — behavior-frozen, byte-identical, NO exceptions (beta.js is REUSED as-is on the new series; no edits, no new engine modules)
- Existing corpus records (706 + P6R2 price series); existing driver keys/schema/deltas; internal scenario keys; `index.html` shell; URL-hash state schema
- Self-computed implied ERP; new valuation methods (Phase 7); any surface not enumerated: STOP and escalate

---

## 2. Prerequisites & Standing Rules

- **Prior state**: P6R2 sub-phases approved 5/5 (suite 618/618 ×3); P6R2 gate HELD for Director final pass (this phase does not release it — release authority stays Director-only).
- **Baseline**: tag `v1.0-P6R2-base` lineage continues; this phase opens tag `v1.0-P6R3-base` at kick-off (current tree). Gate reference for ALL 6R3 diffs is `v1.0-P6R3-base`.
- **Standing rules re-armed**: all-scenario-state rendered sweep every cycle; real-browser validation; test expectations DERIVED, never transcribed; post-PASS disclosure of any file write; live-provider verification of every dated MKT citation (Findings C+D rule); fail-closed probes in `scratch/`; suite totals stated in every submission, red or green.

---

## 3. Sub-Phase Artifact Contracts

### Task P6R3.1: Monthly Implied ERP Driver (Damodaran Monthly + 3M Smoothing Rule)

#### A. Deliverable Files
- `src/data/assumptions.json` (`equity_risk_premium` record only)
- `tests/erp.monthly.test.js` (new, additive)

#### B. Semantics (binding — DS implements exactly this)
1. **Source switch**: the `equity_risk_premium` driver value = **trailing 3-month average** of Damodaran's published monthly implied ERP for the United States, rounded to the driver step (0.0005). `asOf` = latest month in the average. The January-2026-table citation is retired (retirement disclosed in notes as a Finding-C-lineage remediation, same honesty standard as P6R2.3).
2. **Notes carry**: the three monthly prints + average arithmetic (checkable on-screen), the series URL, the historical realized-ERP context series (already in notes pattern), and the smoothing rule stated verbatim so future refreshes are mechanical, not judgmental.
3. **Untouched**: key, label, group, min/max/step, units, marking (MKT), scenarioDeltas (±0.005) — byte-identical. No other driver record changes in this task.
4. **No pin moves yet**: joint mini-ledger with P6R3.2 (both drivers migrate together, once).

#### C. Invariants & Automated Quality Gates
- [ ] **OP live re-pull at review time**: the three monthly prints re-verified against Damodaran's published monthly series; average recomputed by OP; internal consistency alone is insufficient (Finding-C lesson).
- [ ] `assumptions.json` diff limited to the ERP record's value/asOf/notes fields.
- [ ] Driver round-trip: UI control renders the averaged value; slider clamp behavior unchanged.

---

### Task P6R3.2: Bottom-Up Peer Beta + Mini-Ledger Migration & Re-Baseline

#### A. Deliverable Files
- `src/data/historical/peers_beta.json` (new, additive; path per corpus convention)
- `src/data/assumptions.json` (`beta` record only)
- `src/ui/valuationTab.js` (Beta block extension), `src/ui/sensitivityTab.js` (range readout text)
- `tests/beta.peers.test.js` (new, additive), mini-ledger + ledger-enumerated pin updates across `tests/`
- `docs/screenshots/phase_6R3/`; `docs/status.md` + `OPmemory.md` §3 (OP, post-verification)

#### B. Semantics (binding)
1. **Peer corpus**: monthly closes (peer + S&P 500) per peer over the maximum shared window (target: trailing 60 months where listed history permits; shortfalls disclosed per peer, never silently padded). Filed D/E (total debt ÷ market cap at peer fiscal year-end) + effective tax per peer, cited. Existing corpus files byte-identical.
2. **Beta math**: per-peer levered beta via frozen `beta.js` OLS (same returns convention as P6R2.2); Hamada unlever per peer (`β_asset = β_equity / (1 + (1−t)·D/E)`); headline = **median of the three asset betas**, rounded to driver step (0.01). Mean + span rendered alongside (dispersion visible, never hidden).
3. **Driver re-anchor**: `beta` value = peer median; `asOf` = series end month; notes carry per-peer betas, D/E inputs, unlevered values, median/mean/span, the Vasicek-shrunk own-regression cross-check (0.89 OLS, t ≈ 1.72 disclosed), and the debt-free direct-application statement (no Hamada on DUOL side). Marking MKT kept; keys/deltas/bounds byte-identical — bear +0.15 / bull −0.15 apply to the new base (review at gate: if the median lands far from 0.89, OP flags delta adequacy to the Director rather than silently keeping stale bands).
4. **Presentation**: Beta Derivation block gains a peer-median derivation table (per-peer rows, engine-computed at runtime from the bundled corpus) + range readout; the driver stays user-adjustable. Sensitivity tab states the beta range under evaluation (text only).
5. **Migration mini-ledger BEFORE any pin moves** (single joint pass — ERP + beta together): DS enumerates every pin transitively depending on {ERP, beta} — Re/WACC, dfs, pvExplicit, terminal FCF, Gordon TV, pvTerminal, EV, equity, perShare, upside (vs $157.85 benchmark, unchanged), Bear/Bull per-shares + WACCs, sensitivity corners, chart/waterfall pins. New pins computed and ledged, never hand-derived. Unaffected-by-construction (asserted): hybrid H1 invariants, corpus 706, balance gate, latency budget, shares, market cap (price-anchored, ERP/beta-independent).
6. **Test updates are ledger-enumerated ONLY**; every changed expectation maps 1:1 to a ledger row.
7. **Re-baseline sweep**: all-scenario-state browser sweep, all 8 tabs tied to re-derived engine values, screenshots refreshed.

#### C. Invariants & Automated Quality Gates
- [ ] **External truth (OP)**: OP independently re-runs OLS per peer from raw closes, re-derives D/E from cited filings, reproduces median/mean/span; ERP average recomputed from live series. Tolerances: β within 1e-6, pins per ledger.
- [ ] **Convergence sanity**: FCFF headline < legacy still holds; Bear<Base<Bull ordering; WACC>g every grid cell; legacy block still matches the P6R2.4 mixed-basis lineage (recomputed at new anchors).
- [ ] Engine diff EMPTY (`git diff v1.0-P6R3-base -- src/engine/` — zero exceptions this phase); corpus 706 + price-series diffs empty; `assumptions.json` diff = the two enumerated records within enumerated fields.
- [ ] Suite green ×3, 0 flakes; latency median <16ms/100; zero console errors; `/protocol/i` zero in DOM.

---

## 4. Milestone Acceptance Criteria (Gate Requirements)

- [ ] P6R3.1–P6R3.2 individually submitted and OP-approved under the standing sweep.
- [ ] Monthly ERP live-verified (3 prints + average); peer beta independently reproduced (per-peer OLS + D/E + median); cross-checks (Vasicek own-regression, historical ERP) disclosed with deviations.
- [ ] Mini-ledger closed: every moved pin traceable 1:1; no pin-constant changes outside it; legacy lineage intact.
- [ ] OP consolidated tie-out in `docs/logs/op/phase_6R3.md`.
- [ ] **RELEASE BLOCK (carried forward)**: OP PASS ≠ release. The `v1.0` tag issues only after the Director's explicit final-pass approval of the whole product.

---

> **Director decisions encoded (this session)**: (1) ERP = Damodaran monthly implied series, trailing-3M average, self-computed implied deferred. (2) Beta = median Hamada-unlevered beta over SPOT/RBLX/NFLX; Vasicek-shrunk own-regression cross-check retained; beta-range display. (3) Coursera + Udemy removed from ALL peer uses (model mismatch; distortion risk); single peer set SPOT/RBLX/NFLX everywhere. (4) SOTP subscriptions = EV/Revenue primary + EBITDAR sensitivity; DET at family multiple, constraint disclosed (no separate DET multiple). (5) Sequencing: 6R3 (cost of capital) FIRST, Phase 7 (methods) NEXT. (6) Release authority Director-only.
