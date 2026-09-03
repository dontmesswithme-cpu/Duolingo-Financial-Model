# Phase 6R — Remediation & Production Release Verification Log (DS)

## Sub-Phase P6R.1: Engine-State Accuracy & Critical Fixes Verification

**Date**: 2026-09-03  
**Author**: DS (Worker)  
**Status**: COMPLETE / READY FOR OP AUDIT  

---

### 1. Scope & Deliverables

Task P6R.1 targeted five core deliverables per `docs/phases/phase_6R.md`:
1. **Scenario Comparison Semantics & State Integrity Fix**:
   - Resolved the defective coupling where changing the active scenario caused the Scenario Comparison table in the Sensitivity tab to mutate and double-apply deltas (e.g. Bear setting Base to Bear's $132.16 and shifting Bull to $249.98).
   - In `src/app.js`: Re-architected state pipeline with `applyDriverOverrides(assumptions, overrides)`. Derived immutable `neutralAssumptions` containing base assumptions plus user overrides (0 scenario deltas). Derived `workingAssumptions` for the active views by applying `activeScenario` to `neutralAssumptions`. Evaluated `scenariosOut` from `neutralAssumptions` with canonical deltas applied exactly once per scenario (reusing active evaluation for whichever scenario is active).
   - In `src/ui/sensitivityTab.js`: Decoupled `renderScenarioComparisonCard` from `currentDcf` / `currentGrid`. Base case values now bind directly to `base` scenario object (`base?.wacc?.wacc?.value`, `base?.perShare`).
   - Verified that across default (Base), Bear, and Bull active states, the Scenario Comparison table displays strictly invariant canonical values ($132.16 / $249.36 / $532.17) and preserves the fundamental valuation invariant `Bear < Base < Bull`.
2. **Sensitivity 9×5 Grid Tracks Active Scenario**:
   - In `src/ui/sensitivityTab.js`: Matrix row center WACC tracks the active scenario WACC. The highlight badge was relabeled from `BASE` to `ACTIVE`. Cell highlight check was updated to `row.isActiveWacc`.
   - Card description was updated to: *"Two-variable 9×5 matrix evaluating implied equity value per share across WACC (±200 bps) and Gordon Growth rates (1.0%–3.0%). Strict monotonicity holds across all 45 cells (∂Price/∂WACC < 0, ∂Price/∂g > 0). Matrix center tracks active scenario WACC; highlighted cell denotes Active Case valuation."*
3. **Debt Schedule Lease Rows & Footnotes**:
   - In `src/ui/schedulesTab.js`: Fixed `buildDebtData()` to read from `schedules.debt.byPeriod` rather than the undefined `scannedByPeriod`.
   - Historical lease cells render exact filed corpus values ($k):
     - FY2021: 29,124
     - FY2022: 23,503
     - FY2023: 21,094
     - FY2024: 54,656
     - FY2025: 93,779
   - Forecast lease cells (FY2026–FY2030) read from balance sheet / Q2 FY2026 terminal hold: 86,136 ($k) with zero hardcoded literals > 999.
   - Surfaced `debt_free_verified` basis text from `schedules.debt.statementBasis` and added visible footnote explaining ASC 842 lease liabilities and the forecast hold methodology.
   - Funded debt zero rows are visually distinct with `DEBT-FREE` badges (`badge-pass`), while operating lease rows carry `ASC 842` badges (`badge-est`).
4. **Balance Sheet Invariant Hard Gate Card Header**:
   - In `src/ui/schedulesTab.js`: Updated header text from `Balance Sheet Invariant Hard Gate (Assets === Liabilities + Stockholders' Equity)` to `Balance Sheet Invariant Hard Gate (Assets = Liabilities + Stockholders' Equity)` (single `=` symbol).
5. **Additive Regression Verification**:
   - Created `tests/p6r.accuracy_fixes.test.js` covering scenario anti-double-delta across default, Bear, and Bull states, slider override deltas, sensitivity ACTIVE tracking, debt schedule lease rows and footnotes, balance gate card `=`.

---

### 2. Verification Results

- **Automated Test Suite**:
  - `npm test` executed across 161 test suites (520 tests total).
  - All 520 tests passed cleanly with 0 failures, 0 cancellations, 0 skipped, 0 flakes (verified ×3 consecutive runs).
- **Headless Probe Verification**:
  - Executed `scratch/op_dir_sens_probe.mjs` against live application DOM:
    - State A (Default Base): Comparison displays Bear $132.16 | Base $249.36 | Bull $532.17. Matrix center = 8.66% ACTIVE ($249.36).
    - State B (Active Bear): Comparison displays Bear $132.16 | Base $249.36 | Bull $532.17. Matrix center = 10.35% ACTIVE ($132.16).
    - State C (Active Bull): Comparison displays Bear $132.16 | Base $249.36 | Bull $532.17. Matrix center = 7.13% ACTIVE ($532.17).
- **Quality Gates**:
  - `git diff v1.0-P6R-base -- src/engine/`: Strictly empty (zero engine modifications).
  - Zero bare numeric literals > 999 outside comments in `src/ui/*.js`.
  - Zero inline `style=` attributes across all `src/ui/*.js`.
  - 706-record historical corpus invariant strictly preserved.

---

## Sub-Phase P6R.2: Cover/TOC Protocol Removal & Product Disclaimer

**Date**: 2026-09-03  
**Author**: DS (Worker)  
**Status**: COMPLETE / READY FOR OP AUDIT  

---

### 1. Scope & Deliverables

Task P6R.2 targeted Cover/TOC cleanup and independent model disclaimer per `docs/phases/phase_6R.md` §3 Task P6R.2:
1. **Preparers / Protocol Removal**:
   - Removed the `<div class="cover-meta-item">` row (`DS (Worker) / OP (Auditor) · Protocol 1.0`) from the Cover tab metadata grid in `index.html`.
2. **Product-Wide Protocol Purge**:
   - In `index.html`:
     - Subtitle updated: `Cited 3-Statement Financial Valuation Model · Interactive Valuation Interface` (removed `Interactive Protocol 1.0 Interface`).
     - Cover disclaimer updated: removed `under Protocol 1.0`.
   - In `src/ui/sensitivityTab.js`: Purged OP finding [F2] by updating `Hybrid FY2026 Invariance Invariant` note (`In accordance with Protocol 1.0 audit rules` → `In accordance with audit standards`).
   - In `src/ui/summaryTab.js`: Updated `Protocol Discipline:` to `Mechanical Discipline:`.
   - Verified zero occurrences of `/protocol/i` across the entire rendered DOM of all 8 tabs.
3. **Table of Contents & Architecture Table Status Column Removal**:
   - In `index.html` `<table class="toc-table">`: Removed `<th class="col-tab-status">Status</th>` and all `<td class="toc-status">` / `status-badge` cells across all rows.
   - Preserved Trading Comparables (Comps), Precedent Transactions, and LBO Analysis rows marked `excluded (N/A) per Director decision (spec §3.4, §7)`.
4. **Color-Coding & Labeling Legend Removal**:
   - Removed the entire `<div class="cover-section">` containing `Color-Coding & Labeling Legend` and `.legend-grid` from `index.html`.
   - Cleaned up obsolete legend CSS from `<style>`.
5. **Standard Independent-Model Disclaimer**:
   - In `index.html` `<footer>`:
     `Independent and unofficial financial valuation model. Not affiliated with, endorsed by, or associated with Duolingo, Inc. Prepared strictly for educational, informational, and analytical research purposes; not investment advice. Does not constitute a solicitation to buy or sell securities.`
   - In `index.html` Cover disclaimer box:
     `IMPORTANT DISCLAIMER: This independent financial model is prepared strictly for informational, educational, and analytical research purposes. It is not affiliated with, endorsed by, or associated with Duolingo, Inc. It is not investment advice, a financial promotion, or a recommendation to buy or sell securities. All forward-looking projections and valuations are estimates based on explicitly cited assumptions and historical filings. Past performance does not guarantee future results.`
   - Formally satisfies invariant: disclaimer contains `"not affiliated"` + `"not investment advice"`.
6. **Badge & TOC Column CSS Support**:
   - Added `.col-tab-num`, `.col-tab-name`, `.toc-excluded-name` to replace inline `style=` attributes.
   - Defined `.badge-pass`, `.badge-fail`, `.badge-muted` to address non-blocking review finding [F1].

---

### 2. Verification Results

- **Automated Test Suite**:
  - `npm test` executed across 162 test suites (522 tests total).
  - All 522 tests passed cleanly with 0 failures, 0 flakes across 3 consecutive runs.
- **Headless Live Browser Probe (`scratch/test_p6r2_dom_probe.mjs`)**:
  - Navigated across all 8 tabs and evaluated full rendered DOM:
    - DOM innerHTML matches for `/protocol/i`: 0
    - DOM innerText matches for `/protocol/i`: 0
    - TOC Status column header count: 0
    - TOC status-badge count: 0
    - Legend grid count: 0
    - Preparers row count: 0
    - Footer text matches independent disclaimer with `"not affiliated"` and `"not investment advice"`.
- **Quality Gates**:
  - `git diff v1.0-P6R-base -- src/engine/`: Strictly empty.
  - Zero bare numeric literals > 999 outside comments in `src/ui/*.js`.
  - Zero inline `style=` attributes across all `src/ui/*.js`.
  - 706-record historical corpus invariant strictly preserved.

---

## Sub-Phase P6R.3: Assumptions Tab — Scenario Naming, Percent Display & Slider Styling

**Date**: 2026-09-03  
**Author**: DS (Worker)  
**Status**: COMPLETE / READY FOR OP AUDIT  

---

### 1. Scope & Deliverables

Task P6R.3 targeted display-layer scenario naming, percent formatting, and slider styling per `docs/phases/phase_6R.md` §3 Task P6R.3:
1. **Scenario Labels (Display-Only Boundary)**:
   - User-visible scenario labels mapped across all interfaces:
     - Bear &rarr; **Downside**
     - Base &rarr; **Base**
     - Bull &rarr; **Upside**
   - In `src/ui/assumptionsTab.js`: Added `SCENARIO_DISPLAY_NAMES = { bear: 'Downside', base: 'Base', bull: 'Upside' }`. Active Model Scenario selector buttons display `DOWNSIDE`, `BASE`, `UPSIDE`.
   - In `src/ui/sensitivityTab.js`: Scenario Comparison table rows relabeled to `Downside Case`, `Base Case`, `Upside Case`. Header updated to `(Downside / Base / Upside)` and monotonicity note updated to `Downside < Base < Upside`. Invariance footnote updated to `across all Downside, Base, and Upside scenarios`.
   - In `src/ui/format.js`: Implemented `formatDisplayText(text)` to map scenario mentions in driver notes (e.g. `Bear/bull deltas` &rarr; `Downside/upside deltas`), eliminating user-visible `bear|bull` literals from the rendered DOM without mutating data on disk.
   - In `index.html`: TOC row 8 and Tab 8 placeholder copy updated to `Downside / Base / Upside`. Aliased `.badge-downside, .badge-bear` and `.badge-upside, .badge-bull`.
   - Internal keys `bear/base/bull` are **FROZEN**: `src/data/assumptions.json` diff against `v1.0-P6R-base` is strictly empty; `setScenario('bear')` API unchanged; `app.js` state machine unchanged.
2. **Percent Display & Unit Formatting**:
   - In `src/ui/format.js`:
     - Added `isRatioUnit(units)`: Identifies ratio units starting with `pct_` (`pct_of_revenue`, `pct_growth_annual`, `pct_decimal`, `pct_of_pretax`, `pct_of_average_invested_cash`, `pct_of_gross_ppe`).
     - Added `formatDriverDisplay(value, units)`: Renders ratio driver values as formatted percentages (e.g. Deferred Cost of Revenues: **9.89%**; terminal growth rate: **2.50%**; SBC target: **13.25%**).
     - Added `parseDriverInput(input, driver)`: Parses entered strings (with or without `%`, decimals or whole percentage numbers) back into engine raw values, with slider `[min, max]` clamping.
     - Added `humanizeUnits(units)`: Eliminates raw unit-tag suffixes like `pct_of_revenue`, `pct_growth_annual`, `pct_decimal` from user-visible labels, while preserving clean units (`days`, `$k`, `$/sub`, `$/sh`, `x`, `shares`).
   - In `src/ui/assumptionsTab.js`: Connected `.driver-number-input` and `.driver-units` to `formatDriverDisplay`, `parseDriverInput`, and `humanizeUnits`. Maintained two-way synchronization between slider and input companion.
   - **Percent Round-Trip Gate**: Every ratio driver's formatted percentage string, when parsed back with `parseDriverInput`, equals the engine's raw value within display rounding tolerance (`< 0.0001`).
3. **iOS-Style Sliders**:
   - In `index.html`: Enhanced `.driver-slider` CSS for Webkit and Firefox:
     - 6px rounded track with subtle background (`#e2e8f0`).
     - Larger 20px iOS-style circular white thumb with `2px solid var(--color-blue-input)` and subtle drop shadow (`box-shadow: 0 2px 4px rgba(0, 82, 204, 0.25)`).
     - Smooth hover scale transition (`scale(1.1)`).
     - Preserved current blue color scheme (`#0052cc` / `.cell-input` family).

---

### 2. Verification Results

- **Automated Test Suite**:
  - `npm test` executed across 163 test suites (527 tests total).
  - All 527 tests passed cleanly with 0 failures, 0 flakes across 3 consecutive runs.
- **Headless Live Browser Probe (`scratch/test_p6r3_browser_probe.mjs`)**:
  - Tested in Microsoft Edge:
    - Scenario buttons display `DOWNSIDE`, `BASE`, `UPSIDE`.
    - Ratio inputs display formatted percentages: Deferred Cost `9.89%`, Terminal Growth `2.50%`, SBC Target `13.25%`.
    - Zero raw `pct_` unit tags in DOM text.
    - Two-way slider & input synchronization verified in live DOM.
    - Sensitivity tab displays `Downside Case`, `Upside Case`, `Downside / Base / Upside`, `Downside < Base < Upside`.
    - Full-DOM sweep across all 8 tabs in all 3 scenario states (default, downside-active, upside-active):
      - 0 whole-word "bear" hits across all 8 tabs.
      - 0 whole-word "bull" hits across all 8 tabs.
    - Zero console/page errors.
- **OP Sweep Script Check (`scratch/op_p6r2_dom_sweep.mjs`)**:
  - All 72 tab/state checks passed with 0 failures.
- **Quality Gates**:
  - `git diff v1.0-P6R-base -- src/engine/`: Strictly empty.
  - `git diff v1.0-P6R-base -- src/data/assumptions.json`: Strictly empty.
  - Zero bare numeric literals > 999 outside comments in `src/ui/*.js`.
  - Zero inline `style=` attributes across all `src/ui/*.js`.
  - 706-record historical corpus invariant strictly preserved.

---

## Sub-Phase P6R.4: Historicals Citation Hybrid & Cross-Tab Grid Calibration

**Date**: 2026-09-03  
**Author**: DS (Worker)  
**Status**: COMPLETE / READY FOR OP AUDIT (FINAL SUB-PHASE BEFORE DIRECTOR v1.0 RELEASE GATE)  

---

### 1. Scope & Deliverables

Task P6R.4 targeted the presentation reorganization of SEC citations and cross-tab grid calibration per `docs/phases/phase_6R.md` §3 Task P6R.4:
1. **Hybrid Citation Model (Director Decision)**:
   - **Column-Header Primary Citations**: In `src/ui/historicalsTab.js`, implemented `deriveColumnPrimaryCitations(statementRows)` backed by `WeakMap` caching. Automatically derives the majority SEC filing per column per dataset.
     - Income Statement FY2021 primary cites the restated FY2023 10-K (`...000156208824000050/duol-20231231.htm`), while Balance Sheet FY2021 primary cites the FY2021 10-K (`...000156208822000039/duol-20211231.htm`).
     - Period column headers render clickable `<sup><a class="citation-sup">[n]</a></sup>` linking to the primary filing URL.
     - TTM column header carries the existing `COMPUTED` badge and zero filing citation.
     - Non-filing derived columns (such as Q4 FY2025 derived in Income Statement) carry zero filing citation.
   - **Exception-Only Inline Superscripts**: Inline superscripts appear exclusively on rows whose `source.url` differs from their column's primary filing URL (`source.url !== columnPrimary.url`).
     - Across the entire 706-record corpus, `amortization_expense_total` in the Income Statement is the single verified exception row (cites FY2021 10-K instead of FY2023 10-K).
     - Exception row receives `.citation-sup.citation-exception` with amber styling.
     - Balance Sheet, Cash Flow Statement, and KPIs have zero exception rows, rendering clean numbers without inline superscript clutter.
   - **Audit Data Layer & Citations Drawer Unchanged**: All 6 cited SEC filings remain registered in the Citations Drawer with active permalinks, preserving full provenance in the audit layer.
2. **Cross-Tab Grid Calibration & Shared Layout Baseline**:
   - In `index.html`:
     - Standardized shared layout wrapper `.historicals-view-wrapper, .schedules-view-wrapper, .projections-view-wrapper, .valuation-view-wrapper, .summary-view-wrapper, .sensitivity-view-wrapper` with `max-width: 1100px; margin: 0 auto;`.
     - Standardized Tabulator heights and row metrics: row height `36px`, header column height `38px`, cell padding `8px 12px`, font size `13px`, line height `20px`.
     - Mobile responsiveness: `@media (max-width: 900px)` sets `.projections-charts-grid` and `.hybrid-metrics-grid` to 1-column layout (`grid-template-columns: 1fr`).
   - In `src/ui/schedulesTab.js`: Calibrated label column `minWidth: 260`, period columns `minWidth: 95`.
   - In `src/ui/projectionsTab.js`: Calibrated label column `minWidth: 260`, period columns `minWidth: 95`.
   - In `src/ui/valuationTab.js`: Calibrated label column `minWidth: 260`, period and terminal columns `minWidth: 95`.
   - In `src/ui/sensitivityTab.js`: Calibrated label column `minWidth: 200`, growth columns `minWidth: 95`.
   - In `src/ui/historicalsTab.js`: Calibrated label column `minWidth: 260`, period columns `minWidth: 95`.
   - In `src/app.js`: Reactive `inst.redraw(true)` dispatched on active tab's Tabulator instances upon tab activation in `onTabChange`, guaranteeing instant virtual row rendering when switching away from default tabs.
3. **Memory & Symmetrical Teardown**:
   - `WeakMap` caching in `deriveColumnPrimaryCitations`.
   - Cleared closure arrays and model references on `dispose()` across all views and `app.js`.
   - Explicit `globalThis.gc()` latch on teardown during exposed GC testing.

---

### 2. Verification Results

- **Automated Test Suite**:
  - `npm test` executed across 164 test suites (533 tests total).
  - 6 new automated tests in `tests/p6r.accuracy_fixes.test.js` validating hybrid citation derivation, exception isolation, column min-widths, and layout wrapper baseline.
  - All 533 tests passed cleanly with 0 failures, 0 flakes across 3 consecutive runs (`suite × 3`).
- **Headless Live Browser Probe (`scratch/test_p6r4_browser_probe.mjs`)**:
  - Tested in Microsoft Edge with live DOM measurements:
    - **Historicals Hybrid Citations**: Income FY2021 cites FY2023 10-K; Balance FY2021 cites FY2021 10-K; Q4 FY2025 has NO citation; TTM has COMPUTED badge and NO filing link.
    - **Exception Rows**: Income Statement has EXACTLY 1 exception row (`Amortization Expense Total [6]`). Balance Sheet, Cash Flow, and KPIs have EXACTLY 0 exception rows.
    - **Citations Drawer**: Contains all 6 SEC EDGAR filings with valid permalinks.
    - **Grid Calibration (1280px)**: All wrappers conform to 1100px baseline; frozen label columns $\ge 200\text{px}$; data columns $\ge 95\text{px}$; row heights calibrated to 36px; zero viewport-level horizontal overflow.
    - **Mobile Layout (390px)**: Zero viewport horizontal overflow across Historicals, Schedules, and Projections; tableholder internal scroll verified; frozen label column pinned and visible.
    - **TSV Clipboard Battery**: Ctrl+C produces tab-delimited text/plain payload.
    - **Console & Page Errors**: Exactly 0.
- **OP Sweep Script Check (`scratch/op_p6r2_dom_sweep.mjs`)**:
  - All 72 tab/state checks passed with 0 failures across default, bear-active, and bull-active states.
- **Quality Gates**:
  - `git diff v1.0-P6R-base -- src/engine/`: Strictly empty.
  - `git diff v1.0-P6R-base -- src/data/historical/`: Strictly empty.
  - `git diff v1.0-P6R-base -- src/data/assumptions.json`: Strictly empty.
  - Zero bare numeric literals > 999 outside comments in `src/ui/*.js`.
  - Zero inline `style=` attributes across all `src/ui/*.js`.
  - 706-record historical corpus invariant strictly preserved.



