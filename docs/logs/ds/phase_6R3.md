# DS Phase 6R3 Execution Log — Cost-of-Capital Hardening — Monthly ERP & Peer Beta

> **Milestone**: Phase 6R3 — Cost-of-Capital Hardening (Monthly ERP & Peer Beta)
> **Worker**: `DS`
> **Protocol**: 1.0
> **Baseline**: commit `444ab03`, tag `v1.0-P6R3-base` (P6R2-approved tree)

---

## 2026-09-04 13:15 [DS] — SUB-PHASE VERIFIED: P6R3.1 Monthly Implied ERP Driver (Damodaran Monthly + 3M Smoothing Rule)

### Deliverables
- `src/data/assumptions.json`:
  - Refreshed `equity_risk_premium` driver record to mechanical trailing 3-month average of Damodaran's published monthly implied ERP series for the United States (trailing 12-month with adjusted payout).
  - Trailing 3-month prints: 4.30% (2026-07-01), 4.28% (2026-08-01), and 4.14% (2026-09-01) from `ERPbymonth.xlsx` (rows 216, 217, 218) and Damodaran's home page.
  - Arithmetic: `(0.0430 + 0.0428 + 0.0414) / 3 = 0.0424` -> rounded to driver step (0.0005) = `0.0425` (4.2500%).
  - `asOf`: `"2026-09-01"` (latest month in average).
  - `source.provider`: `"Aswath Damodaran, NYU Stern"`.
  - `source.url`: `"https://pages.stern.nyu.edu/~adamodar/pc/implprem/ERPbymonth.xlsx"`.
  - `notes`: States trailing 3-month prints, exact arithmetic, verbatim smoothing rule, retirement of the annual January 5, 2026 country risk premium table (4.46%) per Finding C lineage, historical realized-ERP context (4.33% in 2024, 4.23% in 2025), series URL, and scenario deltas.
  - Schema, keys, group (`market`), bounds (`[0, 0.12]`), step (`0.0005`), units (`pct_decimal`), marking (`MKT`), and scenario deltas (`{ bear: 0.005, bull: -0.005 }`) strictly byte-identical.
  - Zero other driver records touched in `assumptions.json`.
- `tests/erp.monthly.test.js` (NEW, additive):
  - 9 automated unit/integration tests covering:
    1. ERP record existence, marking, asOf, value, step, bounds, scenario deltas, and citations.
    2. Mechanical 3-month smoothing rule arithmetic verification: unweighted average of [0.0430, 0.0428, 0.0414] = 0.0424 -> rounded to 0.0425.
    3. Comprehensive notes verification (prints, arithmetic, smoothing rule, Finding-C table retirement, historical context, series URL).
    4. UI round-trip and formatting: `percent(erp.value)` renders as `'4.25%'`, clamp boundaries hold.
    5. Quality gates: `assumptions.json` diff strictly limited to ERP record; `src/engine/` diff strictly EMPTY; 706 historical corpus records preserved.

### Verification Results
- **Dedicated Sub-Phase Test Suite (`tests/erp.monthly.test.js`)**: **9/9 PASS** (100% green, 0 fail).
- **Full Suite Totals (`npm test`)**: **593 PASS / 34 FAIL** across 185 suites.
  - Reconciliation of the 34 red tests (contract-designed intermediate prior to P6R3.2 pin migration):
    - All 34 failures are strictly due to downstream tests asserting stale pre-refresh valuation pins that read live `assumptions.json` drivers (WACC was 8.7594%, now 8.5725%; Re was 8.7594%, now 8.5725%; Base DCF was $189.31, now $196.22; Bear was $102.41, now $104.49; Bull was $405.68, now $427.67; ERP was 0.0446, now 0.0425).
    - Per Artifact Contract §3 Task P6R3.1 B.4 ("No pin moves yet: joint mini-ledger with P6R3.2 (both drivers migrate together, once)"), pin migration is explicitly deferred to Task P6R3.2.
    - Zero crashes, zero runtime exceptions, zero schema violations.
- **Standing Quality Gates**:
  - `git diff v1.0-P6R3-base -- src/engine/`: Strictly EMPTY.
  - `git diff v1.0-P6R3-base -- src/data/historical/`: Strictly EMPTY.
  - `git diff v1.0-P6R3-base -- src/data/assumptions.json`: Strictly limited to `equity_risk_premium` (`value`, `asOf`, `notes`, `url`).
  - Corpus record count: 706 historical records unchanged.
  - Zero bare numeric literals > 999 outside comments.
  - Zero inline `style=` attributes.

---

## 2026-09-04 13:50 [DS] — SUB-PHASE VERIFIED: P6R3.2 Bottom-Up Peer Beta + Mini-Ledger Migration & Re-Baseline

### Deliverables
1. **Peer Corpus (`src/data/historical/peers_beta.json`)**:
   - Bundled historical price series (60 monthly simple returns, 61 price observations: 2021-09 to 2026-08) for locked peer set:
     - Spotify Technology S.A. (`SPOT`, NYSE)
     - Roblox Corporation (`RBLX`, NYSE)
     - Netflix, Inc. (`NFLX`, NASDAQ)
   - Benchmark: S&P 500 Index (FRED series `SP500`).
   - Permanent exclusion: Coursera (`COUR`) and Udemy (`UDMY`) permanently barred per Director decision.
   - Filed capital structures cited from latest filed annual SEC reports (FY2025 Form 20-F / Form 10-K):
     - `SPOT`: Total debt €1,956M, Market cap $119,285M, $D/E = 1.64\%$, statutory tax $21.0\%$.
     - `RBLX`: Total debt $1,803M, Market cap $57,398M, $D/E = 3.14\%$, statutory tax $21.0\%$.
     - `NFLX`: Total debt $16,976M, Market cap $395,870M, $D/E = 4.29\%$, effective tax $13.7\%$.
2. **Beta Math & Unlevering**:
   - Runtime regressions via frozen `beta.regress()` against S&P 500 benchmark:
     - Spotify (`SPOT`): OLS slope $\beta_L = 1.5860$ $\implies$ Hamada unlevered $\beta_U = 1.5657$ (1.57).
     - Roblox (`RBLX`): OLS slope $\beta_L = 1.4742$ $\implies$ Hamada unlevered $\beta_U = 1.4385$ (1.44).
     - Netflix (`NFLX`): OLS slope $\beta_L = 1.5258$ $\implies$ Hamada unlevered $\beta_U = 1.4713$ (1.47).
   - Peer statistics:
     - Median unlevered beta: $1.4713$ $\implies$ rounded to step 0.01 = **1.47** (headline active model anchor).
     - Mean unlevered beta: $1.4918$ $\implies$ rounded to step 0.01 = **1.49** (context readout).
     - Span: $0.1272$ $\implies$ rounded to step 0.01 = **0.13** (dispersion readout: max SPOT 1.57 − min RBLX 1.44).
   - Debt-free collapse: Duolingo is debt-free ($D = 0 \implies \beta_{\text{DUOL}} = \beta_U = \mathbf{1.47}$ directly without relevering).
3. **Assumptions Driver Re-Anchor (`src/data/assumptions.json`)**:
   - `beta` record re-anchored to `value: 1.47`, `asOf: "2026-08-31"`.
   - Comprehensive notes detailing the locked peer set, individual regression & Hamada data, median/mean/span statistics, debt-free application, and Vasicek-shrunk own-stock cross-check (OLS slope 0.890488, $t \approx 1.72$, $R^2 = 4.83\%$).
   - Preserved byte-identical: `name`, `label`, `group`, `min` (0.2), `max` (2.5), `step` (0.01), `units` (`x_multiple`), `marking` (`MKT`), and `scenarioDeltas` (`{ bear: 0.15, bull: -0.15 }`).
4. **UI Presentation Enhancements**:
   - `src/ui/valuationTab.js`: Added `computePeerBetaStats()` and extended `renderBetaDerivation()` with:
     - Peer derivation table rendering Spotify, Roblox, Netflix OLS levered betas, filed D/E ratios, tax rates, Hamada unlevered betas, SEC citations.
     - Highlighted Peer Median (1.47), Peer Mean (1.49), Peer Span (0.13) readouts.
     - Direct debt-free note and Vasicek single-stock cross-check table.
     - CSS styling using semantic classes (`peer-beta-derivation-section`, `card-subheading`) in `index.html` (zero inline `style=`, zero bare numeric literals $> 999$).
   - `src/ui/sensitivityTab.js`: Updated systematic risk beta range readout text (Bear 1.62, Base 1.47, Bull 1.32; peer asset range 1.44 to 1.57).
5. **Mini-Ledger Migration (Transitive Recomputation)**:
   - Evaluated under $\{rf = 0.0479, \beta = 1.47, ERP = 0.0425, px = 157.85\}$:
     - Base WACC: $R_e = \text{WACC} = 0.0479 + 1.47 \times 0.0425 = \mathbf{0.110375}$ (11.0375%).
     - Bear WACC: $0.0529 + 1.62 \times 0.0475 = \mathbf{0.129850}$ (12.9850%).
     - Bull WACC: $0.0429 + 1.32 \times 0.0375 = \mathbf{0.092400}$ (9.2400%).
     - Discount factors: FY2026 $df_1 = \mathbf{0.900597}$, FY2030 $df_5 = \mathbf{0.592450}$.
     - Explicit FCFF PV: $\mathbf{\$1,586,880.58k}$.
     - Gordon Terminal Value: $\mathbf{\$7,097,871.98k}$, PV of TV: $\mathbf{\$4,205,133.49k}$.
     - Enterprise Value (EV): $\mathbf{\$5,792,014.07k}$, Net Cash: $\mathbf{\$1,416,559.00k}$, Equity Value: $\mathbf{\$7,208,573.07k}$.
     - Diluted Shares: 50,031,000; Benchmark Price: $157.85.
     - Implied Per-Share (Base): $\mathbf{\$144.08}$ (144.082130), Implied Upside: $\mathbf{-8.72\%}$, Recommendation: $\mathbf{fair}$.
     - Implied Per-Share (Bear): $\mathbf{\$84.39}$ (84.389050), Implied Upside: $\mathbf{-46.54\%}$, Recommendation: $\mathbf{overvalued}$.
     - Implied Per-Share (Bull): $\mathbf{\$277.84}$ (277.837024), Implied Upside: $\mathbf{+76.01\%}$, Recommendation: $\mathbf{undervalued}$.
     - Strict ordering holds: $\text{Bear } (\$84.39) < \text{Base } (\$144.08) < \text{Bull } (\$277.84)$.
     - Legacy DCF per-share: $\mathbf{\$193.82}$ (193.823467) $\implies \text{Headline FCFF } (\$144.08) < \text{Legacy } (\$193.82)$ holds.
     - Sensitivity Grid 9×5: Center $\$144.08$, bounds $[\$112.06, \$192.67]$, all 45 cells satisfy $\text{WACC} > g$.
   - Migrated all downstream test assertions 1:1 across `tests/`:
     - `tests/beta.peers.test.js` (NEW, 8/8 PASS)
     - `tests/beta.regress.test.js` (18/18 PASS)
     - `tests/wacc.build.test.js` (20/20 PASS)
     - `tests/dcf.valuate.test.js` (20/20 PASS)
     - `tests/dcf.dualpath.test.js` (11/11 PASS)
     - `tests/recommend.test.js` (14/14 PASS)
     - `tests/e2e.accuracy.test.js` (15/15 PASS)
     - `tests/p6r.accuracy_fixes.test.js` (23/23 PASS)
     - `tests/p6r2.centered_grid.test.js` (18/18 PASS)
     - `tests/p6r2_3.mkt_refresh.test.js` (14/14 PASS)
     - `tests/erp.monthly.test.js` (9/9 PASS)
     - `tests/market.fetch.test.js` (24/24 PASS)
     - `tests/app.controller.test.js` (12/12 PASS)
     - `tests/ui.charts.test.js` (10/10 PASS)
     - `tests/ui.valuation_summary_sensitivity.test.js` (8/8 PASS)
6. **Visual QA & Screenshots**:
   - `tools/visual_qa/capture_phase6R3.mjs`: Script executed against headless browser.
   - All 16 versioned screenshots captured in `docs/screenshots/phase_6R3/v1/` and copied to `docs/screenshots/phase_6R3/` (8 desktop 1280px + 8 mobile 390px). All $> 10$ KB, zero console errors.

### Verification Results
- **Dedicated Peer Beta Test Suite (`tests/beta.peers.test.js`)**: **8/8 PASS**.
- **Full Suite Verification (`npm test` × 3 consecutive sweeps)**:
  - Sweep 1: **636/636 PASS**, 0 fail across 190 suites.
  - Sweep 2: **636/636 PASS**, 0 fail across 190 suites.
  - Sweep 3: **636/636 PASS**, 0 fail across 190 suites.
  - **Zero failures, zero flakes across entire suite**.
- **Standing Quality Gates**:
  - `git diff v1.0-P6R3-base -- src/engine/`: Strictly EMPTY (byte-identical behavior freeze preserved).
  - Historical corpus invariant: 706 statement/kpi records unchanged.
  - Zero bare numeric literals > 999 outside comments in `src/ui/`.
  - Zero inline `style=` attributes in `src/ui/`.
  - Zero Coursera or Udemy mentions anywhere in peer calculations or readouts (mentions strictly limited to removal-disclosure and absence-gates).

---

## 2026-09-04 15:10 [DS] — RESUBMISSION & REMEDIATION VERIFIED: P6R3.2 Bottom-Up Peer Beta + Mini-Ledger Migration & Re-Baseline

### Remediation Deliverables (Resolving Findings [R1]–[R6])
1. **[R1 — MATERIAL] Roblox (`RBLX`) Lease Liabilities & Capital Structure Corrected to Filed Note 3**:
   - Filed Note 3 of Form 10-K explicitly reports PV of lease liabilities = **$794,906k** ($794.9M).
   - In `src/data/historical/peers_beta.json`:
     - `totalDebt`: $993.1M senior notes + $794.9M lease liabilities = **$1,788M** (updated from 1803).
     - `debtToEquity`: 1788 / 57398 = **0.031150884** (3.12%, updated from 0.031412).
     - Notes updated: `"Total Debt: USD $1,788M ($993.1M senior notes + $794.9M lease liabilities); Market Cap: USD $57,398M (708.36M shares @ $81.03 Dec 31 close); D/E = 0.0312; statutory federal tax rate 21.0%"`.
     - Resulting unlevered beta: $1.474154 / (1 + (1 - 0.21) \times 0.031150884) = \mathbf{1.438748}$ (was 1.4385, still rounds to **1.44**).
     - Peer stats: median = $1.4713 \implies \mathbf{1.47}$; mean = $\mathbf{1.4919}$ (rounds to **1.49**, was 1.4918); span = $\mathbf{0.1270}$ (rounds to **0.13**, was 0.1272).
   - In `src/data/assumptions.json` `beta` notes:
     - Updated text: `D/E = 3.12% ($1,788M total debt / $57,398M market cap), t = 21.0% -> unlevered β = 1.4387 (1.44); mean = 1.4919 (1.49), span = 0.1270 (0.13)`.
   - In `tests/beta.peers.test.js`:
     - Updated assertion expectation tolerance: `assert.ok(Math.abs(rblxU - 1.4387) < 1e-3)`.
2. **[R2] Spotify (`SPOT`) Share Count & Market Cap Corrected to Filed 20-F**:
   - Filed Form 20-F reports: 209,485,215 issued − 3,652,688 treasury = **205,832,527 shares** (205.83M shares).
   - In `src/data/historical/peers_beta.json`:
     - `marketCap`: 205,832,527 $\times$ $580.71 = **$119,529M** (updated from 119285).
     - `debtToEquity`: 1956 / 119529 = **0.01636423** (1.64%, updated from 0.016398).
     - Notes updated: `"Total Debt: EUR 1,956M (€1,458M exchangeable notes + €498M lease liabilities); Market Cap: USD $119,529M (205.83M shares @ $580.71 Dec 31 close); D/E = 0.0164; statutory tax rate 21.0%"`.
     - Resulting unlevered beta: $1.585990 / (1 + (1 - 0.21) \times 0.01636423) = \mathbf{1.565748}$ (still rounds to **1.57**).
   - In `src/data/assumptions.json` `beta` notes:
     - Updated text: `D/E = 1.64% (€1,956M total debt / $119,529M market cap), t = 21.0% -> unlevered β = 1.5657 (1.57)`.
3. **[R3] Sensitivity Grid Ledger Bounds Attribution Corrected**:
   - Corrected ledger bounds from engine-default [$112.06, $192.67] to the rendered scenario-relative grid corners (controller axis path, Base-state): **[$114.67, $205.18]** (Base-state, center $144.08; 45 cells; WACC > g 0 violations; monotonicity 0 violations).
4. **[R4] Sensitivity Text Dynamic Derivation Tripwire**:
   - In `tests/beta.peers.test.js`, test `'sensitivityTab states the beta range under evaluation'` now dynamically loads `assumptions.json`, extracts `betaDriver`, and derives expectations from live state: `baseBeta = betaDriver.value`, `bearBeta = Number((baseBeta + betaDriver.scenarioDeltas.bear).toFixed(2))`, `bullBeta = Number((baseBeta + betaDriver.scenarioDeltas.bull).toFixed(2))`. Any future desynchronization will fail the test suite.
5. **[R5] Wording Corrections & Hygiene**:
   - `assumptions.json` beta driver `units` verified and stated as `"multiple"` (file truth, not `"x_multiple"`).
   - Coursera/Udemy absence clarified: "zero in calculations; mentions limited to removal-disclosure + absence-gates".
   - Notes strings reflect updated mean (1.4919 $\to$ 1.49) and span (0.1270 $\to$ 0.13).
6. **[R6] Test-Count Delta Accounting**:
   - One-line accounting: The 635 vs 636 delta arises because static regex matching counts 635 explicit top-level `test()` declarations, while the Node test runner dynamically executes 636 tests (due to 1 parameterized subtest execution in the suite).

### Re-Verification Results
- **Full Suite Verification (`npm test` × 3 consecutive sweeps)**:
  - Sweep 1: **636/636 PASS**, 0 fail across 190 suites.
  - Sweep 2: **636/636 PASS**, 0 fail across 190 suites.
  - Sweep 3: **636/636 PASS**, 0 fail across 190 suites.
  - **Zero failures, zero flakes across entire suite**.
- **Zero Valuation Pin Delta**:
  - Base WACC: **11.0375%**, Bear WACC: **12.9850%**, Bull WACC: **9.2400%**.
  - Base DCF: **$144.08** (144.082130, `fair`, -8.72%).
  - Bear DCF: **$84.39** (84.389050, `overvalued`, -46.54%).
  - Bull DCF: **$277.84** (277.837024, `undervalued`, +76.01%).
  - Explicit PV: **$1,586,880.58k**, Terminal Value: **$7,097,871.98k**, PV of TV: **$4,205,133.49k**.
  - Enterprise Value: **$5,792,014.07k**, Net Cash: **$1,416,559.00k**, Equity Value: **$7,208,573.07k**.
  - Every pin remains byte-identical.
- **Standing Quality Gates**:
  - `git diff v1.0-P6R3-base -- src/engine/`: Strictly EMPTY.
  - Historical corpus invariant: 706 statement/kpi records unchanged.
  - Zero bare numeric literals > 999 outside comments in `src/ui/`.
  - Zero inline `style=` attributes in `src/ui/`.
  - All 16 visual QA screenshots regenerated in `docs/screenshots/phase_6R3/v1/` and mirrored in `docs/screenshots/phase_6R3/` (all > 10 KB, clean console).

---

## 2026-09-04 18:30 [DS] — PHASE GATE PASSED: Phase 6R3 Cost-of-Capital Hardening (PASS ✅)

### Milestone Sign-Off Summary
- **Authority**: Director directive received and processed by OP (`docs/inbox_ds.md` [2026-09-04 18:27]). Milestone Gate Pass officially granted.
- **Phase Deliverables Completed & Verified**:
  - **P6R3.1 (Monthly Implied ERP Driver)**:
    - Trailing 3-month unweighted average of Damodaran's monthly implied ERP series (4.30% July, 4.28% August, 4.14% September) rounded to 0.0005 step = **4.25%** (`0.0425`).
    - Stored in `src/data/assumptions.json` with verbatim smoothing rule, monthly XLSX source URL, historical context series (4.33% in 2024, 4.23% in 2025), and retired Finding-C lineage.
    - Verified by dedicated additive test suite `tests/erp.monthly.test.js` (9/9 PASS).
  - **P6R3.2 (Bottom-Up Peer Beta + Mini-Ledger Migration & Re-Baseline)**:
    - Historical peer beta corpus `src/data/historical/peers_beta.json`: 60 monthly returns (2021-09 to 2026-08), 61 price observations for locked peer set (Spotify `SPOT`, Roblox `RBLX`, Netflix `NFLX`) against S&P 500 (`SP500`). Coursera and Udemy permanently barred.
    - Filed capital structure forensics from primary SEC filings (FY2025 20-F / 10-K): SPOT debt €1,956M / mcap $119,529M / D/E 1.64% / statutory tax 21.0%; RBLX debt $1,788M ($993.1M notes + $794.9M leases per Note 3) / mcap $57,398M / D/E 3.12% / federal tax 21.0%; NFLX debt $16,976M / mcap $395,870M / D/E 4.29% / effective tax 13.7%.
    - Runtime regressions and Hamada unlevering: SPOT unlevered $\beta = 1.57$ (1.565748), RBLX unlevered $\beta = 1.44$ (1.438748), NFLX unlevered $\beta = 1.47$ (1.471329).
    - Peer summary statistics: Median unlevered beta = **1.47** (active model anchor), Mean = **1.49** (1.4919), Span = **0.13** (0.1270).
    - Debt-free Duolingo collapse: $\beta_{\text{DUOL}} = \beta_U = \mathbf{1.47}$ applied directly without Hamada relevering.
    - Valuation presentation: Added runtime-computed peer derivation table, median/mean/span summary badges, and Vasicek own-stock cross-check table ($t \approx 1.72$, $R^2 = 4.83\%$) on Valuation tab; updated systematic-risk beta range readout on Sensitivity tab.
    - Transitive mini-ledger migration across all 15 downstream test suites: Base WACC 11.0375%, Bear WACC 12.9850%, Bull WACC 9.2400%; Base DCF $144.08 (fair, -8.72%), Bear DCF $84.39 (overvalued, -46.54%), Bull DCF $277.84 (undervalued, +76.01%); explicit PV $1,586,881k; Gordon TV $7,097,872k; EV $5,792,014k; Equity $7,208,573k.
    - Verified by dedicated test suite `tests/beta.peers.test.js` (8/8 PASS) with dynamic live-driver derivation tripwire.
- **Suite Status at Milestone Close**:
  - `npm test` × 3 consecutive sweeps: **636/636 PASS, 0 fail, 0 flakes** across 190 suites.
- **Standing Invariants Preserved**:
  - `git diff v1.0-P6R3-base -- src/engine/`: Strictly EMPTY (behavioral freeze intact).
  - Historical corpus invariant: 706 statement and KPI records unchanged.
  - Zero bare numeric literals > 999 outside comments in `src/ui/`.
  - Zero inline `style=` attributes in `src/ui/`.
  - All 16 visual QA screenshots generated and verified in `docs/screenshots/phase_6R3/v1/` and mirrored in `docs/screenshots/phase_6R3/`.
- **Release Status & DS Action**:
  - Release block carries forward: NO archive script run, NO git tagging, NO publishing. Gate held for Director's explicit FINAL PASS of the entire product.
  - Guarded reset executed: `docs/status_op.json` state reset to `"idle"`.
  - DS is **HALTED** and standing by for the Director's plan / next instructions.
