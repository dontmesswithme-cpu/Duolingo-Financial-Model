# Master Roadmap & Milestone Plan

> **Purpose**: This document defines the high-level roadmap, phase breakdown, dependency graph, and milestone deliverables for the project.

---

## 1. Milestone Overview

| Phase | Milestone Name | Scope Summary | Prerequisite | Status |
|---|---|---|---|---|
| **P0** | **Foundation: Test Harness, Data Schema & Audit Layer** | Schema definitions (annual/quarter/YTD), citation/EST/MKT audit enforcement, source ledger structure, typed errors, app scaffold. | None | 🟡 In Progress |
| **P1** | **Historical Data: Full 3-Statement Actuals FY2021–FY2025 + TTM** | Full IS/BS/CF annuals (5 years), quarterly TTM window from 10-Qs, KPIs, YTD→discrete differencing fixtures; every record cited. | P0 | ⚪ Pending |
| **P2** | **Supporting Schedules** | Working capital, PP&E roll-forward, debt, stock-based comp, intangible amortization — historical basis + projection logic. | P1 | ⚪ Pending |
| **P3** | **Linked 3-Statement Projections** | Driver-based IS → BS → CF forecast FY2026–FY2030 (hybrid FY2026), cash sweep, **balance gate enforced**. | P2 | ⚪ Pending |
| **P4** | **Valuation: DCF, WACC Build & Recommendation** | CAPM/WACC build (MKT-labeled inputs), DCF schedule, sensitivity grids, mechanical recommendation. | P3 | ⚪ Pending |
| **P5** | **Interactive UI: 8-Tab Model Interface** | Cover/TOC, Assumptions (blue-input color-coding), Historicals, Schedules, Projections, Valuation, Summary, Sensitivity — tables, charts, citations. | P4 | ⚪ Pending |
| **P6** | **End-to-End Verification, Performance & Release** | 100% figure re-verification, performance budgets, responsiveness/a11y, release sign-off. | P5 | ⚪ Pending |

---

## 2. Phase Breakdown & Subtask Structure

### Phase 0: Foundation — Test Harness, Data Schema & Audit Layer
- `P0.1`: Repository scaffolding, git init, app entry scaffold (`index.html`, `src/` skeleton, 8-tab shell), `npm test` green baseline.
- `P0.2`: Historical record schemas (fiscal_year/quarter/ytd periods; flow/stock/kpi classes), audit engine, citation + EST + MKT enforcement with tests.
- `P0.3`: Source ledger structure, loader with fail-fast validation, typed error hierarchy (`DataValidationError`, `EngineError`), constants.

### Phase 1: Historical Data — Full 3-Statement Actuals FY2021–FY2025 + TTM
- `P1.1`: Annual income statements FY2021–FY2025 (10-K 3-year columns) + quarterly discrete IS for TTM window (10-Q 3-month columns); revenue by segment, cost lines, opex, operating income, net income. All cited; fixture cross-checks.
- `P1.2`: Annual balance sheets FY2021–FY2025 year-ends + latest quarter-end (full detail: AR, unearned revenue, PP&E, intangibles, SBC, equity components); balance-sum fixtures per year.
- `P1.3`: Annual cash flow statements FY2021–FY2025 + 10-Q YTD rows (transcribed as `ytd`); engine-side discrete derivation tested against fixture differences.
- `P1.4`: KPIs (DAU, MAU, paid subscribers, bookings, adjusted EBITDA) annual + quarterly, verbatim definitions; TTM computation module verified against anchor fixtures.
- `P1.5`: OP independent re-verification sweep: every value re-pulled from cited sources; ledger completeness audit.

### Phase 2: Supporting Schedules
- `P2.1`: Working capital schedule (DSO/DPO, %-of-revenue lines) from cited historicals; drivers defined.
- `P2.2`: PP&E roll-forward + intangible amortization schedule; capex/D&A drivers defined.
- `P2.3`: Debt schedule (terms verified from filings — debt-free case handled explicitly) + SBC schedule (ties to CF statement).

### Phase 3: Linked 3-Statement Projections
- `P3.1`: Driver-based forecast core (revenue cascade: users → paid subs → subscription revenue; ads; test/other segments; cost structure).
- `P3.2`: IS → BS → CF linkage with cash sweep; hybrid FY2026 (H1 actual / H2 estimate, per-half provenance).
- `P3.3`: **Balance gate**: `assets = liabilities + equity` per forecast year — engine invariant + automated test; scenario system (Bear/Base/Bull) over full 3-statement path.

### Phase 4: Valuation — DCF, WACC Build & Recommendation
- `P4.1`: WACC build (CAPM: rf, beta, ERP — MKT-labeled, as-of dated, user-adjustable); cost of debt from debt schedule.
- `P4.2`: DCF: discount factors, explicit-period PV, Gordon terminal value, EV → net cash → equity → per-share bridge; full schedule exposed.
- `P4.3`: Sensitivity grids (WACC × terminal growth), Bear/Base/Bull per-share ranges; mechanical recommendation (`recommend.evaluate`) with MKT snapshot price.

### Phase 5: Interactive UI — 8-Tab Model Interface
- `P5.0`: Vendor onboarding: download pinned Tabulator release (single file + CSS) into `vendor/tabulator/`, create `docs/vendor/manifest.md` (version, license, source URL, SHA-256), wire ESM import; OP audits manifest + integrity hash.
- `P5.1`: App controller (DI, clamped drivers, synchronous recalc < 16ms, dispose) + tab shell navigation + Cover/TOC (version from git tags, disclaimer, EST/MKT legend).
- `P5.2`: Assumptions tab (blue-input color-coding, schema-clamped controls) + Historicals tab (Tabulator grid: 5-year + quarterly + TTM columns, frozen label column + header, citation superscripts, source expansion, `computed` labels).
- `P5.3`: Schedules + Projections tabs (Tabulator grids with frozen labels across 10-year column spans, balance-check indicators, hybrid-year split display) + cell color-coding audit (formatter callbacks emit `cell-input`/`cell-formula`/`cell-link` classes).
- `P5.4`: Valuation tab (WACC build table, DCF schedule, bridge waterfall) + Summary/Output tab (mechanical recommendation, upside %, KPI headline cards, Rule of 40) + Sensitivity tab (Tabulator data tables, scenario ranges).
- `P5.5`: Custom SVG charts (revenue/FCF actual-vs-forecast lines, margin bars, DCF waterfall); versioned screenshots for visual audit.

### Phase 6: End-to-End Verification, Performance & Release
- `P6.1`: Full accuracy audit: OP re-verifies 100% of historical figures against cited sources (direct EDGAR re-pull + Bigdata.com independent lane per spec §4.7); EST/MKT/computed marks verified present in every rendered view.
- `P6.2`: Performance budgets (recalc < 16ms incl. balance gate + DCF, initial render < 500ms, heap < 50MB), responsiveness (390px–1280px), keyboard accessibility.
- `P6.3`: Production verification & portfolio release: GitHub Actions Pages workflow + Vercel auto-deploy (Vercel URL primary, Pages mirror), offline smoke test (no network requests at runtime — vendor manifest URLs never fetched), **README as portfolio deliverable** (live links, architecture diagram, accuracy-gate pitch, screenshots), screen-recording of live driver-slider recalc for the LinkedIn post, Director release sign-off.

---

## 3. Dependency Graph

```
P0 (Schema & Audit — the Accuracy Gate machinery)
  └─► P1 (Verified 3-Statement Historicals + TTM — audit layer enforced from day one)
        └─► P2 (Supporting Schedules — built on verified historical detail)
              └─► P3 (Linked Projections — balance gate on top of schedules)
                    └─► P4 (DCF/WACC/Recommendation — consumes ThreeStatementOutput)
                          └─► P5 (8-Tab UI — binds data + engine + valuation)
                                └─► P6 (E2E Accuracy & Release — full re-verification)
```

**Key sequencing rationale**:
- The audit/citation layer (P0) precedes ALL data work (P1) so no uncited number can ever enter the repository.
- Schedules (P2) precede projections (P3) because the balance gate needs schedule mechanics (WC, PP&E, SBC) to link the statements.
- The full calculation path (P1→P4) is built and unit-verified headlessly before any UI (P5) touches it.
- The final phase (P6) is a full independent re-verification pass — the accuracy gate is enforced at entry, during, and at exit.
