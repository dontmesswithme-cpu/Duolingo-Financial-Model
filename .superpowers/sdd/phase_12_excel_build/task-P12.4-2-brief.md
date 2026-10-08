# Brief — Task P12.4-2: 17_Checks + C2 plug-magnitude tripwire

## Requirements (from docs/phases/phase_12_excel_build.md §4 P12.4-A/B, plus carried C2)
- New sheet `17_Checks` ONLY (18th tab, last in contract order after 16_Scenarios_Sens). Do not change any existing cell value on 00–16 (additive names/ranges allowed if disclosed, no value changes).
- Contents — each check row has tolerance + turning indicator (OK/BREAK), all green on ship:
  - BS balance every period (13_BS assets = liabilities + equity, within Tolerance_USD)
  - Cash roll ties CF→BS (14_CF ending cash = 13_BS cash, every period)
  - Bookings-to-deferred bridge (06_Revenue_Bookings roll: opening + additions − recognition = ending, per period, within Tolerance_USD — reuse P12.2 C4 wiring, do not rebuild it)
  - Share-count checks (FD 50061458, canonical divisor 67562285.30, finite roll 66893351.78, h5 divisor 57502257.06 — each stated with provenance, within $1/rounding)
  - Formula/error flags (no #REF!/#VALUE!/#NAME?/#DIV/0! workbook-wide; volatile scan clean)
  - C2 plug-magnitude / residual tripwire (binding carry from P12.1 F3 → P12.4): any balancing plug or residual leg exceeding tolerance trips to BREAK. Must be a real magnitude gate, not a presence check. Include at least: NWC residual (production −293206.94 vs helper −293292.19 delta +85.26 stated), EV bridge footing (EV 6181615.23 + net cash 1435448.73 = equity 7617063.96), DCF stage footing (pvExplicit 3109718.43 = 1457943.74 + 1651774.69; EV = pvExplicit + pvTerminal 3071896.80).
- Every threshold computed by scratch/*.mjs from a live engine run and asserted at build time; never hand-typed.
- Named ranges for all downstream refs; no bare A1 cross-sheet refs; blue-input/black-calc; frozen as-of; no TODAY/OFFSET/INDIRECT/NOW/RAND/EDATE/CELL/INFO.

## Frozen anchors (verbatim — do not re-derive differently)
- Tolerance_USD $1k legs / $0.01 per-share (named Tolerance_USD already on workbook; reuse it)
- EV 6181615.23; net cash 1435448.73; equity 7617063.96; pvExplicit 3109718.43 (1457943.74 + 1651774.69); TV 8221173.53; pvTerminal 3071896.80
- NWC production −293206.94 (−293206.9362068829); superseded-basis −293292.19 (−293292.1946155161); recon +85.26 (+85.25840863323538)
- Shares: FD 50061458; canonical divisor 67562285.30 → 112.74 (112.74136); finite 66893351.78 → 113.87 (113.86877); spot 152.15 (152.15425); h5 divisor 57502257.06 → 119.2552 / 120.4478 / EV 5421997.20
- WACC 11.1225%; g 2.5%; Stage1 FY2026–FY2030 (ends 2030), Stage2 FY2031–FY2035 (begins 2031)
- Served file: assets/excel/muse-spark-1-3-contributor-free/duolingo-fm_phase10_20261006.xlsx (17 tabs 00_Cover…16_Scenarios_Sens today; 17_Checks becomes 18th)

## Global constraints (binding)
- Scope lock (§7): Excel file ONLY. No index.html/src/tests/api/tools writes. No wiring. No commit/tag/push/archive. Real-UTC stamps.
- Anonymity (§3): author Faraz Shaikh only; zero prohibited strings (model name, DS, OP, SUB, DIR, AI, assistant, bot, provider names) in XML/surfaces; AI banned on surfaces (ML-cloud).
- Scenario switch stays INACTIVE (01 C7 inactive, 04 deltas REFERENCE-ONLY). Prove_c34 must stay green with 0 Control_Scenario consumers — keep Base/Bear/Bull out of formula-referenced names (P12.4-1 lesson: *_Headline, not *_Base).
- Carry P12.4-1 reviewer minors: (1) verifier BANNED must include CELL|INFO to mirror build guard; (2) assert ALL new names on 17 (loop over grid/check names), not a subset.
- Verifier gate: extend scratch/verify_p12_4.mjs with Task-2 block — live-evaluate every new formula cell vs cache, re-derive each footing from the sheet's own cells, assert all OK/BREAK rows read OK, no Data Tables/no volatile workbook-wide, and 2 turn probes (e.g. break a BS leg by $2k; break cash roll by $2k → shipped check flips OK→BREAK through the same evaluator).

## Done means
- scratch/build_p12_4_checks.mjs (or equivalent) with throw-gated asserts, 0 hand-typed figures
- verifier Task-2 block green + FULL regressions green (verify_p12_4 Task-1 + verify_p12_3 TASKS=1,2 + verify_p12_2 v4 + verify_p12_1 v2 + prove_c34 + probe_b4_negative)
- git status: only untracked assets/excel + .superpowers; zero tracked mods
