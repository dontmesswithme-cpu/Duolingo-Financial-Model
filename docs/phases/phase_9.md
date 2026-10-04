# Phase 9 (FP): Three-Stage Valuation — Explicit Growth, Fade Glide, Terminal Steady-State

> **Milestone**: Phase 9 (Fade Phase, designation `FP`) — Three-Stage DCF: Explicit FY2026–FY2030, Fade FY2031–FY2035, Gordon Terminal
> **Protocol**: 1.0
> **Status**: 🟢 Finalized — Ready for Implementation (growth fade only, WACC constant at 11.04%; queued after Phase 8 + EP lineage and RP lane close)
> **Owner**: Drafted & Audited by Reviewer (`OP`), Implemented by Worker (`DS`)
> **Phase Designation**: `FP` — a MAIN phase (same standing as P1–P8, EP), NOT a Redesign (RP) sub-phase. RP phases change presentation; FP changes the forecast engine. Messages use `SUBMISSION: FP.Y`, `REVIEW: FP.Y` per AGENTS.md §4.
> **Provenance**: Implements the deferred `economy_phase.md` §10.4 revision (SBC fade + extended horizon) as a full three-stage restructure with documentation, gates, and pin regen.

---

## 1. Milestone Objective & Scope

The current model has a **growth cliff**: subscribers grow +18.39%/yr through FY2030, then the Gordon terminal drops them to +2.5% overnight. No business decelerates 16pp in one year. FP replaces the cliff with a **linear fade stage** — the institutional three-stage structure (high growth → declining growth → perpetuity) — as explicit forecast periods FY2031–FY2035, not a closed-form H-model.

Director rulings locked at planning (pre-draft):

- **FP.A — Explicit fade years (Option A), not the H-model.** A closed formula hides five years inside an identity; an auditable model never hides periods. Terminal stays pure Gordon on the normalised FY2035 — EIG-A1 survives, re-anchored.
- **FP.B — Fade lives in driver schedules, not engine formulas.** The deceleration is a per-year driver path; no fade constant enters `dcf.js`.
- **FP.C — The §10.4 SBC fade is promoted into the base path.** `SBC_FADE_STEADY_STATE_PCT` becomes the actual FY2031–FY2035 statement path via a schedule-driven fade; the EP.4 sensitivity band converges with the base model.
- **FP.D — Fade floor is 4.0%, NOT the 2.5% terminal rate.** The glide runs subscriber growth 18.39% → 4.0% across FY2031–FY2035, then Gordon continues at 2.5% off the FY2035 base. Rationale (Director, on record): the step-down from a 4.0% fade floor to 2.5% perpetuity is a normal maturity deceleration; stepping from 18.4% straight toward 2.5% would force the company to grow *slower* than GDP during the visible glide — indefensible for a category leader still mid-penetration. The floor driver is range-checked to sit strictly between `terminal_growth_rate` and the explicit-stage growth rate, so the ordering `explicit (18.39%) > fade floor (4.0%) > terminal g (2.5%)` is a gate, not a convention.

Out of scope: FY2026–FY2030 explicit-period drivers/statements (frozen — one tie-out refresh, not two), peer set changes, ERP/beta revisions.

### 1.1 The disclosed tension (write this into the page, not the code)

The fade adds five revenue years at decelerating-but-high growth (FP.D makes them genuinely growth years: FY31 ≈ 15.5%, FY32 ≈ 12.6%, FY33 ≈ 9.8%, FY34 ≈ 6.9%, FY35 ≈ 4.0% — OP-measured from the engine interpolation `18.39% − (18.39% − 4.0%) × ((t − 5) / 5)`, R4 amendment correcting planning approximations), lifting enterprise value by +13.5% ($5,332,169.32 → $6,050,147.96). However, the extended 10-period EIG-B share roll-forward adds 5 more years of SBC dilution, expanding terminal shares by +17.5% (56,903,132 → 66,862,894 shares). Because share dilution (+17.5%) outpaces enterprise value growth (+13.5%), net headline per-share moves from $118.60 down to **$111.67** (falsifying the early planning hypothesis of $130–145 where dilution was underestimated). The headline valuation remains **Overvalued** (-29.26% vs market price $157.85), sitting comfortably below the fair/overvalued boundary ($134.17 = $157.85 × 0.85). **That is the model telling the truth**: all five sensitivity band treatments are overvalued, and `labelStable` holds `true`.

---

## 2. Prerequisites & Dependencies

- **Prior phases**: Phase 8 complete (GATE PASS on record); EP complete (EIG A–E green); Redesign lane closed (RP10 merged — currently unmerged).
- **Engine modules touched**: `src/data/constants.js`, `src/data/assumptions.json` (additive fade drivers), `src/engine/forecast.js`, `src/engine/schedules.js`, `src/engine/threeStatement.js` (extension only — FY26–30 paths untouched), `src/engine/shares.js`, `src/engine/dcf.js`, `src/engine/recommend.js`, `tools/regen_pins.mjs`, `src/ui/projectionsTab.js`, `src/ui/schedulesTab.js`, `src/ui/valuationTab.js`, `src/ui/summaryTab.js`, `src/ui/sensitivityTab.js`, `src/ui/charts.js`, `index.html`.
- **Frozen meanwhile** (changes here reopen this plan at Director level): FY2026–FY2030 statement paths; EP-era EIG gate semantics (re-anchoring is FP work); `tests/e2e.accuracy.test.js` pins except via stamped regen.

---

## 3. Sub-Phase Artifact Contracts

### Task FP.1: Fade Driver Architecture + Horizon Extension (engine spine)

#### A. Deliverable Files
- `src/data/constants.js` — `FORECAST_HORIZON_MAX` 5 → 10; `FADE_STAGE_LENGTH` = 5; `FADE_START_INDEX` = 5; stage metadata (`explicit` vs `fade`).
- `src/data/assumptions.json` — additive EST-marked drivers with full note discipline:
  - `paid_subscriber_fade_floor` — **default 0.04 (4.0%)** per FP.D. Range-check: `terminal_growth_rate < fade_floor < paid_subscriber_growth` — a load-bearing ordering gate, not a convention.
  - `sbc_fade_end_pct_of_revenue` — steady-state SBC ratio (default = `SBC_FADE_STEADY_STATE_PCT` ≈ 8%).
  - `fade_shape` — `linear` (v1; geometric named as future extension, not a silent alternative).
- `src/engine/forecast.js` — fade cascade: for FY2031–FY2035, `growth_t = 18.39% − (18.39% − 4.0%) × ((t − 5) / 5)`; all segment paths ride the same `growth_t`; every fade-year line carries `isEstimate: true` + `stage: 'fade'`.
- `src/engine/schedules.js` / `src/engine/threeStatement.js` — extend to FY2035 through the same per-period machinery (no fade-specific branch — FP.B).
- `tests/fade.engine.test.js` — NEW suite.

#### B. Exported Interfaces & Types
- `forecast.js` gains `stages: { explicit: ['FY2026'..'FY2030'], fade: ['FY2031'..'FY2035'] }` — single source of stage identity for every UI surface.
- Every fade-period line: `{ ...line, stage: 'fade' }` — additive, non-breaking.

#### C. Invariants & Automated Quality Gates
- [ ] FY2030 columns byte-identical to pre-FP output under same drivers (additivity proof: the 5-year model is a strict prefix of the 10-year model).
- [ ] Fade growth monotonically non-increasing, converging **exactly to the 4.0% floor** at FY2035 (no overshoot; last step lands ON the anchor).
- [ ] Ordering gate green: `18.39% > 4.0% > 2.5%` (explicit > floor > terminal g) — asserted from drivers, not literals.
- [ ] EIG-D articulation green on all 10 periods.
- [ ] Purity: zero DOM/fetch/clock/RNG; zero bare numerics >999 outside comments; zero `??` fallbacks on new paths.

### Task FP.2: Valuation Re-Anchor — Terminal, Share Roll, Band, EIG-A

#### A. Deliverable Files
- `src/engine/dcf.js` — terminal anchor to FY2035; `pvExplicit` = PV over 10 periods; EIG-A normalisation re-derives off the FY2035 WC schedule; Gordon on the normalised FY2035 FCFF **continues at g = 2.5%** (the fade floor governs the visible glide; the perpetuity rate is unchanged — FP.D). Output gains `pvByStage: { explicit, fade, terminal }`.
- `src/engine/shares.js` — roll extends FY2031–FY2035 (five more SBC years on the faded SBC path).
- `src/engine/recommend.js` — `buildLabelStability` recomputes over 10 periods; all five band treatments re-derive terminal legs off FY2035 identically to the headline.
- `tests/coherence.eig.test.js` — EIG-A/B re-anchored; EIG-D extended; NEW `tests/fade.valuation.test.js`.

#### B. Exported Interfaces & Types
- `DcfResult.pvByStage` — frozen `{ explicit, fade, terminal }` ($k), plus `terminalYear: 'FY2035'`.
- `LabelStability` contract shape unchanged — treatments ×5, same names.

#### C. Invariants & Automated Quality Gates
- [ ] EIG-A1 exact on FY2035 (Gordon on the normalised series, re-derived from raw lines).
- [ ] EIG-A2 re-anchors: the FY2035 deferred-revenue growth vs g gap must render truthfully (the shrunk gap is the fade working).
- [ ] EIG-B exact over 10 periods; fade-year SBC comes from the faded schedule path (FP.C).
- [ ] TV% of EV recomputed and disclosed (~73% → materially lower; the drop surfaces in the Valuation tab).
- [ ] `labelStable` behavior pinned at default drivers: with the 4.0% floor the headline likely sits near $134.17 — if band treatments split, the suite FAILS until the surface discloses it (§1.1).
- [ ] Scenario ordering Bear < Base < Bull re-pinned via regen.

### Task FP.3: UI Glide — Stage Switch, Charts, Valuation Bridge

#### A. Deliverable Files
- `src/ui/projectionsTab.js` + `src/ui/schedulesTab.js` — segmented control `Explicit FY26–30 | Fade FY31–35` (house pattern: Tab 03 Annual/Quarterly toggle, P8.4 selection contract). One 5-column stage mounted at a time (16ms budget). FY31–35 columns carry the fade-stage badge — same visual grammar as FY2026's hybrid indicator, zero new CSS vocabulary.
- `src/ui/charts.js` — trajectory charts show the **full FY2026–FY2035 arc, never stage-switched** (the deceleration is the story).
- `src/ui/valuationTab.js` — explicit 5-year DCF/WACC table kept intact and re-labelled: **"Explicit Forecast (FY2026–FY2030) — CAPM & DCF at Base WACC 11.04% (β 1.47)"** — table, discount row `1/(1+WACC)^t`, and Gordon row stay exactly as on `main` (no fade numbers enter this card; `valuationTab.js:815` `wacc-card` untouched in shape). The PV composition becomes a fixed three-row block `PV(explicit) + PV(fade) + PV(terminal) + net cash` — never stage-switched; TV% displayed; new inspector lever: fade floor.
- `src/ui/summaryTab.js` — headline, bridge, SBC band, sparklines re-derive off 10-period outputs; cards unchanged in shape.
- `index.html` — switch CSS, stage badges.
- `tests/redesign.tab5.fade.test.js` (+ tab6 additions).

#### B. Exported Interfaces & Types
- Stage switch state persists across re-render and driver edits (P8.4 selection contract); disposed on `dispose()`.

#### C. Invariants & Automated Quality Gates
- [ ] Toggle sweep: both states render, zero console errors, state persists across re-render + driver edit.
- [ ] Footer row on BOTH states: "Stage 3: Gordon g=2.5% off normalised FY2035" (the Explicit view never silently becomes a 2-stage model).
- [ ] Charts never stage-switch (asserted).
- [ ] Explicit 5-year WACC/DCF card label contains "Explicit Forecast (FY2026–FY2030)" and shows no fade numbers (asserted).
- [ ] Perf: single-stage mount keeps the 16ms median; 10-period engine loops benchmarked in FP.1 before UI work.
- [ ] Zero `style=`; zero bare numerics >999 in `src/ui/` additions; em-dash rule per RP10 precedent.

### Task FP.4: Pin Regen, Tie-Out Refresh, Documentation

#### A. Deliverable Files
- `tools/regen_pins.mjs` — one machine pass; hash stamp covers new drivers + touched engine files.
- `tests/e2e.accuracy.test.js` — regenerated pins + docstring, stamped.
- `docs/conventions.md` §6 append — **Fade Stage Law**: explicit-stage growth must converge toward the terminal anchor through a declared driver glide with a floor strictly between the explicit rate and g; a terminal value may never sit on a growth rate the explicit path never approaches (the cliff prohibition).
- `docs/spec.md` + `dcf.js` header — lockstep three-way with code.
- `docs/status.md` — FP row (OP-owned).
- §1.1 tension paragraph carried into user-facing model documentation.

#### B. Semantics
- Pin moves disclosed per the EP commit rule: e.g. "pins moved: perShare $118.60 → $X (FP three-stage: fade floor 4.0%, SBC fade promoted to base path, terminal re-anchored FY2035)".
- All RP-era engine-truth tie-outs refreshed green against the 10-period engine (method values 124.49/102.17/211.40/390.10 re-derive under the extended roll).

#### C. Invariants & Automated Quality Gates
- [ ] Stored hash == recomputed hash; regen idempotent ×3.
- [ ] Full suite green ×3, zero flakes.
- [ ] Every RP tie-out refreshed; grep for stale 5-period pins.
- [ ] Fade Stage Law live; spec/docstring/code agree three-way.

---

## 4. Performance Budget (named risk, FP-wide)

FP doubles per-period engine work; the suite already fights the 16ms median on a loaded machine. Constraints: (1) single-stage table mount mandatory; (2) FP.1 benchmarks the 10-period pipeline before UI work — if the median breaches, the fix is engine memoisation, not a loosened gate; (3) perf gates re-measured on an idle machine before OP submission.

## 5. Sequencing & Parking

- FP starts only after the Redesign lane closes (RP10 merged) and EP stays complete — one clean tie-out refresh (`economy_phase.md:32` precedent).
- Sub-phase order FP.1 → FP.4 dependency-locked; no parallel landing.
- If the Director orders scope reduction mid-phase, the H-model is the named fallback — but it requires re-spec of EIG-A1's identity and is MORE gate work, not less. Recorded so nobody rediscovers this.

## 6. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] All four sub-phases individually submitted and OP-approved (PASS ✅ each).
- [ ] Suite green ×3, zero flakes; perf gates green on idle-machine measurement.
- [ ] FY2026–FY2030 outputs byte-identical to pre-FP under same drivers (additivity proof).
- [ ] EIG A–E green, re-anchored; EIG-A2 discloses the shrunk gap truthfully.
- [ ] `pvByStage` three-row bridge live; TV% of EV disclosed.
- [ ] Stage switch + full-arc charts + footer terminal row asserted; both toggle states swept.
- [ ] Fade ordering gate green: explicit growth (18.39%) > fade floor (4.0%) > terminal g (2.5%) — driver-derived.
- [ ] Pins stamped and regenerated; all RP tie-outs refreshed; docstring ≡ assertions.
- [ ] Fade Stage Law in `conventions.md`; spec/code/docstring lockstep.
- [ ] `labelStable` honest at the new headline — whatever it says (§1.1).
- [ ] Zero `??` fallbacks, zero bare literals > 999 outside comments, determinism gates on all new code.

---

> **Disclaimer**: this document records a modeling plan and measured outcomes. The fade-stage values are `EST` judgments; the headline per-share value of record is **$111.67** (FP.4 machine pass), where dilution (+17.5% share count) dominates enterprise value expansion (+13.5% EV).
