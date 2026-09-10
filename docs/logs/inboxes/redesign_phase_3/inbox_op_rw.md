# Reviewer Inbox (OP Inbox)

> **Channel**: Worker (`DS`) ➔ Reviewer (`OP`)
>
> **Rule**: DS appends sub-phase submissions and resubmissions here. Every message MUST end with `[END_OF_MESSAGE]`.

---

### [2026-09-08 21:15] SUBMISSION: RP3-RW [Rework Amendment RP3-RW1]

#### Summary of Changes & Rework Implementations:

1. **RW1.1: Canonical App-Wide Header Unification**:
   - Copied exact `.trend-title-block` treatment: `border-left: 3px solid var(--color-accent-blue); padding-left: 10px;`.
   - Title styling: 15px, font-weight 700, `var(--color-text-primary)`, margin-bottom 2px.
   - Subtitle styling: 12px, `var(--color-text-muted)`, margin 0.
   - Applied one shared CSS rule across all section and card headers on Tab 03 and gated RP0/RP1/RP2 tabs:
     `.trend-title-block, .operating-kpis-title-block, .statement-title-block, .audit-center-title-block, .cover-section-header, .cover-card-title, .scenario-picker-title, .driver-group-header, .statement-card-header`.
   - Excluded pane-level H2 headers, SEC hero banner, drawer internals, thead cells, and footer per contract.

   **RW1.1 Header Treatment Inventory**:
   | File | Selector | Before Treatment | After Treatment (Canonical) |
   | :--- | :--- | :--- | :--- |
   | `index.html` | `.trend-title-block` | `border-left: 3px solid var(--color-accent-blue); padding-left: 10px;` | `border-left: 3px solid var(--color-accent-blue); padding-left: 10px;` (Reference) |
   | `index.html` | `.operating-kpis-title-block` | No left accent border, unpinned title margins | `border-left: 3px solid var(--color-accent-blue); padding-left: 10px;` |
   | `index.html` | `.statement-title-block` | No left accent border, unpinned title margins | `border-left: 3px solid var(--color-accent-blue); padding-left: 10px;` |
   | `index.html` | `.audit-center-title-block` | No left accent border, unpinned title margins | `border-left: 3px solid var(--color-accent-blue); padding-left: 10px;` |
   | `index.html` | `.cover-section-header` | No left accent border, unpinned margins | `border-left: 3px solid var(--color-accent-blue); padding-left: 10px;` |
   | `index.html` | `.cover-card-title` | Plain text title, no accent border | `border-left: 3px solid var(--color-accent-blue); padding-left: 10px;` |
   | `index.html` | `.scenario-picker-title` | Plain section header, no accent border | `border-left: 3px solid var(--color-accent-blue); padding-left: 10px;` |
   | `index.html` | `.driver-group-header` | Plain card title, no accent border | `border-left: 3px solid var(--color-accent-blue); padding-left: 10px;` |
   | `index.html` | `.statement-card-header` | Plain card header, no accent border | `border-left: 3px solid var(--color-accent-blue); padding-left: 10px;` |

2. **RW1.2: Removal of Legacy Source Drawer**:
   - Completely removed legacy `<details class="source-drawer">` DOM markup, placeholder, and CSS rules from `src/ui/historicalsTab.js` and `index.html`.
   - Retargeted legacy tests (`tests/p6r.accuracy_fixes.test.js`, `tests/tabs.views.test.js`, `tests/ui.assumptions_historicals.test.js`) to assert directly on audited actuals in SEC Filing Audit Center cards (`.filing-card`).
   - Repository grep scan for `source-drawer` outside `docs/`: **0 occurrences verified**. Matches exist solely in audit logs and phase specifications under `docs/`.

3. **RW1.3: PDF Page Numbers**:
   - Dropped per contract (no action required).

4. **RW1.4: De-Buttoning Operating KPI Cards**:
   - Converted `.operating-kpi-card` to static non-focusable `<div>` elements in `src/ui/historicalsTab.js`.
   - Removed `role="button"`, `tabindex="0"`, `aria-label`, and `data-target-metric` attributes.
   - Removed KPI card click and keydown cross-link listeners and pointer cursor (`cursor: default` in `index.html`).
   - Verified that clicking KPI cards does not switch or mutate Trend Explorer state.

5. **RW1.5: Dynamic Revenue Mix Donut & Bar Expansion Lifecycle**:
   - Donut chart strictly renders reporting streams for `selectedYear` only (defaults to `FY2025` on initial render).
   - Trend Bar Chart clicking a year bar triggers `onYearSelect(period)`, updating donut title to `Revenue Composition (${year})`, updating center total, and highlighting the selected bar (`.trend-bar-rect.selected` with 2.5px stroke).
   - Verified Hamilton-Hare largest remainder method ensures decomposition segments sum strictly to 100.0% across all 5 historical years (FY2021–FY2025).
   - Switching to non-revenue trend pills (`gross_profit`, `operating_income`, `net_income`, `cash`, `daus`) cleanly unmounts `#revenue-donut-card` and expands the bar chart to full 980px row width (`.trend-charts-grid.single-chart`).
   - Switching back to Revenue remounts the donut chart with the previously selected year preserved.
   - Prevented vertical overflow clipping via `position: relative; z-index: 5;` on `.trend-explorer-header` and `overflow: hidden;` on `.chart-container-inner`.

6. **RW1.6: Donut Subtitle & Tooltip Units**:
   - Donut chart subtitle reads `Breakdown by reporting stream ($M)`.
   - Donut slices tooltip renders `$M` with 1 decimal place derived from thousands ÷ 1e3 (e.g. `Subscription: $828.4M (79.8%)`).

7. **RW1.7: Single-Open Accordion & Grid Reflow Fix**:
   - Filing cards enforce single-open exclusivity via native `toggle` event listener.
   - `#btn-jump-audit` opens card 1, closes all others, and executes smooth scroll.
   - Added `align-items: start;` to `.audit-cards-grid` CSS, completely eliminating the ghost-expansion reflow defect.

#### Full Touched Files List:
- `src/ui/charts.js`: Dynamic year filtering, title, subtitle, `$M` tooltip, selected bar highlight, responsive width expansion.
- `src/ui/historicalsTab.js`: KPI de-buttoning, source-drawer removal, accordion exclusivity, jump-button exclusivity, donut mount/unmount & year preservation lifecycle.
- `index.html`: Canonical header unification CSS, KPI card non-focusable styles, single-chart grid layout, selected bar stroke, `.audit-cards-grid` `align-items: start;`, chart container overflow fix.
- `tests/p6r.accuracy_fixes.test.js`: Retargeted from source-drawer to SEC Filing Audit Center cards.
- `tests/tabs.views.test.js`: Retargeted from source-drawer to SEC Filing Audit Center cards.
- `tests/ui.assumptions_historicals.test.js`: Retargeted from source-drawer to SEC Filing Audit Center cards.
- `tests/redesign.tab3.test.js`: Added dedicated test suite for RW1.1, RW1.4, RW1.5, RW1.6, RW1.7.
- `scratch/ds_rp3_rw_vision.mjs`: Chromium Playwright test verifying all rework items live.
- `docs/screenshots/redesign/rp3_rw_1440.png`: Desktop visual capture.
- `docs/screenshots/redesign/rp3_rw_390.png`: Mobile visual capture.
- `docs/logs/ds/redesign_phase_3.md`: Detailed audit log entry appended.
- `docs/inbox_op.md`: Submission payload written.
- `docs/DSmemory.md`: Working memory updated.
- `docs/status_op.json`: Signal state flipped to `review_pending`.

#### Verification Results:
- `tests/redesign.tab3.test.js`: **54/54 passing** (100% green)
- Full regression suite (`npm test`): **819/819 passing** across 239 suites (100% green, 0 flakes, 0 regressions)
- Real browser vision QA (`scratch/ds_rp3_rw_vision.mjs`): **PASS** (0 console errors)
- `source-drawer` grep scan outside `docs/`: **0 occurrences**

[END_OF_MESSAGE]
