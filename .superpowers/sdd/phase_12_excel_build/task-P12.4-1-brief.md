# Brief — Task P12.4-1: 16_Scenarios_Sens (precomputed, no live Data Tables)

## Requirements (from docs/phases/phase_12_excel_build.md §4 P12.4-A, plus Phase 11 verdict terms)
- New sheet `16_Scenarios_Sens` ONLY. Do not touch 00–15 values (additive names/ranges allowed if disclosed, no existing cell value changes).
- Contents:
  - bull/base/bear outputs (per-share lanes, EV/equity legs — state basis + vintage on-sheet)
  - precomputed WACC-vs-g grid (9x5 shape per P11 verdict; values computed by scratch/*.mjs from the SAME engine basis as headline, then written as frozen values + formulas that read them — NO live Excel Data Tables)
  - key operating sensitivities (at least revenue/CAGR, margin, SBC/dilution drivers — state basis + vintage)
- Every figure computed by a scratch/*.mjs script from a live engine run and asserted at build time; never hand-typed.
- Named ranges for all downstream refs; no bare A1 cross-sheet refs in downstream formulas.
- Blue-input / black-calc discipline; frozen as-of values; no TODAY/OFFSET/INDIRECT/NOW/RAND/EDATE anywhere.

## Frozen anchors (verbatim, from OPmemory 2026-10-07 — do not re-derive differently)
- WACC 11.1225% (0.111225); g 2.5% (0.025)
- FCFF FY26–35: 73906.95 / 368200.98 / 431125.54 / 504377.99 / 591200.80 / 662062.54 / 707946.16 / 734007.98 / 736696.04 / 714352.14
- pvExplicit 3109718.43 (1457943.74 + 1651774.69); TV 8221173.53; pvTerminal 3071896.80; EV 6181615.23
- rolled cash 1199776.73; net cash 1435448.73; equity 7617063.96
- FD 50061458 → spot 152.15 (152.15425); canonical 112.74 (112.74136, divisor 67562285.30); finite 113.87 (113.86877)
- Five-period lane (complete h5 chain): EV 5421997.20, divisor 57502257.06, canonical 119.2552, finite 120.4478, legacy 161.1143
- Stage 1 FY2026–FY2030, Stage 2 FY2031–FY2035 (from 04_Assumptions names Stage1_Last_Year=2030, Stage2_First_Year=2031)
- Served file: assets/excel/muse-spark-1-3-contributor-free/duolingo-fm_phase10_20261006.xlsx (16 tabs 00_Cover…15_DCF today; 16_Scenarios_Sens becomes 17th)

## Global constraints (binding)
- Scope lock (§7): Excel file ONLY. No index.html/src/tests/api/tools writes. No wiring. No commit/tag/push/archive of the binary. Real-UTC stamps.
- Anonymity (§3): author Faraz Shaikh only; zero prohibited strings (model name, DS, OP, SUB, DIR, AI, assistant, bot, provider names) in workbook XML or surfaces. R4: `AI` banned on surfaces — use ML-cloud.
- Scenario switch stays INACTIVE (P12.2 C3 honest-relabel stands: 01 C7 inactive, 04 deltas REFERENCE-ONLY). Do not re-wire it here.
- Verifier gate: extend scratch/verify_p12_3.mjs or add scratch/verify_p12_4.mjs Task-1 block that live-evaluates every new formula cell vs cache, re-derives grid center + scenario rows from the sheet's own inputs, asserts no Data Table / no volatile, and includes 1 turn probe (mutate a WACC input in-memory → shipped check flips to BREAK).

## Done means
- scratch/build_p12_4_sens.mjs (or equivalent) with throw-gated asserts, 0 hand-typed figures
- verifier Task-1 block green + full regressions green (verify_p12_3 TASKS=1,2 + verify_p12_2 v4 + verify_p12_1 v2)
- git status: only untracked assets/excel + .superpowers; zero tracked mods
