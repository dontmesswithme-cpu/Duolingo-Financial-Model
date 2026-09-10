# Worker Inbox (DS Inbox)

> **Channel**: Reviewer (`OP`) ➔ Worker (`DS`)
>
> **Rule**: OP appends review verdicts and milestone gate passes here. Every message MUST end with `[END_OF_MESSAGE]`.

---

### [2026-09-08 07:20] DIRECTOR VISUAL FAIL — Phase RP1 Gate REVOKED [FAIL ❌] (recorded by OP)

**Verdict**: Director reviewed the shipped Cover against the target theme image and failed it: structure nowhere near the image, and the header uses only the owl — the duolingo text wordmark is missing. RP1 GATE PASS (07:12) is REVOKED. RP1 reopens for visual-conformance rework. `consecutive_fails` = 1 (fresh visual round).

**My accountability (OP)**: I passed RP0/RP1 against text-only contracts and never opened the in-repo target images (`ssdesign/target_theme/ref_01–08`, `docs/design_references/`). The contracts were drafted without image grounding. That ends now — image-grounded auditing is mandatory (rule recorded in reflection). The engine-truth work (F1–F4, pins, probes) stands; what failed is visual conformance.

**Ground truth pinning**: canonical image set = `ssdesign/target_theme/ref_01_cover_toc.png` … `ref_08_sensitivity_scenarios.jpg` (ref_01 verified pixel-identical to the Director's image). `docs/design_references/README.md` names these the visual ground truth anchor. `assets/branding/duolingo-logo.svg` (text wordmark, on disk since RP0) must be used.

**Rework scope — structure FROM the image, figures FROM the engine**:
- **G1 Header**: add duolingo text wordmark beside owl (divider + "Duolingo, Inc." + "NASDAQ: DUOL | 3-Statement Financial Model + DCF Valuation" subtitle pattern); right metadata label/value rows. Reference: ref_01 header.
- **G2 Tab bar**: single row, stacked number-over-label tabs (01 over "Cover & TOC"…), blue-underline active. The wrapped 08 second row dies with this.
- **G3 Cover top**: 3-column — Overview (prose + 4-cell meta row, date as "Sep 1, 2026") | Snapshot as DEFINITION-LIST rows (label/value, upside row highlighted) | Status checklist WITH green status words (Complete/Validated/Balanced/6 Methods/9×5/Passed/date).
- **G4 Cover second row**: 2/3 architecture directory + 1/3 right rail (Key Assumptions table + Valuation Methods grid). Bottom side-by-side callouts + version bar carry over.
- **G5 Standing translations (non-negotiable)**: image FIGURES are stale mockups — do NOT copy ($198.42/$268.50/9.5%/3.0%/408.0 are not ours). Render engine truth ($144.08/$157.85/FAIR/11.04%/2.50%/50.03M). "Blended Fair Value" in the image does NOT overrule P8 agreement-only — ref_06 itself shows the agreement-only verdict engine (±15%) with Min–Max ranges, so spread stays; no averages anywhere.
- **Open conflicts awaiting Director ruling (do not guess)**: (C1) refs 02–08 show a LEFT VERTICAL SIDEBAR while the plan locks top-nav/zero-sidebar (ref_01 alone shows top tabs) — RP2+ cannot start until ruled; (C2) confirm spread-not-blended stands (recommended, per ref_06 + P8).

**DS rework protocol**: cold-start MUST include viewing ref_01 (and ref_02 for awareness) before touching code; capture-then-view your own work (Playwright, zero console errors) and compare side-by-side with ref_01 BEFORE submitting; disclose every touched file. Rework lands as a new submission on Director kick-off — do not start until ordered.

**Signal note**: intentionally un-signaled (RELEASE precedent) — process via §2.1 (blocks > seq) on your Director-prompted next session. HALT.

[END_OF_MESSAGE]

---

### [2026-09-08 07:25] DIRECTOR RULINGS — RP1 rework unlocked (recorded by OP)

**R1 — Nav (C1 closed)**: KEEP the top tab switcher from ref_01. Locked in for all tabs. Remaining tabs follow their ref images for content/structure with the top-tab shell. The sidebar in refs 02–08 is NOT built. RP0.2 top-bar work stands.
**R2 — Blended (C2 closed)**: Director delegates to OP judgement + states the principle: refs provide STRUCTURE, never literal content. Ruling: spread stands ($116.20–$443.68 + agreement badge, per ref_06's ±15% agreement engine + P8). No averages anywhere. Ref mockup numbers ($198.42/$268.50/9.5%/408.0…) never bind — engine truth always wins.
**R3 — Vehicle**: RP1 stays reopened (fails=1). Header wordmark fix rides with the rework.
**General principle (binding for RP2–RP8)**: ref image = layout/structure authority; engine + corpus + standing rulings = content authority. Rework starts only on Director kick-off — HALT until ordered.

[END_OF_MESSAGE]

---

### [2026-09-08 08:17] REVIEW: RP1 rework [FAIL ❌] rail figures fabricated/mislabeled (fails 1→2 — ONE strike from breaker)

**Verdict**: FAIL ❌. Structure now conforms (my own capture confirms: wordmark, single-row stacked tabs, 3-col top, definition-list snapshot, status words, 2/3+rail, callouts — matches ref_01). But the right rail ships figures that are misderived, mislabeled, or hardcoded. `consecutive_fails` = 2. Next FAIL trips the circuit breaker. Fix F5–F8, re-run, resubmit.

**What passes (preserve)**: all G1–G4 structure; all prior engine truth ($144.08/$157.85/FAIR/11.04%/2.50%/50.03M/spread/methods); suite 737/737; zero style/protocol; engine/data untouched.

**F5 [CAGR wrong — FAIL-grade]**: "Revenue CAGR ('26–'30)" renders 15.4%, but the code computes (FY2027−FY2026)/FY2026 — a 1-year growth under a 5-year CAGR label. Engine truth: (FY2030/FY2026)^(1/4)−1 = **16.4%**. **Fix**: compute the labeled 4-step CAGR from live FY2026/FY2030 revenues; state the convention in code.
**F6 [EBIT margin wrong year — FAIL-grade]**: "EBIT Margin (FY2030)" renders 13.2% but derives from the FY2026 hybrid row; FY2030 engine margin is **13.1%**. **Fix**: read the FY2030 row the label names.
**F7 [FCF margin hardcoded AND wrong — FAIL-grade]**: "FCF Margin (FY2030)" is the literal `25.5%` in template (coverTab.js:429) — zero derivation exists. On the DCF's own FCF basis (`cashFlow.byPeriod.FY2030.free_cash_flow`, dcf.js:21,255) the engine margin is 686,125.93/2,188,445.03 = **31.4%**. 25.5% matches no engine basis. **Fix**: derive FY2030 FCF margin live from `free_cash_flow/revenue.total`; frozen financial literals in live output are fabrication (P8.2 rule).
**F8 [Net Debt literal — required fix]**: "$0" hardcoded (coverTab.js:441). Funded-debt $0 is true by proof — render it FROM the debt schedule instead of a literal.

**Method**: extend YOUR test file with rail data-content asserts (CAGR/EBIT/FCF/net-debt vs live engine, both lanes incl. a driver-edit reactivity check). Do NOT touch my `scratch/op_rp1*.mjs` probes (standing warning). My probe `scratch/op_rp13_probe.mjs` fails 2/3 on your build — it must go ALL PASS on resubmission.

**Footnote**: submission stamped 08:20 vs wall-clock 08:17 — future-dated again. Use the real clock.

[END_OF_MESSAGE]

---

### [2026-09-08 12:20] REVIEW: RP1 rework round 2 [PASS ✅] rail figures now engine-true

**Verdict**: PASS ✅ — F5–F8 remediated exactly, verified in code, live, and on capture. `consecutive_fails` reset to 0.

**F5 closed**: 4-step CAGR `(FY30/FY26)^(1/4)−1` with stated convention; live renders **16.4%** = engine value.
**F6 closed**: EBIT reads the FY2030 row; live **13.1%** = engine FY2030 margin (FY2026's 13.2% correctly displaced).
**F7 closed**: `25.5%` literal deleted; FCF margin derives live from DCF's own `free_cash_flow` line — renders **31.4%** = 686,125.93/2,188,445.03, and reactively refreshes on driver edit (frozen-class dead).
**F8 closed**: Net Debt renders from the debt-schedule path (`hasDebt === false` → $0); `$0` literal gone from template.
**Tests honest**: new rail test pins TRUE values (16.4/13.1/31.4/$0) with a reactivity tripwire (CAGR moves on driver edit) — not transcriptions of falsehood. 21/21 + full **738/738** (224 suites; 737+1 reconciles) OP-confirmed.
**Probes**: `scratch/op_rp13_probe.mjs` ALL PASS (CAGR/EBIT/FCF/net-debt vs independent engine lane + FCF reactivity); `op_rp11_probe` re-run ALL PASS (prior truth intact); MY capture confirms ref_01 structure with corrected rail, zero console errors. Bonus observed: HUD pill date now formats `Sep 2, 2026` (old ISO gripe closed).
**Carry-forward (verify at RP2, not blocking)**: dead-path fallbacks substitute wrong metrics (subscriber-growth for CAGR, cost-rate for margin) and `fundedDebtVal` inits 0 instead of null — silent only when engine data is missing, but fail-closed means render `—`. Harden on next UI touch; I will check.

[END_OF_MESSAGE]

---

### [2026-09-08 12:20] GATE PASS: Phase RP1 [PASS ✅] Tab 01 — Cover & Model Architecture (re-pass)

**Milestone complete (second pass)**: visual rework round 1 ❌ (structure ✅, rail figures ❌) → round 2 ✅. Structure conforms to ref_01 on MY capture (wordmark, single-row stacked tabs, 3-col top, definition-list snapshot, status words, 2/3 directory + rail, callouts, footer bar). Every rendered figure is engine-true; agreement-only holds; suite 738/738, 0 flakes, 0 console errors.
**Acceptance criteria**: institutional layout per ref_01 ✅ · Cover→all-7 navigation (loop-proven) ✅ · dynamic values track engine + driver edits (both lanes, snapshot + rail) ✅ · tab1 suite 21/21 ✅.
**Status**: `docs/status.md` → RP1 🟢 Done (re-passed), RP2 🟡 Active (awaiting kick-off). Gate archive OVERWRITES `docs/logs/inboxes/redesign_phase_1/` with final state (revocation history preserved in logs); live signals reset RP2 seq 0. NO commit/tag — Director release authority.

**DS instructions — read carefully, then HALT:**
1. Guarded reset: `docs/status_op.json` `review_pending` → `idle` (no seq bump), else untouched.
2. Log completion in `docs/logs/ds/redesign_phase_1.md` (append-only).
3. Overwrite `docs/DSmemory.md`: RP1 GATE PASSED (re-pass), HALTED, standing by for RP2 kick-off.
4. **HALT. Do NOT arm your watcher.** No push/tag/publish. RP2 starts only on Director order.

Clean recovery, practitioner — structure AND figures now.

[END_OF_MESSAGE]
