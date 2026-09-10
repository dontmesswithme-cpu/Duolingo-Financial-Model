# Redesign Phase 3: Tab 03 — Historicals (Financial Data Terminal)

> **Milestone**: Redesign Phase 3 — Tab 03: Historicals (Financial Data Terminal)  
> **Protocol**: 1.0  
> **Status**: ⚪ Pending  
> **Owner**: Drafted by Reviewer (`OP`), Implemented by Worker (`DS`)  
> **Objective**: Re-architect Tab 03 from an Excel spreadsheet dump into an institutional Financial Data Terminal built on progressive disclosure—featuring an active Statement Workspace with freeze panes, Annual vs Quarterly view toggle, interactive Line-Item Inspector drawer, multi-metric Trend Explorer, cross-linking KPI cards, and an expandable SEC Audit Center.

---

## 1. Milestone Objective & Scope

Instead of stacking 300+ rows in three unmanageable tables, Tab 03 will progressively reveal audited data through an intuitive terminal interface:
1. **Hero & SEC Continuity Banner**: Top status bar highlighting SEC filing provenance (`6 SEC filings integrated | Quarterly continuity preserved | Latest filing: Q2 FY2026 10-Q`) with a quick-jump button to the Audit Center.
2. **Top Headline KPI Cards**: 4 executive metric cards displaying FY2025 Revenue, Net Income, Total Assets, and Cash & Cash Equivalents (e.g. `$873.4M`, `$414.1M`, `$1.99B`, `$1.35B` *[ILLUSTRATIVE MOCKUP VALUES — MUST DERIVE DIRECTLY FROM AUDITED JSON FILES]*).
3. **Statement Workspace (Segmented Switcher + Freeze Panes)**:
   - Only ONE primary financial statement active at a time (`[Income Statement]`, `[Balance Sheet]`, `[Cash Flow]`).
   - Sticky year header row and pinned left `Metric / Line Item` column (Freeze Panes behavior) for horizontal scanning across years.
4. **Annual vs. Quarterly View Mode**: Segmented toggle allowing analysts to inspect full 5-year annual trends (FY2021–FY2025) or high-frequency quarterly continuity (Q3 FY2025–Q2 FY2026), plus CSV Export.
5. **Line-Item Inspector (Drawer / Side-Panel)**: Clicking any line item row opens an audit drawer displaying:
   - Historical filed values & 5-year CAGR.
   - Segment composition breakdown (e.g. Subscriptions, Advertising, DET, In-App Purchases).
   - SEC filing citation metadata and a "Jump to source filing" anchor.
6. **Dynamic Trend Explorer**: Replaces static disjointed charts with a single dynamic charting component toggled by metric pills (`[Revenue]`, `[Gross Profit]`, `[Operating Income]`, `[Net Income]`, `[Cash]`, `[DAUs]`), paired with the FY2025 Revenue Composition donut chart.
7. **Interactive Operating KPI Strip**: Core metrics (DAU, MAU, Paid Subscribers, Conversion %, Rule of 40, ARPU) that cross-link into the Trend Explorer on click.
8. **Institutional Audit Center**: Expandable filing cards for the 6 cited SEC filings (FY2021–FY2025 10-K and Q2 FY2026 10-Q) showing filing dates, descriptions, lines sourced, and official SEC links.

---

## 2. Prerequisites & Dependencies

- **Prior Completed Phases**: RP0 (App Shell), RP1 (Cover), RP2 (Assumptions).
- **Visual Authority (binding, R2)**: `ssdesign/target_theme/ref_03_historicals.png` — content/structure ONLY, TOP-TAB shell per R1 (sidebar not built). Ref numbers are mockups; every figure from audited JSON + engine. DS cold-start MUST view the ref before code; capture-vs-ref self-check before submitting.
- **Historical Data Feeds**: `src/data/historical/income.json`, `balance.json`, `cashflow.json`, `kpis.json`, `src/data/ledger.js`.
- **Chart Engines**: `src/ui/charts.js` — pure-SVG ONLY (Chart.js canvas renderers are NOT permitted: zero runtime dependencies, no chart libraries per conventions/P5.6).

---

## 3. Sub-Phase Artifact Contracts

### Task RP3.1: Statement Workspace, Freeze Panes & View Toggles

#### A. Deliverable Files
- `src/ui/historicalsTab.js` — Core statement workspace with segmented switcher, annual/quarterly filtering, and pinned column layout.
- `index.html` — Historicals pane markup updated with terminal workspace container and side drawer skeleton.
- `src/ui/format.js` — Strict tabular-number formatting for positive, negative (parentheses), and zero balances.

#### B. Exported Interfaces & Types
- `function renderHistoricalsWorkspace({ container, dataset, activeStatement, periodMode }): WorkspaceView`
- Segmented Statement Control: `[Income Statement] [Balance Sheet] [Cash Flow]`
- View Mode Control: `[Annual] [Quarterly]` + `[Export CSV]` button.
- CSS Freeze Panes:
  - Sticky header: `position: sticky; top: 0; z-index: 10; background: var(--color-page-bg);`
  - Pinned column: `position: sticky; left: 0; z-index: 5; background: var(--color-card-bg);`

#### C. Invariants & Automated Quality Gates
- [ ] Switching statements occurs instantaneously (< 16ms) without table re-instantiation overhead.
- [ ] Pinned metric column remains visible and perfectly aligned during horizontal scroll.
- [ ] Annual mode renders exactly FY2021–FY2025 columns; Quarterly mode renders Q3 FY2025–Q2 FY2026.
- [ ] 100% of figures originate from audited JSON files; zero mock or un-cited values.

---

### Task RP3.2: Line-Item Inspector Drawer & SEC Audit Center

#### A. Deliverable Files
- `src/ui/historicalsTab.js` — Line-item click handlers, inspector drawer component, and expandable audit filing cards.
- `tests/redesign.tab3.test.js` — DOM tests asserting row selection, drawer population, CAGR derivation, and citation linkage.

#### B. Exported Interfaces & Types
- `.line-item-drawer`:
  - Header: Metric title, class tag, close button (`×`).
  - History stat strip: Earliest vs Latest value + computed CAGR.
  - Composition list: Sub-segments and percentage shares.
  - Provenance card: SEC Form, Filing Date, Statement, Link.
- `.audit-center`:
  - 6 expandable filing cards (`<details class="filing-card">`) covering all SEC source documents.

#### C. Invariants & Automated Quality Gates
- [ ] Clicking any table row opens the inspector drawer populated with the selected line item's data.
- [ ] Pressing `Escape` or clicking the overlay closes the inspector cleanly.
- [ ] Audit cards link directly to canonical SEC EDGAR URLs registered in `src/data/ledger.js`.
- [ ] All keyboard actions maintain focus management and ARIA attributes.

---

### Task RP3.3: Trend Explorer & Dynamic Charting Integration

#### A. Deliverable Files
- `src/ui/charts.js` — Dynamic Trend Explorer charting engine supporting single-click metric switching without canvas recreation leaks.
- `src/ui/historicalsTab.js` — Metric switcher pill integration and Revenue Composition donut chart binding.

#### B. Exported Interfaces & Types
- Metric Switcher: `[Revenue] [Gross Profit] [Operating Income] [Net Income] [Cash] [DAUs]`
- Chart Components:
  - `.trend-bar-chart`: Multi-year annual progression with value labels.
  - `.revenue-donut-chart`: FY2025 revenue mix by segment with interactive legend.

#### C. Invariants & Automated Quality Gates
- [ ] Toggling Trend Explorer metrics updates chart datasets in-place without memory leaks.
- [ ] Donut chart segments sum exactly to 100.0%.
- [ ] Clicking KPI cards (e.g. DAUs) automatically activates the corresponding chart in the Trend Explorer.

---

## 4. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] All sub-tasks (RP3.1, RP3.2, RP3.3) passing unit and DOM integration tests.
- [ ] Capture-vs-ref comparison recorded (paths) against `ref_03` with zero console errors at desktop/tablet.
- [ ] Statement workspace freeze panes verified on desktop and narrow viewport widths.
- [ ] Inspector drawer accurately displays audited history, CAGR, and filing provenance.
- [ ] Trend Explorer and Audit Center fully operational with zero console warnings.

---

## 5. Rework Amendment RP3-RW1 (Director inputs 2026-09-08, rulings 18:35 — gate archive stands)

> Lane: phase `RP3`, subphase `RP3-RW`. Single work order; DS submits once as `SUBMISSION: RP3-RW` and overwrites `docs/DSmemory.md` in the same turn (repeat of the RP3.1-F4 omission is itself a FAIL item). Standing gates hold: derived-not-transcribed expectations, normalized literal scans, corpus 706 records, zero console errors/warnings, capture-then-view. No new synthesis across methods or metrics (RP1.1 rule); every displayed figure traces to a corpus row or a stated corpus formula.

- **RW1.1 Header unification (APP-WIDE)**. Canonical treatment, copied exactly from `.trend-title-block` / `.operating-kpis-title-block` (`index.html` ~:3749/:3859): title block carries `border-left: 3px solid var(--color-accent-blue); padding-left: 10px;`, title is 15px/700 `var(--color-text-primary)` with 2px bottom margin, subtitle (where one exists) is 12px `var(--color-text-muted)` with zero margin. DS implements it as ONE shared CSS rule applied to all header blocks — not per-header copies. Scope: every card/section title block on Tab 03 (workspace `Financial Statements`, explorer, operating KPIs, audit center) AND every card/section title block on the gated RP0/RP1/RP2 tabs. Excluded, explicitly: the pane-level `03. Historicals` H2 header, the SEC hero banner, drawer overlay internals, table `thead` cells, and the footer. Frozen: all header TEXT strings, element order, `data-*` hooks, and TAB_KEYS stay byte-identical (treatment-only change; `git diff` on markup must show no text-node or hook edits). Proof bar: submission lists the full header inventory (file + selector + before/after); shell/tab1/tab2 suites green; literal-order pins green; OP DOM-sweeps every in-scope header for the shared treatment and re-captures.
- **RW1.2 Directory removal**. Delete the legacy `<details class="source-drawer">` Audit & Filing Citations Directory block from the `renderHistoricals` output and its dedicated CSS rules. Keep `citationRegistry`, `collectCitation`, and all data-layer code untouched. DS greps the repo for `source-drawer`; every remaining reference outside git history must be justified line-by-line in the submission, else removed (including tests — retarget them to the Audit Center cards). Forbidden: deleting or weakening any other test to make the suite pass.
- **RW1.3 PDF page numbers — DROPPED (Director 18:35)**. No work. Drawer filing links remain the provenance depth. Standing ban: any page number not traced to a sourced document is fabrication (instant FAIL).
- **RW1.4 KPI de-buttoning**. `.operating-kpi-card` renders as a static, non-focusable `div`: remove `role="button"`, remove `tabindex`, remove all click/keydown listeners and their binding code, remove pointer-cursor affordance, remove `data-target-metric` attributes and the cross-link dispatch they fed. Cards keep label, value, period pill, and text content byte-identical. SUPERSEDES the §3-RP3.3 cross-link invariant by Director order. Tests: delete the cross-link tests and add a de-buttoning test (cards expose zero handlers; simulated click changes nothing and moves no focus). Explorer `.trend-pill-btn` pills remain the sole metric switcher. Proof bar: OP live-clicks every KPI card and asserts zero state change with focus remaining on `body`.
- **RW1.5 Donut dynamics (decided)**. The donut shows the revenue-stream mix for the SELECTED YEAR only, default `FY2025` on first mount. Clicking any trend-bar selects that year: the donut recomputes that year's mix from corpus rows, the donut title year updates to the selected year, the center total updates to that year's derived total, and exactly one bar carries the selected highlight. All five FY21–FY25 decompositions are pinned at 100.0% in tests (FY21 sums 250,772; FY25 sums 1,037,589 — each year's children must sum its parent exactly). On any non-`revenue` pill the donut container unmounts (no hidden-but-mounted SVG, no empty gap) and the bar chart expands to the full row width with no horizontal overflow at 1280 and 390; reselecting Revenue re-mounts the donut at the currently selected year. Forbidden: any segment split not traced to corpus rows; any hardcoded year, total, or share; changing bar values, scales, or divisors. Tests: year-follow for all five years, hide/expand per non-revenue pill, restore-on-revenue with year preserved, reflow assertions at both widths.
- **RW1.6 Subtitle units**. Donut subtitle reads exactly `Breakdown by reporting stream ($M)`. Every hover/tooltip value renders `$M` with 1 decimal, computed as thousands ÷1e3 from the row value (derived, never relabeled). Test pins the subtitle string and at least two hover values against corpus arithmetic.
- **RW1.7 Accordion discipline**. The Audit Center is a single-open accordion: opening any `.filing-card` closes all others, implemented on the toggle event (no click-position hacks), with no scroll jumps on toggle. The `#btn-jump-audit` path opens card 1, closes the rest, and scrolls exactly once. Root-cause and eliminate the ghost-expansion defect: at no time may a second card paint in an open/expanded state with empty content (if grid overlap caused it, reflow the grid). Tests: open-2nd-closes-1st, jump-button exclusivity, and an assertion that every open card's body is non-empty (contains its accession string).

Acceptance (all required): full suite green with zero drops vs 815 and zero weakened tests (OP diffs test changes); OP real-browser re-verification of RW1.1 and RW1.4–RW1.7 item-by-item with 0 console errors; fresh 1440 + 390 captures recorded against ref_03; submission carries the RW1.1 header inventory, the RW1.2 `source-drawer` grep disposition, and the full touched-file disclosure list.
