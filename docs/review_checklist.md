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

### C. Test Integrity & Verification
- [ ] Independent test runner passes cleanly with 0 flakes.
- [ ] New components have dedicated unit/integration test coverage.
- [ ] Deterministic test execution (mocked time/randomness, seeded PRNG).
- [ ] Real wall-clock timestamps in logs (no future-dated or estimated times).

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

## 3. Reviewer Verification Steps (OP Protocol)

When conducting an audit, the Reviewer (`OP`) executes:

1. **File Diff Inspection**: Read every single touched file line-by-line against this checklist and `docs/conventions.md`.
2. **Independent Test Execution**: Run the test suite (`npm test`, `pytest`, etc.) directly to verify green status and test counts.
3. **Standalone Probe Scripts**: If testing complex math, parsing, or algorithmic logic, write and execute standalone probe scripts in `scratch/`.
4. **Visual Audit** *(if visual deliverable)*: Inspect rendered screenshots in `docs/screenshots/phase_X/v(n)/` against benchmarks.
5. **Issue Verdict**: Format review response with clear PASS/FAIL header and `[END_OF_MESSAGE]` delimiter.
