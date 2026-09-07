# Phase 7 Solution: Driver-Defense — Thesis Defense Panel (Converged Design)

> **Document**: `docs/phases/phase_7_solution.md` — the converged OP+DS practitioner solution to the Director's problem: *"Before gate close, I'm gonna need a lot more footnotes explanation in the valuation tab. I want to defend all drivers in the notes."*
> **Status**: Drafted by DS from the R1–R3 agreement (fidelity review by OP pending; Director approval = Phase 7 gate pass)
> **Deliberation record**: `docs/inbox_op.md` (DS R1, R3) · `docs/inbox_ds.md` (OP R1 kick-off, R2 rulings) · `docs/logs/ds/phase_7.md` · `docs/logs/op/phase_7.md`
> **Design invariant (governs every clause)**: **static prose, dynamic figures.** Every numeral the reader sees in a defense surface is computed at render time from live drivers/engine/corpus. Prose carries reasoning; figures carry derivation. A defense that can stale silently is a defect, not a footnote.

---

## 1. Problem Definition (agreed, R1 §A-1)

A valuation whose drivers cannot each survive a skeptic's cross-examination at the point of consumption cannot ship. Today every lever is answered *somewhere* (Assumptions notes, driver records, OP verdicts, logs) but not where the skeptic stands: on the Valuation tab, beside the number being challenged. The deliberation produced live proof of the failure mode (**Exhibit A**, §7): two prose-embedded figures in shipped driver notes went stale/wrong and survived six review cycles because no automated gate reads prose numerals.

**Scope of "all drivers"**: the levers the *verdict consumes* get defended at the point of consumption (Valuation tab). The 38-driver operating cascade stays defended in its existing home (Assumptions-tab per-driver notes, each FY2025-anchored and cited) — **linked from the panel, never duplicated**.

---

## 2. Solution Overview (agreed)

A single **Thesis Defense panel** on the Valuation tab: one `valuation-card` placed directly below the live-price banner, containing **ten expandable defense rows** (`<details>` — the shipped Historicals citation-drawer and Summary KPI-drawer patterns), collapsed by default, each anchor-linked (superscript) from the table rows that consume that lever (WACC build table, DCF schedule, bridge table, dual-path card). No new tabs (8-tab shell frozen); no drawer (all-or-nothing hiding — ruled out R2 §A-2); no free-standing cards (density — ruled out R1 §A-3).

Each row's anatomy (agreed R1 §B-3 + R2 amendment):
1. **Runtime value line** — one line: the live figure + units (from the driver record or engine object at render).
2. **Why-this-choice** (leads) — the defense prose: the choice rationale, in the driver record's own terms.
3. **Source / asOf / provider link** — via the standing `mktBadge`/`estSuffix` vocabulary paths.
4. **Flip-map** (levers 1–4, 7): the computed verdict-geometry (§4) — parity, both ±15% band-flips, unreachable-flip honesty — signed, in the lever's own units.
5. **Mechanism line** — what machinery keeps this row true (tripwire/gate name).

The WACC table already renders the *what* (component, value, driver, asOf, provider link per row); the panel rows carry the *why*. No duplication beyond the one runtime value line.

---

## 3. The Ten Levers (inventory ratified R2 §B-1)

Skeptic test applied (R1 §B-a): *would a skeptic standing at the verdict accept the model if this lever moved against the thesis?*

| # | Lever | Anchor-linked from | Runtime value source | Defense content ("why-this-choice") | Mechanism |
|---|---|---|---|---|---|
| 1 | **Risk-free rate (rf)** | WACC table rf row | `wacc.riskFreeRate` (driver record) | 10Y UST benchmark basis; FRED DGS10 posted-vs-pending release honesty (6R2.3 convention); scenario deltas move the discount rate inversely to equity risk appetite | Driver-record render; derivation-guard re-derives from record |
| 2 | **Beta (peer median)** | WACC table β row; beta derivation block | `wacc.beta` + runtime `beta.regress` block (shipped) | Bottom-up median over locked peer set (SPOT/RBLX/NFLX; COUR/UDMY removal disclosed); debt-free ⇒ no relevering; own-OLS cross-check (t, R²) — the shipped beta block already ~90% of this anatomy | Runtime regress (shipped); peer-set lock tripwire |
| 3 | **Equity risk premium (ERP)** — *amended ordering, R2 §B-3* | WACC table ERP row | `wacc.erp` (driver record) | **Leads with the smoothing rationale** (mechanical trailing-3M average; dated; single-print-noise rejection; Jan-2026 table-retirement lineage — Finding C); print arithmetic demoted to one sub-line | Driver-record render; derivation-guard |
| 4 | **Terminal growth (g)** | DCF schedule / terminal rows | `dcf.terminalGrowthRate` + computed flip-map | 2.5% choice: below-WACC ceiling, nominal-GDP ceiling (upper bound, contract note); **flip-map asymmetry is the defense** (§4): within its stated bounds, g cannot rescue the thesis — only the discount rate or the flows can | Computed flip-map at render; derivation-guard |
| 5 | **Tax normalization (13.42%)** | WACC tax row | `wacc.taxRate` + driver record notes | Normalized structural rate, NOT observed effective: FY2025 −126.99% (VA release) prohibited as anchor; FY2024 13.4225% = most recent undistorted year; below-statutory rationale (VA + FTC position); user-overridable | Driver-record render; derivation-guard |
| 6 | **Net cash bridge** | Bridge table rows | `dcf.bridge` components + `dcf.netCash` | Why today's balance against a 5-year DCF: FCFF-headline convention (6R2.4) — after-tax interest income in flows, cash added once, zero double count; Q2 FY2026 filed basis + asOf; debt-free sweep enumeration | Corpus render; bridge-component tripwire |
| 7 | **Scenario bands (deltas)** | Sensitivity/comparison anchors | Driver `scenarioDeltas` records | Whose judgment: the bands bracket their cited spans with margin — β ±0.15 vs peer span [1.44, 1.57] (~2.3×); per-band table renders value, bracket, margin at runtime (permanently answers the 6R3.2 delta-adequacy flag) | Delta-record render; band-vs-span tripwire |
| 8 | **Benchmark price** | Verdict/summary anchors | `market_share_price` record + 6R2.5 fetched-price state | Three true sentences (agreed R2 §A-1): live close feeds verdict math (`isOfficialClose`-gated, 6R2.5); immobile snapshot anchors scenario comparison (deltas 0 since P3 — moving the benchmark empties the upside metric of information); OHLCV decoration staleness remediated in P8.0 ledger (Exhibit A-2) | Fetched-state + driver render; derivation-guard |
| 9 | **Discount-mechanics digest** | DCF schedule + waterfall anchors | `dcf` object: terminal FCF → Gordon multiple → PV(TV); **PV(TV)/EV share computed** | Structural honesty: the verdict lives mostly in the terminal value (72.6% at P6R3 baseline — recomputed at render); digest points at the existing Finding-E rows, defends nothing twice | Computed digest; derivation-guard |
| 10 | **Shares / dilution** | Bridge per-share row | `shares_outstanding` record | Diluted 50,031,000 (10-Q Note 11, treasury-method gap ~3.24M vs basic 46,786,269); held constant per P4 contract (no share-count forecast driver); SBC-drift direction disclosed | Filing-cited render; derivation-guard |

**Argued OUT (accepted R2 §B-1, verbatim)**: individual forecast drivers (paid-sub growth, ARPU, cost ratios, SBC, capex, W.C. ratios, revenue-mix growth) — all remain in Assumptions notes, linked; horizon/terminal-FCF walk — a consequence, absorbed into lever 9.

---

## 4. Flip-Map Specification (agreed R2 §B-4; verified R1 probe + R3 closed-form check)

Every flip coordinate is **computed at render** from frozen engine surfaces — zero new engine modules (probe-proven: `scratch/p7_r1_breakeven_probe.mjs`, `scratch/p7_r3_closedform_g.mjs`). Thresholds import from `RECOMMENDATION_THRESHOLDS` (±15%), never literals.

Each WACC-component lever (rf, β, ERP) states, **signed, in its own units**:
- **Parity coordinate** — the lever value at which perShare == benchmark (10.185% WACC at P6R3 baseline).
- **Overvalued flip** — the lever value at which the Base verdict flips overvalued (WACC 11.780%, i.e. rf +74.25bps | β +0.175 (ΔWACC/ERP) | ERP +50.5bps (ΔWACC/β) — illustrative at baseline; recomputed at render).
- **Undervalued flip** — likewise toward undervalued (WACC 9.060%: rf −197.75bps | β −0.465 | ERP −134.5bps).
- **Reachability honesty** — if a flip lies outside the driver's permissible bounds or the grid band, the row SAYS so ("unreachable within bounds [0, 4%]") rather than rendering a bare coordinate.

Terminal-g flip-map (lever 4), same structure in bps of g: parity 3.621% (+112.1bps, outside the ±100bps band); overvalued flip <1.457% (−104.3bps); **undervalued flip unreachable** (requires g ≥ 4.000% = the structural ceiling) — rendered as the R2-ratified sentence: *within its stated bounds, terminal growth cannot rescue this thesis — only the discount rate or the flows can.* No static prose could produce this defense; it is only true because it is computed.

**Computation mechanics (implementation note, verified; C1-corrected per fidelity cycle 1)**: the g-axis has an exact closed form — with A = pvExplicit + netCash − targetEquity and B = df_T × terminal-base-FCF, g* = (A·WACC + B)/(A − B) — one division, zero iterations, exact to 1e-9 against engine bisection on all reachable cases (parity and both flips). **`terminal-base-FCF` is the final explicit-year FCF BEFORE g-growth** (591,200.80 at the P6R3 baseline) — NOT the UI-rendered "terminal FCF" (605,980.82), which is already grown by ×(1+g); substituting the grown value into B silently corrupts g* by ~17bps (3.448% vs the true 3.621%). This ×(1+g) trap is the standing hazard of the engine's TV convention (TV = grown-FCF/(WACC−g)) — the implementation gate pins the base value derivation and the derivation-guard suite asserts it. The WACC axis uses bisection on frozen `dcf.valuate` (df and TV are nonlinear in WACC); ~80 iterations of pure arithmetic, O(1) engine calls — no latency-budget risk (<16ms standing budget; each `valuate` call is the same cost as one grid cell, and the grid already renders 45 cells well inside budget).

**Grid overlay (verdict-map boundary on the sensitivity grid): DEFERRED to P8** — the sensitivity grid is the densest surface on the tab and an overlay is a new visual claim needing its own real-browser audit; P8.0 ships the flip-map *rows* only. **Director-flagged option**: this deferral is OP's scope ruling, not a technical necessity; the Director may order the overlay into P8.0 at approval time (see §10).

---

## 5. Maintenance Machinery (agreed R2 §A-3, §A-4)

1. **One consolidated derivation-guard suite** (not per-card suites — duplication ruled out). Every panel numeral re-derives from live driver records + engine + corpus at test load (the generalized R4 pattern — expectations derived, never transcribed). Staleness fails the suite.
2. **Tripwires re-derive from the driver record + corpus ONLY — never from live provider pages** (R2 §A-3 ruling: provider pages change shape; provider-parsing tests are flake farms — the P6R2.3/P6R3.1 lesson). Live re-pulls remain an **OP audit-lane activity at gates** (the 6R3.1 pattern), not a suite activity.
3. **Orphan-figure lint (NEW GATE)**: any named numeral in user-visible prose outside a sanctioned derivation template fails the suite. Catches the next 8.6638% pre-ship.
4. **Prose data-content gate (NEW — extension of the standing gate)**: the rendered-value gate extended to figures inside prose blocks, asserted equal to corpus/engine re-derivation **in every scenario state** (default, downside-active, upside-active, slider-edited in each) — not just grid cells.

---

## 6. Non-Duplication Map (agreed R1 §D; spec §4 criterion)

- **Assumptions tab**: sole defense home for all 38 operating drivers (existing per-driver FY2025-anchored notes at `assumptionsTab.js:104`) — linked from the panel, never copied.
- **Schedules/Projections tabs**: keep their existing methodology footnotes (hybrid FY2026 decomposition, held-constant disclosures, lease ASC 842 note) — untouched.
- **Thesis Defense panel**: the *why* for the 10 levers + one runtime value line each. The WACC table keeps the *what*.
- **EST/MKT vocabulary**: `estSuffix`/`mktBadge` remain the sole badge paths (standing ruling).

---

## 7. Exhibit A Remediation (agreed R2 §C — binding for P8.0)

Both defects confirmed live by both sides; notes-only, zero pin impact (same class as the P6R2.4 R1 ledger-string FAIL):
- **F1**: `terminal_growth_rate` note cites "Base WACC (8.6638%, ~616bps headroom)" — P4-era (`b88ce9b`); live Base WACC 11.0375%, true headroom 853.75bps. Survived six verdicts (no gate reads prose numerals — defect class shared, line DS-owned, disclosed DS-side in R1).
- **F2**: `market_share_price` note OHLCV (155.00/159.20/154.50/752,400) matches no real session; live Sep-2 row = 156.24/158.47/154.30/157.85/1,294,851 (matches OP's P6R2.3 verification). Close value correct; decoration wrong. DS-lineage, disclosed.

**P8.0 remediation ledger** fixes both under the 1:1 ledger machinery (P6R2/P6R3-proven: every changed expectation maps to a ledger row; any red outside the ledger fails the resubmission outright).

**Class sweep (binding, zero exceptions — R2 §C directive)**: full-prose sweep across all driver notes + methodology strings for the *class* — every prose-embedded numeral either derives from a live record (sanctioned template) or lands in the P8.0 ledger. F1's anatomy (a growth-driver note quoting another driver's computed value) implies siblings may exist wherever a note quotes a cross-driver figure. **P8.0 acceptance includes the sweep output.**

---

## 8. Implementation Vehicle & Phasing (agreed R2 §B-5, §B-6)

**Vehicle: P8.0 — a Phase 8 preamble sub-phase** (not an amendment to a shipped phase; not a separate mini-phase). Dependency chain: **this doc's Director approval (Phase 7 gate) → Director Phase 8 kick-off → P8.0 FIRST → P8.1+ consume the anatomy.** Rationale: building P8.1's method tables before the defense anatomy exists = defense-less surfaces built twice (the P6.3 README signature).

**P8.0 deliverables (with effort/risk):**

| Item | Files | Effort | Risk |
|---|---|---|---|
| Thesis Defense panel (10 rows, amended anatomy) | `src/ui/valuationTab.js` (+ CSS) | Moderate — 10 `<details>` rows on shipped patterns; all values already render-time | Low — no engine surface; UI literal gate intact (all figures runtime-derived) |
| Flip-map computation + rendering | `src/ui/valuationTab.js` (pure view-tier math on frozen engine outputs) | Low-moderate — g closed-form + WACC bisection, both probe-verified | Low-moderate — bisection bounds must respect the WACC>g guard (probe pattern handles); latency budget headroom large |
| Consolidated derivation-guard suite | `tests/p7_solution.defense.test.js` (new, additive) | Moderate — re-derives every panel numeral | Low |
| Orphan-figure lint gate | same suite (lint pass) | Moderate — **allowlist calibration is the known-hard part** (sanctioned derivation templates must be enumerable) | Medium — false positives block; calibrate against the full sweep output |
| Prose data-content gate (all states) | same suite | Moderate — all-state rendered prose assertions | Low — extends the P6R-standing sweep machinery |
| Exhibit A remediation ledger (F1+F2) + full-prose class sweep | `src/data/assumptions.json` (notes only) + ledger | Low for F1/F2 (notes-only); **the sweep is the open-ended item** | Medium — unknown sibling count until swept; ledger discipline absorbs it |
| Re-baseline: suite ×3 + screenshots | `docs/screenshots/`, logs | Low | Low |

**Explicitly out of P8.0 scope**: engine files (frozen — 6R2's enumerated lifts were the last sanctioned edits), corpus records, driver keys/schema/deltas (notes-only edits sanctioned for the ledger), the 8-tab shell, the grid overlay (deferred, §4).

---

## 9. Gate-Compatibility Statement (binding)

The solution builds under every standing gate: zero new engine surfaces (flip-map probe-proven on frozen modules); UI literal gate intact (all figures runtime-derived — the lint gate enforces it going forward); data-content gate extended, not weakened; real-browser all-state sweep covers the new DOM; `<details>` + HTML tables only (no new Tabulator grids — TabulatorFull-only rule untouched); zero external network beyond the existing 6R2.5 fetch path; EST/MKT sole-badge-path ruling preserved; zero `style=`; `/protocol/i` DOM-zero preserved (panel prose contains no protocol vocabulary).

**Phase 8 compatibility**: `src/engine/methods/*` modules return `{ method, basis, impliedPerShare, rangePerShare, inputsProvenance }` (phase_8.md §3 B.6) — `inputsProvenance` is the contract hook each method block's defense consumes; the P8.3 DCF-method block and P8.1 method tables inherit this anatomy verbatim (agreed R1 §B-e/T8). No phase_8.md text changes required — the solution compatibly extends it.

---

## 10. Closed Questions Ledger (spec §4: "open questions: NONE")

| Question (R1 origin) | Disposition | Round |
|---|---|---|
| (a) Is 8 levers "100%"? | 10 — two additions ratified with defenses; argued-OUT list accepted verbatim | R1 §B-a → R2 §B-1 |
| (b) Cards vs drawer vs rows | Expandable rows, one panel, anchor-linked; drawer ruled out (all-or-nothing) | R1 §A-3/§B-b → R2 §A-2 |
| (c) Vehicle/phasing | P8.0 preamble sub-phase; ledger machinery governs remediations; P6R3.3-amendment instinct formally withdrawn (OP) | R1 §B-c → R2 §B-5/6 |
| (d) Break-even pointers | Computed flip-maps (parity + both band-flips + reachability honesty), signed, lever's own units; closed-form g verified | R1 §B-d → R2 §B-4 |
| (e) Maintenance | One consolidated suite; two new gates (orphan-figure lint, prose data-content all-states); tripwires driver-record+corpus only | R1 §B-e → R2 §A-3/4 |
| OP R1: benchmark staleness | Split verdict: snapshot immobility defended (scenario-comparison role, deltas 0 since P3); OHLCV decoration conceded → P8.0 ledger | R1 §C-4 → R2 §A-1 |
| OP R1: delta adequacy | Lever 7 renders value/bracket/margin at runtime — the 6R3.2 flag permanently answered | R1 §D row 7 → R2 §B-1 |
| ERP anatomy | Defense-first ordering (smoothing rationale leads, print arithmetic demoted) — R2 amendment | R2 §B-3 |
| Grid overlay | DEFERRED to P8 (OP scope ruling) — **Director-flagged option**: may be ordered into P8.0 at approval | R2 §B-4a + §D |
| Detached prose-figure class | Full-prose class sweep, binding, zero exceptions, part of P8.0 acceptance | R2 §C directive |

**Escalation items: NONE.** The single Director-boundary note (grid overlay) is an option flag, not an open question — both sides accept the deferral; the Director may override at approval.

---

## 11. Acceptance Criteria Mapping (spec §4 checklist)

- [x] Every valuation lever covered — 10-lever inventory agreed (§3)
- [x] Per-lever: placement + anatomy + derivation/tripwire mechanism + gate-compatibility note (§2, §3, §5, §9)
- [x] Explicit non-duplication map (§6)
- [x] Implementation phasing with vehicle + effort/risk per item (§8)
- [x] Open questions: NONE (§10)
- [ ] OP fidelity sign-off (next step per P7.2)
- [ ] Director explicit approval → GATE PASS → HALT (release block carries: no archive/tag/`v1.0`)
