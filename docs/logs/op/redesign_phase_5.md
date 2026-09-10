# OP Log — Redesign Phase 5 (Tab 05 — Projections)

> Append-only. Reviewer (`OP`) audit trail.

---

### [2026-09-09 10:50] KICK-OFF: Phase RP5 (Director order — lane opened; consecutive_fails: 0)
- Director: "OP start RP5, read howtowork.md and begin". Cold-start complete (Reflection → Memory → Status → Signal Reconciliation → Phase Spec).
- Signal reconciliation (§2.1): live `inbox_op.md` 1 submission header == `status_op.json.seq` 1; live `inbox_ds.md` 6 verdict headers == `status_ds.json.seq` 6 → balanced, no crash, nothing pending.
- Image-first: viewed `ssdesign/target_theme/ref_05_projections.jpg` (R2 structure-only; ref figures are mockups — every figure from the 3-statement engine; R1 top-tab shell holds, sidebar not built).
- Contract loaded: `docs/phases/redesign_phase_5.md` — RP5.1 KPI cards + dual trajectory charts · RP5.2 statement workspace/freeze panes/units/hybrid-FY2026. Gate needs all-3-statements link + capture-vs-ref_05 (0 errors, desktop/tablet) + engine-true KPIs/charts + `tests/redesign.tab5.test.js` green.
- Mechanics (manual RP-aware; tool RP-incompatible per RP0 rule): live inboxes + status jsons copied to `docs/logs/inboxes/redesign_phase_4/` (status jsons added — prior re-archive had inboxes only) → live inboxes reset to template → signals reset RP5/RP5.1 seq 0 (status_op idle, status_ds worker_active — DS owns RP5.1 build). NO commit/tag — Director release authority.
- Carry-forward into RP5 gates: B1/B2/B3 → RP9 · earlier-tab visual backlog → last phase (Director order) · D1 pill watch-item · D2 spec ready · verbatim-example rule · ternary-zero lint · zero→`—`/`$0` display discipline · NO DATA fail-closed pattern · retired-class empty-alias pattern.
- Standing pins: live MKT (rf 0.0479 · beta 1.47 · ERP 0.0425 · price 157.85 · shares 50,031,000); P6R3 Base $144.082130 / Bear $84.389050 / Bull $277.837024; corpus 706; suite baseline 839/839 ×242.
- Watcher: arming `node tools/watch_op_inbox.mjs` baseline seq 0.

### [2026-09-09 11:05] REVIEW: RP5.1 [FAIL ❌] (cycle 1 — consecutive_fails: 1)
- Submission: seq 1 RP5/RP5.1. Delimiter ✅. Suite OP-run 842/842 ×243 ✅ (focused 3/3; legacy 19/19; counts honest).
- Probes: `scratch/op_rp51_probe.mjs` 19/20 (F1 below; engine pins rev26 1,193,853.52 == RP2 matrix pin, rev30 2,188,445.03, ebit30 285,937.85, ni30 345,421.66, fcf30 686,125.93) · `scratch/op_rp51_live.mjs` 12/12 (KPIs 16.4/13.1/31.4/$345 engine-true; reactivity 16.4→36.6; 0 errors) · captures 1280 + 390 viewed (ref_05-conformant; post-driver-change state noted). Instruments unmodified. DSmemory honest.
- F1 product fail-OPEN: `computeProjectionKpis` guard lets null terminal revenue through (`null >= 0` → true) → CAGR -1 ("-100.0%") vs claimed fail-closed dashes. Fix: finite-guard both endpoints + regression test.
- F2 test-scope: derivation pins CAGR-only; margins/NI finite-only; update test uses identical input. Fix: pin all four derivations + F1 null case.
- A1 advisory: resubmission to carry baseline-state full-page captures (1280 + 390).
- Signal: `status_ds.json` → worker_active/RP5/RP5.1 seq 1. Watcher re-armed baseline seq 1.

### [2026-09-09 11:20] REVIEW: RP5.1 [PASS ✅] (cycle 2 — consecutive_fails reset to 0)
- Resubmission: seq 2 RP5/RP5.1. Delimiter ✅. Suite OP-run 842/842 ×243 ✅ (22/22 focused = 3 tab5 + 19 charts/schedules).
- Probes: `scratch/op_rp51_probe.mjs` **20/20** (F1 null-matrix green) · `scratch/op_rp51_live.mjs` **12/12** (baseline KPIs engine-true; reactivity 16.4→36.6; 0 errors) · baseline captures 1280 + 390 viewed (ref_05-conformant). Instruments unmodified.
- F1 closed (`:53` finite-guards; missing-terminal → null). F2 closed (4-way derivation pins + null regression + changed-input update).
- Signal: `status_ds.json` → worker_active/RP5/RP5.2 seq 2 (DS owns RP5.2 build). Watcher re-armed baseline seq 2.

### [2026-09-09 11:30] INBOX REPAIR (protocol — RP4.1 precedent, content unchanged)
- Found RP5.2 block (16:56:58) inserted mid-file before the earlier-timestamped RP5.1 resubmission (16:46:00). Re-seated RP5.2 at tail in signal order (1→2→3); all three blocks + delimiters byte-identical. True order confirmed by timestamps + seq chain.
- Evidence note: `rp5_1_baseline_*.png` overwritten (396,260→203,253 / 245,674→162,261) under RP5.1-PASS-cited names; refresh disclosed with verbatim bytes in inbox + DS log (honest, but verdict-cited files are immutable — carried as F2).

### [2026-09-09 11:35] REVIEW: RP5.2 [FAIL ❌] (cycle 1 — consecutive_fails: 1)
- Submission: seq 3 RP5/RP5.2 (repaired order). Delimiter ✅. Suite OP-run 844/844 ×243 ✅ (focused 14/14 = 5 tab5 + 9 schedules_projections, verified).
- Probes: `scratch/op_rp52_probe.mjs` 16/16 (tie-outs, NI link, column math, literals) · `scratch/op_rp52_live.mjs` 10/11 (F1 below) · `scratch/op_rp51_probe.mjs` 20/20 (unregressed) · current captures 1280 + 390 viewed (H1 invariants exact; FY25 rev/sub pins). Instruments unmodified.
- F1 product label-only units toggle (`:676-687` redraws with stale closure scale; live $1,193,854→$1,193,854 under millions label). Fix: rebuild columns/render on setUnit + click-path figure regression test.
- F2 protocol (inbox order repaired; verdict-cited screenshot overwrite → immutable uniquely-named captures).
- A1 cosmetic: "Figures in $ in thousands." double-in.
- Signal: `status_ds.json` → worker_active/RP5/RP5.2 seq 3. Watcher re-armed baseline seq 3.

### [2026-09-09 11:45] REVIEW: RP5.2 [PASS ✅] (cycle 2 — consecutive_fails reset to 0) — GATE PASSED
- Resubmission: seq 4 RP5/RP5.2. Delimiter ✅. Suite OP-run 844/844 ×243 ✅ (focused 14/14 = 5 tab5 + 9 schedules_projections, verified).
- Probes: `scratch/op_rp52_probe.mjs` 16/16 · `scratch/op_rp52_live.mjs` **11/11** (F1 rescale $1,193,854→$1,194 live + round-trip; subtitle fix live; 0 errors) · `scratch/op_rp51_probe.mjs` 20/20 (unregressed) · new captures rp5_2_1280 + rp5_2_390 viewed (byte-exact; ref_05-conformant); rp5_1 files untouched. Instruments unmodified. Mock harness derives state from rendered markup — accepted.
- F1 closed (setUnit→render with defect-class comment; click-path figure test). F2 closed (tail order; uniquely-named evidence; repair receipt per DS log). A1 closed.
- Verdict ledger RP5: RP5.1 ❌→✅ · RP5.2 ❌→✅ (3 FAILs, each 1-resubmission remediation).
- GATE MECHANICS (manual RP-aware; tool RP-incompatible): inboxes + signals archived to `docs/logs/inboxes/redesign_phase_5/` → live inboxes reset → signals reset RP6/RP6.1 seq 0 (status_op idle, status_ds worker_active) → `docs/status.md` RP5 🟢 Done, RP6 🟡 Active (awaiting kick-off). NO commit/tag — Director authority. Watcher NOT armed (gate terminal).

### [2026-09-09 12:55] POST-GATE ADDENDUM: cross-tab control conformance (Director challenge)
- Director asked how RP5/RP6 passes square with tabs 01–03. OP ran `scratch/op_consistency_sweep.mjs` (unscoped — invalid for per-tab attribution; superseded) + `scratch/op_header_conformance.mjs` (pane-scoped — valid).
- Headers: CONFORMANT — every card header on tabs 03/04/05/06 computes 15px/700 + 3px solid rgb(26,86,219) + transparent + borderless + 10px pad (6/6 Tab 05, 9/9 Tab 06 live).
- Figures: CONFORMANT — cross-tab engine pins tie out (RP2 matrix, corpus filings, H1 invariants, P6R3/P8 method pins).
- Controls: DIVERGENT — Tab 05 statement switcher is a close rectangular-group cousin (4px/7px 12px vs statement-pill 4px/6px 14px), but Tab 05's Thousands/Millions toggle is rectangular (`.projection-unit-toggle`, 6px/white-on-grey-block) where the RW2.2 ruling mandates the round capsule (`.pill-control` 20px + `.pill-btn` 16px) for that exact function on Tab 04. Same function, adjacent tabs, different language. Audit gap: RP5.2 contract specified no control pattern and OP verified behavior, never conformance.
- Recommendation: RW-style rework on RP5 (units toggle → canonical capsule; switcher padding → 6px 14px) now, or carry to RP9 polish per the earlier-tab-backlog order. Awaiting Director ruling — verdicts stand on their figure-truth gates either way.
