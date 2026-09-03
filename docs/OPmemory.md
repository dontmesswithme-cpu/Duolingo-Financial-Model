# OP Working Memory (RAM State)

> **Rule**: This file represents the Reviewer's active working memory. It is **overwritten** after every review cycle, audit outcome, or phase boundary transition.

---

## 1. Phase 6R — 🟡 ACTIVE: P6R.1 ✅ 18:40 · P6R.2 ✅ PASS (2026-09-03 19:20, first review, fails 0); P6R.3 approved 20:35; P6R.4 approved 22:15 FINAL — GATE HELD for Director FINAL PASS
- **Current Phase**: `P6R`. P6 ledger closed as sub-phase approvals (P6.1 ✅ 22:40, P6.2 ✅ 23:59, P6.3 ✅ resubmission 03:10); Phase 6 gate HELD, merged into P6R completion + Director final pass (no `v1.0` until Director final-pass approval — OP PASS ≠ release).
- **Kick-off state**: KICK-OFF directive appended to `inbox_ds.md` (5th block) + `status_ds.json` → `worker_active P6R/P6R.1 seq6`. Baseline tag `v1.0-P6R-base` created at `b093abf` (= v1.0-P5; `src/`+`index.html` diff EMPTY verified). Suite baseline single run 510/510 (10:55). Consecutive fails: 0.
- **Signal note**: at kick-off, `inbox_ds.md` held 4 blocks vs `status_ds.json.seq = 5` (flip-without-message +1 offset, origin unknown — possibly a manual seq bump via `scratch/fix_status.mjs`; blocks < seq means NO un-signaled message, no §2.1 recovery needed). Offset carried: 5 blocks vs seq 6. Watched at every reconciliation.
- **P6R review protocol**: every verdict cycle uses the all-scenario-state rendered sweep (default, bear-active, bull-active, slider-edited in each) — standing gate per spec §4 (the scenario double-delta survived default-only sweeps at P5.5 and P6.1). Engine diff `v1.0-P6R-base -- src/engine/` must stay EMPTY; corpus/assumptions diffs EMPTY; default pins invariant (perShare 249.35851138243592 · WACC 0.086638 · Bear 132.16 · Bull 532.17 · H1 590,421/78,472/76,618/239,031-OCF).
- **OP gate checklist at P6R completion** (spec §4): P6R.1–P6R.4 individually PASS → consolidated tie-out in `docs/logs/op/phase_6R.md` → await Director FINAL PASS (explicit message) → status.md P6R 🟢 + sign-off quote in log → `node tools/archive_phase.mjs phase_6R` → tag `v1.0` → HALT.
- **P6R verdict ledger**: P6R.1 ✅ 18:40 (suite 520/520 ×3; Probe A 30/30; Probe B 4-state browser sweep green; P6.1 8-tab regression 0 fails). Non-blocking: F1 badge CSS (resolved P6R.2), F2 "Protocol 1.0" @sensitivityTab:236 (purged P6R.2), F3 alias, F4 real-click harness rule, F5 prose fallback.
- **P6R.2 ✅ 19:20** (suite 522/522 ×3; 72-check DOM purge sweep green, 8 tabs × 3 states; cover structure intact, footer/disclaimer per intent). Scope amendment recorded: 2 UI one-liners (F2 + summaryTab:156) accepted as gate-required minimal remediation. F6: DS DOM test over-named, OP sweep is proof. Signal +1 offset carried (7 blocks vs seq 8).
- **P6R.3 ✅ 20:35** (suite 527/527 ×3; 29-driver round-trip + 24/24 innerText sweep + wiring-only innerHTML ruling + slider/clamp/MKT probes green). Ruling: user-visible layer governs bear|bull gate. F7 probe-precision note, F8 dual-map advisory. Placeholders wiped (0 in DOM). Signal offset carried (8 blocks vs seq 9).
- **P6R.4 approved 22:15 FINAL** (suite 533/533 x3; independent plurality map every column, zero ties; exception set == {amortization} only; layout 1100/36px/frozen, no overflow 1280+390; keyboard both directions; real TSV; all-state regression green; MKT sweep flag dispositioned as legend-removal harness artifact). Tabs.js +2 dispose-only; redraw guarded. DS directional write (status_ds worker_idle) corrected to worker_active seq 10. Signal offset carried (9 blocks vs seq 10). **NO archive/tag — Director FINAL PASS required.**
- **Director queue (carried)**: (a) DS on STANDBY per Director 22:20 (verdict issued manually — OP halted, no further review traffic unless directed); (b) push to GitHub → Actions Pages + Vercel live (deployed-URL smoke still pending since P6.3); (c) confirm canonical repo URL (README clone link unverified — no remote); (d) aesthetic review of screenshots; (e) footer disclaimer wording approval at final pass; (f) Director MANUAL verdict (FINAL PASS or directed fix) — OP takes no gate action before it. Signal: 10 blocks vs seq 11 (+1 offset carried).
- **Watcher**: ARMED baseline `status_op.json.seq = 7` (explicit arg; current state review_pending P6R.3 must NOT false-trigger). Next wake = DS P6R.4 submission (seq → 8) → audit per §3 P6R.4 (citation hybrid primary-map re-derivation, layout calibration 1280/390, keyboard/TSV battery, all-state sweep). **After P6R.4 PASS: NO archive/tag — Director FINAL PASS required.**

## 2. P6 Review Protocol (per sub-phase)
1. P6.1 Full Accuracy Audit: verify 100% corpus re-derivation (706 records vs cited filings), rendered-view tie-out all 8 tabs (real-browser, figures == corpus/engine re-derivation, pin tables §3), EST/MKT/computed marks, Bigdata lane recorded, `tests/e2e.accuracy.test.js` encasement (expectations DERIVED, never transcribed — tautology = FAIL).
2. P6.2 Performance Budgets: independent real-browser measurement (recalc median <16ms/100 iters, render <500ms, heap <50MB, 20 mount/dispose cycles bounded, zero runtime network, 390/1280 responsive, keyboard a11y incl. guard regression). DS suite green is cross-check; OP probe is the proof.
3. P6.3 Release: CI workflow (offline test gate), Vercel + Pages live, deployed-URL offline smoke (boot, 8 tabs, driver recalc, zero network), README figure tie-out vs pin tables, **Director release sign-off required before gate**; gate → `archive_phase.mjs phase_6` → tag `v1.0`.
- **Standing rules re-armed**: real-browser validation mandatory; data-content gates; UI literal gate; sole-badge-path; gate-scope audit (grep path matches gate name); post-PASS disclosure of any file write; fail-closed probes in `scratch/`.

## 3. Authoritative Pin Tables (frozen through `v1.0-P5` — carry into P6)
- **Valuation**: Base perShare `249.35851138243592` (undervalued +68.08%), Bear `132.16` (fair, −10.92%), Bull `532.17` (undervalued, +258.71%), marketPrice `148.36` (2026-08-31), WACC `0.086638` (rf `0.0473` FRED 2026-08-28 + β `0.89` stockanalysis 2026-09-01 × ERP `0.0442` Damodaran 2026-07-01), taxRate `0.134225` normalized effective, marketCap `7,422,599,160`, shares `50,031,000` (SEC 10-Q 2026-08-06), df FY2026 `0.920269675825804` / FY2030 `0.660048058982708`, pvExplicit `1,956,849.680114`, terminal FCF `703,279.08` (686,125.93 × 1.025), Gordon TV `11,409,829.693933133`, pvTerminal `7,531,035.94`, EV `9,487,885.62`, netCash `2,987,770.06` (cash `2,752,098.06` + STI `132,979` + LTI `102,693`), equity `12,475,655.68`.
- **Hybrid FY2026**: revenue H1 `590,421` (cited) + H2 `603,432.52` (driver est) = `1,193,853.52`; H1 invariants REV/OI/NI/OCF `590,421 / 78,472 / 76,618 / 239,031` (OCF = 6M YTD cash-from-operations; `230,562` = FCF-H1 — never confuse).
- **KPI truths**: DAU Q2 FY2026 `58.7M`, MAU Q4 FY2025 `133.1M`, subs Q2 FY2026 `12.7M`, DET FY2025 `$42,006`, Rule of 40 `47.4%` (31.4% FY2030 FCF margin + 16.1% 5Y CAGR — computed).
- **Corpus**: 706 records, 100% cited, 0 estimates, `git diff v1.0-P4 -- src/data/historical/` empty.
- **Vendor**: Tabulator 6.2.1 pinned (js SHA `0383b1f8…`, css SHA `a46d8051…`), manifest complete, 0 CDN, 0 runtime deps.
- **Grids**: historicals 22/41/32/6 rows (101 metrics); schedules 5 grids + balance gate (FY2026 A=L+E diff 0); projections 3 grids; sensitivity 9×5 (45 cells, `WACC>g` all, monotonic, corners).
- **UI gates standing**: zero `style=` in `src/ui/`; UI literal gate (no bare financials >999); sole-badge-path `format.estSuffix`/`mktBadge`; `RECOMMENDATION_THRESHOLDS` import-only; data-content gates (rendered == corpus/engine); `editor:false` all grid columns; boolean `selectableRange:true`; clipboard raw TSV; keyboard guard scoped.

## 4. P5 Standing Rulings (binding carry-forward)
1. DIR Option A standards: single visible table implementation; constructor-invocation gates (not config-shape); live mounting verified in DOM.
2. Real-browser validation mandatory for UI sub-phases (stub-DI green never carries a verdict).
3. Test expectations must be DERIVED (corpus/engine/mock) — tautology gates are a FAIL class.
4. Methodology text must match cited sources (no invented "statutory"/"Bloomberg" claims).
5. Fail-closed rendering everywhere ("—" via formatters, never `||` numeric/string fallbacks).
6. Keyboard handlers scoped by target; grid keybindings and global routers must coexist.
7. Charts are part of the tab interface (spec §3.4) — modules ship mounted.
8. OP capability honesty: no image input → programmatic visual audit + Director owns aesthetics; never fake the review.

## 5. End-of-Session Handoff Notes
- **OP state**: P6R ACTIVE, P6R.1 ✅ 18:40 · P6R.2 ✅ 19:20 · P6R.3 ✅ 20:35, watcher ARMED baseline `status_op.json.seq = 7` (explicit arg). Next wake = Director FINAL PASS prompt (no watcher armed — nothing to watch; DS halted, no submissions pending). On FINAL PASS: record sign-off quote in docs/logs/op/phase_6R.md → status.md P6R green → node tools/archive_phase.mjs phase_6R → tag v1.0 → overwrite OPmemory → HALT.
- **DS state**: `worker_active P6R/P6R.4 seq9` — executing final sub-phase; no prompt needed.
- **Director queue**: (a) DS P6R.1 kick-off instruction; (b) GitHub push (Pages + Vercel smoke); (c) canonical repo URL; (d) aesthetics; (e) footer wording approval (P6R.2 final pass); (f) FINAL PASS release approval (no `v1.0` before it).
- Circuit breaker: armed at 0 for P6R (fresh phase ledger). Breaker history: 1 trip (P5.3), resolved same-day by Director ruling; P6 clean (1 FAIL → 1 resubmission on P6.3).
