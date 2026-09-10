# Redesign Phase 5: Tab 05 — Projections (3-Statement Linked Forecast)

> **Milestone**: Redesign Phase 5 — Tab 05: Projections (3-Statement Linked Forecast)  
> **Protocol**: 1.0  
> **Status**: ⚪ Pending  
> **Owner**: Drafted by Reviewer (`OP`), Implemented by Worker (`DS`)  
> **Objective**: Redesign Tab 05 into an institutional projection workstation featuring forward KPI summary cards, dual trajectory forecast charts, a segmented statement switcher with freeze panes, display units toggle, and clear hybrid-year (FY2026) split indicators.

---

## 1. Milestone Objective & Scope

Tab 05 delivers the forward-looking 3-statement financial forecast (FY2026–FY2030) linked to the driver engine. This milestone optimizes comprehension and visual density:
1. **Top Forward KPI Cards**: 4 executive forward stat cards:
   - Revenue 5-Year CAGR (`2026E–2030E`)
   - Terminal Year Operating Margin (`2030E`)
   - Terminal Year FCF Margin (`2030E`)
   - Terminal Year Net Income (`2030E, US$ mm`)
2. **Dual Trajectory Forecast Charts**:
   - Chart 1: Revenue & Unlevered Free Cash Flow (UFCF) multi-year progression ($ mm).
   - Chart 2: Operating Margin Expansion (Gross Margin % vs Operating Margin %).
3. **Statement Workspace with Freeze Panes**:
   - Segmented switcher (`[Income Statement]`, `[Balance Sheet]`, `[Cash Flow]`) ensuring only one clean statement is active at a time.
   - Pinned `Line Item` column and sticky year headers (`FY2021` through `FY2030E`).
4. **Display Units Toggle**: Seamless switching between `$ Thousands` and `$ Millions`.
5. **Hybrid FY2026 Provenance Indicator**: Clear visual demarcation showing H1 actuals transcribed from SEC Form 10-Q and H2 model estimates.

---

## 2. Prerequisites & Dependencies

- **Prior Completed Phases**: RP0 through RP4 completed.
- **Visual Authority (binding, R2)**: `ssdesign/target_theme/ref_05_projections.jpg` — content/structure ONLY, TOP-TAB shell per R1 (sidebar not built). Ref numbers are mockups; every figure from the 3-statement engine. DS cold-start MUST view the ref before code; capture-vs-ref self-check before submitting.
- **Engine Modules**: `src/engine/threeStatement.js`, `src/engine/forecast.js`, `src/ui/projectionsTab.js`.
- **Chart Infrastructure**: `src/ui/charts.js`.

---

## 3. Sub-Phase Artifact Contracts

### Task RP5.1: Forward KPI Summary Cards & Trajectory Charts

#### A. Deliverable Files
- `src/ui/projectionsTab.js` — Forward KPI card computations and chart bindings.
- `src/ui/charts.js` — Dual line-chart renderers with custom tooltips and legend styling.
- `index.html` — Updated Tab 05 container markup.

#### B. Exported Interfaces & Types
- `.kpi-strip`:
  - 4 cards displaying large metric values, benchmark tags, and sub-labels.
- Trajectory Charts:
  - `#chart-revenue-fcf`: Dual line chart with distinct blue and green plot lines.
  - `#chart-margin-expansion`: Percentage line chart tracking gross and operating margins.

#### C. Invariants & Automated Quality Gates
- [ ] Forward CAGR and margin metrics compute dynamically from the active 3-statement dataset.
- [ ] Charts update reactively when driver sliders change in Tab 02.
- [ ] Zero canvas memory leaks on repeated tab switching.

---

### Task RP5.2: Projection Statement Workspace & Freeze Panes

#### A. Deliverable Files
- `src/ui/projectionsTab.js` — Statement switcher, freeze panes table markup, and hybrid FY2026 split styling.
- `tests/redesign.tab5.test.js` — Tests asserting statement switching, unit scaling, and line item formulas.

#### B. Exported Interfaces & Types
- `.projection-table`:
  - Pinned line item column on the left.
  - Historical columns (FY2021–FY2025) with neutral styling.
  - Projected columns (FY2026E–FY2030E) with light blue header accents.
  - Balance Sheet statement includes live `Assets = Liab + Equity` tie-out row.

#### C. Invariants & Automated Quality Gates
- [ ] Segmented switcher switches statements without lag (< 16ms).
- [ ] Units toggle scales figures between Thousands and Millions accurately.
- [ ] Net Income from Income Statement ties to Cash Flow Statement net income row across all projected years.

---

## 4. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] All 3 projected statements balance and link without discrepancy.
- [ ] Capture-vs-ref comparison recorded (paths) against `ref_05` with zero console errors at desktop/tablet.
- [ ] Forward KPI cards and dual trajectory charts render accurately matching engine output.
- [ ] Automated headless tests in `tests/redesign.tab5.test.js` green.
