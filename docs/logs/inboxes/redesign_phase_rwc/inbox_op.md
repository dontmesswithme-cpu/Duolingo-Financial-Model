# Reviewer Inbox (OP Inbox)

> **Channel**: Worker (`DS`) ➔ Reviewer (`OP`)
>
> **Rule**: DS appends sub-phase submissions and resubmissions here. Every message MUST end with `[END_OF_MESSAGE]`.

---
### [2026-09-09 22:55] SUBMISSION: RWC.1 [Consistency Rework — Figures, Narratives, Controls + Beta Reframe]

**Contract**: `docs/phases/redesign_phase_rwc.md` §§2–5 (RWC.1a/b/c + §5 RWC.1d). Full log: `docs/logs/ds/redesign_phase_rwc.md`.

- **RWC.1a**: `src/ui/summaryTab.js` — FCF margin now reads `threeStatement.cashFlow.FY2030.free_cash_flow` (686,125.93 → 31.4%); card + citation **47.4% = 31.4% + 16.1%** with `FY2025–FY2030E` base named; null-path dashes (zero `33.9/16.5/50.4` in file). Live browser: `47.4%` + `FCF (31.4%) + CAGR FY2025–FY2030E (16.1%)` + citation `= 47.4%`.
- **RWC.1b**: `src/ui/sensitivityTab.js` — `scenarioTerminalMargin()` derives base/bull margins from their scenario engines (base **31.4%**, bull **39.2%**, bear 24.6%); zero `33.9%`/`38.0%` in file and rendered descs; pins 84.39/144.08/277.84 undisturbed.
- **RWC.1c**: `src/ui/projectionsTab.js` + `index.html` — units toggle rebuilt as `.pill-control` + `.pill-btn` (Tab 04 reference); legacy unit classes empty aliases; switcher padding 6px 14px; `data-projection-unit` contract unchanged. Probe: inactive pill `16px|6px 14px|transparent` identical to Tab 04; rescale `$1,193,853.52` → `$1,193.85` → round-trip exact.
- **RWC.1d**: `src/ui/valuationTab.js` — heading `Single-Stock Regression Cross-Check`; Vasicek claim removed; transparency reframe + CI `-0.15 to 1.93`; verbatim Director footnote live (derived months/β/SE/R²/median → Sep 2021 / Aug 2026 / 0.89 / 0.52 / 4.8% / 1.47, zero >999 literals in source). 1.47 anchors; 0.89 transparency-only.
- **Tests**: new `tests/redesign.rwc1.test.js` (5); maintenance `tests/redesign.tab5.test.js` (+1 capsule/round-trip; `data-projection-unit` unchanged), `tests/beta.peers.test.js` (Vasicek → Single-Stock header), `tests/ui.valuation_summary_sensitivity.test.js` (R40 basis → threeStatement). Suite **852/852 × 247** (846 + 6).
- **Captures** (0 console errors): `scratch/ds_rwc1_projections_1280.png` 11d25c1b · `scratch/ds_rwc1_valuation_1280.png` bdf91f90 · `scratch/ds_rwc1_summary_1280.png` 5856df29 · `scratch/ds_rwc1_sensitivity_1280.png` 408c422d · `scratch/ds_rwc1_projections_390.png` b69ed1ea · `scratch/ds_rwc1_summary_390.png` 69b0e36d · `scratch/ds_rwc1_sensitivity_390.png` 43d0c05f.
- **Out of scope untouched**: engine, corpus 706, pins, levers, B-lane → RP9.
[END_OF_MESSAGE]
---
### [2026-09-09 23:15] SUBMISSION: RWC.1 (Resubmission) [Cycle-1 FAIL F1+F2 closed]

**Verdict repaired**: `REVIEW: RWC.1 [FAIL]` cycle 1 (13:40, consecutive_fails 1). Green lanes retained.

- **F1**: footnote CI now computed at render — `tCrit = 2.002` (Student-t 0.975, df = n-2 = 58, documented) + `beta ∓ tCrit × SE` → `-0.15 to 1.93` live (0.8904878 ± 2.002 × 0.5191868). Test asserts footnote-CI == recomputation from same `regress()` object.
- **F2**: `sensitivityTab.js:153` em dash → hyphen (`terminal FCF margin -`); zero `—` in file and rendered descs.
- **Evidence**: `scratch/ds_rwc1_resub_verify.mjs` all true; suite **852/852 × 247**; captures unchanged (copy identical), 0 console errors.
[END_OF_MESSAGE]
