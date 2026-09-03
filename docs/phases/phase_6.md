# Phase 6: End-to-End Verification, Performance & Release

> **Milestone**: Phase 6 — End-to-End Verification, Performance & Release
> **Protocol**: 1.0
> **Status**: ⚪ Pending (Approved by Director 2026-09-02 — amendment applied: recording deliverable removed from P6.3; awaiting Director initiation)
> **Owner**: Drafted & Audited by Reviewer (`OP`), Implemented by Worker (`DS`)
> **Objective**: Certify the finished Duolingo FM product end-to-end before public release: a full independent re-verification of 100% of historical figures and every rendered valuation output (the Accuracy Gate enforced at exit), performance and memory budgets proven on the shipped artifact, responsiveness and accessibility verified, deployment pipelines live (Vercel primary + GitHub Pages mirror), and the portfolio deliverable (README) produced — closing the project with a Director release sign-off. Phase 6 is verification and release only: **no new financial logic, no new corpus rows, no UI redesign** (design-reference discussion closed by Director 2026-09-02 — out of scope).

---

## 1. Milestone Objective & Scope

Phase 6 is the exit gate of the project. P0–P5 are complete and gated (`v1.0-P5`, 482/482 tests, 706-record corpus, frozen valuation surface `perShare $249.35851138243592`). P6 re-verifies the whole from the outside in: `P6.1` is a 100% accuracy sweep — OP independently re-derives every historical figure from cited SEC filings (direct EDGAR re-pull per spec §4.5, plus the Bigdata.com independent lane per spec §4.7) and verifies every rendered screen figure ties to engine/corpus truth; `P6.2` proves the non-functional budgets on the shipped static app (recalc <16ms, initial render <500ms, heap <50MB, 390px–1280px responsive, keyboard accessibility, zero network at runtime); `P6.3` ships the release: GitHub Actions Pages workflow + Vercel auto-deploy, offline smoke test, README portfolio deliverable, and Director release sign-off.

**Out of scope**: any change to `src/engine/` arithmetic (frozen since P4), any new corpus rows or edits to `src/data/historical/` (706 records frozen), any UI redesign or re-theming (Director closed the design-reference question 2026-09-02 — the shipped `v1.0-P5` interface is the release interface), any new runtime dependency. If P6.1/P6.2 verification finds a defect, the fix lands as a **minimal, disclosed remediation** under the existing frozen-surface rules (removal/correction only, additive test gates) — never a rewrite.

---

## 2. Prerequisites & Dependencies

- **Completed Prior Phases**: Phase 5 — 🟢 **GATE PASSED 2026-09-02 19:07, tag `v1.0-P5`, commit `b093abf`**. Sub-phase ledger: P5.0 vendor (Tabulator 6.2.1 pinned, SHA `0383b1f8…`/`a46d8051…`), P5.1 hardening (zero buried fallbacks, all-engine literal gates), P5.2 controller (DI, clamped drivers, sync recalc ~2.4ms, 8-tab shell), P5.3 Historicals (4 live TabulatorFull grids, 101 cited metric rows, Ctrl+C TSV), P5.4 Schedules+Projections (8 grids, all corpus/engine-derived, balance gate, hybrid decomposition), P5.5 Valuation/Summary/Sensitivity (WACC/CAPM, bridge waterfall, mechanical +68.08% UNDERVALUED, 9×5 grid, Bear $132.16 < Base $249.36 < Bull $532.17), P5.6 charts+screenshots (4 pure-SVG charts mounted, 16 PNGs). Suite **482/482**, 0 flakes ×3 (OP-verified 19:07). Circuit breaker history: 1 trip (P5.3, Director Option A resolution).
- **External Dependencies / Manifests**: SEC EDGAR (CIK 0001562088) — canonical authority for the P6.1 re-pull, ledger `docs/sources/sources.md` (7 filing URLs); Bigdata.com remote MCP — OP independent verification lane only, never a citation source (spec §4.7); cached EDGAR filings at `scratch/op_p1_1_edgar/` as verification substrate; Playwright (devDependency, existing) for performance/responsive probes; GitHub Actions + Vercel accounts for P6.3 deployment. **Zero new runtime dependencies** — the release artifact stays a zero-build, zero-network static app.
- **Reference Documents**:
  - `docs/spec.md` §4.5 (citation protocol / direct EDGAR authority), §4.7 (Bigdata retrieval-lane ruling), §5 (non-functional budgets: recalc <16ms, render <500ms, heap <50MB), §7 decisions 11–12 (deployment: Vercel primary + Pages mirror; Bigdata tooling).
  - `docs/plan.md` §2 Phase 6 (P6.1/P6.2/P6.3 scope as Director-approved).
  - `docs/phases/phase_5.md` + `docs/logs/op/phase_5.md` — the accumulated P5 tie-out record; P5 gate checklist is the entry evidence.
  - `docs/OPreflection.md` (P4 + P5 boundary learnings — external-truth-first rules, probe library, tautology prohibition, capability honesty).
  - `docs/OPmemory.md` §3 — **authoritative pin tables** (valuation, hybrid, KPI, vendor, grid, UI gates) — the P6.1 comparison substrate.
  - Standing rulings P3–P5 (hybrid join, post-PASS disclosure, frozen surfaces, DIR Option A standards, data-content gates, UI literal gate, sole-badge-path, real-browser validation, methodology-text-truth).
  - `docs/review_checklist.md` §1/§2/§3 (zero-tolerance conditions, external-truth verification steps).

---

## 3. Sub-Phase Artifact Contracts

### Task P6.1: Full Accuracy Audit — 100% Figure Re-Verification & Rendered-View Tie-Out

#### A. Deliverable Files
- `scratch/op_p6_1_edgar/` (new) — OP's fresh EDGAR re-pull cache: the five 10-K/10-Q filing documents re-fetched (or re-confirmed from `scratch/op_p1_1_edgar/`) at audit time; each cached document's URL must equal the `docs/sources/sources.md` ledger entry it verifies.
- `scratch/op_p6_1_*.mjs` (new, OP-authored) — re-verification probes: (a) corpus sweep — every one of the 706 records re-derived from the cited filing (value, period, statement, fiscal-year alignment); (b) rendered-view sweep — real-browser probe over all 8 tabs asserting every on-screen figure ties to corpus/engine re-derivation (extends the P5 probe library: `op_p5_3_browser_probe_v3.mjs`, `op_p5_4_content_probe.mjs`, `op_p5_4_schedules_content_probe.mjs`, `op_p5_5_content_probe.mjs`, `op_p5_5_kpi_probe.mjs`, `op_p5_6_visual_audit.mjs`); (c) Bigdata.com independent lane — reproducible smart/fast search lanes pinned in the audit procedure (e.g. `reporting_entities`/`reporting_periods`/`document_type` filters over the same filings), recorded in the log.
- `tests/e2e.accuracy.test.js` (new, DS-authored, additive) — automated regression encasement of the sweep: sampled corpus tie-outs per statement (annual + quarterly + YTD classes), TTM recomputation anchors, hybrid FY2026 invariants, and the full valuation pin set — so the P6.1 evidence is re-runnable, not a one-time audit.
- `docs/logs/op/phase_6.md` (new) — OP verification log: methods, per-figure results, Bigdata lane lanes used, discrepancies found (target: zero) and their disposition.
- `docs/logs/ds/phase_6.md` (new) — DS verification entries (append-only).

#### B. Exported Interfaces & Types
- No new runtime interfaces. `tests/e2e.accuracy.test.js` exports only `node:test` suites; probes are standalone scripts. Frozen surfaces from P1–P5 (`loadHistorical`, `HISTORICAL_DATASETS`, `schedules.build`, `forecast.project`, `threeStatement.project`, `wacc.build`, `dcf.valuate`, `recommend.evaluate` + `buildSensitivityGrid` + `runFullValuation`, `createApp`/`bootApp`, `src/ui/*` view contracts) must remain byte-identical in behavior — P6.1 verifies, it does not modify.

#### C. Invariants & Automated Quality Gates
- [ ] **100% corpus re-verification**: every record in `src/data/historical/*.json` re-derived from its cited SEC filing via direct EDGAR re-pull (spec §4.5 authority); ledger join 1:1 (7/7 URLs live and canonical); zero value discrepancies, zero period misalignments, zero uncited records. Discrepancy found → minimal disclosed remediation under frozen-surface rules; the remediation re-runs the sweep for the affected statement.
- [ ] **Bigdata.com independent lane** (spec §4.7): reproducible filter lanes over the same filings recorded in `docs/logs/op/phase_6.md`; Bigdata is a second ingestion pipeline only — any discrepancy resolves to the canonical sec.gov document, never to "Bigdata".
- [ ] **Rendered-view tie-out (real browser, all 8 tabs)**: every figure on screen equals corpus/engine re-derivation — valuation pins (perShare `249.35851138243592`, WACC `0.086638`, df FY2026/FY2030, pvExplicit `1,956,849.68`, terminal FCF `703,279.08` → Gordon TV `11,409,829.69`, pvTerminal `7,531,035.94`, EV `9,487,885.62`, netCash `2,987,770.06`, equity `12,475,655.68`, marketPrice `148.36`, upside `+68.08%`), scenario bands (Bear `132.16` fair < Base < Bull `532.17` undervalued), sensitivity 9×5 (45 cells, `WACC>g` all, monotonic, 4 corners), hybrid FY2026 (590,421 + 603,432.52 = 1,193,853.52; H1 invariants 590,421/78,472/76,618/239,031 OCF), KPI truths (DAU 58.7M, MAU 133.1M Q4 FY2025, subs 12.7M, DET $42,006, Rule of 40 47.4%), grid row counts (22/41/32/6), balance gate (A=L+E per year, diff 0).
- [ ] **EST/MKT/computed marking verified present in every rendered view** (spec §2.3 rule 2): assumptions MKT badges with asOf+provider links, forecast EST titleFormatters on every forward column, TTM `computed`, hybrid `ACT`/`EST`, sole-badge-path via `format.estSuffix`/`mktBadge` (grep `src/ui/` for direct badge construction is `[]`).
- [ ] `npm test` green (482 baseline + new e2e suites), 0 flakes ×3 runs; corpus `git diff v1.0-P5 -- src/data/historical/` empty; frozen-surface diff `v1.0-P5 --stat` empty unless a disclosed remediation occurred.
- [ ] OP logs methods + results; DS cannot mark P6.1 done without OP PASS (standard protocol).

---

### Task P6.2: Performance, Responsiveness & Accessibility Budgets

#### A. Deliverable Files
- `tests/perf.budgets.test.js` (new, DS-authored, additive) — automated budget gates re-runnable in CI: recalc latency (median <16ms over 100 iterations of `setDriver` full path), initial render budget, heap-bound and disposal assertions (pre-existing P5.2 patterns extended to the full 8-tab mount), zero-network assertion (no `fetch`/XHR at steady-state runtime).
- `scratch/op_p6_2_perf_probe.mjs` (new, OP-authored) — real-browser (Playwright/Chromium, system-Edge channel) measurement: cold-load timing on a locally served static build (DOM content loaded → app booted → 8 tabs activated → all grids populated), steady-state heap via `performance.memory` sampling, network-request log (target: only static asset GETs, zero external calls), 390px + 1280px layout probes (no horizontal scroll leak outside `.table-responsive` containers, frozen columns intact), keyboard accessibility sweep (tab/arrow navigation on tab bar, grid arrow navigation + Ctrl+C TSV, focus visibility).
- `docs/screenshots/phase_6/v1/` (new) — responsive verification set: at minimum `cover/historicals/valuation/summary` at 390px and 1280px post-P6 (re-captured only if any remediation changed rendering; otherwise the P5 v1 set is referenced as-is and its freshness asserted).
- `docs/logs/op/phase_6.md` (appended) — P6.2 measurement results vs budgets.

#### B. Exported Interfaces & Types
- No new runtime interfaces. `tests/perf.budgets.test.js` exports `node:test` suites. Any budget-measurement helper must live in `tests/` or `scratch/` — `src/` stays unchanged.

#### C. Invariants & Automated Quality Gates
- [ ] **Latency**: full recalc path (`setDriver` → schedules → forecast → threeStatement → wacc → dcf → recommend → sensitivity → view updates) **median <16ms** over 100 iterations (P5.2 measured ~2.4ms — re-prove on the shipped artifact); synchronous hot path (zero `async`/`await`/`Promise` in the recalc chain — grep gate re-run).
- [ ] **Initial render**: locally served static app boots to interactive (app booted + active tab populated) in **<500ms** on a 2020-class laptop (median of ≥5 cold loads; document hardware).
- [ ] **Memory**: steady-state JS heap **<50MB** after activating all 8 tabs and returning; no unbounded growth across 20 mount/dispose cycles (P5.2 disposal patterns — `listenerCount 0`, grid instances destroyed); no detached-node accumulation (heap snapshot node-count delta bounded).
- [ ] **Zero network at runtime**: after load, zero non-asset network requests (vendor manifest URLs never fetched — `index.html` + `src/` + vendor grep for runtime CDN references is `[]`; network log in the probe confirms).
- [ ] **Responsiveness 390px–1280px**: every tab usable at both widths — no viewport-level horizontal scroll (scroll containment inside `.table-responsive`/grid holders), frozen label columns intact, charts legible (SVG viewBox scaling), no clipped interactive controls.
- [ ] **Keyboard accessibility**: tab bar arrows/Home/End functional (P5.2 router, guard regression intact — arrows in grids do NOT switch tabs), grid arrow navigation + multi-cell range + Ctrl/Cmd+C TSV functional on Historicals/Schedules/Projections/Valuation/Sensitivity grids (P5.3 layer-3 battery re-run), focus states visible, `aria-selected` synchronization verified.
- [ ] `npm test` green ×3 with the new budget suites; no regression in the 482 baseline; corpus/frozen-surface diffs empty.

---

### Task P6.3: Production Deployment, Portfolio Deliverables & Release Sign-Off
- `.github/workflows/deploy.yml` (new) — GitHub Actions workflow: on push to main, (a) run the full offline test suite (`npm ci && npm test`) as the deployment gate, (b) publish to GitHub Pages (static artifact: `index.html`, `src/`, `vendor/`, `docs/screenshots/` as needed). No secrets beyond the platform-provided Pages token; zero network at test time.
- `vercel.json` (new, minimal) — static deployment config for the Vercel auto-deploy from the same repo (framework preset: none/static; no build step; output directory: repo root). Vercel URL is the primary public link; Pages is the permanent mirror (spec §7 decision 11).
- `README.md` (rewrite of the existing scaffold — the portfolio deliverable per spec §7 decision 11): project title + one-paragraph pitch (audit-gated Duolingo DCF: every historical figure cited to SEC filings, every estimate marked), live links (Vercel primary, Pages mirror), methodology summary (driver model → 3-statement → WACC/CAPM → DCF → mechanical recommendation, with the headline outputs: perShare $249.36, +68.08% undervalued vs $148.36, Bear/Base/Bull range), **accuracy-gate pitch section** (706 records 100% cited, EST/MKT/computed taxonomy, fail-closed engine, the protocol that enforced it — this is the portfolio's differentiator), architecture diagram (data ← engine ← app ← ui, zero runtime dependencies, vendored Tabulator), screenshot gallery (references `docs/screenshots/phase_5/v1/` + any P6 additions), test-suite summary (482+ tests, 0 flakes), how-to-run (open `index.html` or `npx serve`; `npm test` fully offline), disclaimer (not investment advice).
- `docs/logs/op/phase_6.md` (appended) — P6.3 verification: deployment smoke results (both URLs live and serving the same artifact hash), offline test evidence, README accuracy review (every number in README ties to the pin tables — README figures are subject to the same data-content gate as the UI).
- **Director release sign-off** — recorded by OP in `docs/status.md` on DIR's explicit instruction (final gate message); without it, the phase cannot gate.

#### B. Exported Interfaces & Types
- Deployment configs only (no runtime code). The deployed artifact must be **byte-identical in behavior** to the verified working tree: the workflow gates on `npm test` before publishing; Vercel serves the same static root with zero build step.

#### C. Invariants & Automated Quality Gates
- [ ] **CI deployment gate**: GitHub Actions workflow runs the full suite offline and publishes only on green; the workflow itself contains no secrets, no external fetches at test time.
- [ ] **Offline smoke test**: a headless probe against the *deployed* URLs (Vercel primary + Pages mirror) verifies: app boots (`globalThis.duolingoFM.app` defined), zero console errors, all 8 tabs mount, a driver change recalculates (state dirty), and **the network log shows zero runtime API calls** (all requests are same-origin static assets). Same-content check: both deployments serve the same artifact (e.g. identical `LEDGER_URLS` boot, identical rendered perShare).
- [ ] **README is accurate and portfolio-grade**: every figure/claim ties to the pin tables (perShare, upside, scenario range, record count, test count, deployment URLs); no fabricated or forward-looking unmarked numbers; EST/MKT vocabulary used correctly; disclaimer present; screenshots referenced exist on disk.
- [ ] **Release tag**: on all P6 sub-phase PASSes + Director sign-off, OP executes the Phase 6 gate: `node tools/archive_phase.mjs phase_6` → git commit + tag **`v1.0`** (the release tag — final project version, superseding the per-phase `v1.0-PX` tags), `docs/status.md` P6 → 🟢 Done, project complete.

---

## 4. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] All sub-phase Artifact Contracts (`P6.1`–`P6.3`) individually submitted and approved by OP; P6.3 is the final sub-phase → Gate sequence on its PASS.
- [ ] **100% accuracy re-verification proven** (P6.1): direct EDGAR re-pull for all 706 records re-derived with zero unexplained discrepancies; Bigdata.com independent lane executed and recorded (retrieval lane only — SEC remains the authority); rendered-view tie-out across all 8 tabs green (every screen figure equals corpus/engine truth); EST/MKT/computed marks present in every rendered view; e2e regression suite encases the sweep.
- [ ] **Non-functional budgets proven on the shipped artifact** (P6.2): recalc median <16ms (no async in hot path), initial render <500ms, steady-state heap <50MB, bounded mount/dispose cycles, zero runtime network requests, 390px–1280px responsive usability, keyboard accessibility (tab router + grid navigation + TSV copy, guard regression intact).
- [ ] **Release shipped and verified** (P6.3): Actions workflow + Vercel deploy live and serving the identical verified artifact; offline smoke test against both deployed URLs green; README accurate (figure-tie-out enforced), portfolio-grade; **Director release sign-off recorded**.
- [ ] **Frozen surfaces through the entire phase**: `src/engine/` arithmetic byte-identical to `v1.0-P4` behavior; `src/data/historical/` `git diff v1.0-P5` empty (706 records); UI frozen to the shipped `v1.0-P5` interface (no redesign — Director ruling 2026-09-02); any P6 remediation is minimal, disclosed in the submission, and re-verifies the affected sweep.
- [ ] **External truth over internal consistency** (binding carry-forward): a green suite alone carries no verdict; every P6 audit step is an independent probe (fresh EDGAR pull, real-browser measurement, deployed-URL smoke). Tautology gates are a FAIL class; test expectations must be derived from corpus/engine/pins, never transcribed from screens or README prose.
- [ ] `npm test` green, 0 flakes ×3 runs across the phase; suite count additive from 482 baseline.
- [ ] **OP consolidated final tie-out** recorded in `docs/logs/op/phase_6.md`: methods + results for all three sub-phases (accuracy sweep coverage %, budget measurements, deployment smoke), the release-version artifact identity (commit SHA + tag `v1.0`), and the Director sign-off quote.

---

> **Director review 2026-09-02 — draft notes resolved**: (1) P6.1 keeps the 100% re-verification bar — approved. (2) Recording deliverable — **removed from P6.3 scope by Director** (the recording and its script/shot-list deliverable are withdrawn; LinkedIn video production is Director's own affair entirely outside the repo and this protocol). (3) `v1.0` release tag scheme — confirmed. (4) No design-alignment sub-phase — approved. Draft is final and stands as written.
