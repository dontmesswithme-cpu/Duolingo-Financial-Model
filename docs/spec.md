# Technical & Product Specification (Master Spec)

> **Purpose**: This document defines the comprehensive product requirements, system architecture, data models, APIs, and technical constraints for the project. Both Worker (`DS`) and Reviewer (`OP`) refer to this document as the authoritative specification.

---

## 1. Executive Summary & Project Goal

- **Project Name**: Duolingo FM — Duolingo, Inc. (NASDAQ: DUOL) Financial Model
- **Target Platform**: Static browser application (HTML/CSS/JS, ESM modules, zero backend, zero build step, zero runtime dependencies). Runs fully offline once loaded.
- **Core Value Proposition**: A rigorous, fully-cited browser financial model for Duolingo structured as a professional 3-statement model: **Cover/TOC → Assumptions → Historicals → Supporting Schedules → 3-Statement Projections → Valuation (DCF) → Summary/Output → Sensitivity/Scenarios**. Historical financials and KPIs are transcribed **verbatim from SEC filings (10-K, 10-Q) and investor releases** — every historical figure carries a source citation. On top of the verified historical base: a **driver-based forecast engine** with full IS→BS→CF linkage (balance-checked), **Bear/Base/Bull scenarios**, **DCF valuation with WACC build**, sensitivity grids, and a **mechanical recommendation output**.

### Guiding Principle — Accuracy Gate (#1 Non-Negotiable)
1. **Every historical figure must trace to a source citation** (filing type, period, statement/section, and where feasible an external URL to SEC EDGAR / IR). No historical number may enter the data layer without a `source` field.
2. **Any estimated, market-sourced, or derived-forward value must be visibly marked `EST`** (or `MKT` for market snapshots) in tables, charts, and UI wherever displayed.
3. **No fabricated data.** A figure that cannot be verified from a source in `docs/sources/` must not appear as historical.
4. **Computed ≠ filed.** Values the engine derives (TTM sums, discrete-quarter differences, growth rates, margins) are labeled `computed` — never presented as filed figures. As-reported units preserved (thousands vs millions as in the filing), units explicit in UI. Currency: USD.
5. **The model must balance.** `Assets = Liabilities + Equity` asserted for every projected year — as an engine invariant and an automated test. A model that does not balance cannot pass CI.

---

## 2. System Architecture & Tech Stack

- **Primary Language & Runtime**: JavaScript (ES2022+, native ESM). Node.js >= 20 for tooling/tests only.
- **Frameworks & Core Libraries**: None at runtime (vanilla DOM + custom SVG charts). Dev-only: Node built-in test runner.
- **Storage / Database**: None. Static JSON data files (`src/data/historical/*.json`) served alongside the app.
- **Testing Framework**: Node Test Runner (`node:test`), fully headless.

```
+-------------------------------------------------------------+
+  Presentation (index.html + ui/ — 8 tab views)                |
+  Cover/TOC | Assumptions | Historicals | Schedules |          |
+  Projections | Valuation | Summary | Sensitivity              |
+  (cell color-coding: blue=input, black=formula, green=link)   |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
+      App Controller (app.js — state, events, wiring)          |
+   Binds driver inputs -> Engine; synchronous recalc; dispose  |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
+      Calculation Engine (engine/ — pure functions)             |
+   forecast.js  scenarios.js  schedules.js  three_statement.js  |
+   ttm.js  wacc.js  dcf.js  recommend.js  metrics.js format.js  |
+   (100% pure, deterministic, injected clock, balance gate)    |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
+      Data Layer (data/ — verified historicals + citations)    |
+   historical/{income,balance,cashflow,kpis}.json (annual +    |
+   quarterly) -> loader.js + audit.js (Accuracy Gate)          |
+-------------------------------------------------------------+
```

### Module Boundaries (Strict Separation of Concerns)
| Layer | Directory | May Import From | Never Imports |
|---|---|---|---|
| Data | `src/data/` | nothing (pure JSON + validation) | engine, app, ui |
| Engine | `src/engine/` | `src/data/` types only | app, ui, DOM |
| App | `src/app.js` | `data/`, `engine/` | ui internals |
| UI | `src/ui/` | app-injected render state, `engine/format.js` | data loading, engine math |

---

## 3. Core Modules & Component Specifications

### 3.1 Data Layer — `src/data/`
- **Files**:
  - `src/data/historical/income.json` — annual FY2021–FY2025 + discrete quarters for the TTM window (from 10-K 3-year columns and 10-Q three-month columns).
  - `src/data/historical/balance.json` — full balance sheets: fiscal year-ends FY2021–FY2025 + latest reported quarter-end.
  - `src/data/historical/cashflow.json` — full cash flow statements: annual FY2021–FY2025 + 10-Q **year-to-date** figures (discrete quarters derived by the engine, see §4.4).
  - `src/data/historical/kpis.json` — DAU, MAU, paid subscribers, bookings, adjusted EBITDA (definitions verbatim from filings/IR).
  - `src/data/assumptions.json` — named driver defaults, ranges (min/max/step), scenario deltas (Bear/Base/Bull), market-input defaults (rf rate, ERP, beta, MKT snapshot price).
  - `src/data/loader.js`, `src/data/audit.js`, `src/data/schema.js`, `src/data/errors.js`, `src/data/constants.js`.
- **Interfaces & Methods**:
  - `loadHistorical(): HistoricalDataset` — validates every record against schema, runs full audit; throws `DataValidationError` listing every invalid/uncited record.
  - `validateRecord(rec, schema): ValidationResult` — `{ ok, errors: [{ field, message, source? }] }`.
  - `auditDataset(ds): AuditReport` — violations: `HIST_NO_SOURCE`, `HIST_MARKED_ESTIMATE`, `DUP_KEY`, `BAD_UNITS`, `SOURCE_URL_MISSING`, `SOURCE_NOT_IN_LEDGER`.
- **Historical Record Schema** (every row, no exceptions):
  ```json
  {
    "metric": "revenue",
    "label": "Total Revenue",
    "klass": "flow",
    "period": "FY2023",
    "periodType": "fiscal_year",
    "value": 531325,
    "units": "thousands_usd",
    "scale": 1000,
    "source": {
      "filing": "10-K",
      "period": "Fiscal Year 2023",
      "statement": "Consolidated Statements of Operations",
      "url": "https://www.sec.gov/...",
      "accessedAt": "YYYY-MM-DD"
    },
    "isEstimate": false
  }
  ```
- **Schema specifics**:
  - `periodType`: `"fiscal_year" | "quarter" | "ytd"` (10-Q CF rows are transcribed as `ytd`; never relabeled as discrete).
  - `klass`: `"flow" | "stock" | "kpi"` — TTM applies only to `flow`; `stock` shows latest balance date; `kpi` shows latest reported value.
  - **Invariant: `source` required when `isEstimate === false`** — violation makes `loadHistorical()` throw; app boots to an uncited-data error page listing offenders.

### 3.2 Calculation Engine — `src/engine/` (pure, headless-testable)
- **Purpose**: All financial math. Pure functions; no DOM, no fetch, no `Date.now`, no `Math.random` (current period injected). Deterministic: identical inputs → byte-identical outputs.
- **Interfaces & Methods**:
  - `forecast.project(input: ForecastInput): ForecastOutput` — driver-based projection FY2026–FY2030 (horizon user-extensible 3–10). **FY2026 is hybrid**: H1 2026 = cited actuals (already reported), H2 2026 = engine estimate; rows carry per-half provenance.
  - `scenarios.apply(base: AssumptionSet, scenario: 'bear'|'base'|'bull'): AssumptionSet` — immutable delta application; `scenarios.list(): ScenarioMeta[]`.
  - `schedules.build(historical, assumptions): ScheduleSet` — supporting schedules: working capital (DSO/DPO, %-of-revenue lines), PP&E roll-forward (capex, D&A), debt schedule (terms verified from filings; handles the debt-free case explicitly), stock-based comp, intangible amortization.
  - `threeStatement.project(schedules, assumptions, forecast): ThreeStatementOutput` — linked IS → BS → CF; cash sweeps from CF; **asserts `assets === liabilities + equity` per forecast year** and throws `EngineError("balance_check_failed", year)` otherwise; output carries the balance check result per year for UI display.
  - `ttm.compute(historical): TtmOutput` — TTM for `flow` metrics = sum of last 4 discrete quarters; discrete quarters derived from cited YTD values by differencing; all outputs labeled `computed`. `stock` metrics → latest balance date; `kpi` → latest reported value.
  - `wacc.build(marketInputs): WaccBuild` — CAPM build: risk-free rate, beta, equity risk premium (all `MKT`/`EST`-labeled market inputs with as-of dates, user-adjustable); cost of debt from debt schedule (debt-free → WACC = cost of equity); full build table exposed for rendering.
  - `dcf.valuate(threeStatement, wacc, dcfInput): DcfResult` — discount factors, PV of explicit-period FCF, terminal value (Gordon), EV → net cash bridge → equity value → per-share; full intermediate schedule.
  - `recommend.evaluate(dcfPerShare, marketPrice): Recommendation` — **mechanical only**: `{ upsidePct, label: 'undervalued'|'fair'|'overvalued' }` with fixed thresholds from `constants.js`; market price from `MKT` snapshot, `EST`-labeled. No editorial language.
  - `metrics.computeGrowth / computeMargins / computeCagr / computeRuleOf40(...)` — derived series, all labeled `computed`.
  - `format.usd / compact / percent / estSuffix(label, isEstimate)` — the ONLY path estimates reach the screen; UI never builds estimate strings directly.
- **Invariants & Constraints**:
  - All forward-period outputs carry `isEstimate: true` (per-half provenance in hybrid FY2026); enforced at type level and by `audit.js`.
  - Division-by-zero, NaN, negative-sqrt guards on all ratios; invalid driver input throws typed `EngineError` naming the driver.
  - Balance gate is a hard invariant: no `ThreeStatementOutput` can exist for an unbalanced projection.

### 3.3 App Controller — `src/app.js`
- `createApp({ data, engine, root, now }): App` — DI-constructor for headless testability.
- `app.setDriver(name, value)` — clamps to schema range, synchronous recalc (< 16ms), re-renders affected regions. `app.setScenario(name)`, `app.state()` (frozen snapshot), `app.dispose()` — removes all listeners.
- **Key Flows**: init → load+audit data (fail-fast on audit errors) → build schedules → 3-statement projection (balance gate) → WACC → DCF → recommendation → render; driver input → clamp → recalc → patch render → URL hash (shareable state, schema-validated on read; malformed → defaults).

### 3.4 Presentation / UI — `src/ui/` + `index.html` (8 Tabs, Director-defined)
| # | Tab | Contents |
|---|---|---|
| 1 | **Cover & TOC** | Title, as-of date, preparer (DS/OP, Protocol 1.0), version (git tag via `WORKFLOW_GIT_TAG_PREFIX`), disclaimer (not investment advice; EST/MKT marking legend), TOC with anchors. |
| 2 | **Assumptions / Drivers** | All inputs: revenue drivers, margins, tax rate, WACC components (rf, beta, ERP), terminal growth, MKT snapshot price. Every input color-coded **blue**; ranges from `assumptions.json` enforced on entry. |
| 3 | **Historicals** | FY2021–FY2025 full IS/BS/CF + quarterly TTM window + TTM column (labeled `computed`); KPIs with verbatim definitions; citation superscripts per row; source expansion. |
| 4 | **Supporting Schedules** | WC, PP&E roll-forward, debt, SBC, intangible amortization — historical + projected, each line traced to statements. |
| 5 | **Projections (3-Statement)** | Forecast IS → BS → CF, linked; per-year balance check indicator (pass/fail from engine); hybrid FY2026 shows H1 actual / H2 estimate split. |
| 6 | **Valuation** | DCF: WACC build table (CAPM components labeled MKT/EST), explicit-period PV schedule, terminal value, EV → equity → per-share bridge (waterfall). Comps/precedent/LBO: **excluded by Director decision** — shown as marked N/A lines on Cover TOC only. |
| 7 | **Summary / Output** | Key outputs: DCF/share vs MKT price, upside %, mechanical recommendation label, valuation bridge, Rule of 40, KPI headline cards (dashboard role lives here). |
| 8 | **Sensitivity / Scenarios** | Data tables: WACC × terminal growth per-share grid; Bear/Base/Bull output ranges; price-per-share ranges. |
- **Cell color-coding (universal rule)**: **blue** = hardcoded input; **black** = formula/computed; **green** = cross-statement link. Enforced via CSS classes emitted only by render functions — OP audits that any input cell lacking the blue class is a rejection condition.
- **Charts**: custom SVG (line: revenue/FCF actual-solid vs forecast-dashed; bar: margins; waterfall: DCF bridge). No chart library.
- **Sources footer**: present on Historicals/Valuation; full filing list with URLs.

### 3.5 Test Suite — `tests/`
- Headless Node tests against pure modules. Data tests: 100% historical records sourced; forecast rows `isEstimate: true`; statement identities (revenue − cost of revenue = gross profit; BS balances per historical year-end) hold.
- **Known-Figure Fixtures** `tests/fixtures/duolingo_facts.js` — verified anchors (FY2025 & FY2023 revenue, net income, YoY growth, DAU, TTM revenue) each with source; tests assert `historical/*.json` matches exactly — a forged number cannot slip in. Balance fixtures: historical BS sums asserted.

---

## 4. Data Sourcing & Verification Protocol (Project-Critical)

1. **Approved Sources (priority order)**: (a) SEC filings on EDGAR — 10-K (CIK 0001562088; FY2021–FY2025 accession numbers verified: 0001628280-26-012494, 0001562088-25-000042, 0001562088-24-000050, 0001562088-23-000052, 0001562088-22-000039), 10-Q (TTM window quarters; exact accessions pinned at P1.1); (b) Duolingo IR press releases/shareholder letters for KPIs not in filings.
2. **Source Ledger**: `docs/sources/sources.md` — every filing/release used: entity, form, period, filing date, URL, `accessedAt`, metrics taken. Every `source.url` in data JSON must appear in the ledger.
3. **Transcription Rule**: Figures as-reported; filing-native units kept (`units`, `scale`); no silent conversion. Derived metrics computed by the engine, labeled `computed`.
4. **Quarterly & TTM Mechanics**: 10-Q income statements present discrete 3-month columns → transcribed directly (cited). 10-Q cash flow statements are **year-to-date** → transcribed as `ytd` rows (cited as such); the engine derives discrete quarters by differencing consecutive YTD values (`computed`); TTM = sum of 4 discrete quarters (`computed`). Q4 discrete = FY − 9M-YTD. KPI quarterly values from IR letters (cited). Underlying cited values are always displayed alongside or accessible via the source expansion — a `computed` value never replaces its cited constituents.
5. **Verification Workflow (per data sub-phase)**: DS transcribes → `npm test` (fixtures + audit) → cites every record. OP **independently re-pulls cited sources and re-verifies every single value** — blind approvals prohibited; verification method recorded in audit log.
6. **EST/MKT Policy**: forecast/scenario/DCF outputs `isEstimate: true`; market inputs (rf, beta, ERP, share price, share count for per-share) marked `MKT` with as-of dates. `format.estSuffix` guarantees visible marking.

---

## 5. Non-Functional Requirements & Performance Budgets

- **Latency / Response Time**: Full recalc (schedules → 3-statement incl. balance gate → WACC → DCF → sensitivity grid) < 16ms on a 2020-class laptop; initial render < 500ms on locally-served static files.
- **Memory Footprint**: < 50MB resident heap; no unbounded caches; disposed nodes on tab switch.
- **Concurrency & Throughput**: Single-user client; all recalc synchronous (no event races); zero unhandled promise rejections.
- **Reliability & Error Handling**: Fail-fast on data audit failure (explicit uncited-data error page); typed `DataValidationError`/`EngineError` hierarchy; 100% test pass on critical paths; balance gate failure = blocking error, never silently ignored.
- **Accessibility & Responsiveness**: Keyboard-navigable inputs/tabs; semantic `<table>` with `scope` headers; usable 390px–1280px.
- **Determinism**: Byte-identical `ForecastOutput`/`ThreeStatementOutput` for identical driver state (snapshot test).

---

## 6. Security & Data Protection

- **Input Validation**: Driver values schema-clamped in `app.setDriver`; URL-hash state validated against the same schema (malformed → defaults, never crash).
- **Authentication / Authorization**: N/A (public static content; no PII, no accounts, no backend).
- **Secret Management**: None required; `.env` holds only optional dev flags. Zero secrets in source or data files.
- **Supply Chain**: Zero runtime dependencies; dev dependencies limited to the workflow's pinned tooling.
- **Content Integrity**: Public-domain financial disclosure; falsification prevented by the audit layer, fixtures, and OP re-verification — not by security controls.

---

## 7. Resolved Decisions Log (Director-Approved)

| # | Decision | Resolution |
|---|---|---|
| 1 | Forecast horizon | 5 forward years (FY2026–FY2030), user-extensible 3–10. FY2026 hybrid: H1 actual + H2 estimate. |
| 2 | Historical base | **FY2021–FY2025 annuals + TTM** (from quarterly 10-Qs); latest reported quarter KPIs. |
| 3 | Statement depth | **Full IS + BS + CF** (supersedes early "summary B/S + CF"). |
| 4 | Valuation methods | DCF primary (Gordon terminal, WACC build). **No comps, no precedent transactions, no LBO** (Director: "No comps then. Hold that."; LBO marked N/A). |
| 5 | Recommendation | **Mechanical**: upside % → Undervalued/Fair/Overvalued. No editorial language. |
| 6 | Comparables | Excluded per Director (2026-08-31). Revisit only on explicit Director instruction. |
| 7 | UI structure | Director-defined 8 tabs (§3.4). Dashboard concept merged into Summary/Output tab. |
| 8 | Version control | Git repo initialized at P0.1; Cover tab version reads git tags produced by Gate Pass archiver. |
