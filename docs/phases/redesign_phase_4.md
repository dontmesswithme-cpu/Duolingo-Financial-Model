# Redesign Phase 4: Tab 04 — Supporting Schedules

> **Milestone**: Redesign Phase 4 — Tab 04: Supporting Schedules  
> **Protocol**: 1.0  
> **Status**: ⚪ Pending  
> **Owner**: Drafted by Reviewer (`OP`), Implemented by Worker (`DS`)  
> **Objective**: Redesign Tab 04 into a modular schedule hub featuring prominent Balance Sheet Invariant Hard Gate status cards, a segmented schedule switcher, display units toggle (Thousands vs Millions), and cleanly formatted debt-free capital structure verification.

---

## 1. Milestone Objective & Scope

Supporting schedules supply the operational mechanics that link the historical statements to the future forecast. This milestone redesigns Tab 04 to emphasize auditability and mathematical integrity:
1. **Balance Sheet Invariant Hard Gate Cards**: 5 prominent executive cards (FY2026 through FY2030) validating that `Assets = Liabilities + Equity` with verified green checkmarks and `BALANCED (Δ$0)` badges.
2. **Modular Schedule Switcher**: Segmented pill control allowing analysts to view all schedules simultaneously or isolate specific modules:
   - `[All Schedules]`, `[Balance Sheet]`, `[Working Capital]`, `[PP&E]`, `[Intangibles]`, `[Stock-Based Comp]`, `[Debt & Capital Structure]`.
3. **Display Units Toggle**: Upper-right controls strip toggle allowing instant switching between Thousands (`$ in thousands`) and Millions (`$ in millions`).
4. **Clean Schedule Presentation**:
   - Working Capital & Operating Schedules (DSO/DPO, NWC, ΔNWC).
   - PP&E Roll-Forward Schedule (Beginning PP&E, Capex, Depreciation, Ending PP&E).
   - Intangibles & Amortization Schedule (Additions, Amortization, Net Intangibles).
   - Stock-Based Compensation Schedule (% of Revenue).
   - Debt Schedule & Capital Structure (Verification of zero funded debt, zero borrowings, and ASC 842 lease liability treatment).
5. **Standardized Debt & Lease Callout**: Clear informational card explaining funded debt status and ASC 842 operating lease convention.

---

## 2. Prerequisites & Dependencies

- **Prior Completed Phases**: RP0 (App Shell), RP1 (Cover), RP2 (Assumptions), RP3 (Historicals).
- **Visual Authority (binding, R2)**: `ssdesign/target_theme/ref_04_supporting_schedules.jpg` (`_v2` if newer) — content/structure ONLY, TOP-TAB shell per R1 (sidebar not built). Ref numbers are mockups; every figure from engine + schedules. DS cold-start MUST view the ref before code; capture-vs-ref self-check before submitting.
- **Engine Modules**: `src/engine/schedules.js`, `src/engine/threeStatement.js`, `src/ui/schedulesTab.js`.

---

## 3. Sub-Phase Artifact Contracts

### Task RP4.1: Balance Sheet Invariant Hard Gate Cards & Unit Switcher

#### A. Deliverable Files
- `src/ui/schedulesTab.js` — Hard gate card renderer and units toggle calculation bindings.
- `index.html` — Tab 04 container updated with responsive hard gate grid (`.gate-grid`).
- `tests/redesign.tab4.test.js` — Tests asserting hard gate zero-discrepancy conditions and unit scaling.

#### B. Exported Interfaces & Types
- `.gate-card`:
  - Year label (`FY2026` ... `FY2030`)
  - Status badge: `.badge-pass` (`✓ BALANCED (Δ$0)`)
  - Ledger breakdown: Total Assets, Total Liabilities, Stockholders' Equity, Discrepancy (`$0`).
- Units Toggle:
  - Radio pills: `( ) Thousands` / `( ) Millions` with scaling factor `scale = unit === 'millions' ? 1000 : 1`.

#### C. Invariants & Automated Quality Gates
- [ ] If any forecast year has `Assets !== Liabilities + Equity`, the card immediately flips to red `.badge-fail` with exact discrepancy amount.
- [ ] Toggling units re-scales all schedule figures dynamically without rounding distortion.
- [ ] 0 inline styles; responsive 5-card grid collapses gracefully on narrower screens.

---

### Task RP4.2: Modular Schedules & Capital Structure Verification

#### A. Deliverable Files
- `src/ui/schedulesTab.js` — Modular schedule tables with freeze panes and segmented switcher filtering.
- `src/ui/format.js` — Enhanced accounting formatters (negative numbers in parentheses, zero formatted as `—`).

#### B. Exported Interfaces & Types
- Schedules:
  - `.schedule-working-capital`: NWC and ΔNWC lines highlighted with subtle green/gray borders.
  - `.schedule-ppe`: Beginning PP&E, (+) Capex, (-) Depreciation, Ending PP&E roll-forward.
  - `.schedule-intangibles`: Additions and amortization schedules.
  - `.schedule-sbc`: SBC expense and SBC % of revenue.
  - `.schedule-debt`: Funded debt line items ($0 confirmed) and ASC 842 lease obligations.

#### C. Invariants & Automated Quality Gates
- [ ] Debt schedule explicitly renders `$0` for all funded debt lines across all historical and projected years.
- [ ] ΔNWC in the Working Capital schedule ties exactly to the Cash Flow Statement working capital line in engine calculations.
- [ ] Segmented switcher allows switching between individual schedules or viewing all consecutively.

---

## 4. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] All 5 Balance Sheet Invariant cards display `BALANCED (Δ$0)` under active baseline engine state.
- [ ] Capture-vs-ref comparison recorded (paths) against `ref_04` with zero console errors at desktop/tablet.
- [ ] Unit toggle switches between Thousands and Millions accurately across all 5 schedules.
- [ ] Automated headless test suite `tests/redesign.tab4.test.js` green.

---

## 5. Rework Amendment RP4-RW (Director Order 2026-09-08 23:10 — Gate reopened)

> **Authority**: Director visual rework order, supersedes RP4.1 §B "Radio pills" spec for the units control. All other RP4.1/RP4.2 contracts remain frozen. Backlog items on earlier tabs are explicitly OUT of scope ("last phase").

### RW2.1 — Card header conformance to canonical RW1.1 treatment (app-wide)
- **Defect**: Tab 04 card headers (`.statement-card-header`) inherit the legacy P5-era rule block (`index.html` ~:1238: `padding: 12px 16px; background: var(--color-page); border-bottom: 1px solid var(--color-border); font-weight: 650`) which the RW1.1 shared rule (:3705/:3719) does not fully override — producing grey-banner headers inconsistent with the blue-bar inline headers on tabs 01–03.
- **Fix**: ALL Tab 04 card/section headers — 5 schedule cards (`.statement-card-header`), the hard-gate section header (`.statement-card-header.gate-section-header`), and the debt callout title block — render the canonical RW1.1 treatment exactly (border-left 3px `var(--color-accent-blue)`, padding-left 10px, 15px/700 primary, subtitle 12px muted where present): neutral/transparent header background, no full-width bottom border, no grey banner. Achieved by extending the ONE shared RW1.1 rule / neutralizing the legacy conflicting properties — NOT by per-header copies or new one-off styles.
- **Frozen**: all header text strings, element order, `data-*` hooks, gate-card internals, and tests unrelated to headers stay byte-identical.

### RW2.2 — Units toggle rebuilt on the canonical segmented pill pattern
- **Defect**: `Thousands`/`Millions` toggle uses a bespoke `.units-radio-group` + `.radio-pill`/`.radio-indicator` radio-dot control — inconsistent with the app-wide `.pill-control` + `.pill-btn` segmented capsule (Tab 02 `Sliders`/`Table View`, Tab 03 `Annual`/`Quarterly`).
- **Fix**: Units toggle renders as `<div class="pill-control">` with two `<button type="button" class="pill-btn" data-unit="…">` options (`Thousands`, `Millions`), active state via `.pill-btn.active` — visually and structurally identical to the Tab 02 mode toggle. The `DISPLAY UNITS` label may remain. Retire the radio-dot affordance on Tab 04 (`.radio-pill`/`.radio-indicator`/`.units-radio-group` custom classes removed from markup and CSS, or reduced to no-op). Keep the hidden radio inputs for a11y ONLY if wired to the same pattern used by Tab 02 — otherwise buttons + `aria-pressed` matching Tab 02's implementation.
- **Behavior preserved (gated)**: `setUnit`/`onUnitChange` wiring, both `click` and `change` paths, `getUnit()` round-trip, millions rescale, and RP4.1/RP4.2 invariants unchanged. Tests pinning `.radio-pill[data-unit]` update to the new selector (test-maintenance with one-line rationale per disclosure rule).

### Proof bar (submission requirements)
- Header inventory: file + selector + before/after for every in-scope Tab 04 header; computed-style conformance vs a Tab 02/03 reference header (background, border-left, padding-left, font).
- Live pill conformance: DOM shape identical to Tab 02 toggle (`.pill-control` container + 2 `.pill-btn`, active class flips on click); units behavior re-verified (toggle → rescale → round-trip).
- Suite green (837+ or updated count with rationale); capture-vs-ref re-run (1440 + 390), 0 console errors; `tests/redesign.tab4.test.js` selector updates disclosed.
