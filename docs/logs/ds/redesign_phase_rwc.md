# DS Log — Consistency Rework Round 1 (RWC.1)

> Append-only. Worker (`DS`) audit trail.

---

### [2026-09-09 22:55] [DS] — SUB-PHASE VERIFIED: RWC.1 [Cross-Tab Figure, Narrative & Control Conformity]

**Authority**: Director order 2026-09-09 via `docs/inbox_ds.md` REWORK ORDER (13:05) + ADDENDUM RWC.1d (13:15). Contract `docs/phases/redesign_phase_rwc.md` §§2–5. Cold-start per `docs/howtowork.md` §2 (DSreflection → DSmemory → status → signal reconciliation → phase spec). Reconciliation: incoming `inbox_ds.md` 2 blocks vs `status_ds.json.seq` 1 → addendum landed without signal bump (lane already worker_active); both orders processed as RWC.1a–d. Outgoing `inbox_op.md` 0 blocks == `status_op.json.seq` 0 → balanced.

**RWC.1a (Tab 07 Rule of 40 — single definition)**:
- Before: `summaryTab.js:371-377` read `dcf.schedule[last].fcf` (591,200.80 → 27.0%) → card 43.1%; null fallbacks `33.9%`/`16.5%`/`50.4%`; CAGR label baseless.
- After: FCF margin reads `threeStatement.cashFlow.FY2030.free_cash_flow` (686,125.93 → 31.35% → 31.4%) + CAGR FY2025–FY2030E (16.10% → 16.1%) → card + citation 47.4% = 31.4% + 16.1%; citation names base explicitly; null path dashes everywhere; zero vintage literals in file.
- Evidence: live probe `scratch/ds_rwc1_verify.mjs` (F1 card true/true/true, null-dash true); real-browser summary pane reads 47.4% + `FCF (31.4%) + CAGR FY2025–FY2030E (16.1%)` + citation `31.4% … 16.1% … = 47.4%`; capture `scratch/ds_rwc1_summary_1280.png` (387,017b sha:5856df29) viewed.

**RWC.1b (Tab 08 derived narratives)**:
- Before: `sensitivityTab.js:188` base `33.9%` (live 31.35%), `:202` upside `38.0%` (unverifiable).
- After: `scenarioTerminalMargin()` + `scenarioMarginClause()` derive per-scenario FY2030 margin from that scenario's own threeStatement engine at render; base reads 31.4% live, bull 39.2% (engine 39.22%), bear 24.6% (no % in static downside copy, untouched); zero `33.9%`/`38.0%` in file and rendered descs.
- Evidence: `scratch/ds_rwc1_verify.mjs` (bear 24.63% / base 31.35% / bull 39.22%; base-desc 31.4 true, bull-desc 39.2 true); capture `scratch/ds_rwc1_sensitivity_1280.png` (143,014b sha:408c422d) viewed — Base `31.4% terminal FCF margin`, Upside `39.2% terminal FCF margin`; pins undisturbed (84.39/144.08/277.84); suite green.

**RWC.1c (Tab 05 canonical units capsule)**:
- Before: `.projection-unit-toggle` rectangular (6px radius, blue block) + buttons 4px/7px-12px blue-active; switcher 7px-12px.
- After: units toggle rebuilt as `.projection-unit-toggle pill-control` + `pill-btn projection-unit-btn` (Tab 04 `units-mode-toggle` reference); legacy `.projection-unit-toggle`/`.projection-unit-btn` CSS reduced to empty comment-only aliases (RWC.1c); `data-projection-unit` contract unchanged; switcher buttons padding aligned to 6px 14px.
- Evidence: probe `scratch/ds_rwc1_pill_probe.mjs` — container 20px radius; inactive pill `16px|6px 14px|transparent` byte-identical to Tab 04 reference; active pill white/blue `16px|6px 14px`; rescale + round-trip live (`$1,193,853.52` → `$1,193.85` → round-trip exact, RP5.2 F1 regression green); capture `scratch/ds_rwc1_projections_1280.png` (204,965b sha:11d25c1b) viewed; test maintenance disclosed below.

**RWC.1d (Tab 06 beta relabel + reframe)**:
- Before: heading `Duolingo Single-Stock OLS Regression & Vasicek Cross-Check` (raw 0.89 shown next to 1.47, shrinkage implied but never performed).
- After: heading `Single-Stock Regression Cross-Check`; transparency framing paragraph (too imprecise to opine, CI contains 1.47); verbatim Director footnote rendered via live-derived builder (no >999 literals in source — literal-gate compliant): months from `fmtYm(reg.windowStart/End)` → Sep 2021 / Aug 2026, β/SE/R²/median from `reg` + `peerStats` → 0.89 / 0.52 / 4.8% / 1.47; rendered copy byte-matches Director text including CI `-0.15 to 1.93`.
- Evidence: `scratch/ds_rwc1_verify.mjs` (footnote verbatim true, no Vasicek true, CI true); capture `scratch/ds_rwc1_valuation_1280.png` (707,096b sha:bdf91f90) viewed; 1.47 anchors (HUD, lever 2, derivation header), 0.89 transparency-only.

**Tests**:
- New `tests/redesign.rwc1.test.js` (5 tests: RWC.1a ×2 rendered-card + null-dash/source-gate, RWC.1b engine-tie-out + pins + source-gate, RWC.1c capsule smoke, RWC.1d verbatim/CI/no-Vasicek).
- Maintenance (one-line rationale each, no expansion): `tests/redesign.tab5.test.js` +1 RWC.1c capsule + round-trip test (`data-projection-unit` contract unchanged — RP0 precedent); `tests/beta.peers.test.js` Vasicek-header → Single-Stock header + no-Vasicek assert (RWC.1d rename); `tests/ui.valuation_summary_sensitivity.test.js` expected-R40 basis `dcf.schedule` → `threeStatement.cashFlow` (RWC.1a single-definition).
- Full suite: **852/852 PASS × 247 suites** (baseline 846 + 6 new), 0 flakes ×1 run this session.

**Captures (uniquely-named, hash-checked, 0 console errors)**: `ds_rwc1_projections_1280.png` 204,965b 11d25c1b · `ds_rwc1_valuation_1280.png` 707,096b bdf91f90 · `ds_rwc1_summary_1280.png` 387,017b 5856df29 · `ds_rwc1_sensitivity_1280.png` 143,014b 408c422d · `ds_rwc1_projections_390.png` 163,132b b69ed1ea · `ds_rwc1_summary_390.png` 325,142b 69b0e36d · `ds_rwc1_sensitivity_390.png` 119,389b 43d0c05f. Console errors: 0 throughout.

**Out of scope untouched**: engine math, corpus (706), MKT/methods/pins (144.08/141.59/116.20/240.43/141.59/443.68; 84.39/144.08/277.84), Tab 06 levers, B1/B2/B3 → RP9, scroll/legend friction advisories.

**Submission**: `SUBMISSION: RWC.1` appended to `docs/inbox_op.md`; `docs/status_op.json` → review_pending seq 1. Watcher NOT armed per RWC lane rule — Director prompts OP for review (RW precedent). HALT.

---

### [2026-09-09 23:15] [DS] — SUB-PHASE RESUBMISSION VERIFIED: RWC.1 (Resubmission — cycle-1 FAIL F1+F2 closed)

**Verdict under repair**: `REVIEW: RWC.1 [FAIL]` cycle 1 (`inbox_ds.md` 13:40, `status_ds.json` worker_active seq 2, consecutive_fails 1). Guarded reset done: `status_op.json` review_pending → idle (seq 1, no bump). Delimiter asserted. Green lanes retained as audited.

**F1 [Footnote CI now live-derived]** (`src/ui/valuationTab.js`): added `tCrit = 2.002` with documented source (Student-t 0.975 quantile, df = n-2 = 58) + `ciLo/ciHi = beta ∓ tCrit × SE` at render; footnote now interpolates `${ciLo} to ${ciHi}` instead of the frozen string. Live: 0.8904878 ± 2.002 × 0.5191868 = -0.15 to 1.93 (matches OP-verified math; rendered copy byte-identical today, desync-proof tomorrow). Test extended: `tests/redesign.rwc1.test.js` RWC.1d recomputes CI from the same `regress(prices.json)` object and asserts footnote inclusion (never a string pin).

**F2 [Em dash removed]** (`src/ui/sensitivityTab.js:153`): fallback `'terminal FCF margin —'` → `'terminal FCF margin -'`. Source grep zero `—` in file; rwc1 test asserts zero em dashes in rendered descs.

**Evidence**: `scratch/ds_rwc1_resub_verify.mjs` — CI -0.15 to 1.93 live, footnote match true, no frozen mismatch, no em dash, fallback hyphen live, t-critical documented. Prior proof bar stands (F1a 47.4%/31.4%/16.1%, F2 descs 31.4/39.2, F3 capsule byte-identical + round-trip, RWC.1d 1.47 anchors). Suite **852/852 × 247** green. Captures unchanged (rendered copy identical): summary 5856df29, sensitivity 408c422d, projections 11d25c1b, valuation bdf91f90 (+390s), 0 console errors.

**Resubmission**: `SUBMISSION: RWC.1 (Resubmission)` appended; `status_op.json` → review_pending seq 2. Watcher NOT armed per lane rule — Director prompts OP. HALT.
