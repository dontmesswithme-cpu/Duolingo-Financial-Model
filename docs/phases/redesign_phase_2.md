# Redesign Phase 2: Tab 02 — Assumptions & Drivers

> **Milestone**: Redesign Phase 2 — Tab 02: Assumptions & Drivers  
> **Protocol**: 1.0  
> **Status**: ⚪ Pending  
> **Owner**: Drafted by Reviewer (`OP`), Implemented by Worker (`DS`)  
> **Objective**: Redesign Tab 02 into an interactive driver command center featuring segmented category pills, dual presentation modes (Interactive Parameter Sliders vs Multi-Year Forecast Table), structured tooltip definitions, and schema-clamped blue-input cell styling.

---

## 1. Milestone Objective & Scope

Tab 02 controls the engine parameters that drive the entire 3-statement projection and valuation cascade. This milestone transforms Tab 02 into a dual-mode interactive workspace:
1. **Segmented Category Filter**: Universal pill switcher allowing analysts to focus on specific driver groups (`[Operating]`, `[Margins]`, `[Tax & Capital]`, `[Balance Sheet]`, `[Financing]`, `[Valuation]`, `[All/Other]`).
2. **Dual Presentation Modes**:
   - **Mode A (Parameter Sliders)**: Visual controls for rapid scenario testing with custom styled slider tracks, live value input pills, unit badges (`%`, `$`, `Days`), and contextual parameter definition tooltips (`ⓘ`).
   - **Mode B (Forecast Matrix Table)**: Comprehensive multi-year driver matrix across FY2021 through FY2030E, clearly distinguishing user inputs (blue text `.cell-input`) from formula-linked rows.
3. **Legend & Controls Strip**: Top controls strip featuring input type legend (`● User Input` vs `○ Calculated / Linked`) and mode toggle (`[Sliders] [Table View]`).
4. **Assumptions Note**: Standardized `.callout-info` detailing methodology sources and management guidance references.

---

## 1b. Carried-over visual fixups (post-RP1 Director review — binding RP2 scope)
- **V1 Tab strip navy gutters**: `.app-header` padding insets the nav 24px each side — make the strip full-bleed edge-to-edge (no navy at the extremes).
- **V2 Tab size**: KEEP current size (Director: size is fine — no compact restyle).
- **V3 Callout treatment**: full thin borders + large left-column outline icons; amber-toned disclaimer title.
- **V4 Disclaimer sentence**: append "Past performance does not guarantee future results." to the Important Disclaimer.

## 2. Prerequisites & Dependencies

- **Prior Completed Phases**: RP0 (App Shell & Design Tokens) and RP1 (Cover & TOC) completed — RP1 visual-conformance rework must be gate-passed first.
- **Visual Authority (binding, R2)**: `ssdesign/target_theme/ref_02_assumptions_sliders.png` + `ref_02_assumptions_table.png` — content/structure ONLY, with the TOP-TAB shell per R1 (the sidebar in refs is not built). Ref numbers are mockups; all values/logic come from engine + assumptions.json + standing rulings.
- **Core Engine Modules**: `src/ui/assumptionsTab.js`, `src/data/assumptions.json`, `src/engine/forecast.js`.

---

## 3. Sub-Phase Artifact Contracts

### Task RP2.1: Segmented Controls, Category Filtering & Custom Sliders

#### A. Deliverable Files
- `src/ui/assumptionsTab.js` — Enhanced with category filter state, dual-mode renderer, and accessible slider bindings.
- `index.html` — Updated Tab 02 pane container supporting category pills and mode toggle.
- `tests/redesign.tab2.test.js` — DOM tests asserting slider range constraints, category filtering, and event dispatching.

#### B. Exported Interfaces & Types
- `function renderAssumptions({ container, assumptions, onChange, mode }): AssumptionsView`
- Slider Card Structure:
  - Metric label + tooltip icon (`<button class="tooltip-btn" aria-label="Description">ⓘ</button>`)
  - Description text
  - Unit badge (`%`, `$`, `Days`, `count`)
  - Custom range slider `<input type="range" class="driver-slider" min="..." max="..." step="..." value="...">`
  - Value input pill `<input type="text" class="driver-val-pill">`

#### C. Invariants & Automated Quality Gates
- [ ] Every slider clamps input strictly within the schema min/max limits defined in `src/data/assumptions.json`.
- [ ] Adjusting any slider fires `onChange(driverName, newValue)` synchronously with recalculation < 16ms.
- [ ] Category pill clicks immediately filter visible driver groups without page reload.
- [ ] Zero inline styles; all slider tracks and thumbs styled via CSS variables.

---

### Task RP2.2: Multi-Year Forecast Table View & Input Color-Coding

#### A. Deliverable Files
- `src/ui/assumptionsTab.js` — Tabular driver matrix implementation covering FY2021–FY2030E with pinned label column.
- `src/ui/format.js` — Formatter integration applying `.cell-input` (blue text) to editable cells and `.cell-calc` to linked lines.

#### B. Exported Interfaces & Types
- Table View Sections:
  - Operating Metrics & KPIs (MAUs, Paid Subs, Conversion Rate, ARPPU, Ad Rev per MAU).
  - Revenue Build (Subscriptions, Advertising, Other, Total, YoY Growth %, Revenue Mix %).
  - Cost & Margin Assumptions (Cost of Revenue %, R&D %, S&M %, G&A %, Operating Margin %, Net Margin %).
  - Balance Sheet & Working Capital Drivers (AR Days, Deferred Rev Days, AP Days, Capex %, D&A %, SBC %, Tax Rate %).

#### C. Invariants & Automated Quality Gates
- [ ] Table cells use `tabular-nums` for precise vertical alignment.
- [ ] Editable projection years (FY2026E–FY2030E) clearly styled in blue text.
- [ ] Historical years (FY2021–FY2025) remain read-only and cited.
- [ ] Mode toggle between Sliders and Table maintains parameter synchronization.

---

## 4. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] Category filtering (`Operating`, `Margins`, etc.) operates seamlessly in both Sliders and Table view.
- [ ] Interactive sliders update model calculations and reflect live state instantly.
- [ ] Both presentation modes pass automated tests in `tests/redesign.tab2.test.js`.
- [ ] Capture-vs-ref comparison recorded (paths) against `ref_02` images with zero console errors; layout matches ref structure at desktop/tablet.
- [ ] Carried-over fixups V1, V3, V4 verified on capture (full-bleed strip, callout treatment, disclaimer sentence; tab size unchanged per Director).
