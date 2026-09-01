# Phase 4 Verification Log — Worker (`DS`)

> **Rule**: Append-only. Worker (`DS`) records sub-phase verification entries here.
> Never overwrite or prune historical entries.

---

[2026-09-02 00:15] [DS] — SUB-PHASE VERIFIED: P4.1 [WACC Build — CAPM Cost of Equity, Capital Weights, MKT/EST Marking Regime]

- Summary of Deliverables & Verification:
  - Developed `src/engine/wacc.js` pure module implementing frozen signature `build(input): WaccBuild`:
    - CAPM cost of equity `Re = rf + beta × ERP`, every leg a MKT-labeled market driver.
    - Market-value capital weights: `E = share price × diluted shares outstanding`; `D` resolved from the debt schedule; `equityWeight = E/V`, `debtWeight = D/V`.
    - **Debt-free collapse as a theorem, not a deleted branch**: `D = 0` reduces `WACC = (E/V)·Re + (D/V)·Rd·(1−t)` to `WACC = Re` arithmetically. No `if (debtFree) return costOfEquity` shortcut exists anywhere in the module.
    - `costOfDebt.value` is **`null`**, not `0`, when debt-free — `0` would assert a 0% borrowing rate that no filing supports.
  - Six new `market`-group drivers in `assumptions.json` (32 → 38), all genuinely sourced live, none invented:

    | Driver | Value | Mark | As-Of | Provider |
    |---|---|---|---|---|
    | `risk_free_rate` | 0.0473 | MKT | 2026-08-28 | FRED DGS10 (H.15) |
    | `beta` | 0.89 | MKT | 2026-09-01 | stockanalysis.com (5Y monthly) |
    | `equity_risk_premium` | 0.0442 | MKT | 2026-07-01 | A. Damodaran, NYU Stern |
    | `terminal_growth_rate` | 0.025 | EST | — (judgment) | — |
    | `market_share_price` | 148.36 | MKT | 2026-08-31 | stockanalysis.com |
    | `shares_outstanding` | 50,031,000 | MKT | 2026-08-06 | SEC Form 10-Q (acc. 0001628280-26-053603) |

    - Every "last completed / last published" choice over an intraday or unreleased print is documented in the driver `notes`: the 2026-09-01 session was intraday (~$156.64 at 14:17 EDT) so the 2026-08-31 official close is used; FRED's next DGS10 release (2026-09-01) was not yet posted so 2026-08-28 is the latest *published* observation.
    - `market_share_price` and `shares_outstanding` carry **bear/bull deltas of 0** by design: the market price is the benchmark the DCF is measured against, so it must not move with the operating scenario (else the upside percentage compares two scenario-shifted numbers).
    - `shares_outstanding` is **diluted**, not basic: 50,031 thousand from Note 11 EPS denominator. Cross-checked against the cover-page count 40,387,012 Class A + 6,399,257 Class B = 46,786,269; the ~3.24M gap is treasury-stock-method dilution.
  - Additive-only schema extension in `src/data/schema.js`: `marking` (enum `MKT|EST`), `asOf` (ISO date, `requiredWhen` group is `market` and marking is `MKT`), `source` (`{ provider, url? }`, same condition). `MARKET_SOURCE_FIELDS` requires a non-empty `provider`.
  - Additive-only `constants.js` entries: `MARKING_VALUES`, `WACC_BUILD_DEFAULTS`, `TERMINAL_GROWTH_BOUNDS` (min 0, max 0.04, step 0.0025), `RECOMMENDATION_THRESHOLDS` (±0.15).
  - Added `MARKET_KNOWN_FIGURES` (read from `assumptions.json` at module load) and `WACC_FIXTURE` (closed-form recomputation through the **general** weighted formula with an explicit zero debt balance) to `tests/fixtures/duolingo_facts.js` — no hand-typed derived value.
  - Added `tests/wacc.build.test.js` (20 tests).
- Resulting build (`Base`, debt-free):

    | Leg | Value | Mark | As-Of |
    |---|---|---|---|
    | `riskFreeRate` | 0.0473 | MKT | 2026-08-28 |
    | `beta` | 0.89 | MKT | 2026-09-01 |
    | `equityRiskPremium` | 0.0442 | MKT | 2026-07-01 |
    | `costOfEquity` | 0.086638 | EST | — |
    | `costOfDebt` | `null` | EST | — |
    | `taxRate` | 0.134225 | EST | — |
    | `marketCap` | 7,422,599,160 | MKT | (per-leg map) |
    | `equityWeight` | 1 | EST | — |
    | `debtWeight` | 0 | EST | — |
    | **`wacc`** | **0.086638** | EST | — |
- Anti-Tautology Pins & Tripwires:
  - **Synthetic levered probe**: a `debtSchedule` of `{ hasDebt: true, totalDebt: 1e9 }` plus a `cost_of_debt` driver proves leverage actually moves WACC (`wacc < costOfEquity` with cheap debt). A hardcoded `return costOfEquity` passes every debt-free identity but fails here.
  - **Two-stage fail-closed gate, both stages pinned**: `assertMarketDriverDiscipline` (ConfigError, `assumptions.market`) fires on a *removed* MKT driver; `requireDriverValue` (`EngineError('missing_driver')`) fires on a *non-finite* value that passes discipline on its label alone, and on a removed non-market driver. Pinning only the removal case would leave `requireDriverValue` deletable for the five market drivers while the suite stayed green.
  - **Mutation-verified**: softening `requireDriverValue`'s `Number.isFinite` check to a presence-only check was confirmed to fail exactly one test — `the discipline gate does not shadow the fail-closed value gate for MKT drivers` — with the intended message `risk_free_rate = null must raise missing_driver/risk_free_rate`. Engine restored byte-identical and re-verified green.
  - **Borrowing-pattern tripwire**: the corpus must contain zero funded-debt metrics; the scan asserts a non-empty balance sheet so a vacuous pass is impossible.
  - **Float tolerance scaled to magnitude**: `pinned()` now combines `1e-12` absolute with `1e-12` relative. `148.36 × 50,031,000` is exactly 7,422,599,160 in decimal but lands on ...160.000001 as a double (148.36 is not exactly representable), so a flat `1e-12` absolute tolerance is unreachable at magnitude 7.4e9. The rate pins keep their tight absolute tolerance; marketCap gains ~7.4e-3 of slack, which still catches one extra share (Δ148.36) or one cent of price (Δ500,310).
- Automated Quality Gates:
  - Test Suite: **379/379 PASS** (359 P3.3 baseline + 20 P4.1), 0 failures, 0 flakes across 3 consecutive `npm test` runs.
  - Zero new corpus rows added (706 records unchanged, 0 estimates in data layer) — independently confirmed: `git status --short src/data/historical/` is empty, so the corpus is byte-identical to `v1.0-P3`.
  - Purity & determinism: byte-identical repeat outputs, deep-frozen output graph, zero bare numeric literals > 999 outside comments in `src/engine/wacc.js`, no DOM/fetch/`Date.now`/`Math.random`; as-of dates come from drivers, never wall-clock.

---

[2026-09-02 02:05] [DS] — SUB-PHASE VERIFIED: P4.2 [DCF Valuation — Discount Factors, Explicit-Period PV, Gordon Terminal Value, EV → Net Cash → Equity → Per-Share Bridge]

- Summary of Deliverables & Verification:
  - Developed `src/engine/dcf.js` pure module implementing frozen signature `valuate(threeStatement, wacc, dcfInput): DcfResult`:
    - Discount factors `df_t = 1 / (1 + WACC)^t` for `t = 1..horizon` with `Number.isFinite` and `wacc > -1` guards.
    - Explicit-period PV `pvExplicit = Σ fcf_t × df_t` recomputed directly from `ThreeStatementOutput.cashFlow.byPeriod[].free_cash_flow.value`.
    - **Hybrid FY2026 FCF honesty**: consumes hybrid FY2026 FCF (H1 cited 239,031 OCF − 8,469 ICF + H2 engine estimate = 368,996.47) without re-estimation.
    - **Gordon terminal value**: `terminalFcf = fcf_T × (1 + g)`, `terminalValue = terminalFcf / (WACC − g)`, `pvTerminal = terminalValue × df_T`.
    - **Hard Gordon guard**: `WACC > g` enforced fail-closed via typed `EngineError('terminal_growth_exceeds_wacc')` (never silent, never clamped).
    - Enterprise value: `EV = pvExplicit + pvTerminal`.
    - **Net cash bridge on raw components**: `netCash = endingCash(T) + shortTermInvestments(T) + longTermInvestments(T) − debt(T)` from final forecast balance sheet (`threeStatement.balanceSheet.byPeriod[FY2030]` — ending cash 2,752,098.06 + held-constant STI 132,979 + LTI 102,693 = 2,987,770.06).
    - Equity value: `equityValue = enterpriseValue + netCash` (formula `EV + netCash = EV − debt + cashAndInvestments` exercised with `debt = 0`).
    - Per-share value: `perShare = (equityValue × scale) / sharesOutstanding` where `sharesOutstanding` is the MKT driver (`50,031,000`) and scale is `UNITS.thousands_usd.scale` (1000).
    - Deeply frozen immutable output graph, zero bare numeric literals > 999 outside comments in `src/engine/dcf.js`.
  - Appended `deriveDiscountFactor`, `deriveExpectedDcf`, `DISCOUNT_FACTOR_FY2026`, `DISCOUNT_FACTOR_FY2030`, and `DCF_KNOWN_FIGURES` to `tests/fixtures/duolingo_facts.js` (derived at module load per `GROWTH_FIXTURE` pattern).
  - Added `tests/dcf.valuate.test.js` (20 tests).
- Resulting Base DCF schedule & bridge (re-derive independently):

    | Metric | Value | Units | Notes |
    |---|---|---|---|
    | `WACC` | 0.086638 | rate | From `wacc.build` (Base CAPM) |
    | `terminalGrowthRate` | 0.025 | rate | `terminal_growth_rate` EST driver |
    | `df_FY2026` (t=1) | 0.920269675826 | factor | `1 / (1 + WACC)^1` |
    | `df_FY2030` (t=5) | 0.660048058983 | factor | `1 / (1 + WACC)^5` |
    | `pvExplicit` | 1,956,849.680114 | $k | Σ (fcf_t × df_t) FY2026–FY2030 |
    | `terminalFcf` | 703,279.082675 | $k | FY2030 FCF (686,125.93) × (1 + 0.025) |
    | `terminalValue` | 11,409,829.693933 | $k | `terminalFcf / (WACC − g)` |
    | `pvTerminal` | 7,531,035.942804 | $k | `terminalValue × df_FY2030` |
    | `enterpriseValue` | 9,487,885.622918 | $k | `pvExplicit + pvTerminal` |
    | `endingCash` (FY2030) | 2,752,098.060057 | $k | From final forecast Balance Sheet |
    | `shortTermInvestments` | 132,979 | $k | Held-constant cited Q2 FY2026 balance |
    | `longTermInvestments` | 102,693 | $k | Held-constant cited Q2 FY2026 balance |
    | `netCash` | 2,987,770.060057 | $k | `cash + STI + LTI − debt` |
    | `equityValue` | 12,475,655.682975 | $k | `enterpriseValue + netCash` |
    | `sharesOutstanding` | 50,031,000 | count | MKT driver (Q2 FY2026 10-Q Note 11) |
    | **`perShare`** | **249.358511** | USD/share | `(equityValue × 1000) / shares` (~$249.36) |
    | `marketSharePrice` | 148.36 | USD/share | MKT snapshot close (2026-08-31) |

- Anti-Tautology Pins & Tripwires:
  - **Missing-components tripwire**: omitting STI or LTI shifts `netCash` by 235,672 ($k) and moves `perShare` by ~$4.71/share; test proves omitting either fails the pin.
  - **Synthetic levered probe**: a capital structure with $1B debt proves `netCash = cash + STI + LTI − debt` and `equityValue = EV + netCash` evaluate the general subtraction formula rather than assuming zero debt.
  - **Gordon guard test**: asserts `g >= WACC` throws `EngineError('terminal_growth_exceeds_wacc')`.
  - **Horizon flexibility**: validates default 5-year and custom 3-year horizons, with out-of-range horizons (2, 11, 4.5, strings) throwing `invalid_horizon`.
- Automated Quality Gates:
  - Test Suite: **399/399 PASS** (379 baseline + 20 P4.2), 0 failures, 0 flakes across 3 consecutive `npm test` runs.
  - Zero new corpus rows added (706 records unchanged) — confirmed `git status --short src/data/historical/` is empty.
  - Purity & determinism: byte-identical repeat outputs, deep-frozen output graph, zero bare numeric literals > 999 outside comments in `src/engine/dcf.js`, zero DOM/fetch/`Date.now`/`Math.random`.

---

[2026-09-02 03:30] [DS] — SUB-PHASE VERIFIED: P4.3 [Sensitivity Grids, Bear/Base/Bull Per-Share Ranges & Mechanical Recommendation]

- Summary of Deliverables & Verification:
  - Developed `src/engine/recommend.js` pure module implementing frozen signature:
    - `evaluate(dcfPerShare: number, marketPrice: number): Recommendation`:
      - `upsidePct = (dcfPerShare − marketPrice) / marketPrice`.
      - Strict mechanical mapping from `RECOMMENDATION_THRESHOLDS` (`undervalued ≥ +15%`, `overvalued ≤ −15%`, `fair` otherwise).
      - Strict 3-word vocabulary: `undervalued | fair | overvalued` (zero editorializing).
      - Zero hardcoded threshold literals (imported from `src/data/constants.js`).
    - `buildSensitivityGrid(input: SensitivityInput): SensitivityGrid`:
      - Builds 9 WACC values (WACC ± 200bps in 50bps steps) × 5 terminal growth rates (1.0%–3.0% in 50bps steps) = 45 cells.
      - Every cell enforces `WACC > g` guard (throws `EngineError('terminal_growth_exceeds_wacc')` if violated).
      - Monotonicity verified: $\frac{\partial \text{perShare}}{\partial \text{WACC}} < 0$ and $\frac{\partial \text{perShare}}{\partial g} > 0$.
      - 4 corner cells pinned with global minimum at (max WACC, min g) and global maximum at (min WACC, max g).
    - `runFullValuation(historical, assumptions, scenario): FullValuationOutput`:
      - Full-path pipeline: `scenarios.apply` → `schedules.build` → `forecast.project` → `threeStatement.project` → `wacc.build` → `dcf.valuate` → `recommend.evaluate`.
      - Strict scenario valuation ordering verified: $\text{Bear} (\$132.16) < \text{Base} (\$249.36) < \text{Bull} (\$532.17)$.
      - Hybrid H1 invariance verified across all scenarios: Revenue \$590,421k, Operating Income \$78,472k, Net Income \$76,618k, Operating Cash Flow \$239,031k.
      - Benchmark market share price invariant: \$148.36 across all scenarios.
  - Updated `src/engine/scenarios.js` (post-PASS edit disclosed): passed through `marking`, `asOf`, and `source` on `appliedDriver` so scenario-shifted drivers preserve MKT metadata across `wacc.build`.
  - Appended `deriveExpectedRecommendation` and `RECOMMENDATION_KNOWN_FIGURES` to `tests/fixtures/duolingo_facts.js`.
  - Added `tests/recommend.test.js` (13 tests).
- Valuation & Scenario Results:

    | Scenario | WACC | g | FY2026 FCF ($k) | FY2030 FCF ($k) | EV ($k) | Net Cash ($k) | Equity ($k) | Per-Share (USD) | Upside (%) | Recommendation |
    |---|---|---|---|---|---|---|---|---|---|---|
    | **Bear** | 0.103468 | 0.020 | 246,738.48 | 415,213.83 | 4,319,326.71 | 2,292,776.90 | 6,612,103.60 | **$132.16** | -10.92% | `fair` |
    | **Base** | 0.086638 | 0.025 | 368,996.47 | 686,125.93 | 9,487,885.62 | 2,987,770.06 | 12,475,655.68 | **$249.36** | +68.08% | `undervalued` |
    | **Bull** | 0.071308 | 0.030 | 501,918.20 | 1,106,038.42 | 22,580,086.69 | 4,045,154.00 | 26,625,240.69 | **$532.17** | +258.71% | `undervalued` |

- Automated Quality Gates:
  - Test Suite: **412/412 PASS** (399 baseline + 13 P4.3), 0 failures, 0 flakes across 3 consecutive `npm test` runs.
  - Zero new corpus rows added (706 records unchanged) — confirmed `git status --short src/data/historical/` is empty.
  - Purity & determinism: byte-identical repeat outputs, deep-frozen output graph, zero bare numeric literals > 999 outside comments in `src/engine/recommend.js`, zero DOM/fetch/`Date.now`/`Math.random`.


