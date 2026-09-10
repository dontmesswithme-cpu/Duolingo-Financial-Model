# Universal Quality Gate & Review Checklist

> **Purpose**: This document defines the strict, non-negotiable audit criteria used by the Reviewer (`OP`) to pass (`PASS ✅`) or fail (`FAIL ❌`) any submitted milestone. The Worker (`DS`) must self-audit against this checklist before submitting.

---

## 1. Zero-Tolerance Failure Conditions (Instant Rejection ❌)

1. **Failing Tests**: Any failing unit, integration, or regression test in the automated suite.
2. **Unhandled Exceptions / Crash States**: Uncaught promise rejections, unhandled exceptions, null pointer crashes, or console error spam.
3. **Memory / Resource Leaks**: Undisposed listeners, open socket/file handles, or unbounded cache growth after teardown.
4. **Blind Approvals**: Approving UI, visual, or audio features without multimodal screenshot inspection or automated sanity metrics.
5. **Fabricated Metrics**: Discrepancy between reported test counts/coverage and actual command execution results.
6. **Hardcoded Secrets / Magic Values**: API keys, credentials, or arbitrary magic numbers embedded directly in source logic.
7. **Undisclosed Hardcoded Fallbacks / Literals & Gate-Scope Mismatch (External-Truth Failure)**: A buried fallback literal (`?? 148.36`, `?? 0.025`, `ttmRev?.value ?? quarterlyValue ?? 0`) in `src/engine/*.js` that violates the phase contract's *“no hardcoded market values anywhere in `src/engine/`”* / *“zero bare numerics >999”* gate, or a test whose name promises *“no market value in the engine”* but only greps one file (`tests/wacc.build.test.js:590` scanned only `wacc.js` while `recommend.js:346` contained `148.36`) while the suite stays `412/412` green — **internal consistency without external truth is a FAIL**. Masked dead code (`wacc.build` discipline gate throwing before `recommend.js:346` is reached) is still a letter violation and an undisclosed deviation.

---

## 2. Universal Audit Criteria

### A. Architectural & Structural Rigor
- [ ] Clean separation of concerns (domain logic, storage/data access, transport/API, presentation).
- [ ] Explicit dependency injection (no hard-to-test global singletons).
- [ ] No circular dependencies between modules.
- [ ] Symmetrical lifecycle: all acquired resources have corresponding cleanup in `dispose()` / `teardown()`.

### B. Functional Correctness & Edge Cases
- [ ] All requirements specified in `docs/phases/phase_X.md` are completely implemented.
- [ ] Boundary conditions handled (empty inputs, null/undefined, extreme limits, zero lengths).
- [ ] Asynchronous race conditions, concurrency bugs, and re-entrancy issues prevented.
- [ ] Clear, typed error responses with descriptive messages.

### C. Test Integrity & Verification — External Truth, Not Just Internal Consistency
- [ ] Independent test runner passes cleanly with 0 flakes — **but a green suite alone is not a PASS**; it only proves DS's code and DS's tests agree (internal consistency). OP must also prove the deliverable is **true against the external source** and that the tests themselves prove what they claim (gate scope = gate name).
- [ ] New components have dedicated unit/integration test coverage **and** each gate's grep/scan actually covers the files its name promises (e.g. `“no market value in the engine”` must grep **all** `src/engine/*.js` outside comments for `\b\d{4,}\b` and `\?\?\s*(148\.36|0\.025)`, not just `wacc.js`; `recommend.test.js` must not only check `0.15` but also that no `MKT` driver fallback exists).
- [ ] Deterministic test execution (mocked time/randomness, seeded PRNG).
- [ ] Real wall-clock timestamps in logs (no future-dated or estimated times).
- [ ] **External-truth pins**: every `MKT` anchor (`risk_free_rate 0.0473` FRED `2026-08-28`, `beta 0.89` stockanalysis `2026-09-01`, `ERP 0.0442` Damodaran `2026-07-01`, `market_share_price 148.36` `2026-08-31`, `shares_outstanding 50,031,000` SEC 10-Q `0001628280-26-053603`, `terminal_growth_rate 0.025` EST) re-derived from raw `assumptions.json`/`historical`/`SEC` filings (not DS fixtures), `WACC`/`df`/`terminalValue`/`netCash`/`perShare` recomputed independently via raw inputs, `WACC>g` guard per cell, `Bear<Base<Bull` ordering, `H1 590,421/78,472/76,618/239,031` invariance per scenario.
- [ ] **Literal / fallback discipline**: `src/engine/*.js` contains zero bare numerics `>999` outside comments **across the whole engine** and zero buried `??` fallbacks on `MKT`/`EST` drivers (`?? 148.36`, `?? 0.025`, `?.value ?? quarterlyValue ?? 0` are fails even if masked by upstream discipline — the P2.1 lesson).

### D. Performance & Resource Efficiency
- [ ] Bounded memory usage under sustained load or stress tests.
- [ ] Algorithmic efficiency ($O(1)$ lookups where appropriate, no unnecessary $O(N^2)$ iterations).
- [ ] In performance-critical hot loops: zero allocation of temporary objects/arrays per tick.

### E. Visual & UX Polish *(If UI/Frontend Deliverable)*
- [ ] Visual screenshots captured in versioned folders (`docs/screenshots/phase_X/v(n)/`).
- [ ] UI layout, typography, colors, and alignments match `docs/design_references/`.
- [ ] Responsive behavior verified across target screen resolutions.
- [ ] Smooth transitions with zero visual clipping, stutter, or layout shifts.

---

## 3. Reviewer Verification Steps (OP Protocol) — External Truth First

When conducting an audit, the Reviewer (`OP`) executes:

1. **File Diff Inspection**: Read every single touched file line-by-line against this checklist and `docs/conventions.md` — including a **gate-scope audit** (does each test's `grep`/`scan` path match its name?).
2. **Independent Test Execution**: Run the test suite (`npm test`, `pytest`, etc.) directly to verify green status and test counts — **the cross-check, not the proof**.
3. **Standalone External-Truth Probes**: Write and execute standalone probe scripts in `scratch/` that would **fail even if DS's suite is green**: call the engine with missing/non-finite `MKT` drivers and assert typed `ConfigError`/`missing_driver` (do not rely on DS's discipline gate masking a fallback), grep **all** `src/engine/*.js` outside comments for bare numerics `>999` and buried `\?\?` fallbacks on market drivers, re-derive every `MKT`/`EST` anchor from raw `assumptions.json`/`historical`/`SEC` filings (reverse `GROWTH_FIXTURE`), re-run `WACC×g` monotonicity and `Bear<Base<Bull` ordering.
4. **Visual Audit** *(if visual deliverable)*: Inspect rendered screenshots in `docs/screenshots/phase_X/v(n)/` against benchmarks.
5. **Issue Verdict**: Format review response with clear PASS/FAIL header and `[END_OF_MESSAGE]` delimiter — a `412/412` green suite that contains a tautology (`plug ≡ residual`, `wacc ≡ costOfEquity` without levered probe) or a bullcrap gate (`“no market value in the engine”` that only greps `wacc.js`) is a **FAIL**.

---

## 4. Redesign Program Verification Map (RP0–RP9) — Final Gate Reference

> **Purpose**: Per-tab audit index for the redesigned 8-tab terminal. Added in RP9.2 per `docs/phases/redesign_phase_9.md` §3. Refs are STRUCTURE-only authority (R2); all figures engine/corpus-derived (R1 top-tab shell everywhere, no sidebars).

| Tab | Phase | Suite File (contract tests) | Binding Pins & Gates |
|---|---|---|---|
| Shell | RP0 | `tests/redesign.shell.test.js` | Tokens, Helvetica stack, top tab bar, footer; `assets/branding/duolingo-logo.svg` wordmark |
| 01 Cover & TOC | RP1 | `tests/redesign.tab1.test.js` | 3-col top, directory + rail, ground-truth image set, no protocol mentions |
| 02 Assumptions / Drivers | RP2 | `tests/redesign.tab2.test.js` | Segmented pills, sliders/table modes, per-MAU scale, B1 snap+no-op (`B1:` tests) |
| 03 Historicals | RP3 | `tests/redesign.tab3.test.js` | Terminal workspace, donut 100.0% largest-remainder, B2 legend isolate (`B2:` tests) |
| 04 Schedules | RP4 | `tests/redesign.tab4.test.js` | Hard-gate cards, canonical headers (15px/700 + blue bar), units pill |
| 05 Projections | RP5 | `tests/redesign.tab5.test.js` | CAGR/margin KPIs, BS $0 tie-out, units toggle with figure rescale (RP5.2 fix) |
| 06 Valuation | RP6 | `tests/redesign.tab6.test.js` | 6-method strip, 7-lever inspector, O1 polarity guard |
| 07 Summary | RP7 | `tests/redesign.tab7.test.js` | Verdict header + agreement table, sparklines, R40 FY2022 trailing label |
| 08 Sensitivity | RP8 | `tests/redesign.tab8.test.js` | Heatmap tiers, active cell, dropdown, spectrum bands, invariance callout |
| E2E + Gates | RP9 | `tests/redesign.e2e.test.js`, `tools/verify_redesign_gates.mjs` | Cross-tab sync, switch <16ms, churn bounded, `runGateScan()` clean |

**Standing live-truth pins (re-derive, never trust)**: DCF $144.08 · Bear $84.39 · Bull $277.84 · benchmark $157.85 · WACC 11.0375% · H1 FY2026 590,421 / 78,472 / 239,031 · corpus 706 records.
**Standing render gates**: zero `style=` (source + rendered app markup; rendered `[style]` elements must all be Tabulator-internal) · zero bare numerics >999 in `src/ui/` (exemptions: 1000/1280/1900/2000) · zero em dashes in user-visible copy · Downside/Base/Upside display vocabulary (never Bear/Bull Case strings) · agreement-only verdicts (zero averages/weights).
