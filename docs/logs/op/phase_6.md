# Phase 6 Verification Log — Reviewer (`OP`)

> **Rule**: Append-only. Reviewer (`OP`) records sub-phase audits, verdicts, independent verification methods, and gate decisions here.

---

[2026-09-02 22:40] [OP] — REVIEW: P6.1 [Full Accuracy Audit — 100% Figure Re-Verification & Rendered-View Tie-Out] [PASS ✅]

**Contract**: `docs/phases/phase_6.md` §3 Task P6.1.

**Methods (all executed 2026-09-02 21:40–22:40 against CURRENT working tree, pre-verdict):**

1. **Frozen surfaces**: `git diff v1.0-P5 -- src/ index.html package.json` → EMPTY. DS write set = exactly the disclosed contract surface (`tests/e2e.accuracy.test.js` new additive, `docs/logs/ds/phase_6.md` new, `docs/DSmemory.md`, `docs/inbox_op.md`, `docs/status_op.json`). Uncommitted `docs/OPreflection.md` modification = prior OP session's P5 boundary reflection (archiver pathspec gap) — OP-authored, additive, to be included in the P6 archive commit. No undisclosed DS writes.

2. **Test suite (cross-check)**: `npm test` (canonical runner, `--expose-gc --test-concurrency=1`) ×3 → **497/497 pass, 0 fail, 0 skipped, 0 flakes** (DS claim 497 confirmed; 482 baseline + 15 P6.1 encasement tests). Note reconciled: bare `node --test` shows 496+1 skipped (heap-churn test requires `--expose-gc`, present only in the canonical `npm test` script) — legitimate conditional skip, not a flake.

3. **Ledger join 1:1** (`scratch/op_p6_1_ledger_check.mjs`): 7 ledger entries, 6 distinct data URLs, 0 in-data-not-in-ledger, sole orphan = LED-001 index anchor (by design). CONFIRMED.

4. **Direct EDGAR re-pull** (`scratch/op_p6_1_edgar/`, fresh fetch 2026-09-02 with reviewer UA): all 6 cited documents re-fetched **byte-identical** to the P1-era cache (duol-20251231/20231231/20250930/20260331/20260630/20211231.htm) — the cited corpus is the live EDGAR state.

5. **100% corpus re-verification — consolidated column-pinned sweep** (`scratch/op_p6_1_sweep.mjs`, locator lineage P1.2_2/P1.3_2/P1.4/P2.2, run against the FRESH re-pull cache): all **706/706** records accounted: 646 column-pinned value-exact (IS/disagg/BS/CF/note rows) + 52 KPI table-verified (units-aware: decimal-M and thousands-$K forms) + 7 amortization Total-row note pins + 1 presence-flag resolved by primary-filer pin (cf_depreciation_and_amortization @ FY2023 = 7,095: FY2025 10-K comparative row interleaves `$`/`—` layout artifacts; the FY2023 10-K's OWN CF statement files `["Depreciation and amortization","7,095","4,870","2,726"]` col0 = 7,095 exactly — probe `scratch/op_p6_1_da_resolve2.mjs`). **Zero value mismatches. Zero uncovered records. Zero period misalignments.** (P1-era probes re-run for lineage cross-check: `op_probe_p1_5_sweep.mjs` 32/32 anchors + identities; `op_probe_p1_3_2.mjs` 257 CF rows, 27 identities, TTM hand-derivation 430,548 = engine.)

6. **Rendered-view tie-out — real browser** (`scratch/op_p6_1_rendered_sweep.mjs`, Playwright Chromium/Edge channel, anchor-activation per P5.3 lineage; **expected values DERIVED at probe time by running the engine pipeline in Node** — anti-tautology): all 8 tabs (Cover, Assumptions, Historicals, Schedules, Projections, Valuation, Summary, Sensitivity): **0 failed checks**, 0 console errors. Verified: valuation pins (perShare 249.36, WACC 8.6638%, pvExplicit 1,956,849.68, Gordon TV 11,409,829.69, pvTerminal 7,531,035.94, EV 9,487,885.62, netCash 2,987,770.06, equity 12,475,655.68, market-cap derivation 7,422,599,160, df 0.92030/0.66000), scenario bands (Bear 132.16 fair < Base 249.36 < Bull 532.17, labels), sensitivity 9×5 (45 cells, monotone, global-max corner 380.44 rendered), hybrid FY2026 (H1 590,421 + FY 1,193,853.52 rendered), KPI truths (DAU 58.7M, subs 12.7M, Rule of 40 47.4% corpus-derived), grid counts (4/5/3), TTM 430,548 computed, EST/MKT/computed marks, MKT provider links (FRED/stockanalysis/Damodaran), citation superscripts, disclaimer.

7. **Bigdata.com independent lane** (spec §4.7 — retrieval lane only; SEC canonical): three reproducible filter lanes executed and recorded:
   - Lane A (Q1 FY2026 10-Q): fast, entity `493F45` — IS chunk: revenues 291,967 / cost 78,871 / GP 213,096 / NI 43,460 — matches corpus Q1 FY2026 rows exactly.
   - Lane B (FY2025 10-K): smart → `mcp_fast_filters` `reporting_entities ["493F45"]`, `reporting_periods [{fiscal_year: 2025}]`, `document_type FILING/SEC_10_K` — chunks from the 10-K itself: DAU 52.7M/40.5M (Q4 3-month, matching the FY2025 dataset rows), paid subs 12.2M/9.5M, subscription bookings $996.3M, total bookings $1,158.4M — all consistent with corpus.
   - Lane C (Q2 FY2026 10-Q): smart → `reporting_periods [{fiscal_year: 2026, fiscal_quarter: 2}]`, `document_type FILING/SEC_10_Q` — DAU 58.7M, subs 12.7M, NI 6M $76.6M — matches corpus.
   - **Zero discrepancies across Bigdata lane ↔ corpus ↔ canonical EDGAR.**

8. **Encasement suite audit** (`tests/e2e.accuracy.test.js`, 15 tests): read line-by-line. Expectations are the frozen pin-table values and corpus-derived identities (not transcribed screen strings) — no tautology. Scope note (recorded, not a defect): the suite's corpus tie-outs are identity/anchor-based (revenue sums, A=L+E, TTM recomputation, hybrid invariants, pin set) and its UI gates cover `src/ui/` style/literal discipline + `createApp` reactive recalc; the 100% per-record filing re-derivation lives in OP's sweep probes (this log §5) per the contract's OP-authored deliverables — the e2e suite encases the regression lane as contracted.

**Findings (non-blocking)**:
- [F1] `cf_depreciation_and_amortization @ FY2023` value 7,095 verified via FY2023 10-K primary-filer column; the FY2025 10-K comparative row's `$ — 7,095` interleaving is a filing layout artifact (documented at P1.3 gate, re-confirmed now).
- [F2] Bare `node --test` vs `npm test` count difference (1 heap-churn skip) is script-flag-conditional, not environment flake — recorded so future gates use the canonical runner.

**Verdict**: **PASS ✅**. P6.1 approved. Consecutive fails: 0.
- `docs/status_ds.json` → `worker_active` (seq 1→2, subphase P6.2).
- Watcher re-armed on `status_op.json` baseline 1 (post-DS-idle-reset).
- Next: P6.2 Performance, Responsiveness & Accessibility Budgets.

---

[2026-09-02 23:59] [OP] — REVIEW: P6.2 [Performance, Responsiveness & Accessibility Budgets] [PASS ✅]

**Contract**: `docs/phases/phase_6.md` §3 Task P6.2.

**Methods (executed 2026-09-02 23:40–23:59 against CURRENT working tree):**

1. **Frozen surfaces**: `git diff v1.0-P5 -- src/ index.html package.json` EMPTY. DS write set = `tests/perf.budgets.test.js` (new additive; imports pre-existing framework helpers `_gc.js`/`_dom_stub.js`, P0-committed) + logs/inbox/signal. No undisclosed writes.

2. **Suite (cross-check)**: `npm test` ×3 → **510/510 pass, 0 fail, 0 skipped, 0 flakes** (497 + 13 P6.2). Canonical runner; gc-gated churn test runs under `--expose-gc`.

3. **Encasement audit** (`tests/perf.budgets.test.js`, 13 tests, read line-by-line): budget gates match contract scope — recalc median <16ms/100 iters full `setDriver` path with warm-up + p95 logging; async/Promise grep over all 8 engine files; bootApp cold boot ×5 median <500ms; 20 mount/dispose cycles with per-cycle `listenerCount===0` asserts + steady-state heap <50MB; index.html + src/ CDN/network greps; tab keyboard/ARIA + grid-isolation guard (stub-level) + SVG viewBox gate; corpus 706 + UI style/literal gates. No tautologies (assertions on behavior, not artifacts).

4. **OP independent measurement — real browser** (`scratch/op_p6_2_perf_probe.mjs` + `op_p6_2_followup.mjs` + `op_p6_2_followup2.mjs`, Playwright Chromium system-Edge headless, locally served static artifact):
   - **Cold boot → interactive (cover populated)**: 186/207/235ms, **median 207ms < 500ms** ✓ (5-context run: domContentLoaded 79ms, app booted 160ms).
   - **In-browser recalc latency** (app.setDriver full reactive path, 30 iters): **median 13.8ms < 16ms** ✓ (p95 16.9ms, max 26.5ms).
   - **Steady-state heap after all-8-tab activation + return**: **7.6MB < 50MB** ✓.
   - **Network log**: 34 requests, **0 external** — all same-origin static assets; zero runtime network ✓ (grep probes concur: 0 fetch/XHR/WS/EventSource in ui+engine; 0 external refs in index.html).
   - **Responsive 390px + 1280px**: no viewport-level horizontal scroll on any tab; frozen columns intact (105 frozen cells on historicals at 1280px); 8 verification screenshots captured → `docs/screenshots/phase_6/v1/` (cover/historicals/valuation/summary × 2 widths, all non-blank 35–92KB).
   - **Grid population + isolation guard** (proper settle): historicals 4 grids / 101 rows / FY2025 revenue 1,037,589 rendered; sensitivity 9 rows / corners rendered; arrows inside grid do NOT switch tabs (in-grid ArrowRight/Down held tab=historicals; arrow on tab bar switches to schedules) — guard verified both directions ✓. Tab bar arrows/Home/End + aria-selected sync verified (16 tab controls).
   - **Sync hot path**: OP grep over all 8 engine files → **zero async/await/Promise** ✓.

**Findings (non-blocking)**:
- [F3] Playwright's actionability-layer `page.click` costs ~22s/iteration on this host — the main probe's "all-8-tabs populated 181s" was automation overhead, NOT app time; the contract budget (boot + active tab < 500ms) measured directly at 207ms. Recorded so no future probe repeats the mislabeled check.
- [F4] `.tabulator-row` queries return 0 until Tabulator's virtual DOM settles post-activation (~1–2s); row-population assertions need the settle wait (followup2 shows 101/9 rows once settled).

**Verdict**: **PASS ✅**. P6.2 approved. Consecutive fails: 0.
- `docs/status_ds.json` → `worker_active` (seq 2→3, subphase P6.3).
- Watcher re-armed on `status_op.json` baseline 2 (post-DS-idle-reset).
- Next: P6.3 Production Deployment, Portfolio Deliverables & Release Sign-Off (final sub-phase — Gate sequence on its PASS + Director sign-off).

---

[2026-09-03 02:20] [OP] — REVIEW: P6.3 [Production Deployment, Portfolio Deliverables & Release Sign-Off] [FAIL ❌] (consecutive fails: 1/3)

**Contract**: `docs/phases/phase_6.md` §3 Task P6.3. **README figures are subject to the same data-content gate as the UI** (contract C-invariant: "every figure/claim ties to the pin tables... no fabricated or forward-looking unmarked numbers").

**Methods**: line-read of all 3 deliverables; independent tie-out of every README figure against engine/corpus/driver re-derivations (`scratch/op_p6_3_readme_tieout.mjs` + `tieout2-5`); suite re-run (510/510 ✓, 157 suites ✓); frozen-surface diff ✓ (empty); repo-state checks for the CI pipeline.

**What passed**: `deploy.yml` schema (test gate before Pages publish, no secrets, platform tokens only), `vercel.json` (static zero-build, security headers), headline valuation pins (148.36 / 249.36+249.3585 / +68.08% / 8.6638% / 4.73% / 0.89 / 4.42% / 2.50% / 9,487,885.62 / 2,987,770.06 / 12,475,655.68 / 50,031,000 / 132.16 / 532.17 / −10.92% / +258.71% / 47.4% / 706 / hybrid invariants 590,421/78,472/76,618/239,031 / 1,193,853.52 / Rule-of-40 components 16.1%+31.4% / thresholds ≥+15% ✓ via `RECOMMENDATION_THRESHOLDS`), screenshots referenced exist on disk, 510/157 badges ✓, EST/MKT vocabulary usage, disclaimer present, architecture diagram accurate.

**FAIL-class defects (fabricated figures — the P5.4/P5.5 "plumbing right, content hand-typed" signature, now in README prose)**:
1. **Net Cash Bridge decomposition**: README "Cash ($274.3M) + STI ($674.8M) + LTI ($2,038.6M)" — engine truth (`dcf.js:321-386`, re-derived): FY2030 ending cash **$2,752.1M** + STI **$133.0M** + LTI **$102.7M** − Debt $0. Total coincidentally matches ($2,987.7M) but every component is invented. The pin-table decomposition (2,752,098.06 / 132,979 / 102,693) has been the frozen truth since P4.
2. **Base scenario blurb**: "15.3% paid subscriber growth" — driver `paid_subscriber_growth` base = **18.4%** (0.183929). "ARPU scaling to $90.50" — `subscription_arpu` = **$80.50**.
3. **Bear scenario blurb**: "8.0% subscriber growth" — bear = base −6pp = **12.4%**. "gross margins 70.5%" — bear GM = (1 − (0.277694+0.02)) = **70.2%**.
4. **Bull scenario blurb**: "operating margin expansion to 35%" — engine FY2030 bull operating margin = **19.1%** (re-derived via runFullValuation: rev 2,819,861 / OI 537,629). Bear 7.1%, Base 13.1%.
5. **Architecture diagram**: "assumptions.json - 24 drivers" — actual = **38 drivers**.

**Repo-state defects (CI correctness)**:
6. **`package-lock.json` MISSING** — `deploy.yml` runs `npm ci`, which FAILS without a lockfile. The deployment gate would never go green on GitHub. Generate and commit it (`npm install --package-lock-only` acceptable; zero new runtime deps — verify lock contains devDependencies only).
7. **`LICENSE` MISSING** — README carries an MIT license badge + link; no LICENSE file exists in the repo. Either add the MIT LICENSE file or remove the badge.

**Flagged for Director (not DS-fixable)**:
8. README clone URL `github.com/thelastfaraz/Duolingo-FM.git` — repo has **no git remote configured**; Director must confirm the canonical GitHub URL (and Pages/Vercel URLs for §live links — the deployed-URL smoke test executes at Director push time; it cannot be run before the repo is pushed).
9. **Director release sign-off** remains required before the Phase 6 gate regardless of resubmission outcome.

**Required fixes (resubmission)**:
- README §1 Net Cash Bridge row: replace components with the engine decomposition (Cash $2,752.1M + STI $133.0M + LTI $102.7M − Debt $0) — keep $2,987,770.06k total.
- README §1 scenario blurbs: correct to driver truth — Bear (12.4% subs growth, GM 70.2%, g 2.0%), Base (18.4% subs growth, ARPU $80.50, g 2.5%), Bull (op margin to ~19% FY2030, ARPU $84.50, g 3.0%). Alternatively rewrite the blurbs to describe delta DIRECTIONS without specific numbers — but any number present must tie to engine truth.
- README §2 diagram: 38 drivers (or verify the "24" referred to something real — no 24-driver subset found).
- Add `package-lock.json`; add `LICENSE` (MIT) or drop the badge.
- Qualify perf bases: "~2.3ms (stub harness) / 13.8ms (real-browser)" and "~92ms / 207ms" or use the real-browser figures.
- Clone/live URLs: leave placeholders or confirm with Director before publishing.

**Verdict**: **FAIL ❌** (consecutive fails: 1/3). The README is the portfolio deliverable — a public document whose component figures are provably invented cannot ship under the accuracy-gate pitch it itself makes. All defects are one-file fixes (README + lockfile + LICENSE); no `src/` changes; frozen surfaces unaffected.

---

[2026-09-03 03:10] [OP] — REVIEW: P6.3 (Resubmission) [Production Deployment, Portfolio Deliverables & Release Sign-Off] [PASS ✅ — GATE HELD FOR DIRECTOR SIGN-OFF]

**Contract**: `docs/phases/phase_6.md` §3 Task P6.3 (final sub-phase).

**Remediation verification (every FAIL-class defect independently re-derived):**
1. **Net Cash Bridge**: README now "Cash ($2,752.1M) + STI ($133.0M) + LTI ($102.7M) − Debt ($0)" — ties exactly to engine truth (`dcf.js:321-386`: FY2030 ending cash 2,752,098.06 + STI 132,979 + LTI 102,693 − debt 0 = 2,987,770.06). ✓
2. **Scenario blurbs** — all figures now match driver/engine re-derivations: Bear 12.4% subs growth (18.39−6pp) ✓, GM 70.2% (1−(0.277694+0.02)) ✓, g 2.0% ✓; Base 18.4% ✓, ARPU $80.50 (`subscription_arpu` 80.5016) ✓, 13.1% FY2030 op margin (285,938/2,188,445 via runFullValuation) ✓; Bull 24.4% subs (18.39+6pp) ✓, 19.1% FY2030 op margin (537,629/2,819,861) ✓, 3.0% g ✓.
3. **Diagram**: "38 drivers" ✓ (assumptions.json array length 38).
4. **Perf bases dual-qualified**: "~2.3ms in-memory / 13.8ms real-browser" and "~92ms in-memory / 207ms real-browser" — matches OP's P6.2 real-browser measurements exactly. ✓
5. **`package-lock.json`**: exists, root dependencies = [] (zero runtime), devDeps = playwright/@playwright/test only, 0 non-dev entries, 0 vulnerabilities; **`npm ci` executed by OP: success (3 packages, 944ms)** — the CI gate will go green. ✓
6. **`LICENSE`**: MIT, present. Badge claim now true. ✓

**Full re-verification**: suite ×3 after `npm ci` → **510/510, 0 fail, 0 skipped, 0 flakes**; frozen-surface diff `v1.0-P5` EMPTY (write set = README/LICENSE/lockfile/workflow/vercel.json + logs, all disclosed); `deploy.yml` no secrets (sole token-like line is the platform `id-token: write` OIDC permission for official Pages actions); `vercel.json` static zero-build.

**Remaining Director items (blocking the gate, not the sub-phase):**
- **Director release sign-off** (contract §3 P6.3 + §4): required before the Phase 6 gate and tag `v1.0` can issue. OP cannot issue GATE PASS without it.
- Live URLs: deployed-URL offline smoke test executes after the Director pushes to GitHub (Vercel auto-deploy + Actions Pages). README clone URL (`thelastfaraz/Duolingo-FM`) needs Director confirmation since no git remote is configured on this working copy.
- Carried: aesthetic review of P5 screenshots (Director's own queue item).

**Verdict**: **PASS ✅ — P6.3 approved (sub-phase 3/3)**. Consecutive fails reset: 0. **All P6 sub-phase Artifact Contracts now individually approved.** Phase 6 gate (GATE PASS → `archive_phase.mjs phase_6` → tag `v1.0`) is **BLOCKED pending Director release sign-off** per contract. DS HALTS and stands by for the Director.
