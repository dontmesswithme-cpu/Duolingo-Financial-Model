# Brief — Task P12.4-3: 18_Summary + whole-workbook polish (C1 disclosed-not-run)

## Requirements (from docs/phases/phase_12_excel_build.md §4 P12.4-A/B/C)
- New sheet `18_Summary` ONLY as new content (19th tab, last in contract order after 17_Checks). Do not change any existing cell value on 00–17 (additive names/ranges allowed if disclosed, no value changes).
- Contents (display-only, engine-true, agreement-only — no new computation):
  - operating forecast, margins, cash flow, valuation (EV 6181615.23 / equity 7617063.96 / canonical 112.74 / finite 113.87 / spot 152.15 + h5 lane 119.2552/120.4478/EV 5421997.20), key sensitivities (WACC-vs-g centre + operating deltas). Every figure a live link to its source tab by name, never re-typed.
- Whole-workbook polish (additive formatting only, no value changes):
  - slate headers, one body font, tabular numerals, accounting `$#,##0;($#,##0);"-"`, `0.0%`
  - frozen panes + print titles on every schedule/statement; landscape fit-to-page
  - tab colors by group (inputs / schedules / statements / valuation / checks); Cover index hyperlinks to each tab INCLUDING 16/17/18 (Task-1 deferral closes here)
  - formula cells locked with sheet protection (password optional, recorded); inputs unlocked and blue
- Anonymity + filename proofs: author Faraz Shaikh only; zero prohibited strings (model name, DS, OP, SUB, DIR, AI, assistant, bot, provider names) in workbook XML/surfaces (ML-cloud, never AI); filename `duolingo-fm_<tag>_<YYYYMMDD>.xlsx` exact per §3 under `assets/excel/muse-spark-1-3-contributor-free/` (provisional tag stays until Director final name — do not rename without order).

## C1 cold-open — DISCLOSED-NOT-RUN (Director-accepted basis)
- The contract gate (desktop Excel + Google Sheets, zero #REF!/#VALUE!/#NAME?, print preview clean) CANNOT run in this environment (no desktop Excel, no browser). Do NOT claim it passes.
- Instead: (1) evaluator + raw-XML proof over all 19 tabs (every formula cell live-vs-cache, 0 errors/mismatches, volatile + Data-Table scans clean), (2) C1 matrix sheet/section in the workbook or verifier output marked NOT-RUN in real Excel/Sheets with the substitute evidence cited, (3) real-UTC stamp + environment statement. The matrix turns green only on a real Excel+Sheets run outside this environment.

## Frozen anchors (verbatim)
- EV 6181615.23; net cash 1435448.73; equity 7617063.96; pvExplicit 3109718.43; pvTerminal 3071896.80; TV 8221173.53
- Canonical 112.74 (112.74136 / divisor 67562285.30); finite 113.87 (113.86877); spot 152.15 (152.15425); h5 119.2552/120.4478/EV 5421997.20/divisor 57502257.06; WACC 11.1225%; g 2.5%
- NWC production -293206.94; superseded -293292.19; recon +85.26; Tolerance_USD $1k / $0.01 per-share
- C2 bound 7.5% of revenue (ruled 2026-10-07 19:50 UTC, supersedes 3.0%); scenario switch stays INACTIVE (prove_c34 green, 0 Control_Scenario consumers — keep Base/Bear/Bull out of formula-referenced names)
- Served file: assets/excel/muse-spark-1-3-contributor-free/duolingo-fm_phase10_20261006.xlsx (18 tabs today; 18_Summary becomes 19th)

## Carry P12.4-1 reviewer minors (close here or state why deferred to final review)
- (1) verifier BANNED must include CELL|INFO to mirror build guard; (2) assert ALL new names on 16/17/18 (loop), not a subset.

## Global constraints (binding)
- Scope lock (§7): Excel file ONLY. No index.html/src/tests/api/tools writes. No wiring. No commit/tag/push/archive. Real-UTC stamps.

## Done means
- scratch/build_p12_4_summary.mjs (or equivalent) with throw-gated asserts, 0 hand-typed figures
- verifier Task-3 block green (19-tab order, 18 live-vs-cache + links-to-source, polish checks, anonymity/filename proofs, C1 NOT-RUN statement) + FULL regressions green (verify_p12_4 Tasks 1+2, verify_p12_3 TASKS=1,2, verify_p12_2 v4, verify_p12_1 v2, prove_c34, probe_b4_negative)
- git status: only untracked assets/excel + .superpowers; zero tracked mods
