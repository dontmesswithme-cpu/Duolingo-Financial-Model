# Redesign Phase 8: Tab 08 — Sensitivity & Scenario Spectrum

> **Milestone**: Redesign Phase 8 — Tab 08: Sensitivity & Scenario Spectrum  
> **Protocol**: 1.0  
> **Status**: ⚪ Pending  
> **Owner**: Drafted by Reviewer (`OP`), Implemented by Worker (`DS`)  
> **Objective**: Redesign Tab 08 into an interactive sensitivity and scenario matrix workstation featuring an active scenario selector dropdown, a $9 \times 5$ WACC $\times$ Terminal Growth heatmap matrix with dynamic cell highlight and gradient shading, comprehensive Downside/Base/Upside scenario valuation bands, and the audit-grade Hybrid FY2026 Invariance disclosure.

---

## 1. Milestone Objective & Scope

Tab 08 exposes the valuation model's sensitivity to macro factors and stress conditions:
1. **Active Scenario Selector**: Clean dropdown control (`[Active Scenario: Base Case ▾]`) allowing instant switching between Base Case, Downside (Bear) Case, and Upside (Bull) Case.
2. **$9 \times 5$ WACC $\times$ Terminal Growth Rate Sensitivity Matrix**:
   - Two-variable matrix evaluating implied share price across 9 WACC discount rates ($\pm 200$ bps) and 5 Gordon growth rates ($\pm 100$ bps).
   - Prominent blue highlight for the active runtime cell (e.g. `$144.08` *[ILLUSTRATIVE MOCKUP VALUE — MUST DERIVE FROM ENGINE/DATA LAYER]*).
   - Dynamic soft-green gradient heatmap shading where darker shades represent higher implied intrinsic values.
   - Strict monotonic property validation ($\partial \text{Price}/\partial \text{WACC} < 0$, $\partial \text{Price}/\partial g > 0$).
3. **Scenario Valuation Bands & Sensitivity Spectrum**:
   - Comprehensive comparative table evaluating Downside, Base, and Upside cases.
   - Columns: Scenario Case, Core Driver Assumptions, WACC, Terminal Growth ($g$), DCF Target Price, Upside / (Downside) %, Multi-Method Verdict (`FAIR`), and Mechanical Recommendation (`OVERVALUED`, `FAIR`, `UNDERVALUED`).
4. **Hybrid FY2026 Invariance Memo**: Standardized `.callout-warning` highlighting the SEC 10-Q invariance gate (H1 FY2026 actuals remain byte-identical across all scenarios).

---

## 2. Prerequisites & Dependencies

- **Prior Completed Phases**: RP0 through RP7 completed.
- **Visual Authority (binding, R2)**: `ssdesign/target_theme/ref_08_sensitivity_scenarios.jpg` — content/structure ONLY, TOP-TAB shell per R1 (sidebar not built). Ref numbers are mockups; matrix values from the live sensitivity engine. DS cold-start MUST view the ref before code; capture-vs-ref self-check before submitting.
- **Engine Modules**: `src/engine/scenarios.js`, `src/engine/dcf.js`, `src/engine/wacc.js`, `src/ui/sensitivityTab.js`.

---

## 3. Sub-Phase Artifact Contracts

### Task RP8.1: $9 \times 5$ Heatmap Sensitivity Matrix & Active Cell Shading

#### A. Deliverable Files
- `src/ui/sensitivityTab.js` — Sensitivity matrix generator, color-ramp interpolation algorithm, and active cell highlight binding.
- `index.html` — Updated Tab 08 container markup.

#### B. Exported Interfaces & Types
- `.sensitivity-matrix-table`:
  - Top-left header: `WACC (Discount Rate)`
  - Column headers: growth values derived from the COMPUTED axis (centered on active g ±100bps, shrink-guard narrowed when headroom squeezes) — never fixed literals like `1.5%…3.5%`.
  - Rows: 9 WACC rates centered on active WACC (same computed-axis rule).
  - Cells: Formatted dollar values styled with discrete CSS percentile bucket classes (`.heatmap-cell`, `.heatmap-tier-1` through `.heatmap-tier-9`, and `.active-cell`), guaranteeing zero inline `style=` attributes.

#### C. Invariants & Automated Quality Gates
- [ ] Active scenario WACC and terminal growth rate match the exact center coordinates of the matrix.
- [ ] Active cell is distinctly highlighted with solid blue background (`#1A56DB`) and white text (`.active-cell`).
- [ ] Heatmap background interpolates across discrete CSS bucket classes (`.heatmap-tier-1`..`.heatmap-tier-9`); zero inline `style="background:..."` attributes permitted.
- [ ] Cell values are strictly monotonic across all rows and columns.

---

### Task RP8.2: Scenario Bands Table & Hybrid Invariance Callout

#### A. Deliverable Files
- `src/ui/sensitivityTab.js` — Scenario spectrum table renderer and hybrid invariance callout binding.
- `tests/redesign.tab8.test.js` — Tests verifying scenario valuations, monotonicity, and hybrid actual invariance.

#### B. Exported Interfaces & Types
- `.scenario-spectrum-table`:
  - Rows for `Downside Case`, `Base Case`, and `Upside Case`.
  - Color-coded badges for verdicts and mechanical recommendations.
- `.callout-warning`: Hybrid FY2026 Invariance callout card.

#### C. Invariants & Automated Quality Gates
- [ ] Changing the active scenario dropdown immediately updates the DCF target price and highlights across the application.
- [ ] Downside target price < Base target price < Upside target price invariant strictly holds.
- [ ] Automated headless tests in `tests/redesign.tab8.test.js` pass 100%.

---

## 4. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] Interactive scenario dropdown switches between Base, Bear, and Bull cases seamlessly.
- [ ] Capture-vs-ref comparison recorded (paths) against `ref_08` with zero console errors at desktop/tablet.
- [ ] $9 \times 5$ matrix renders mathematically validated heatmap values with active cell highlight.
- [ ] Test suite `tests/redesign.tab8.test.js` passes 100%.
