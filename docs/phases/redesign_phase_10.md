# Redesign Phase 10: Tab 03 — Ratio Analysis (Statement Line Items + Trend Explorer)

> **Milestone**: Redesign Phase 10 — Tab 03: Ratio Analysis  
> **Protocol**: 1.0  
> **Status**: ⚪ Pending  
> **Owner**: Drafted by Reviewer (`OP`), Implemented by Worker (`DS`)  
> **Objective**: Close the biggest gap in Tab 03 by adding computed financial ratios in two places: (1) relevant ratio line items inside the three historical statements, and (2) a Ratio Analysis part in the Trend Explorer with a Charts / Ratio Analysis tab switch. All 20 Director-approved ratios derive live from audited corpus rows, and every new surface reuses the standing project-wide UI system (§5) with zero new visual language.

---

## 1. Milestone Objective & Scope

1. **Ratio engine**: a pure `src/engine/ratios.js` module computing 20 ratios across FY2021–FY2025 (plus derivable quarterly columns) from cited income / balance / cashflow / KPI rows. No filed figures as literals; missing or zero denominators fail closed to null (shared dash).
2. **Statement line items**: computed ratio footer rows inside each workspace statement — margins under Income, liquidity / leverage / returns / efficiency under Balance, cash-flow ratios under Cash Flow — clickable into a ratio inspector drawer (definition, formula, 5-year trend).
3. **Trend Explorer upgrade**: a `[Charts | Ratio Analysis]` tab switch. Charts keeps the 6 level pills plus a new ratio pill row trending in the bar chart; Ratio Analysis shows the grouped FY2021–FY2025 table with change column and distortion footnotes.
4. **Distortion policy (Director decision)**: tax-distorted prints render as-is with footnotes (FY2025 −127% effective rate from the DTA valuation release, Q3 FY2025 107% quarterly net margin from the same cause, FY23 871% FCF conversion off a tiny base). NM (dash) only where mathematically not meaningful: non-positive pretax for the tax rate, non-positive net income for conversion.

Out of scope: forecast-period ratios, peer-relative ratios, per-share ratios (no share-count series in corpus).

---

## 2. Prerequisites & Dependencies

- **Prior Completed Phases**: RP3 (Historicals terminal: workspace, drawer, Trend Explorer, Audit Center) plus RW1.1 canonical header treatment.
- **Visual Authority (binding, R2)**: `ssdesign/target_theme/ref_03_historicals.png` — structure/styling ONLY, TOP-TAB shell per R1. Ref numbers are mockups; every ratio figure engine-derived. Cold-start MUST view the ref before code; capture-vs-ref self-check before submitting.
- **Data Feeds**: `src/data/historical/income.json`, `balance.json`, `cashflow.json`, `kpis.json` via `extractRows`; discrete-quarter derivation via `deriveDiscreteQuarters` (ttm.js); `DAYS_IN_YEAR` from `src/data/constants.js`.
- **Chart Engines**: `src/ui/charts.js` — pure-SVG ONLY, zero chart libraries.

---

## 3. Sub-Phase Artifact Contracts

### Task RP10.1: Ratio Engine + Catalogue

#### A. Deliverable Files
- `src/engine/ratios.js` — NEW pure module (zero DOM/fetch/clock/RNG).
- `tests/ratios.test.js` — NEW suite: catalogue freeze, per-ratio recomputation vs corpus arithmetic, NM fail-closed matrix, purity/literal gates.

#### B. Exported Interfaces & Types
- `RATIO_DEFS` — frozen catalogue, 20 entries: `{ id, label, category, kind: 'percent'|'multiple'|'days', decimals, statement, definition, formula, basis }`.
- `RATIOS_BY_STATEMENT` — `{ income: [...5], balance: [...11], cashflow: [...4] }` (lists in §4).
- **OP ruling 2026-09-11 (RP10.1 verdict)**: §4 governs the catalogue; the earlier `[...6]/[...10]` bracket counts were a spec-side summary defect, corrected here. Frozen ratio ids for RP10.2/RP10.3 consumption — income: `gross_margin`, `operating_margin`, `net_margin`, `adjusted_ebitda_margin`, `effective_tax_rate`; balance: `roe`, `roa`, `current_ratio`, `quick_ratio`, `cash_ratio`, `liabilities_to_equity`, `liabilities_to_assets`, `equity_ratio`, `asset_turnover`, `dso`, `dpo`; cashflow: `ocf_margin`, `fcf_margin`, `fcf_conversion`, `capex_intensity`.
- `computeHistoricalRatios(historical)` — frozen `{ periods, annualPeriods, quarterlyPeriods, ratios: { id: { def, values } }, byPeriod }`.
- `formatRatioById(ratioId, value)` / `formatRatioValue(value, kind, decimals)` — dash on null/non-finite.
- `formatRatioChange(ratioId, earliest, latest)` — pp for percents, x for multiples, d for days.

#### C. Invariants & Automated Quality Gates
- [ ] Every ratio re-derives from raw corpus rows in-test (no fixture-truth loops).
- [ ] Average-balance returns (ROE, ROA, asset turnover) use mean of current + prior year-end; earliest year falls back to year-end stock, documented in `basis`.
- [ ] Missing short-term-investment rows (pre-FY2024 all-cash years) resolve as zero, documented; all other missing inputs resolve null.
- [ ] Engine purity + zero bare numerics >999 outside comments (raw + normalized scans).

### Task RP10.2: Statement Footer Line Items + Ratio Drawer

#### A. Deliverable Files
- `src/ui/historicalsTab.js` — `buildStatementRatioRows`, `buildRatioDrawerMarkup`, workspace/CSV/drawer wiring.
- `index.html` — CSS for `.row-ratio`, `.ratio-divider-row` (reusing freeze-pane selectors, §5).

#### B. Exported Interfaces & Types
- Footer rows: `data-metric="ratio:<id>"` + `data-ratio="<id>"`, `computed` badge via `estSuffix`, annual + quarterly cells (balance-dependent ratios annual-only, dash in quarterly columns).
- Balance footers grouped under category subheaders in frozen catalogue (§4) order — Returns, Liquidity, Leverage, Efficiency; Income and Cash Flow under single subheaders. (OP ruling 2026-09-11, RP10.2 verdict: prose enumeration order is non-normative; the catalogue projection governs.)
- RP10.3 condition carried: the Trend Explorer Ratio Analysis table gets a proper §5.1 title block; in-table divider bands stay under the ref_03 band pattern, not the title-block treatment.
- Ratio drawer: FY21 / FY25 / Change stat strip, definition + formula block, annual series mini-table, computed-provenance note (no fake EDGAR links; constituent rows carry the citations).
- CSV export appends `(computed)` ratio rows for the active statement/period set.

#### C. Invariants & Automated Quality Gates
- [ ] Ratio rows sort after all filed rows, never interleave; hidden Tabulator grids unchanged (filed rows only).
- [ ] Workspace row clicks on `ratio:*` keys open the ratio drawer; filed-row drawer behavior untouched (all 56 existing tab3 tests green).
- [ ] Zero `style=`, zero bare >999 literals, keyboard (Enter/Space) + ARIA row semantics preserved.

### Task RP10.3: Trend Explorer Charts / Ratio Analysis Tabs

#### A. Deliverable Files
- `src/ui/charts.js` — `RATIO_TREND_METRICS` (additive; `TREND_EXPLORER_METRICS` stays frozen at 6), ratio-aware `createTrendBarChart` (percent-pp scaling, fractional multiple steps, %/x/d axis suffixes).
- `src/ui/historicalsTab.js` — `buildTrendExplorerMarkup` tab switch, `buildRatioAnalysisMarkup` grouped table, `setTrendMetric` accepting ratio keys, donut mount discipline unchanged (revenue-only).

#### B. Exported Interfaces & Types
- Tab switch `[Charts | Ratio Analysis]` reusing the statement-switcher pill pattern; Charts tab keeps 6 level pills + ratio pill row; Ratio Analysis tab renders the §4 table with Change FY21–25 column and the standing footnote block.
- Ratio pill trending reuses blue-positive / red-negative bar convention with value labels (`72.2%`, `2.61x`, `57d`).

#### C. Invariants & Automated Quality Gates
- [ ] `TREND_EXPLORER_METRICS` exact-6 contract untouched (existing RP3.3 test green as-is).
- [ ] Ratio bar charts handle nulls (dash labels, zero-height bars) and negatives (red, below-axis labels).
- [ ] Year-select cross-talk preserved: bar clicks update `selectedTrendYear`; donut stays revenue-only and unmounts otherwise.
- [ ] Analysis-table ratio rows open the ratio inspector on click and on Enter/Space (behavioral test: drawer opens with the row's ratio content); band rows stay inert (no key, no tabindex, no handler). (OP amendment 2026-09-11, RP10.3 verdict: the footnote promises selection, so the wiring is contract, not ornament.)

---

## 4. Ratio Catalogue (Director-Approved: 20 of 21 — SBC % Revenue Cut)

Values below are engine-derived FY2021 → FY2025 actuals (illustrative pins for test fixtures, never literals in `src/`).

### Profitability (Income footers; quarterly-capable)
| Ratio | Formula | FY21 → FY25 |
|---|---|---|
| Gross margin | `gross_profit / revenue_total` | 72.4% → 72.2% |
| Operating margin | `operating_income / revenue_total` | −23.9% → 13.1% |
| Net margin | `net_income / revenue_total` | −24.0% → 39.9% (tax-inflated, footnoted) |
| Adjusted EBITDA margin | `adjusted_ebitda / revenue_total` | −0.4% → 29.5% |
| Effective tax rate | `income_tax / pretax_income` (NM unless pretax > 0) | NM → −127.0% (DTA release, footnoted) |

### Returns (Balance footers; annual-only, avg-balance basis)
| Ratio | Formula | FY21 → FY25 |
|---|---|---|
| ROE | `net_income / avg(equity)` | −11.7% → 38.1% |
| ROA | `net_income / avg(assets)` | −9.1% → 25.1% |

### Liquidity (Balance footers; annual-only)
| Ratio | Formula | FY21 → FY25 |
|---|---|---|
| Current ratio | `current_assets / current_liabilities` | 5.20x → 2.61x |
| Quick ratio | `(cash + st_investments + receivables) / current_liabilities` | 4.93x → 2.36x |
| Cash ratio | `(cash + st_investments) / current_liabilities` | 4.65x → 2.07x |

### Leverage (Balance footers; annual-only; no funded debt — numerator is operating liabilities)
| Ratio | Formula | FY21 → FY25 |
|---|---|---|
| Liabilities-to-Equity | `total_liabilities / equity` | 0.29x → 0.48x |
| Liabilities-to-Assets | `total_liabilities / total_assets` | 22.4% → 32.4% |
| Equity ratio | `equity / total_assets` | 77.6% → 67.6% |

### Efficiency (Balance footers; annual-only)
| Ratio | Formula | FY21 → FY25 |
|---|---|---|
| Asset turnover | `revenue / avg(assets)` | 0.38x → 0.63x |
| DSO | `receivables / revenue * 365` | 48d → 57d |
| DPO | `payables / cost_of_revenue * 365` | 41d → 10d |

### Cash Flow (Cash-flow footers; quarterly-capable except conversion)
| Ratio | Formula | FY21 → FY25 |
|---|---|---|
| OCF margin | `ocf / revenue_total` | 3.7% → 37.4% |
| FCF margin | `(ocf + ppe_capex + software_capex) / revenue` (outflows filed negative) | 1.2% → 34.7% |
| FCF conversion | `fcf / net_income` (NM unless NI > 0) | NM → 87% (FY23 871% off tiny base, footnoted) |
| Capex intensity | `-(ppe_capex + software_capex) / revenue` | 2.5% → 2.6% |

**Cut by Director**: SBC % of revenue (16.3% → 13.2%). May return as a cost-structure memo later; engine SHOULD support additive ratio ids without breaking the frozen 20.

---

## 5. UI Design Consistency Contract (Binding)

No new visual language. Every ratio surface MUST reuse the standing system below; any deviation is a FAIL even with tests green.

### 5.1 Section Headers (RW1.1 Canonical Treatment)
- Ratio section headers reuse the app-wide title-block rule: 3px `var(--color-accent-blue)` left border + 10px left padding; titles 15px/700/`--color-text-primary` with 2px bottom margin; subtitles 12px/`--color-text-muted`, zero margin.
- Implementation: add ratio header classes to the existing shared selector groups in `index.html` (same block as `.trend-title-block`, `.trend-main-title`, `.trend-subtitle`) — never a parallel header style.

### 5.2 Controls (Pills, Switchers, Tabs)
- Charts / Ratio Analysis tab switch reuses the statement-switcher pattern (`.statement-pill-btn` + `.active`, `role="tablist"`/`aria-selected`).
- Ratio pills reuse `.trend-pill-btn` inside `.pill-group` (a distinct `trend-pill-btn-ratio` hook is allowed ONLY for grouping/spacing, never for restyling active/hover states).
- Annual / Quarterly column hiding reuses `.hidden` on `.td-annual` / `.td-quarterly`; trend grid expansion reuses `.single-chart`.

### 5.3 Tables (Freeze Panes, Rows, Numbers)
- Ratio tables reuse `.statement-table`: sticky `thead th` (`top: 0`), sticky first column (`left: 0`), `.th-metric` / `.th-period` / `.td-metric` / `.td-period`, Helvetica + `tabular-nums` figures.
- Ratio rows are `.statement-row.row-ratio` with `tabindex="0"` + `role="row"`; divider rows are `.ratio-divider-row` and MUST match the freeze-pane `:first-child` selectors so pinning never breaks.
- Number formatting: filed-money rules untouched (`formatTabularNumber`); ratios render `72.2%` / `2.61x` / `57d`, null as the shared ` - ` dash. Marking via `format.estSuffix` ONLY (`computed` badge); no hand-rolled badges.

### 5.4 Drawer (Line-Item Inspector Pattern)
- Ratio drawer reuses `.line-item-drawer-overlay` / `.line-item-drawer` / `.drawer-header` / `.drawer-metric-title` / `.drawer-metric-tag` / `.drawer-close-btn` / `.drawer-stat-strip` / `.drawer-stat-box` / `.drawer-section` / `.drawer-section-title` / `.drawer-mini-table` / `.provenance-label` / `.provenance-val.font-mono`.
- Content mapping ONLY (no structural invention): CAGR strip becomes FY21 / FY25 / Change; composition block becomes Definition + Formula + Basis; provenance card becomes the computed-provenance note pointing at constituent cited rows.
- Behavior parity: overlay-click / `Escape` close, focus management, `aria-modal` dialog semantics.

### 5.5 Copy, Type, Charts, A11y (Standing Render Gates)
- Zero `style=` attributes; zero `<aside>`; top-tab shell only.
- Zero em dashes in RP10-introduced user-visible copy (use the shared ` - ` dash; footnotes included). The 9 pre-existing RP3 `' — '` KPI/CAGR placeholders are grandfathered and frozen (count pinned, placeholder-only) — prose order in this section is non-normative where it conflicts with the frozen RP3 suite. (OP ruling 2026-09-11, RP10.3 verdict.); Downside/Base/Upside vocabulary; agreement-only verdicts untouched.
- Charts stay pure-SVG (`charts.js`): ratio bars reuse the blue-positive / red-negative convention, ACT/EST axis discipline, `<title>` tooltips.
- Data lineage invariant: 100% of rendered ratio figures equal engine recomputation from corpus (data-content gates in `tests/ratios.test.js`); methodology/footnote text matches cited sources.

---

## 6. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] RP10.1, RP10.2, RP10.3 artifact contracts individually submitted and approved by `OP`.
- [ ] Full suite green (existing 56 tab3 tests untouched and passing + new `tests/ratios.test.js`), zero flakes.
- [ ] Capture-vs-ref recorded against `ref_03` (statements, explorer tabs, ratio drawer) at desktop + narrow widths, zero console errors.
- [ ] Standing gates hold: zero `style=`, zero bare numerics >999 in `src/` (raw + normalized scans), purity (no `Date.now` / `Math.random` / `fetch` in touched modules), zero user-visible em dashes.
- [ ] No commit/tag/push before explicit Director order (release authority unchanged).
