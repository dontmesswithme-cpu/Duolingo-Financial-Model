# Reviewer Inbox (OP Inbox)

> **Channel**: Worker (`DS`) ➔ Reviewer (`OP`)
>
> **Rule**: DS appends sub-phase submissions and resubmissions here. Every message MUST end with `[END_OF_MESSAGE]`.

---

### [2026-09-01 17:00] RESUBMISSION: P3.1 [Driver-Based Forecast Core (Revenue Cascade + Cost Structure + Hybrid FY2026)]

**Remediation Summary (Addressing Reviewer OP's Audit Finding):**

1. **Hybrid FY2026 H2 Semantics (`src/engine/forecast.js`)**:
   - Corrected `hybridLine` signature and implementation: takes `h1Value` (cited actuals sum) and `h2Value` (driver model estimate for H2), with `value = h1Value + h2Value` by construction.
   - Driver model internally estimates H1 and H2: `h2Estimate = fullYearDriverEstimate − h1DriverEstimate`.
   - The full-year value now reflects the cited H1 actual surprise (H1 actual + H2 estimate):
     - **Subscription**: Modeled mid-year stock compounds from opening (12.2M); H1 driver estimate = 512,687.26; H2 estimate = 522,134.23; hybrid subscription value = 508,943 (H1 actual) + 522,134.23 (H2 estimate) = 1,031,077.23 (carrying the −3,744.26 surprise).
     - **Growth-driven segments** (ads, DET, IAP, other): `h1Driver = fullYearDriver / 2`, `h2 = fullYearDriver / 2`; hybrid value = `h1Actual + h2`.
     - **Cost structure**: `costs[key].h2 = totalRevenue.h2 * pctByCost[key]`, `costs[key].value = costH1Actual + costs[key].h2`.
     - Gross profit and operating income close on H1 actuals, H2 estimates, and full-year totals by construction.

2. **Independent Fixture Recomputation (`tests/fixtures/duolingo_facts.js`)**:
   - Updated `deriveExpectedForecast` to implement the contract hybrid join formula independently.

3. **Test Suite Invariant Updates (`tests/forecast.core.test.js`)**:
   - Updated H2 residual test to assert `total.value === total.h1.value + total.h2.value`.
   - Updated mutation test to verify that mutating a cited Q1/Q2 row changes the full-year `value` 1:1, while `h2.value` remains invariant to H1 actuals.
   - Updated cost margin test to assert driver percentage on `totalRevenue.h2` for hybrid FY2026 and on full-year revenue for subsequent periods.

**Automated Verification Results:**
- Test Suite: **335/335 PASS** (291 baseline + 44 P3.1), 0 failures, 0 flakes across 3 consecutive `npm test` runs.
- Segment-sum totality: `revenue_total = Σ segments` asserted per forecast year with pinned values for FY2026 and FY2030 against `deriveExpectedForecast`.
- Hybrid FY2026 H1 actuals tie to cited quarters: H1 revenue = 590,421 (recomputed from Q1+Q2 corpus rows); all IS lines carry per-half provenance citing both quarter rows; `h1 + h2 = value`.
- Cascade anti-retyping: in-memory mutation of subscriber base row, cited quarter rows, or drivers alters output by construction.
- Fail-closed drivers: every driver lookup via `requireDriverValue` throws typed `EngineError('missing_driver', name)`; horizon clamp throws `EngineError('invalid_horizon', 'horizon')`.
- Engine purity + determinism + zero bare numeric literals > 999 in `src/engine/forecast.js`.
- Engine-only phase: corpus record count is exactly 706 (0 new corpus rows added; zero estimate rows in data layer).

[END_OF_MESSAGE]

### [2026-09-01 18:30] SUBMISSION: P3.2 [Three-Statement Linkage — IS → BS → CF with Cash Sweep & Balance Invariant]

**Deliverables Summary:**

1. **`src/engine/threeStatement.js` (NEW)**:
   - Pure module implementing frozen signature: `project(schedules: ScheduleSet, assumptions: AssumptionSet, forecast: ForecastOutput): ThreeStatementOutput`.
   - **Income Statement Linkage**:
     - Upper lines from `forecast.byPeriod[period]`.
     - Below-the-line lines: other income net, interest income on average invested cash (exact closed-form linear solve), pretax income, tax at effective tax rate driver, and net income.
     - Hybrid FY2026: H1 actuals cited from Q1+Q2 corpus rows (other income = -1,196; interest income = 23,642; pretax = 100,918; tax = 24,300; net income = 76,618); H2 driver estimate; `value = H1 + H2` per line with per-half provenance.
   - **Cash Flow Statement Linkage**:
     - Operating Cash Flow = net income + D&A (PP&E depreciation + intangible amortization) + SBC − ΔNWC.
     - Investing Cash Flow = −PP&E capex − software additions.
     - Free Cash Flow = OCF + ICF.
     - Financing Cash Flow = option proceeds − net share settlement taxes − share repurchases.
     - Cash Sweep: Net change in cash = OCF + ICF + CFF; ending cash = beginning cash + net change in cash.
     - Hybrid FY2026: H1 actuals cited directly from 6M FY2026 YTD cash flow rows (OCF = 239,031; ICF = -8,469; FCF = 230,562; CFF = -86,064; Net change = 144,498); H2 driver estimate; `value = H1 + H2` with per-half provenance.
   - **Balance Sheet Linkage & Hard Balance Invariant Gate**:
     - Assets === Liabilities + Equity holds exactly for all forecast years (FY2026–FY2030) on raw constructed components with 0 balancing plug lines (throws typed `EngineError('balance_check_failed', year)` if broken).
     - Cash swept from CF ending cash; operating assets & liabilities from Working Capital schedule; net PP&E from PP&E schedule; net Intangibles from Intangibles schedule; non-driver stock lines held constant from Q2 FY2026 cited balance with documented notes; equity roll: common stock held constant, APIC + SBC + option proceeds − tax settlement − share repurchases, retained earnings + net income (0 dividends).
   - **Engine Purity & Zero Literals**:
     - 100% pure (0 DOM, 0 fetch, 0 Date.now, 0 Math.random).
     - 100% deterministic (byte-identical repeat runs).
     - Deep-frozen output graph.
     - ZERO bare numeric literals > 999 outside comments.

2. **Fixtures & Tests (`tests/fixtures/duolingo_facts.js`, `tests/threeStatement.link.test.js`)**:
   - Added `THREE_STATEMENT_KNOWN_FIGURES` and independent closed-form recomputation `deriveExpectedThreeStatement`.
   - Comprehensive test suite (12 tests) verifying frozen signatures, raw-component balance gates, cash sweep integrity, schedule tie-ins, hybrid provenance, mutation tests, purity, determinism, and corpus count invariant.

**Automated Verification Results:**
- Test Suite: **347/347 PASS** (291 baseline + 44 P3.1 + 12 P3.2), 0 failures, 0 flakes across 3 consecutive `npm test` runs.
- Balance gate: `assets === liabilities + equity` holds exactly across all forecast years on raw constructed components.
- Cash sweep integrity: ending cash per year matches beginning + net changes with pinned values against `deriveExpectedThreeStatement`.
- Hybrid FY2026 H1 actuals tie to cited 6M YTD / discrete quarter rows; all forward rows marked `isEstimate: true`.
- Corpus record count is unchanged at 706 (0 new corpus rows added).

[END_OF_MESSAGE]

### [2026-09-01 20:41] SUBMISSION: P3.3 [Scenario System + Full-Path Integration + Balance-Gate Matrix (Final Sub-Phase)]

**Deliverables Summary & File Disclosures:**

1. **`src/engine/scenarios.js` (NEW)**:
   - Pure module implementing frozen signatures per spec §3.2:
     - `scenarios.apply(base: AssumptionSet, scenario: 'bear'|'base'|'bull'): AssumptionSet`: immutable delta application with driver [min, max] range clamping and `clampedDrivers` logging; base set immutability preserved (deep-frozen in, deep-frozen out, zero in-place mutations); fail-closed typed `EngineError` on invalid scenario or missing input.
     - `scenarios.list(): ScenarioMeta[]`: returns frozen array of metadata objects for Bear, Base, and Bull cases.
     - `runFullProjection(historical, assumptions, scenario?): FullProjectionOutput`: runs full-path integration across `assumptions ➔ schedules.build ➔ forecast.project ➔ threeStatement.project` per scenario.
   - Purity & Quality: 100% pure, 100% deterministic (byte-identical repeat runs), zero bare numeric literals > 999 outside comments, zero hardcoded config strings outside `constants.js`.

2. **`tests/scenarios.test.js` (NEW)**:
   - Comprehensive test suite (12 tests) verifying:
     - **Balance-Gate Matrix (15/15 Checks)**: `assets === liabilities + equity` holds across all 3 scenarios (Bear, Base, Bull) × all 5 forecast years (FY2026–FY2030) on raw constructed components with zero balancing plug lines (`difference < 1e-6`, `ok: true`).
     - **Scenario Distinctness**: `Bear < Base < Bull` monotonic ordering proven across Revenue, Operating Income, Net Income, and FCF for FY2027–FY2030.
     - **Hybrid FY2026 Honesty under Scenarios**: H1 actuals remain exact cited figures across Bear, Base, and Bull (590,421 revenue; 76,618 net income; 239,031 OCF); scenario deltas apply strictly to forward estimates; `isEstimate: true` on all forward lines.
     - **Delta Correctness & Clamping**: Verified across all drivers and extreme delta bounds.
     - **Immutability Mutation Test**: Base assumption set verified unmutated after multiple scenario applications.
     - **Engine Purity & Zero Literals**: Verified offline, deterministic, and clean of bare numeric literals > 999.

3. **File Modifications Disclosure**:
   - `src/engine/scenarios.js`: NEW file.
   - `tests/scenarios.test.js`: NEW file.
   - Zero modifications to previously passed engine modules (`src/engine/forecast.js`, `src/engine/threeStatement.js`, `src/engine/schedules.js` untouched).
   - Zero new corpus rows added (706 records unchanged, 0 estimates in data layer).

**Automated Verification Results:**
- Test Suite: **359/359 PASS** (291 baseline + 44 P3.1 + 12 P3.2 + 12 P3.3), 0 failures, 0 flakes across 3 consecutive `npm test` runs.
- Balance-Gate Matrix: 15 of 15 matrix checks pass on raw components (`difference < 1e-6`, 0 plugs).
- All Phase 3 sub-phases (P3.1, P3.2, P3.3) are now complete and ready for consolidated Gate Review.

[END_OF_MESSAGE]