# Redesign Phase 1: Tab 01 — Cover & Model Architecture

> **Milestone**: Redesign Phase 1 — Tab 01: Cover & Model Architecture  
> **Protocol**: 1.0  
> **Status**: 🔴 Reopened — gate REVOKED 2026-09-08 (Director visual FAIL); visual-conformance rework active (fails=1)  
> **Owner**: Drafted by Reviewer (`OP`), Implemented by Worker (`DS`)  
> **Objective**: Rebuild Tab 01 (Cover & TOC) from a plain HTML table into an executive model dashboard featuring institutional overview cards, live valuation snapshots, verified integrity checkmarks, interactive architecture navigation, and side-by-side methodology callouts.

---

## 1. Milestone Objective & Scope

Tab 01 serves as the front door and executive briefing room of the financial model. This milestone redesigns the tab into a structured institutional dashboard:
1. **Model Overview & Metadata HUD**: Core model purpose, institutional scope, and 4 quick-glance metadata pills (Valuation Date, Current Share Price, Model Version, Model Type: 3-Statement DCF).
2. **Valuation Snapshot Card**: Live summary of base case DCF fair value (e.g. `$144.08` *[ILLUSTRATIVE MOCKUP VALUE — MUST DERIVE FROM ENGINE/DATA LAYER]*), blended valuation, implied upside %, implied return, active WACC, and terminal growth.
3. **Model Integrity Checklist**: Verified checklist with green checkmark badges confirming historical dataset completeness, 3-statement linkage, balance sheet invariant pass, and scenario framework readiness.
4. **Model Architecture Directory**: Interactive table listing tabs 01 through 08 with section names, institutional descriptions, and clickable jump arrows (`→`) that activate the respective tab.
5. **Key Assumptions & Valuation Methods Cards**: Quick reference cards displaying key baseline parameters and multi-method fair value outputs.
6. **Side-by-Side Methodology & Disclaimer Cards**: Standardized `.callout-info` and `.callout-warning` callout cards explaining methodology scope notes and statutory research disclaimers.

---

## 1b. Visual Authority & Binding Rulings (Director FAIL 2026-09-08)

- **Canonical image**: `ssdesign/target_theme/ref_01_cover_toc.png` (pixel-identical to Director's target). DS cold-start MUST view it before code; no submission without a capture-vs-ref self-check.
- **Rework scope**: (a) 3-column top row — Overview (prose + 4-cell meta row, date `Sep 1, 2026`) | Snapshot as DEFINITION-LIST rows (label/value, upside row highlighted) | Status checklist WITH green status words; (b) second row 2/3 architecture directory + 1/3 right rail (Key Assumptions table + Valuation Methods grid); (c) RP0 shell fixups ride along (wordmark §RP0, single-row stacked tabs §RP0).
- **Standing translations (R2)**: image FIGURES are stale mockups — render engine truth ($144.08/$157.85/FAIR/11.04%/2.50%/50.03M); "Blended Fair Value" does NOT overrule P8 agreement-only (spread + agreement badge stay; ref_06 confirms). R1 (top tabs locked, no sidebar) and R3 (this reopening) apply.

## 2. Prerequisites & Dependencies

- **Prior Completed Phases**: Redesign Phase 0 (RP0) completed with GATE PASS (design tokens, Helvetica stack, app shell).
- **Core Data Feeds**: `src/data/assumptions.json`, `src/engine/dcf.js`, `src/engine/recommend.js`.
- **Reference Assets**: `assets/icons/ui/check-circle.svg`, `assets/icons/ui/info-circle.svg`, `assets/icons/ui/alert-triangle.svg`.

---

## 3. Sub-Phase Artifact Contracts

### Task RP1.1: Cover Dashboard Grid & Summary Cards

#### A. Deliverable Files
- `index.html` — Tab 01 pane markup updated with responsive CSS Grid layout (`.cover-grid`).
- `src/ui/coverTab.js` — Dedicated UI view controller managing Cover card hydration, dynamic data population, and lifecycle.
- `src/ui/tabs.js` — Jump link handlers (`data-jump-tab="X"`) enabling direct navigation to any tab from the architecture directory.
- `src/app.js` — Wires `coverTab.renderCover()` into the main application lifecycle.

#### B. Exported Interfaces & Types
- Component Elements:
  - `.cover-overview-card`: Overview prose + 4-item metadata stat row (`.stat-pill`).
  - `.cover-snapshot-card`: Base Case valuation metrics with dynamic upside badge (`.badge-upside`) — rendered as DEFINITION-LIST rows (label/value per ref_01: price, DCF fair value, spread, upside highlighted, implied return, WACC, g, forecast period) fed EXCLUSIVELY by engine outputs (no mockup figures; no averaged headline).
  - `.cover-status-card`: 6-row checklist using verified SVG checkmark icons.
  - `.cover-assumptions-card`: Baseline WACC, g, revenue CAGR, margins, share count.
  - `.cover-methods-card`: Summary of the 6 valuation methods and blended fair value.

#### C. Invariants & Automated Quality Gates
- [ ] Clicking any row in the Model Architecture table switches immediately to the target tab.
- [ ] All valuation figures on the Cover tab derive from the engine; zero hardcoded financial figures.
- [ ] Layout renders cleanly across desktop and tablet without overlapping cards.
- [ ] Semantic HTML: `article`, `section`, `nav`, and proper ARIA labels.

---

### Task RP1.2: Architecture Directory & Standardized Callouts

#### A. Deliverable Files
- `index.html` — Updated Model Architecture table markup and side-by-side callout cards.
- `tests/redesign.tab1.test.js` — Headless DOM tests verifying presence of all cards, 8 architecture rows, jump links, and callout classes.

#### B. Exported Interfaces & Types
- `.architecture-table`:
  - Columns: `#`, `Section`, `Description`, `Go To`.
  - Rows 01 through 08 with hover highlights and jump buttons (`.jump-btn`).
- Side-by-side Callouts:
  - Left: `.callout-info` (Methodology Scope Note on comps integration and excluded LBO/M&A).
  - Right: `.callout-warning` (SEC & FINRA compliant research disclaimer).

#### C. Invariants & Automated Quality Gates
- [ ] Architecture directory lists all 8 sections accurately matching `docs/spec.md`.
- [ ] Zero inline `style=` attributes.
- [ ] Both callouts display their respective SVGs (`info-circle.svg` and `alert-triangle.svg`).
- [ ] `npm test` passes 100%.

---

## 4. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] Tab 01 matches `ref_01` structure on side-by-side capture comparison (3-col top, definition-list snapshot, status words, 2/3 + 1/3 second row) — figure values exempt (engine truth governs).
- [ ] Capture-vs-ref comparison recorded (paths) with zero console errors; no overlapping cards at desktop/tablet.
- [ ] Tab 01 renders pixel-perfect institutional layout matching target theme structure.
- [ ] Clickable navigation verified from Cover to all other 7 tabs.
- [ ] Dynamic values accurately reflect active scenario assumptions.
- [ ] Headless test suite `tests/redesign.tab1.test.js` green.
