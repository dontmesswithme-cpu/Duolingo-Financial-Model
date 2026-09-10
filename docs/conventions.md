# Universal Engineering Conventions & Standards

> **Purpose**: This document establishes the non-negotiable technical, architectural, and quality standards for all development work. Both Worker (`DS`) and Reviewer (`OP`) must adhere to these standards.

---

## 1. Architectural Principles

1. **Modular Architecture**:
   - High cohesion within modules, loose coupling between modules.
   - Clear separation of concerns (e.g. Core Domain Logic, Data Access / Persistence, Transport / API Layer, UI / Presentation).
2. **Single Source of Truth**:
   - State and domain configurations must have exactly one authoritative source.
   - Avoid shadow state or duplicated data models across layers.
3. **Explicit Dependency Injection**:
   - Inject dependencies (services, loggers, clocks, network clients) into constructors or factories rather than importing global singletons.
   - Facilitates headless, isolated unit testing without complex monkey-patching.
4. **Configuration over Hardcoding**:
   - Zero magic numbers or hardcoded URLs/credentials in business logic.
   - Extract all constants, timeouts, retry limits, and configuration values into dedicated configuration/tuning modules.

---

## 2. Code Quality & Maintainability

1. **Self-Documenting & Clean Code**:
   - Use descriptive, unambiguous variable and function names.
   - Avoid cryptic abbreviations.
   - Keep functions focused on a single responsibility (aim for < 40-50 lines per function).
2. **Robust Error Handling**:
   - Never swallow exceptions silently (`catch (e) {}` with no handling is forbidden).
   - Use custom error classes with descriptive context and error codes where applicable.
   - Differentiate between expected operational errors (e.g. invalid user input) and unexpected programmer errors (e.g. null pointer, invariant violation).
3. **Strict Immutability & Pure Functions where Feasible**:
   - Prefer pure functions with deterministic outputs given identical inputs.
   - Minimize mutable global state.

---

## 3. Resource Management & Performance Contracts

1. **Clean Lifecycle Disposal**:
   - Any component that acquires system resources, handles, network sockets, DOM listeners, timers, or database connections must implement an explicit disposal method (`dispose()`, `close()`, `destroy()`, `teardown()`).
   - Symmetrical lifecycle: everything opened/subscribed during initialization must be closed/unsubscribed during teardown.
2. **Memory Leak Prevention**:
   - Remove event listeners when components unmount or destroy.
   - Avoid unconstrained caches/maps; use LRU caches with bounded maximum capacities.
   - In performance-critical hot loops (e.g. graphics render loops, high-throughput packet processing), avoid per-iteration allocations (`new` calls, temporary arrays/closures).
3. **Algorithmic Efficiency**:
   - Choose appropriate data structures ($O(1)$ map/set lookups for frequent queries rather than $O(N)$ array scans).
   - Avoid $O(N^2)$ nested loops over large collections.

---

## 4. Testing & Verification Standards

1. **Deterministic Test Execution**:
   - Tests must pass 100% reliably across all environments.
   - Zero test flakes: mock time, network, and random number generators (`PRNG`) with deterministic seeds.
2. **Test Coverage Hierarchy**:
   - **Unit Tests**: Test core domain logic and utility modules in isolation.
   - **Integration Tests**: Verify inter-module data flow and API contracts.
   - **Edge-Case & Boundary Tests**: Test empty inputs, extreme values, timeouts, network failures, and boundary conditions.
   - **Resource & Leak Tests**: Verify proper disposal and bounded memory usage under load.
3. **Headless Execution**:
   - All tests must be executable in headless, non-interactive CI environments (`npm test`, `pytest`, `cargo test`).

---

## 5. Visual & UI Conventions *(For Frontend/UI Projects)*

1. **Design Parity**:
   - UI elements must match canonical design specifications and benchmarks in `docs/design_references/`.
2. **Responsive & Accessible**:
   - Consistent typography, contrast ratios, keyboard navigation, and responsive scaling.
3. **Visual Audit Artifacts**:
   - Capture automated screenshots into versioned folders (`docs/screenshots/phase_X/v(n)/`) to visually verify layout, alignment, and responsiveness before submission.

---

## 6. Language & Framework Customization

This specification is domain-neutral. Projects may append language-specific rules below:

### Project-Specific Rules — Duolingo FM (Static Browser Financial Model)

#### Runtime & Dependencies
- **Zero network dependencies** (supersedes the earlier "zero runtime dependencies" wording, Director-approved 2026-08-31): no CDN fetches, no external origin requests at runtime, no build step, no bundler.
- Vendored, version-pinned local files are permitted **only** through the Vendor Policy (`docs/spec.md` §2.1): stored under `vendor/`, recorded in `docs/vendor/manifest.md` (project, version, license, source URL, local path, SHA-256), audited by OP at every gate touching them. Current approved set: Tabulator (MIT) — the sole vendor file.
- Native ESM modules (`import`/`export`) with explicit `.js` extensions in relative imports.
- Node built-ins only for tooling/tests (`node:test`, `node:assert/strict`, `fs`, `path`).
- Runtime test: with the network disconnected, the deployed app must behave identically — any vendor or data fetch from an external origin is a rejection condition.

#### Financial Data Integrity (Project-Critical — overrides everything else)
- **EXTERNAL TRUTH, NOT JUST INTERNAL CONSISTENCY (OP's core mandate):** A green suite (`412/412`) that agrees with itself is **not** a PASS. `P4.3` `recommend.js:346` `??148.36` passed while `412/412` was green precisely because `tests/wacc.build.test.js:590` only grepped `wacc.js` and `tests/recommend.test.js:130` only checked `0.15` — the gate name over-promised and the literal survived. OP must prove **external truth** (every `MKT` anchor `0.0473` FRED `2026-08-28` / `0.89` stockanalysis `2026-09-01` / `0.0442` Damodaran `2026-07-01` / `148.36` `2026-08-31` / `50,031,000` SEC `0001628280-26-053603` / `WACC 0.086638` / `df 0.920269675825804` / `perShare 249.36` re-derived from raw `assumptions.json`/`historical`/`SEC` filings, not DS fixtures) **and** that the **tests themselves actually prove what their names claim** (gate scope = gate name, grep all `src/engine/*.js` outside comments for `\b\d{4,}\b` and `\?\?` on `MKT` drivers). Internal consistency without external truth is a **FAIL**.
- **NO BURIED FALLBACK LITERALS ANYWHERE IN `SRC/ENGINE/` — EVEN IF MASKED:** `src/engine/recommend.js:194` `??0.025` and `recommend.js:346` `??148.36` are letter violations of *“no hardcoded market values anywhere in `src/engine/`”* (`docs/phases/phase_4.md:33`) and the P2.1 permanent rule banning `?? 0` fallbacks, even though `wacc.js:106` discipline / `dcf.js:203` `requireDriverValue` currently mask them (unreachable dead code today → would silently corrupt if upstream gate ever changes). OP must flag every `??` on a `MKT`/`EST` driver as deviation, not as “mitigated”.
- Every historical record in `src/data/historical/*.json` MUST carry a full `source` object (filing type, period, statement, URL, accessedAt). The `audit.js` gate makes the app refuse to run otherwise.
- Every forward-looking value (forecast, scenario output, DCF, recommendation) carries `isEstimate: true` and is rendered with a visible `EST` mark via `format.estSuffix` — never bypassed by direct string building in UI code.
- **Marking taxonomy (three kinds, never conflated):**
  - `EST` — engine-generated forward estimates (projections, DCF, scenarios).
  - `MKT` — market-sourced inputs (risk-free rate, beta, ERP, share price, share count) with mandatory as-of dates; never presented as filing data.
  - `computed` — engine-derived values from cited inputs (TTM sums, discrete-quarter differences from YTD, growth rates, margins, CAGR). Computed values never replace their cited constituents; underlying cited values remain displayed or source-expandable.
- **Period transcription honesty:** 10-Q cash-flow rows are transcribed as `ytd` (periodType: "ytd") exactly as filed — never relabeled as discrete quarters. Discrete quarters are derived by differencing in the engine and labeled `computed`. A model value's label must always match how the source reports it.
- As-reported units preserved (`thousands_usd` etc.); no silent unit conversion. Derived metrics are computed by the engine — never hand-typed as data.
- Source ledger `docs/sources/sources.md` is the anchor: every `source.url` in data JSON must have a ledger entry. OP independently re-verifies figures against cited sources at every data-related quality gate.
- Cross-check fixtures (`tests/fixtures/duolingo_facts.js`) pin known anchor figures; any change to historical data that breaks a fixture is a rejection condition.
- **Balance gate:** projected balance sheets must satisfy `assets = liabilities + equity` per year — engine invariant and automated test. An unbalanced projection is a blocking failure, never a warning.
- **Mechanical recommendation only:** the Summary output's valuation label is computed from fixed thresholds in `constants.js` (upside % → Undervalued/Fair/Overvalued). No editorial language anywhere.
- **Driver-based input model (Director-confirmed):** no free-form cell editing anywhere in the model. Every input is a named, schema-clamped driver on the Assumptions tab. Grid cells are read-only displays; Tabulator formatter callbacks only map model semantics to CSS classes.

#### Vendored Table Layer (Tabulator)
- Financial-model tables (Historicals, Schedules, Projections, Valuation, Sensitivity) render through the vendored Tabulator file at `vendor/tabulator/`; small summary tables (≤ 5 rows) may remain semantic `<table>`s.
- Frozen first column + header row across 10-year column spans; keyboard cell navigation; range selection with clipboard copy-out to Excel.
- **No editing modules** — Tabulator is used strictly as a grid/viewer. Any writable cell is a rejection condition.
- Cell color-coding classes (`cell-input`, `cell-formula`, `cell-link`) are emitted only from render functions via Tabulator formatter callbacks — the same universal rule, same audit condition.
- The vendor file is never modified. Version pinning and SHA-256 recorded in `docs/vendor/manifest.md`; drift between manifest hash and file content is a rejection condition.

#### Cell Color-Coding (Model Standard)
- **Blue** = hardcoded input cell; **black** = formula/computed cell; **green** = cross-statement link cell.
- Colors are emitted only by render functions via CSS classes (`cell-input`, `cell-formula`, `cell-link`) — never hand-set.
- OP audit rule: any hardcoded input cell lacking the `cell-input` class (or any formula cell styled as input) is a rejection condition.

#### Purity & Testability
- All `src/engine/` and `src/data/` modules are pure: no DOM, no `fetch`, no `Date.now`, no `Math.random` inside `src/engine/` — the current period is injected as a parameter.
- App construction via DI factory `createApp({ data, engine, root, now })`; everything opened/subscribed during init is closed/removed in `dispose()`.
- Tests are headless (no browser required); UI logic separated into pure render-state modules so it is testable from Node.

#### Code Layout
- Layer imports follow the module boundary table in `docs/spec.md` §2 (data ← engine ← app ← ui; never reversed). No cross-layer imports that skip the boundary.
- All constants live in `src/data/constants.js`. No magic numbers in `src/`.
- JSDoc `@typedef` for all shared types; no TypeScript compilation step.
- Engine module set per spec §3.2: `forecast.js`, `scenarios.js`, `schedules.js`, `three_statement.js`, `ttm.js`, `wacc.js`, `dcf.js`, `recommend.js`, `metrics.js`, `format.js` — engine modules may import `src/data/` types only; never app/ui/DOM.

### JavaScript / TypeScript
- Module system: Standard ESM (`import` / `export`).
- Strict typing (`tsc --noEmit`) and ESLint / Prettier rules enabled.
- Avoid `any` in TypeScript; use strict interfaces and unions.

### Python
- Type annotations (`typing`, `mypy` strict mode).
- Formatting with `black` and linting with `ruff` or `flake8`.
- Use context managers (`with` statements) for resource safety.

### Rust / Go / C++
- Follow idiomatic formatting (`cargo fmt`, `gofmt`, `clang-format`).
- Strict RAII / memory safety and zero data races.

---

## 6. Economic Identity Rules (Economy Phase — Permanent)

> Landed per rule with its sub-phase (EP.2: SBC Settlement + Settlement Registry; EP.3: Terminal Steady-State Law + Pin Genesis). Locked by Director ruling 2026-09-10; amendable only by Director order.

1. **SBC Settlement Rule (R2 formula, EP.2)**: the OCF stock-based-compensation add-back is GAAP-correct at statement level, but the DCF must pay for the offsetting future issuance. `shares_DCF = shares_BOP + Σ (SBC_t ÷ market_share_price)` over FY2026–FY2030, where `shares_BOP` is the MKT diluted-shares driver (grants already made), `SBC_t` is the per-period SBC embedded in each period's cash-flow statement (hybrid FY2026 = cited H1 corpus row + H2 CF leg — never the CF line alone, never the annualized schedule), and `market_share_price` is the MKT spot driver. No buyback netting in the headline path (buybacks stay financing flows, value-neutral at fair price); uncharged netting (retiring shares without charging the cash) is a rejection condition on sight. Statements stay GAAP-clean; settlement lives in the valuation layer (`src/engine/shares.js`, consumed at the DCF per-share division).
2. **Settlement Registry (EP.2)**: no undeclared add-backs. Every OCF add-back names a settlement path in `src/engine/invariants.js` (`SETTLEMENT_REGISTRY`): D&A → ICF capex (settled), SBC → EIG-B share roll-forward (settled EP.2). Any operating-activity line outside the registry (beyond the net-income base, the total, and the working-capital movement) fails EIG-C coverage. Registry statuses are load-bearing: `pending-*` entries document known-unsettled economics, never silent passes.
3. **Terminal Steady-State Law (EP.3)**: the final forecast year's working-capital inflow is priced at forecast growth and must never be capitalised raw into perpetuity. Terminal construction replaces it with the perpetuity-rate equivalent: `fcffTNormalised = fcff_T − (−ΔNWC_T) + (−NWC_T × g)`, with NWC from the working-capital schedule (BOP-anchored for a first-period terminal); the FCFE floor and legacy paths sharing the terminal-year flow normalise identically. Violations live almost entirely in the terminal (PV(TV) ≈ 73% of EV here), so the law is exact, not approximate.
4. **Pin Genesis (EP.3)**: hand-typed pins are rejected; hash-stamped regeneration only. `tools/regen_pins.mjs` emits every e2e pin plus the docstring header numbers from one machine pass and stamps the run (SHA-256 over `src/data/assumptions.json` + engine sources outside comments). Tests verify stored hash == recomputed hash; any source change without regen — or any pin that disagrees with live engine output — fails loudly with a diff of what moved. Regen is idempotent (unchanged inputs rewrite nothing).
