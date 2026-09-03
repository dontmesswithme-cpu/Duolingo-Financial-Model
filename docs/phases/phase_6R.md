# Phase 6R: Release Readiness Polish

> **Milestone**: Phase 6R — Release Readiness Polish (Director-directed revision of the approved P6 surface)
> **Protocol**: 1.0 (internal workflow only — no protocol mentions in the product UI, per Director ruling this phase)
> **Status**: 🟡 Active — approved & kicked off by Director 2026-09-03 10:55 (OP KICK-OFF in `docs/inbox_ds.md`); DS on P6R.1
> **Owner**: Drafted & audited by Reviewer (`OP`); implemented by Worker (`DS`); **final approval authority: Director**
> **Objective**: Apply the Director's accuracy and presentation direction to the shipped `v1.0-P5`/`v1.0-P6` interface before public release: fix the two verified engine-state/presentation defects (scenario comparison double-delta; debt-schedule lease row), remove all workflow-protocol artifacts from the product UI, and calibrate the presentation layer (naming, percent formatting, citations, grid consistency) — without touching engine arithmetic, corpus data, or any frozen contract surface beyond the presentation/controller scope specified here. **This phase is release-blocking: the `v1.0` tag cannot issue until every sub-phase passes OP review AND the Director issues an explicit final-pass approval. OP PASS ≠ release.**

---

## 1. Milestone Objective & Scope

Phase 6R exists because the Director's review of the shipped interface found (a) two genuine defects that survived OP's audits, (b) workflow-protocol content that must never appear in a portfolio product, and (c) presentation polish the Director wants before the product represents them publicly. The Director owns visual judgment (standing since P5.6); Director decisions recorded 2026-09-03 are binding contract terms here: **sensitivity grid tracks the active scenario** · **color-coding legend removed** · **hybrid citation superscripts** · **scenario names renamed at display layer only**.

**In scope** (frozen-surface amendments, presentation/controller only):
- `src/app.js` — scenario comparison semantics fix (P6R.1)
- `src/ui/*.js` — presentation-layer changes per sub-phase contracts
- `index.html` — CSS (slider styling, grid calibration support), Cover/TOC content, footer disclaimer
- `docs/` — this spec, logs, no-touch elsewhere

**Out of scope**:
- `src/engine/*.js` arithmetic — behavior-frozen. P6R.1's fix is controller-level; if a fix cannot be achieved without engine changes, STOP and escalate to Director.
- `src/data/historical/` (706 records, `git diff v1.0-P5` must remain empty), `src/data/assumptions.json` driver keys/values/deltas (display layer translates, never mutates), internal scenario keys `bear/base/bull`, `tests/` expectations for engine pins.
- Any new valuation method. Comps / Precedent Transactions / LBO rows in the TOC & Model Architecture table are **retained as-is** (Director: future methods planned).

---

## 2. Prerequisites & Dependencies

- **Prior state**: P6 sub-phases all approved (P6.1 ✅ P6.2 ✅ P6.3 ✅); Phase 6 gate HELD for Director sign-off; suite 510/510 ×3; corpus 706 frozen; `docs/logs/op/phase_6.md` records the P6 tie-outs.
- **Verified defect evidence (this phase's genesis — recorded in OP investigation probes, read-only, 2026-09-03)**:
  - `scratch/op_dir_sens_probe.mjs` — scenario comparison table renders correctly at default (Bear 10.35%/2.00%/$132.16, Base 8.66%/2.50%/$249.36, Bull 7.13%/3.00%/$532.17), but after `setScenario('bear')`: Base row mutates to Bear's values (10.35%/2.00%/$132.16) and Bull shifts to ~$249.98 — `app.js:400-405` builds all three `runFullValuation` calls from `workingAssumptions` (active-scenario-adjusted) instead of the scenario-neutral driver state, double-applying deltas.
  - `scratch/op_p6_3_tieout*.mjs`, corpus reads — debt schedule lease row: engine carries ASC 842 long-term operating lease liability correctly (Q2 FY2026 = 86,136, cited, verified); the schedules grid shows historical years as 0 and holds 86,136 constant FY2026–FY2030 with no footnote (no lease forecast driver exists).
  - `schedules.js:955-1027` — debt-free verification itself is correct (zero funded debt in all periods); presentation must distinguish funded debt from lease visibility rows.
- **Reference**: `docs/phases/phase_6.md` (P6 gate conditions remain the release base); `docs/OPmemory.md` §3 pin tables (frozen); Director decisions 2026-09-03 (this document §1).

---

## 3. Sub-Phase Artifact Contracts

### Task P6R.1: Engine-State Accuracy Fixes — Scenario Comparison & Debt Schedule

#### A. Deliverable Files
- `src/app.js` (controller semantics, minimal diff)
- `src/ui/sensitivityTab.js` (highlight relabel; description text)
- `src/ui/schedulesTab.js` (lease row rendering + footnote + balance-card symbol)
- `tests/` — additive regression tests covering the scenario-state defect class (see C-invariants)

#### B. Semantics (binding — DS implements exactly this)
1. **Scenario comparison semantics**: the controller maintains the scenario-neutral driver state (user's current base drivers with zero scenario deltas applied). The active view (all bound tabs, valuation outputs) = neutral state + active-scenario deltas (current behavior, preserved). The **Scenario Comparison table** on the Sensitivity tab computes each of the three cases as `neutral state + that scenario's deltas` — never from the active-scenario-adjusted state. User slider edits continue to flow into both (comparison reflects the user's current drivers, canonical deltas applied exactly once).
2. **Sensitivity 9×5 grid tracks the active scenario** (Director decision): the matrix centers on the active WACC (current behavior — preserve it), and the row highlight badge relabels **BASE → ACTIVE**, with matrix description updated to state the center follows the active scenario's WACC. When active = base, the highlight cell = the base valuation pin (249.36 at 8.66%×2.50%) — pin invariance holds.
3. **Debt schedule lease rows**: historical years render the **filed corpus values** (FY2021 29,124 · FY2022 23,503 · FY2023 21,094 · FY2024 54,656 · FY2025 93,779 · Q2 FY2026 86,136 — `$k`, cited rows already in corpus; render from `schedules.debt.byPeriod[].operating_leases.long_term_lease_liability`, no new data). FY2026–FY2030 lease values carry a visible footnote: *"held at last filed Q2 FY2026 level; no lease forecast driver — see methodology"*. Funded-debt rows stay zero with the existing `debt_free_verified` basis text surfaced in the grid header or footnote (labeling so a reader cannot conflate the two).
4. **Balance gate card**: `Assets === Liabilities + Stockholders' Equity` → `Assets = Liabilities + Stockholders' Equity`.

#### C. Invariants & Automated Quality Gates
- [ ] **Scenario-state integrity (new standing gate — the audit correction)**: real-browser sweep across **all interactive states** — default, active=bear, active=bull, plus a slider edit in each — asserting: comparison table shows canonical values per scenario derived from the neutral state (Bear 10.35%/2.00%/$132.16 · Base 8.66%/2.50%/$249.36 · Bull 7.13%/3.00%/$532.17 at unedited drivers); no scenario's row equals another's WACC or terminal g; pin invariance at default state (perShare 249.35851138243592, +68.08%).
- [ ] Lease row: historical cells equal corpus filed values exactly (column-pinned re-check); footnote present; funded-debt zero rows visually distinct from lease visibility rows.
- [ ] `git diff v1.0-P6R-base -- src/engine/` empty (engine untouched); corpus diff empty; suite green ×3, 0 flakes, additive tests only.
- [ ] OP re-runs the full P6.1 rendered-view sweep (all 8 tabs, default state) — zero regressions.

---

### Task P6R.2: Cover/TOC Protocol Removal & Product Disclaimer

#### A. Deliverable Files
- `index.html` (Cover/TOC content, footer), CSS as needed

#### B. Binding Requirements (Director, verbatim intent)
1. **Remove entirely**: the `Preparers / Protocol` row (`DS (Worker) / OP (Auditor) · Protocol 1.0`).
2. **Remove all "Protocol 1.0" mentions from the product UI** — including "under protocol 1.0" in the IMPORTANT DISCLAIMER and the subtitle's "Interactive Protocol 1.0 Interface". Zero occurrences of `protocol` in rendered DOM (case-insensitive; the word must not appear anywhere the user can see).
3. **Remove the Status column** from both the Table of Contents table and the Model Architecture table.
4. **Remove the Color-Coding & Labeling Legend** section entirely (Director decision: removed — the `cell-formula`/`cell-link` color semantics may remain in code/classes, but no legend card is shown).
5. **Footer**: replace "Static browser model — zero build step, zero runtime dependencies. Not investment advice. All forward-looking values are marked EST; market inputs are marked MKT." with a standard independent-model disclaimer conveying: this is an independent, unofficial financial model; **not affiliated with, endorsed by, or associated with Duolingo, Inc.**; for educational/analytical purposes; not investment advice. (EST/MKT vocabulary stays in the models' own cell badges — only the footer sentence is replaced. DS drafts wording; OP verifies against Director's "standard individual disclaimer" intent; Director approves wording at final pass.)
6. **Keep** the Comps / Precedent Transactions / LBO rows in Table of Contents & Model Architecture (marked excluded per Director decision — existing wording retained; Director plans to add these methods later).

#### C. Invariants & Automated Quality Gates
- [ ] Rendered DOM contains zero matches for `/protocol/i`, `/DS \(Worker\)/`, `/OP \(Auditor\)/`; disclaimer contains "not affiliated" + "not investment advice"; TOC/Architecture tables intact minus Status column; excluded-method rows still present.
- [ ] No other content loss on Cover (version, methodology summary, navigational index intact).

---

### Task P6R.3: Assumptions Tab — Scenario Naming, Percent Display & Slider Styling

#### A. Deliverable Files
- `src/ui/assumptionsTab.js`, `src/ui/format.js` (display-only), `index.html` CSS

#### B. Binding Requirements
1. **Scenario labels (display-only)**: Bear → **Downside** · Base → Base · Bull → **Upside** everywhere user-visible (Active Model Scenario selector, badges, comparison table names, tab copy). Internal keys `bear/base/bull` are FROZEN (engine, tests, pin tables, corpus of test expectations all reference them) — a single display-label map at the UI boundary. Grep gate: no `bear|bull` literals in rendered DOM; internal keys unchanged in `src/engine/`, `src/data/`, `src/app.js` state machine.
2. **Percent formatting**: driver values whose units are ratios render as percentages in the blue value box (e.g., Deferred Cost of Revenues: **9.89%** not 0.0989; terminal growth 2.50% not 0.025; SBC 13.25% not 0.1325). Unit-tag suffixes like `pct_of_revenue`, `pct_growth_annual`, `pct_decimal` disappear from user-visible labels (the driver's human label + formatted value carries the meaning; slider ranges and engine inputs unchanged — display translation at the formatter only).
3. **Sliders**: iOS-style slider thumb/track (larger rounded thumb, subtle track fill) — **keep the current blue color scheme** (`.cell-input` / #0052cc family). Number-input companions stay synchronized with slider position (existing behavior preserved).

#### C. Invariants & Automated Quality Gates
- [ ] Display-only: internal driver keys/values/deltas byte-identical (`git diff` on `src/data/assumptions.json` empty); scenario keys unchanged engine-side; `setScenario('bear')` API unchanged.
- [ ] Percent round-trip: every ratio-unit driver's displayed %, when parsed back, equals the engine's raw value (tolerance: display rounding only, 2 decimals); slider step/min/max clamping behavior unchanged; MKT badges, asOf dates, provider links (FRED/stockanalysis/Damodaran) all preserved.
- [ ] All-scenario-state sweep re-run after rename: selector interaction works, comparison rows bind, zero console errors.

---

### Task P6R.4: Historicals Citation Hybrid & Cross-Tab Grid Calibration

#### A. Deliverable Files
- `src/ui/historicalsTab.js` (citation presentation), all tab view files (grid config consistency), `index.html` CSS

#### B. Binding Requirements
1. **Citation superscripts — hybrid model (Director decision)**:
   - Each **period column header** carries the primary filing citation: `FY2021 [1]`, `FY2022 [2]`, … linking to that column's primary filing URL. Primary per column = the filing cited by the majority of rows in that column (per-dataset; e.g., income FY2021 primary = FY2023 10-K restated basis; balance FY2021 primary = FY2021 10-K).
   - **Inline row superscripts appear ONLY on exception rows** — rows whose `source.url` differs from their column's primary filing. Non-exception rows lose their inline `[n]` (the column header carries it).
   - The **Citations Drawer is unchanged** — full per-row source detail remains available on click; every rendered `[n]` resolves to a ledger URL; the audit citation stays in the data layer (this is presentation reorganization, not citation weakening).
   - TTM/Computed columns carry no filing citation (they are derived; existing `computed` marking stays).
2. **Grid calibration & consistency**: one shared Tabulator layout baseline across all grids on all tabs (column min-widths, label-column width, header height, row height, font sizing): Schedules tab (currently over-stretched) and Projections tab (needs calibration) conform to the same baseline as Historicals; no tab's grids visibly diverge in layout at 1280px or 390px. Frozen label columns intact; existing keyboard/clipboard behavior unchanged (P5.3 layer-3 battery re-run).

#### C. Invariants & Automated Quality Gates
- [ ] Citation integrity: column-header `[n]` ↔ primary filing URL correct per column per dataset (OP re-derives the full primary map from corpus and compares against render); exception-row set exactly equals rows with `source.url ≠ column primary` (OP sweep asserts both inclusion and exclusion — no orphan inline sups, no unflagged deviations); 706-corpus diff empty.
- [ ] Layout consistency probe: DOM-sampled column widths / row heights within tolerance across all tabs at 1280px and 390px; no viewport-level horizontal scroll regression; frozen columns intact; keyboard + TSV copy battery green.
- [ ] All-scenario-state sweep re-run; zero console errors; suite green ×3.

---

## 4. Milestone Acceptance Criteria (Gate Requirements)

- [ ] P6R.1–P6R.4 individually submitted and OP-approved; **every verdict cycle uses the all-scenario-state rendered sweep** (default, bear-active, bull-active, slider-edited states) — this gate exists because the scenario defect survived default-only sweeps at P5.5 and P6.1. It is now standing.
- [ ] Engine behavior-identical: `git diff v1.0-P6R-base -- src/engine/` empty; `src/data/historical/` diff empty; `assumptions.json` diff empty; default-state pin set unchanged (perShare 249.35851138243592 · WACC 0.086638 · Bear 132.16 · Bull 532.17 · hybrid invariants).
- [ ] Suite green ×3, 0 flakes, additions only; all standing UI gates hold (zero inline `style=` in `src/ui/` · UI literal gate · data-content gates: rendered values = corpus/engine re-derivations · sole badge path · `editor:false` · keyboard guard scoped).
- [ ] Product-surface cleanliness (P6R.2 gates): zero `protocol` in rendered DOM; disclaimer present; Status column gone; legend gone; excluded-method rows retained.
- [ ] OP consolidated tie-out in `docs/logs/op/phase_6R.md` (methods, per-check results, probe inventory).
- [ ] **RELEASE BLOCK (binding)**: OP approval of all four sub-phases does NOT trigger archive or `v1.0`. The phase gates only on the **Director's final pass** — an explicit Director approval message after reviewing the shipped interface. On that approval: OP updates `docs/status.md`, appends the Director sign-off quote to the log, runs `node tools/archive_phase.mjs phase_6R`, and tags **`v1.0`**. Until then: no tag, no archive, no release.

---

> **Director decisions encoded (2026-09-03)**: (1) sensitivity grid tracks active scenario, highlight relabeled ACTIVE. (2) Color-coding legend removed. (3) Hybrid citation superscripts (column-header primary + exception-only inline). (4) Scenario names Downside/Base/Upside at display layer only. (5) Phase named 6R within the P6 ledger lineage. (6) `v1.0` tags only after Director's final-pass approval — OP PASS is not release authority.
