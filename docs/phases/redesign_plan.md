# Master Redesign Roadmap & Milestone Architecture

> **Document**: Redesign Master Plan (RP0 – RP9)  
> **Protocol**: 1.0  
> **Target Theme**: Duolingo Institutional Financial Data Terminal  
> **Design Rules Locked**:
> 1. Top Horizontal Tab Navigation locked across all 8 tabs (Zero vertical sidebars) — Director ruling R1 2026-09-08: top tab switcher from `ref_01` is the shell for EVERY tab; the sidebar shown in refs 02–08 is NOT built. RP0.2 top-bar work stands; single-row stacked number-over-label restyle rides with RP1 rework.
> 2. Helvetica Font Stack (`"Helvetica Neue", Helvetica, Arial, sans-serif`) with `tabular-nums` for all financial figures.
> 3. Strict preservation of audited data feeds, calculations, and column naming from the core engine.
> 4. Unified component tokens: `.pill-control`, `.pill-btn`, `.callout-info`, `.callout-warning`, `.badge-fair`, `.badge-overvalued`, `.badge-undervalued`.
> 5. Ref authority (Director ruling R2 2026-09-08): `ssdesign/target_theme/ref_01–08` are STRUCTURE/STYLING authority only — never literal content. All figures/logic come from the engine + corpus + standing rulings (agreement-only verdicts, no averaged headlines; ref mockup numbers never bind). Newer live-truth images win figure conflicts.

---

## 1. Redesign Phase Inventory

| Phase | Milestone Name | Primary Scope | Deliverables & Artifacts |
|---|---|---|---|
| **RP0** | **Design System Tokens & App Shell** | CSS Variables, Helvetica font stack, dark navy header (`#0B1E36`), Duo mascot & logo integration, top horizontal tab bar, global status strip, clean footer. | `index.html`, `src/ui/tabs.js`, `tests/redesign.shell.test.js` |
| **RP1** | **Tab 01 — Cover & Model Architecture** | Model overview card, valuation snapshot card, model status checklist, architecture directory table with navigation jump arrows, key assumptions & methods summary cards, side-by-side callout boxes. | `src/ui/coverTab.js`, `src/ui/tabs.js`, `index.html`, `tests/redesign.tab1.test.js` |
| **RP2** | **Tab 02 — Assumptions / Drivers** | Segmented category pills (`[Operating] [Margins]...`), dual view modes (Interactive Sliders vs Multi-Year Projection Table), custom slider controls with tooltip definitions, blue-input color-coding. | `src/ui/assumptionsTab.js`, `tests/redesign.tab2.test.js` |
| **RP3** | **Tab 03 — Historicals (Data Terminal)** | Financial Data Terminal architecture: Hero SEC status banner, top 4 KPI cards, Statement Workspace (`[Income] [Balance] [Cash Flow]`) with freeze panes, Annual vs Quarterly view toggle, Line-Item Inspector drawer, Trend Explorer with dynamic metric switcher, expandable Audit Center. | `src/ui/historicalsTab.js`, `tests/redesign.tab3.test.js` |
| **RP4** | **Tab 04 — Supporting Schedules** | Balance Sheet Invariant Hard Gate check cards (FY2026–FY2030), segmented schedule switcher (`[Balance Sheet] [Working Capital] [PP&E] [Intangibles] [SBC] [Debt]`), display units toggle (Thousands/Millions). | `src/ui/schedulesTab.js`, `tests/redesign.tab4.test.js` |
| **RP5** | **Tab 05 — Projections (3-Statement)** | Forward CAGR & margin KPI cards, dual trend charts (Revenue/FCF & Margin expansion), statement switcher with freeze panes and balance gate indicators. | `src/ui/projectionsTab.js`, `tests/redesign.tab5.test.js` |
| **RP6** | **Tab 06 — Valuation & Parameter Inspector** | Sub-header market quote banner, 6-method valuation card strip, 2-stage DCF component panel, EV-to-Equity waterfall bridge chart, Bloomberg-style 7-lever collapsible Parameter Inspector with live flip indicators and safe-band distance monitoring. | `src/ui/valuationTab.js`, `tests/redesign.tab6.test.js` |
| **RP7** | **Tab 07 — Summary / Output** | Executive consensus verdict card, confidence score progress bar, weighted valuation table, waterfall bridge summary, 6 KPI sparklines, Key Investment Thesis, and Model Health checklist. | `src/ui/summaryTab.js`, `tests/redesign.tab7.test.js` |
| **RP8** | **Tab 08 — Sensitivity / Scenarios** | Active scenario dropdown (`Base`, `Bear`, `Bull`), $9 \times 5$ WACC $\times$ Terminal Growth matrix with gradient heatmap and active cell highlight, Downside/Base/Upside scenario bands, hybrid invariance memo. | `src/ui/sensitivityTab.js`, `tests/redesign.tab8.test.js` |
| **RP9** | **End-to-End Verification & Gate Pass** | Full regression test suite run, responsive layout audits, zero style= violations, memory profiling, final gate pass approval. | `tests/*.test.js`, `docs/review_checklist.md` |

---

## 1b. Visual Authority Map (binding — R2 2026-09-08)

| Phase | Ref image(s) — STRUCTURE only | Notes |
|---|---|---|
| RP0 shell | `ssdesign/target_theme/ref_01_cover_toc.png` (header + tab bar) | Header MUST use `assets/branding/duolingo-logo.svg` wordmark beside owl; tab bar single-row stacked number-over-label. |
| RP1 | `ssdesign/target_theme/ref_01_cover_toc.png` | 3-col top (overview 4-cell meta row \| snapshot definition-table \| status with green status words); 2/3 directory + 1/3 rail (assumptions table + methods grid). |
| RP2 | `ssdesign/target_theme/ref_02_assumptions_sliders.png`, `ref_02_assumptions_table.png` | Slider + table content with TOP-TAB shell (sidebar not built, R1). |
| RP3 | `ssdesign/target_theme/ref_03_historicals.png` | Same shell rule. |
| RP4 | `ssdesign/target_theme/ref_04_supporting_schedules.jpg` (`_v2` if newer) | Same shell rule. |
| RP5 | `ssdesign/target_theme/ref_05_projections.jpg` | Same shell rule. |
| RP6 | `ssdesign/target_theme/ref_06_valuation.png` | Live-truth pins + ±15% agreement engine reference; Min–Max ranges, no averages. |
| RP7 | `ssdesign/target_theme/ref_07_summary_output.png` | Same shell rule. |
| RP8 | `ssdesign/target_theme/ref_08_sensitivity_scenarios.jpg` | Same shell rule. |

Worker + Reviewer cold-start MUST view the phase's ref image(s) before code/audit; no visual PASS without a recorded capture-vs-ref comparison.

---

## 2. Universal Interaction Standards

```
+----------------------------------------------------------------------------------------------------+
| [Duo Icon] Duolingo, Inc. (NASDAQ: DUOL | 3-Statement Model)  | Valuation Date | Model v1.0-P4 |   |
+----------------------------------------------------------------------------------------------------+
| [01 Cover & TOC] [02 Assumptions] [03 Historicals] [04 Schedules] ... [08 Sensitivity]            |
+----------------------------------------------------------------------------------------------------+
| [Status / Context Banner: SEC Filing Continuity / Market Quote / Units Switcher]                   |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|                                       ACTIVE TAB WORKSPACE                                         |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
| Duolingo, Inc. (NASDAQ: DUOL) | Independent Financial Valuation Model | Version v1.0-P4            |
+----------------------------------------------------------------------------------------------------+
```

1. **Navigation Invariant**: The top horizontal tab bar remains mounted and sticky across all 8 tabs.
2. **Typography Invariant**: Helvetica font stack with `tabular-nums` applied to all data cells and cards.
3. **Data Lineage Invariant**: All values rendered derive directly from `src/data/` or `src/engine/`. No mock numbers or bare literals outside constants.
4. **Clean DOM Invariant**: Zero inline `style=` attributes. All styling driven by semantic CSS classes.
