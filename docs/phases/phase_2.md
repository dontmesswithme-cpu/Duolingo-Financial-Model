# Phase 2: Supporting Schedules — Historical Basis + Driver/Projection Logic

> **Milestone**: Phase 2 — Supporting Schedules
> **Protocol**: 1.0
> **Status**: 🟢 Active (Director-approved as drafted 2026-09-01 — no amendments)
> **Owner**: Drafted & Audited by Reviewer (`OP`), Implemented by Worker (`DS`)
> **Objective**: Build the supporting-schedule engine layer on top of the verified P1 historical corpus: working capital, PP&E roll-forward, intangible amortization, debt (Duolingo's debt-free case handled explicitly), and stock-based compensation — each schedule's historical lines computed **from the loaded corpus** (never re-typed), each forecast side expressed as pure driver-application functions that P3's linked projections will consume. The assumptions infrastructure (`assumptions.json` + driver schema + fail-closed loader) ships here, with every default value traceable to a corpus computation or explicitly labeled a judgment.

---

## 1. Milestone Objective & Scope

Phase 2 implements `src/engine/schedules.js` per spec §3.2 and the named-driver assumptions layer per spec §3.1. Three sub-phases per `docs/plan.md` §2: P2.1 working capital, P2.2 PP&E roll-forward + intangible amortization, P2.3 debt schedule + SBC schedule. Historical schedule lines read directly from the P1 corpus through the loader; projection logic is exposed as pure functions of `(drivers, periodInputs)` so Phase 3 can link statements without circular dependencies (the revenue cascade belongs to P3, not P2). Where a schedule needs balance-sheet **note detail** the corpus does not yet carry (PP&E gross/accumulated, intangible components), P2.2 transcribes it from the already-ledgered 10-Ks into `balance.json` through the full Accuracy Gate.

**Out of scope**: revenue/expense forecasting (P3), scenario application machinery `scenarios.apply` (P3 — P2 only *defines* scenario deltas on drivers), market-input defaults rf/beta/ERP/price (P4), WACC/DCF (P4), any UI (P5), hypothetical debt issuance (the model handles the debt-free case explicitly per spec §3.2 — no speculative debt drivers).

---

## 2. Prerequisites & Dependencies

- **Completed Prior Phases**: Phase 1 — GATE PASSED 2026-09-02, tag `v1.0-P1` (224/224 tests; 630-record corpus: income 162 + balance 159 + cashflow 257 + kpis 52, 100% cited, ledger-enforced, independently re-verified).
- **External Dependencies / Manifests**: None at runtime. Agent-time retrieval per spec §4.7 (EDGAR primary; Bigdata.com as DS aid / OP verification lane — never a citation target). OP holds all six cited filings cached at `scratch/op_p1_1_edgar/` for sub-phase re-verification.
- **Reference Documents**:
  - `docs/spec.md` §3.1 (assumptions.json), §3.2 (`schedules.build` — signature FROZEN), §4 (Data Sourcing & Verification incl. §4.7).
  - `docs/sources/README.md` (ledger rules + OP cross-check protocol — BINDING wherever new data rows land).
  - `docs/conventions.md` (Financial Data Integrity; Cell Color-Coding note: P2 is engine-only, no UI).
  - P1 binding rulings (carry-forward): derived values never hand-typed as data; per-doc verbatim text where any definition is transcribed; numbers in logs/notes must trace to dataset or filing; regression test required for every caught defect class; `GROWTH_FIXTURE` derived-anchor pattern for fixtures.

---

## 3. Sub-Phase Artifact Contracts

### Task P2.1: Assumptions Infrastructure + Working Capital Schedule

#### A. Deliverable Files
- `src/data/assumptions.json` (new) — Named driver definitions, each: `{ name, label, group, value, min, max, step, units, scenarioDeltas: { bear, bull }, notes }`. P2.1 creates the file with the `workingCapital` group only (later sub-phases append their groups; P4 adds market inputs). **Honest-defaults rule (binding)**: every `value` default either derives from corpus figures (state the derivation in `notes`, e.g. "FY2025 actual: 496,205 / 1,037,589") or is explicitly labeled a judgment default ("EST judgment") — no untraceable numbers, anywhere.
- `src/data/schema.js` (additive only) — `SCHEMAS.assumptionDriver`: validates name/label/group/value/min/max/step/units/scenarioDeltas/notes; `min <= value <= max`; `scenarioDeltas` present with finite bear/bull numbers; unique `name` across the file. The frozen `historicalStatement`/`kpi` schemas are untouched — additive key only (sanctioned by this contract; a needed change to frozen schemas is an escalation, not an improvisation).
- `src/data/loader.js` (additive export only) — `loadAssumptions({ readText?, dir? }): AssumptionSet`: validates every driver against `SCHEMAS.assumptionDriver`, fails closed with `ConfigError` listing every offender (the P0.3 typed error), returns a frozen set. The FROZEN `loadHistorical()` signature and four-file `HISTORICAL_DATASETS` manifest are untouched.
- `src/engine/schedules.js` (new) — module skeleton + working-capital family:
  - `build(historical, assumptions): ScheduleSet` (spec §3.2 — FROZEN signature): returns `{ workingCapital, ppe, intangibleAmortization, debt, sbc }`; P2.1 fills `workingCapital` and leaves the other families as explicit `null` placeholders (filled in P2.2/P2.3; a null family is honest scaffolding, an invented one is not).
  - `buildWorkingCapital(historical): WorkingCapitalSchedule` — per balance date (FY2021–FY2025 year-ends + Q2 FY2026), from corpus rows only: asset lines (accounts receivable, prepaid & other current assets, deferred cost of revenues, income tax receivable where present), liability lines (deferred revenues, accounts payable, accrued expenses & other current liabilities, income tax payable), each as % of revenue (annual denominator; latest quarter uses TTM revenue via `ttm.compute`); DSO = AR/revenue × 365; DPO = AP/cost of revenue × 365; deferred-revenue days; net working capital (current WC assets − current WC liabilities, cash & investments excluded).
  - Pure projection functions for the family, e.g. `projectWorkingCapital(schedule, drivers, revenueByPeriod)` — applies DSO-days / DPO-days / %-of-revenue drivers to caller-supplied period revenues (P3 supplies the revenue cascade; P2 never forecasts revenue itself). All outputs carry `isComputed: true` + `derivedFrom` chains (P1 engine pattern).
- `tests/schedules.wc.test.js` — WC suite (below).
- `tests/fixtures/duolingo_facts.js` (append) — `SCHEDULE_FIXTURES`: at minimum FY2025 DSO, FY2025 deferred revenues % of revenue, FY2025 NWC, Q2 FY2026 deferred revenues % of TTM revenue — each derived from cited corpus anchors at module load (never hand-typed), per the `GROWTH_FIXTURE` pattern.

#### B. Exported Interfaces & Types
- `loadAssumptions(opts): AssumptionSet` — frozen, validated, fail-closed (`ConfigError`).
- `schedules.build(historical, assumptions): ScheduleSet` — FROZEN per spec §3.2.
- `schedules.buildWorkingCapital(historical): WorkingCapitalSchedule`; `schedules.projectWorkingCapital(...)` — pure.
- `SCHEMAS.assumptionDriver` — new additive schema key.

#### C. Invariants & Automated Quality Gates
- [ ] **Corpus tie-out by construction**: schedule historical values are read from the loaded corpus (loader rows), never re-typed — a test mutates a corpus row's value in-memory and asserts the schedule output changes accordingly (the anti-retyping gate).
- [ ] Ratio math independently recomputed: hand-computed fixtures match (FY2025 DSO ≈ AR 162,827... derived at load from anchors; DPO, deferred %, NWC per year).
- [ ] Driver validation fails closed: out-of-range default, missing scenarioDeltas, duplicate name, min>max, non-finite step → `ConfigError` listing every offender (never first-fail-only, never silent).
- [ ] Scenario immutability: reading/applying deltas never mutates the base set (deep-frozen).
- [ ] Projection purity: projection functions are pure — no DOM/fetch/`Date.now`/`Math.random` (grep gate), deterministic byte-identical outputs across repeated calls.
- [ ] `npm test` green, 0 flakes × 3 runs; existing 224 tests untouched and green.

---

### Task P2.2: PP&E Roll-Forward + Intangible Amortization (Corpus Note Extension)

#### A. Deliverable Files
- `src/data/historical/balance.json` (appended rows only) — PP&E and intangible note detail transcribed from the **already-ledgered** 10-Ks (LED-002 FY2025, LED-003 FY2023, LED-007 FY2021; expect zero new ledger entries, zero new URLs — verify). Minimum per year as filed: PP&E gross, accumulated depreciation, PP&E net (must equal the existing `property_and_equipment_net` row); capitalized software / acquired intangible components with accumulated amortization and net (tying to `intangible_assets_net` / `capitalized_software_net`); goodwill where already present is untouched. Rows follow the frozen `historicalStatement` schema, `klass: "stock"`, `isEstimate: false`, new unique metric keys (cross-dataset `DUP_KEY` safe). Where a filing's presentation differs (e.g., FY2021's "Capitalized software, net" without separate intangible components), transcribe as filed — omit, never zero-fill; flag as a deviation for OP ruling.
- `src/engine/schedules.js` (extended) — `buildPpeRollForward(historical)` and `buildIntangibleAmortization(historical)`: per fiscal year, BOP + additions − depreciation/amortization − disposals − impairments = EOP; additions and D&A reconcile against the CF corpus rows (`purchase_of_property_and_equipment`, `capitalized_software_and_intangibles`, `cf_depreciation_and_amortization`, `cf_gain_loss_sale_capitalized_software`, `cf_loss_on_disposal_leasehold_improvements`, `cf_impairment_capitalized_software`) — where the combined CF D&A line cannot be split between PP&E and intangibles from filed data, state the split basis used or flag for ruling; **never force-fit** (P1.1 rule). Pure projection functions with drivers: capex % of revenue (total capex, default from FY2025 actuals, derivation in `notes`), D&A % of revenue, amortization treatment.
- `src/data/assumptions.json` (appended) — `capexDna` driver group.
- `tests/schedules.ppe.test.js` — roll-forward identities below.
- `tests/fixtures/duolingo_facts.js` (append) — PP&E net anchors per year + at least one gross/accumulated pair (derived from cited anchors).

#### B. Exported Interfaces & Types
- `schedules.buildPpeRollForward(historical): PpeSchedule`; `schedules.buildIntangibleAmortization(historical): AmortizationSchedule`; pure `project*` counterparts. `build()` now fills `ppe` + `intangibleAmortization` families.

#### C. Invariants & Automated Quality Gates
- [ ] **Roll-forward closes per year**: BOP + additions − D&A − disposals/impairments = EOP, and EOP **equals the existing corpus net row exactly** (mismatch = transcription error to fix, not a test to weaken — P1.2 rule).
- [ ] Additions/D&A reconcile to CF corpus rows; any split basis documented in the schedule output's `derivedFrom`.
- [ ] New balance rows: 100% cited, in-ledger (no new URLs), schema-valid, `DUP_KEY`-safe; `loadHistorical()` green over the extended corpus.
- [ ] OP cross-check (ledger README §3 — binding for the new rows): URL set-diff both directions; every new value column-pinned re-verified against the cached EDGAR HTML (`scratch/op_p1_1_edgar/`); accession/filing-date checks.
- [ ] Drivers validated + clamped + immutable + honest-defaults notes (same gates as P2.1).
- [ ] `npm test` green, 0 flakes × 3 runs.

---

### Task P2.3: Debt Schedule (Debt-Free Explicit) + SBC Schedule

#### A. Deliverable Files
- `src/engine/schedules.js` (final) — `buildDebt(historical): DebtSchedule`:
  - `hasDebt: false`, stated explicitly with **evidence**: an enumerated scan result over the cited balance sheets (FY2021–FY2025 + Q2 FY2026) showing no borrowings / notes payable / credit-facility lines exist in any cited filing (reference the corpus metrics actually present). The debt-free case is a first-class output, not an empty table.
  - Operating-lease transparency lines **as already filed in the corpus** (ROU assets; long-term operating lease liability) listed for visibility with an explicit note that US GAAP operating leases are not debt; no current-lease split is invented (the current portion sits within accrued liabilities as filed — note it, do not fabricate a line).
  - No hypothetical-issuance drivers (spec §3.2: debt-free handled explicitly; WACC implication — WACC = cost of equity — is P4's to consume).
- `buildSbc(historical): SbcSchedule` — per fiscal year + TTM: SBC from `cf_stock_based_compensation` (annual + YTD corpus rows; discrete quarters via `ttm.compute` differencing), % of revenue per year, dilution-context reference lines from corpus rows (`proceeds_from_stock_options_exercise`, `taxes_paid_net_share_settlement`, `repurchase_of_common_stock`) — read from the corpus, clearly labeled reference (not schedule math).
- `src/data/assumptions.json` (appended) — `sbc` driver group: `sbc_target_pct_of_revenue` (default from FY2025 actual: 137,437 / 1,037,589, derivation in `notes`) + scenario deltas.
- `tests/schedules.debt_sbc.test.js` — debt-free assertion with evidence; SBC tie-outs; driver gates.

#### B. Exported Interfaces & Types
- `schedules.buildDebt(historical): DebtSchedule`; `schedules.buildSbc(historical): SbcSchedule`; pure `projectSbc` counterpart. `build()` now returns the complete five-family `ScheduleSet` (no remaining `null` placeholders).

#### C. Invariants & Automated Quality Gates
- [ ] Debt-free is **proven, not assumed**: the schedule's evidence enumerates the corpus balance-sheet metric sets per date; a regression test asserts `hasDebt === false` **and** that no corpus metric matching a debt pattern (`/borrow|notes payable|credit facility|term loan/i`) exists — if Duolingo ever files debt in a future quarter, this test fails loudly rather than the schedule silently mislabeling.
- [ ] SBC tie-outs: schedule SBC per period equals `cf_stock_based_compensation` exactly (annual years + TTM via TTM OCF-style differencing); % of revenue recomputed independently in fixtures.
- [ ] Drivers validated + clamped + immutable + honest-defaults notes.
- [ ] `npm test` green, 0 flakes × 3 runs; P1's 224 + P2.1/P2.2 suites still green.

---

## 4. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] All sub-phase Artifact Contracts (P2.1–P2.3) individually submitted and approved by OP.
- [ ] `schedules.build(historical, assumptions)` resolves over the full corpus via the unmodified P0/P1 pipeline (loader + audit) with the complete five-family `ScheduleSet`; zero violations on the extended corpus (630 + P2.2 note rows).
- [ ] **Tie-out totality**: every historical schedule line traces to a corpus row by construction (anti-retyping mutation test green); every roll-forward closes and equals its corpus net exactly; SBC and WC ratios recompute from cited anchors.
- [ ] Assumptions layer: `loadAssumptions()` fail-closed on every driver-rule violation (`ConfigError`, all offenders listed); all defaults carry derivation notes or explicit EST-judgment labels; every P2 driver has bear/bull deltas; sets deep-frozen and immutable.
- [ ] Engine purity + determinism: no DOM/fetch/`Date.now`/`Math.random` anywhere in `src/engine/` (grep gate, P1.3 pattern); identical inputs → byte-identical outputs.
- [ ] Zero magic numbers in new `src/` code (config values exempt per P0.3 ruling); zero runtime dependency additions; `npm test` fully offline, green, 0 flakes × 3 runs.
- [ ] No forward-looking value entered as historical anywhere; new P2.2 data rows are 100% `isEstimate: false` + cited + in-ledger; all schedule *projected* outputs live in engine output as `isComputed: true` — never in the data layer.
- [ ] App still boots headless over the full corpus (P1 boot gate unchanged and green).
- [ ] **OP consolidated tie-out before Gate Pass**: OP independently re-computes every schedule family from the corpus, re-verifies all P2.2 additions against the cached filings (ledger README §3), and records methods + results in `docs/logs/op/phase_2.md`. Blind approval prohibited (spec §4.5).
- [ ] Frozen-surface check: `loadHistorical()` signature, `HISTORICAL_DATASETS` manifest, `historicalStatement`/`kpi` schemas, and all P1 test expectations untouched (additive changes only, per this contract's sanctions).

---

> **Drafting note (OP → DIR)**: This contract follows `docs/plan.md` §2 Phase 2 exactly (three DS sub-phases; no separate OP sweep sub-phase — OP's consolidated tie-out is a Gate requirement in §4 instead). Key design decisions for your review: (1) schedule **note detail** (P2.2) lands as additive rows in `balance.json` rather than a new dataset file, keeping the frozen four-file manifest intact; (2) the assumptions layer ships in P2.1 because P2.1 is the first sub-phase that "defines drivers" per plan.md, with market-input defaults deferred to P4; (3) projection functions are pure and take caller-supplied revenues, keeping the revenue cascade strictly in P3; (4) Duolingo's debt-free status is a proven, regression-tested schedule output rather than an omission; (5) P2.2 transcribes from the three already-ledgered 10-Ks — new ledger entries are expected to be zero, and any new URL is a deviation requiring ruling. Approve, amend, or reject before DS begins P2.1.
