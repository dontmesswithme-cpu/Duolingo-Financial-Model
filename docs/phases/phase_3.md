# Phase 3: Linked 3-Statement Projections â€” Driver-Based Forecast, ISâ†’BSâ†’CF Linkage, Balance Gate & Scenarios

> **Milestone**: Phase 3 â€” Linked 3-Statement Projections
> **Protocol**: 1.0
> **Status**: ðŸŸ¢ Active (Director-approved 2026-09-01 â€” drafting note removed per Director instruction; no other amendments)
> **Owner**: Drafted & Audited by Reviewer (`OP`), Implemented by Worker (`DS`)
> **Objective**: Build the linked projection engine on the verified P1 corpus and P2 schedule/driver infrastructure: a driver-based forecast core (revenue cascade + cost structure, hybrid FY2026 with per-half provenance), full ISâ†’BSâ†’CF linkage with cash sweep and a hard `assets = liabilities + equity` invariant per forecast year, and the immutable Bear/Base/Bull scenario system applied over the complete three-statement path. **Engine-only phase**: zero new corpus rows are sanctioned; every forward-looking value lives in engine output as `isEstimate: true` â€” never in the data layer.

---

## 1. Milestone Objective & Scope

Phase 3 implements `src/engine/forecast.js`, `src/engine/threeStatement.js`, and `src/engine/scenarios.js` per spec Â§3.2 (signatures FROZEN there) and plan.md Â§2: P3.1 the driver-based forecast core (revenue cascade: paid subscribers â†’ subscription revenue; advertising / DET / IAP / other segments; cost structure; hybrid FY2026 per-half provenance), P3.2 the linked three-statement projection with cash sweep and the balance invariant, P3.3 the scenario system over the full path plus the balance-gate test matrix. The forecast consumes the P2 `ScheduleSet` projections (`projectWorkingCapital`, `projectPpeRollForward`, `projectIntangibleAmortization`, `projectSbc`) and the assumptions layer; revenue/segment/cost/tax/financing driver groups are appended to `assumptions.json` with honest defaults per the binding rules.

**Out of scope**: WACC/DCF/market inputs (P4), sensitivity grids (P4.3), any UI or app wiring (P5 â€” engine modules ship headless-testable only), any new corpus rows (engine-only phase: if DS believes a data gap blocks a contract item, FLAG for OP ruling â€” never transcribe unilaterally; the P2.2 disclosure lesson is binding), bookings forecasting (not named in plan.md; KPI outputs are context-only), M&A/goodwill forecast drivers (no acquisition modeling â€” goodwill and undriven stock lines are held constant with explicit notes).

---

## 2. Prerequisites & Dependencies

- **Completed Prior Phases**: Phase 2 â€” GATE PASSED 2026-09-01, tag `v1.0-P2` (291/291 tests; 706-record corpus, 100% cited; five-family `ScheduleSet`; 16 drivers across 3 groups; standing gates: engine literal gate, plug tripwires, debt tripwire, `resolveCfPeriod` mapping, TTM positivity gates).
- **External Dependencies / Manifests**: None at runtime. Cached EDGAR filings at `scratch/op_p1_1_edgar/` (6 filings) remain OP's verification substrate; no agent-time retrieval is expected in P3 (engine-only).
- **Reference Documents**:
  - `docs/spec.md` Â§3.2 (frozen interfaces + invariants: `forecast.project`, `threeStatement.project`, `scenarios.apply`/`list`, `isEstimate: true` on all forward periods, balance gate `EngineError("balance_check_failed", year)`), Â§3.1 (assumptions schema), Â§7 (resolved decisions: horizon FY2026â€“FY2030 extensible 3â€“10; hybrid FY2026).
  - `docs/conventions.md` (Financial Data Integrity), `docs/sources/README.md` (no new rows expected â€” ledger rules stand by, dormant).
  - P1/P2 binding rulings (carry-forward): derived never as data; per-doc verbatim; traceable numbers; regression test per defect class; `GROWTH_FIXTURE` derived-anchor pattern; **anti-tautology test pattern (plug pins + tripwires)**; **period-key mapping made explicit and tested**; **zero bare numeric literals > 999 in engine code**; deviations flagged at submission.
- **Corpus anchors OP has independently verified** (for contract derivation rules below; DS re-derives its own values from the corpus â€” contract figures are audit cross-checks, and copying them without corpus derivation is a fixture-echo violation): paid subscribers FY2025 12.2M / Q2 FY2026 12.7M (FY2025 growth +28.4%); subscription revenue FY2025 873,442 â†’ implied ARPU â‰ˆ $80.5 per average sub; ads 79,725 / DET 42,006 / IAP 40,479 / other 1,937; cost ratios of FY2025 revenue 1,037,589: CoR 27.77%, R&D 29.53%, S&M 12.11%, G&A 17.53%; other income net 1,609; interest income 45,231 on average (cash + ST + LT investments) â‰ˆ 1,125,751 â†’ â‰ˆ 4.0%; **FY2025 tax line âˆ’231,655 on pretax 182,410 â€” distorted by a one-time valuation-allowance release; the tax driver default must be a normalized structural rate labeled EST, never this effective rate**; buybacks 6M FY2026 69,603 (Q1 24,331 + Q2 45,272, accelerating); option proceeds FY2025 12,570; net-share-settlement taxes FY2025 âˆ’41,617; H1 FY2026 revenue 590,421 = Q1 291,967 + Q2 298,454; H1 FY2026 OCF 239,031 (cited 6M YTD row).

---

## 3. Sub-Phase Artifact Contracts

### Task P3.1: Driver-Based Forecast Core (Revenue Cascade + Cost Structure + Hybrid FY2026)

#### A. Deliverable Files
- `src/engine/forecast.js` (new) â€” pure module implementing `project(input: ForecastInput): ForecastOutput` (spec Â§3.2 â€” FROZEN signature):
  - `ForecastInput` shape (contract-defined): `{ historical, assumptions, horizon? }` â€” `horizon` integer clamped to [3, 10] (default 5 â†’ FY2026â€“FY2030); out-of-range throws typed `EngineError` naming the input. The forecast base year is FY2026 (hybrid).
  - **Revenue cascade**: paid subscribers path (driver-driven growth from the Q2 FY2026 cited base 12.7M) â†’ average subs per period â†’ Ã— subscription ARPU driver â†’ subscription revenue; advertising, DET, IAP, and other revenue as driver-driven segment paths (growth drivers off FY2025 cited bases, or %-of-subscription basis â€” DS's design choice, documented in `derivedFrom`). **`revenue_total = Î£ segments` by construction â€” no residual plug, ever** (P2 fixture identity stands in forecast years too).
  - **Cost structure**: CoR / R&D / S&M / G&A as %-of-revenue drivers; gross profit, operating income per year (all forecast IS identities recomputed, never assumed).
  - **Context outputs**: paid-subs path per year carries `derivedFrom` chains to the cited base row. DAU/MAU forecasts are NOT required (MAU reporting is stale in the corpus â€” latest filed Q3 FY2025; building the cascade on stale MAU is prohibited. See drafting note, key decision 1).
  - **Hybrid FY2026**: full-year driver estimate for FY2026; **H1 actual = engine-computed sum of the cited discrete Q1 FY2026 + Q2 FY2026 income rows** (no new corpus rows); **H2 estimate = full-year driver estimate âˆ’ H1 driver estimate** (the driver model internally estimates both halves; no uniform-split special case beyond the driver model's own annual semantics â€” documented); every FY2026 IS line carries per-half provenance: `{ h1: { value, provenance: 'actual', derivedFrom: [Q1 row, Q2 row] }, h2: { value, provenance: 'estimate' }, value: h1 + h2 }`.
- `src/data/assumptions.json` (appended) â€” new driver groups (additive; `DRIVER_GROUPS` in `constants.js` extended additively to match): `revenue` (paid-subs growth, subscription ARPU or ARPU-growth, segment growth drivers for ads/DET/IAP/other â€” other-revenue may alternatively be an explicit held-constant treatment, documented, never silently dropped), `costs` (CoR/R&D/S&M/G&A %-of-revenue, other income), `tax` (normalized structural rate â€” see Â§2 anchor warning; EST-labeled), and financing-context drivers DS needs for P3.2 (share repurchases per year; option proceeds; net-share-settlement taxes) with honest defaults.
- `tests/forecast.core.test.js` â€” suite below.
- `tests/fixtures/duolingo_facts.js` (append) â€” forecast anchors derived at module load from cited anchors per the `GROWTH_FIXTURE` pattern (e.g. FY2025 ARPU, FY2025 cost ratios, H1 FY2026 revenue = Q1+Q2 anchor sum). Hand-typed forecast values are prohibited.

#### B. Exported Interfaces & Types
- `forecast.project(input: ForecastInput): ForecastOutput` â€” FROZEN per spec Â§3.2. `ForecastOutput`: per-year IS lines (segments, total revenue, CoR, opex lines, operating income), per-half FY2026 provenance blocks, `isEstimate: true` on every forward value, `derivedFrom` chains throughout, deeply frozen.
- `SCENARIO_DELTA_KEYS` consumption is P3.3's; P3.1 ships only base-path projection.

#### C. Invariants & Automated Quality Gates
- [ ] **Segment-sum totality**: `revenue_total = Î£ revenue segments` per forecast year â€” asserted with **specific pinned values for at least FY2026 and FY2030** (anti-tautology: pin values, not just the identity; P2.2 rule).
- [ ] **Hybrid FY2026 H1 actuals tie to cited quarters**: H1 revenue = 590,421 (recomputed from Q1+Q2 corpus rows, not typed); every IS line's H1 block cites its two quarter rows; `h1 + h2 = value` asserted per line.
- [ ] **Cascade anti-retyping**: mutating the paid-subs base row (or a cited quarter row) in-memory changes forecast output â€” mutation test (P2 pattern).
- [ ] **Honest defaults**: every new driver's `notes` states the corpus derivation or "EST judgment" (tax and subs-growth MUST be EST-labeled with the distortion/staleness rationale); ranges bounded; bear/bull deltas present; `loadAssumptions()` fail-closed unchanged.
- [ ] **Fail-closed drivers**: every driver lookup via the `requireDriverValue` pattern (typed `EngineError('missing_driver', name)`); horizon clamp throws typed error.
- [ ] Purity + determinism: no DOM/fetch/`Date.now`/`Math.random`; byte-identical repeat runs; **zero bare numeric literals > 999** in `forecast.js` (standing gate; import constants like `DAYS_IN_YEAR` where needed).
- [ ] `npm test` green, 0 flakes Ã— 3 runs; existing 291 tests untouched and green.

---

### Task P3.2: Three-Statement Linkage â€” IS â†’ BS â†’ CF with Cash Sweep & Balance Invariant

#### A. Deliverable Files
- `src/engine/threeStatement.js` (new) â€” pure module implementing `project(schedules, assumptions, forecast): ThreeStatementOutput` (spec Â§3.2 â€” FROZEN signature):
  - **Income statement**: forecast IS from `ForecastOutput` + below-the-line construction: other income net (driver), **interest income = average (cash + short-term investments + long-term investments) Ã— interest-rate driver** (the ISâ†”BS linkage), pretax income, tax at the normalized driver rate, net income. FY2026 hybrid per-half provenance carried through every below-the-line line.
  - **Cash flow statement**: OCF = net income + D&A (PP&E depreciation + intangible amortization from the schedule projections) + SBC (from `projectSbc` driver path) âˆ’ Î”NWC (from `projectWorkingCapital`); ICF = âˆ’capex (PP&E + capitalized software from schedule projections) Â± investment purchases/maturities (driver or explicit held-constant note); FCF exposed. FCF = OCF + ICF identity. Financing = option proceeds + net-share-settlement taxes âˆ’ share repurchases (drivers). **Hybrid FY2026 CF: H1 = cited 6M FY2026 YTD rows directly; H2 = driver estimate; per-half provenance blocks** (period-key mapping per the P2 `resolveCfPeriod` lesson â€” the mapping IS-actuals-from-quarters vs CF-actuals-from-YTD vs BS-from-Q2-stock is explicit in code and tested).
  - **Balance sheet (year-end FY2026 â€¦ FY2030)**: enumerated construction â€” cash swept from CF (EOP = BOP + net change); investments, goodwill, ROU assets, other assets, deferred tax assets, and lease/other liability lines **held constant from the Q2 FY2026 cited balance with explicit per-line notes** (no silent constants); operating WC lines from `projectWorkingCapital`; PP&E net from `projectPpeRollForward`; intangibles net from `projectIntangibleAmortization`; equity roll: common stock held constant (note), APIC + SBC + option proceeds âˆ’ buybacks, retained earnings BOP + net income (Duolingo pays no dividends â€” held-constant policy note citing the absence of any dividend row in the corpus).
  - **Balance invariant (HARD)**: per forecast year, `assets === liabilities + equity` asserted; violation throws `EngineError("balance_check_failed", year)`; the output carries `{ balanceCheck: { year, assets, liabilities, equity, ok } }` per year for downstream UI. **No balancing plug line may exist anywhere in the construction** â€” an unbalanced year means a missing linkage is to be found and fixed, never absorbed (P2.2 rule; the anti-tautology lesson is binding: the identity is enforced on the constructed components, not via a residual).
  - **FY2026 BS anchor**: BOP = Q2 FY2026 cited balance sheet (June 30, 2026 â€” the latest cited stock date); H2 movements estimated. No FY2025-anchor hybrid BS (the FY2026 year-end BS rolls from the mid-year actual, matching the hybrid CF).
- `tests/threeStatement.link.test.js` â€” linkage suite below.

#### B. Exported Interfaces & Types
- `threeStatement.project(schedules, assumptions, forecast): ThreeStatementOutput` â€” FROZEN per spec Â§3.2. Output: `{ incomeStatement, balanceSheet, cashFlow, balanceCheck, â€¦ }` per year; every forward value `isEstimate: true`; FY2026 per-half provenance on IS and CF; deeply frozen; `derivedFrom` chains into schedule outputs and forecast outputs.

#### C. Invariants & Automated Quality Gates
- [ ] **Balance gate**: `assets === liabilities + equity` per forecast year, all years, on raw constructed components (no residual term) â€” asserted in tests by independent recomputation from the output objects, not by trusting `balanceCheck.ok` alone.
- [ ] **Cash sweep integrity**: ending cash per year = beginning + Î”OCF + Î”ICF + Î”Financing; FY2026 = Q2 FY2026 cited cash 1,180,887 + H2 estimate movements; final-year cash equals cumulative sweep â€” recomputed independently in tests with pinned values for at least two years.
- [ ] **Schedule tie-ins**: Î”NWC in CF equals `projectWorkingCapital` output deltas; D&A equals PP&E + intangible schedule outputs; capex equals schedule additions â€” asserted with pinned values (anti-tautology), not identity-only.
- [ ] **Hybrid CF**: FY2026 OCF = cited 6M FY2026 239,031 + H2E; per-half blocks assert; H1 block carries the cited 6M YTD source row.
- [ ] **Held-constant lines documented**: every constant BS line carries a note (source row + "no forecast driver â€” held constant"); zero silent constants (grep gate: no `?? 0` / `?? const` fallbacks in BS construction â€” missing input is `EngineError`, per the P2.1/P2.2 silent-fallback rule).
- [ ] Division-by-zero / NaN guards on all ratios; typed errors throughout.
- [ ] Purity + determinism + zero-literal gate on `threeStatement.js`; `npm test` green Ã— 3; 291 + P3.1 suite untouched.

---

### Task P3.3: Scenario System + Full-Path Integration + Balance-Gate Matrix (Final Sub-Phase)

#### A. Deliverable Files
- `src/engine/scenarios.js` (new) â€” pure module per spec Â§3.2 (FROZEN):
  - `apply(base: AssumptionSet, scenario: 'bear'|'base'|'bull'): AssumptionSet` â€” applies each driver's `scenarioDeltas[scenario]` to its value; result is schema-validated; **out-of-range results clamp to the driver's [min, max] with the clamped-driver list recorded in the returned set's meta** (scenarios must remain usable and honest); base set **never mutated** (deep-frozen in, deep-frozen out; mutation test required); unknown scenario name throws typed `EngineError`.
  - `list(): ScenarioMeta[]` â€” metadata array (name, label, description) from `SCENARIO_NAMES` + constants; consumed by P5 UI later.
- Full-path integration (may live in `scenarios.js` or a small `runFullProjection` helper exported for P5 reuse): `assumptions â†’ schedules.build â†’ forecast.project â†’ threeStatement.project` per scenario â€” the exact spec Â§3.3 key-flow segment (up to WACC, which is P4).
- `tests/scenarios.test.js` â€” scenario suite + the **balance-gate matrix**.

#### B. Exported Interfaces & Types
- `scenarios.apply(...)`, `scenarios.list()` â€” FROZEN per spec Â§3.2. `AssumptionSet` shape unchanged from P2.1 (additive meta only, if any).

#### C. Invariants & Automated Quality Gates
- [ ] **Scenario immutability**: base set deep-frozen and byte-identical after `apply` (mutation test); applied sets are themselves frozen.
- [ ] **Delta correctness**: applied values = base + delta (pre-clamp) for every driver Ã— scenario â€” full 16+driver Ã— 3-scenario recomputation in tests.
- [ ] **Balance-gate matrix**: `assets = liabilities + equity` holds for **every scenario Ã— every forecast year** (Bear/Base/Bull Ã— FY2026â€“FY2030 = 15 checks) on raw components â€” automated, no exceptions.
- [ ] **Scenario distinctness**: Bear â‰  Base â‰  Bull outputs at the revenue/net-income/FCF level for at least FY2027 (a delta that rounds to zero is a defect); determinism: repeated full-path runs byte-identical.
- [ ] `isEstimate: true` on every forward value across all scenario paths; hybrid FY2026 provenance intact under scenarios (H1 stays cited-actual under Bear/Bull â€” deltas apply to estimates only, H1 never re-estimated).
- [ ] Purity + zero-literal gates on `scenarios.js`; `npm test` green Ã— 3; all prior suites untouched.

---

## 4. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] All sub-phase Artifact Contracts (P3.1â€“P3.3) individually submitted and approved by OP; P3.3 is the final sub-phase â†’ Gate sequence on its PASS.
- [ ] **Frozen interfaces exact** (spec Â§3.2): `forecast.project(input)`, `threeStatement.project(schedules, assumptions, forecast)`, `scenarios.apply(base, scenario)`, `scenarios.list()` â€” signatures, error codes (`balance_check_failed`, `missing_driver`), and the `isEstimate` regime verified as written in the spec, not adapted.
- [ ] **Balance gate proven**: A = L + E per forecast year on raw components, across the full Bear/Base/Bull Ã— horizon matrix (15 checks) â€” OP independently recomputes from raw outputs; blind approval prohibited (spec Â§4.5).
- [ ] **Hybrid FY2026 honesty**: H1 = cited actuals (IS from discrete quarters; CF from 6M YTD rows; BS anchored on Q2 FY2026), H2 = engine estimate, per-half provenance on every line; deltas never touch H1 actuals. Zero new corpus rows added anywhere in P3 (verified by diff vs `v1.0-P2`).
- [ ] **No plugs anywhere**: segment sums, BS construction, cash sweep â€” all close by construction on enumerated components; tripwire tests pin specific values (anti-tautology pattern) on: revenue segments, FY2026 H1 blocks, Î”NWC/CF tie-ins, cash sweep, and at least one BS year's components.
- [ ] Assumptions layer: new groups validated + clamped + immutable + honest-defaulted (tax + subs-growth EST-labeled with rationale); every new driver has bear/bull deltas; `loadAssumptions()` fail-closed behavior unchanged and re-verified.
- [ ] Engine purity + determinism across all three new modules; **zero bare numeric literals > 999** (standing gate extended); zero runtime dependency additions; `npm test` offline, green, 0 flakes Ã— 3 runs.
- [ ] No forward-looking value in the data layer; all projected outputs `isComputed: true` + `isEstimate: true` in engine output only.
- [ ] App still boots headless over the full corpus (P1/P2 boot gates unchanged and green).
- [ ] Frozen-surface check: `loadHistorical()` signature, `HISTORICAL_DATASETS`, `historicalStatement`/`kpi`/`assumptionDriver` schemas, `schedules.build` signature, all P1/P2 test expectations untouched (additive changes only per this contract's sanctions).
- [ ] **OP consolidated tie-out before Gate Pass**: OP independently re-runs the full path per scenario, recomputes balance identities and the pinned anchors (H1 FY2026 590,421; cash sweep; FY2025-derived driver defaults), verifies hybrid provenance under scenarios, and records methods + results in `docs/logs/op/phase_3.md`.
