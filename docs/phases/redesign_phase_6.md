# Redesign Phase 6: Tab 06 — Valuation & Parameter Inspector

> **Milestone**: Redesign Phase 6 — Tab 06: Valuation & Parameter Inspector  
> **Protocol**: 1.0  
> **Status**: ⚪ Pending  
> **Owner**: Drafted by Reviewer (`OP`), Implemented by Worker (`DS`)  
> **Objective**: Redesign Tab 06 into an institutional multi-method valuation workstation featuring a 6-method synthesis strip, 2-Stage DCF primary breakdown, EV-to-Equity waterfall bridge chart, and the signature Bloomberg-style 7-Lever Parameter Inspector with live flip indicators and interactive safe-band stress testing.

---

## 1. Milestone Objective & Scope

Tab 06 synthesizes the intrinsic and relative valuation of Duolingo, Inc. This milestone delivers a terminal-grade workspace:
1. **Live Quote Banner**: Sub-header banner displaying official market closing price (e.g. `$157.85` *[ILLUSTRATIVE MOCKUP VALUE — MUST DERIVE FROM ENGINE/DATA LAYER]*) and intraday benchmark with external data link.
2. **Multi-Method Valuation Synthesis Strip**: 6 horizontal cards for each valuation methodology (illustrative targets shown; all values derive from live engine):
   - 2-Stage FCFF DCF (e.g. `$144.08`, `FAIR` *[ILLUSTRATIVE — DERIVED FROM ENGINE]*)
   - EV / Forward Revenue (e.g. `$141.59`, `FAIR`)
   - EV / Forward EBITDAR (e.g. `$116.20`, `OVERVALUED`)
   - P / FCF & FCF Yield (e.g. `$240.43`, `UNDERVALUED`)
   - Sum-of-the-Parts SOTP (e.g. `$141.59`, `FAIR`)
   - Per-User / Per-Subscriber (e.g. `$443.68`, `UNDERVALUED`)
3. **2-Stage FCFF Primary DCF Card**:
   - Implied share price headline, valuation range, and upside delta vs benchmark.
   - Core component breakdown: PV of explicit forecast, PV of terminal value, enterprise value, net cash bridge, equity value, and per-share price.
   - Runtime parameter sidebar (WACC, terminal growth rate, FCFE cross-path share price, diluted share count).
   - Collapsible methodology derivation overview.
4. **Valuation by Method Summary Table**: Cross-method comparison table showing model basis, implied per share, dispersion range (min-max), upside %, and mechanical verdict badge.
5. **Enterprise Value to Equity Value Bridge**:
   - Left: Visual waterfall bar chart illustrating EV bridging to equity value via cash and debt components.
   - Right: Clean bridge summary ledger card.
6. **Lease Convention Disclosure**: Standardized `.callout-info` clarifying ASC 842 lease expense and EV capitalization convention differences between DCF and multiples.
7. **Bloomberg-Style 7-Lever Parameter Inspector (Audit & Stress-Test Center)**:
   - **Default Collapsed Scan State**: High-density 7-row HUD (all values and sources derive dynamically from live assumptions records):
     1. Risk-Free Rate ($r_f$) — e.g. `4.79%` | FRED (DGS10) *[ILLUSTRATIVE — DERIVED AT RUNTIME]*
     2. Equity Beta ($\beta$) — e.g. `1.47` | Peer median
     3. Equity Risk Premium ($ERP$) — e.g. `4.25%` | Damodaran
     4. Terminal Growth ($g$) — e.g. `2.50%` | GDP bounded
     5. Tax Rate — e.g. `13.42%` | Normalized
     6. Share Count — e.g. `50.031M` | SEC Note 11
     7. Peer Set — `Spotify · Roblox · Netflix` | Locked
   - **Expanded 5-Section Audit Card**:
     - Runtime Value & Timestamped Source
     - Economic & Institutional Defense Rationale
     - Core Mathematical Formula
     - Reachability & Flip Map Coordinates
     - **Live Flip Indicator & Safe-Band Monitor (Killer Feature)**: Computes real-time parity value, overvalued flip threshold, current distance to flip (in basis points), and dynamic interpretation text updating reactively with any driver slider changes.

---

## 2. Prerequisites & Dependencies

- **Prior Completed Phases**: RP0 through RP5 completed.
- **Visual Authority (binding, R2)**: `ssdesign/target_theme/ref_06_valuation.png` — content/structure ONLY, TOP-TAB shell per R1 (sidebar not built). Ref shows live-truth pins + the ±15% agreement engine with Min–Max ranges: NO averaged/blended headlines anywhere (P8 agreement-only). DS cold-start MUST view the ref before code; capture-vs-ref self-check before submitting.
- **Engine Modules**: `src/engine/dcf.js`, `src/engine/wacc.js`, `src/engine/methods/*.js`, `src/engine/recommend.js`, `src/ui/valuationTab.js`.
- **Existing Test Suites**: `tests/p7_solution.defense.test.js` (verifying 7 levers and anchor linkages).

---

## 3. Sub-Phase Artifact Contracts

### Task RP6.1: Multi-Method Card Strip, Primary DCF Card & Waterfall Bridge

#### A. Deliverable Files
- `src/ui/valuationTab.js` — Card strip renderer, DCF component layout, and summary table formatting.
- `src/ui/charts.js` — EV-to-Equity waterfall bar chart rendering.
- `index.html` — Updated Tab 06 markup.

#### B. Exported Interfaces & Types
- `.valuation-strip`: Responsive 6-card container with standardized status pills (`.badge-fair`, `.badge-overvalued`, `.badge-undervalued`).
- `.dcf-primary-card`: 3-column layout (Headline + Component Table + Runtime HUD).
- `#chart-ev-bridge`: Waterfall chart component rendering EV additions and deductions.

#### C. Invariants & Automated Quality Gates
- [ ] Multi-method values tie out exactly to `src/engine/recommend.js` aggregated outputs.
- [ ] Waterfall chart coordinates align with the bridge summary card figures.
- [ ] Verdict badges apply unified color tokens (`#DCFCE7` green, `#FEF3C7` yellow, `#FEE2E2` red).

---

### Task RP6.2: Bloomberg-Style 7-Lever Parameter Inspector & Live Flip Engine

#### A. Deliverable Files
- `src/ui/valuationTab.js` — Collapsible `<details class="defense-row">` structure, 5-section card renderer, and live flip sensitivity math.
- `tests/redesign.tab6.test.js` — Unit tests verifying live flip calculation, basis point distance derivation, and row expand/collapse behavior.

#### B. Exported Interfaces & Types
- Levers 1 through 7 (`#defense-lever-1` through `#defense-lever-7`):
  - Collapsed row: Lever name, live value, source, expand chevron.
  - Expanded card:
    - `.audit-stat-grid`: Runtime value, source, last verified date.
    - `.audit-defense-prose`: Institutional defense text.
    - `.audit-formula`: monospace formula (KaTeX NOT permitted — zero runtime dependencies; monospace only).
    - `.audit-flip-monitor`: Real-time parity, flip threshold, and distance to flip (`+X bps`).

#### C. Invariants & Automated Quality Gates
- [ ] Preserves all 7 expandable lever IDs (`#defense-lever-1` to `#defense-lever-7`) and anchor linkages `[D1]`–`[D6]` verified by `tests/p7_solution.defense.test.js`.
- [ ] Distance-to-flip recomputes synchronously whenever assumptions change.
- [ ] Zero hardcoded flip thresholds; values derive from closed-form engine sensitivity calculations.

---

## 4. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] All 6 valuation methods render with accurate figures, ranges, and verdict badges.
- [ ] Capture-vs-ref comparison recorded (paths) against `ref_06` with zero console errors at desktop/tablet.
- [ ] 7-lever parameter inspector operates smoothly with collapsible rows and dynamic flip monitoring.
- [ ] Existing `tests/p7_solution.defense.test.js` and new `tests/redesign.tab6.test.js` pass 100%.
