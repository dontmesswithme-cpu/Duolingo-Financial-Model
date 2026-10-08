# Report — Task P12.4-1: 16_Scenarios_Sens (precomputed, no live Data Tables)

## What was implemented

New sheet `16_Scenarios_Sens` ONLY (17th tab, last in contract order). No existing cell on 00–15 changed value (additive workbook-level names + sheet-order slot only, disclosed here). Tab color `7C3AED` (valuation group, same as 15_DCF); frozen panes ySplit 4 / xSplit 1; landscape; print titles `4:4`; sheet protection on — all mirroring 15_DCF. P12.4-3 owns final polish/hyperlinks/Cover index (Cover NOT touched).

Sheet geometry: A label (76w) + B..G (15w each), 79 rows:

- **BASIS (rows 5–11):** vintage `built 2026-10-07 (real UTC)` + basis/precomputed/non-production prose; three LIVE pass-throughs (black formulas): Headline WACC `=Cover_WACC` (`Sens_WACC_Headline`), Headline g `=Cover_TerminalGrowth` (`Sens_G_Headline`), Headline canonical `=DCF_PerShareCanonical` (`Sens_Headline_Canonical`). States: dated-seam ten-period canonical basis (WACC 11.1225%, g 2.5%); frozen values below; no Data Tables; lanes reference-only; **01_Control switch stays INACTIVE, 04 deltas remain reference-only** (no re-wiring; 0 `Control_Scenario` consumers).
- **SCENARIOS (rows 12–31):** 10 metric rows × Bear/Base/Bull cols — WACC, g, EV, net cash, equity, canonical / finite / spot per-share lanes, FY2026 revenue + operating income anchors. Engine: full chain per scenario through `scenarios.apply` (bear/bull move 38 drivers; base moves none). Shipped: bear EV 2605834.33 / canon 61.47; base EV 6181615.23 / canon 112.74 (== headline); bull EV 15193780.10 / canon 238.07. Checks: base==headline $0.01, bear<base<bull (canon + EV), equity==EV+netCash per column ($1k), spot>canon per column.
- **9×5 GRID (rows 32–54):** WACC ±200 bps in 50 bps steps (9 rows, B col) × g 1.0%–3.0% in 50 bps steps (C..G). Axes mirror the engine's own grid defaults (`recommend.js`); every VALUE is a full dated-seam canonical revaluation (WACC via risk-free driver preserving marking/asOf/source, g via terminal driver, SBC roll fixed, three-statement reused — documented on-sheet). Centre (WACC base, g 2.5%) == headline 112.74. Range 148.53 .. 89.76. Checks: axis low/high/mid vs live basis, g axis 1.0/3.0 + headline-g column, centre==headline $0.01 (turn-probe target), 4 corner-trend checks. Full 45-cell monotonicity asserted at build + in verifier (ruling: corners on-sheet, exhaustive proof in scripts — stated on-sheet).
- **OPERATING SENSITIVITIES (rows 55–77):** one-way full-chain revaluations (base==headline each): revenue ±100 bps `paid_subscriber_growth` (109.59/112.74/115.97); margin ±100 bps `cost_of_revenue_pct_revenue` (116.49/112.74/108.99); SBC ±100 bps `sbc_target_pct_of_revenue` (112.89/112.74/112.60 — small by construction, add-back offsets expense, disclosed); dilution d_perm 0%/1%/2% (113.87/112.74/111.64). Live delta formulas (low−base, high−base) + base==headline and 8 direction checks.
- **Names (~112 new, all on 16):** `Sens_WACC_Headline`, `Sens_G_Headline`, `Sens_Headline_Canonical`, `Sens_Center`, `Sens_WACC_1..9`, `Sens_G_1..5`, `Sens_Grid_R*C*` (44 + centre), `Scen_{Bear,Base,Bull}_{WACC,G,EV,NetCash,Equity,Canon,Finite,Spot,Rev26,OpInc26}` (33), `OpSens_{Rev,Margin,SBC,Dil}_{Down,Base,Up,DeltaLow,DeltaHigh}` (20). No bare cross-sheet refs in any new formula (v4 bare-ref scan green).

Scripts:
- `scratch/build_p12_4_sens.mjs` (new): **218 throw-gated asserts**, 0 hand-typed figures (grid axes are the engine's documented defaults; all values live-computed). Pins all brief frozen anchors first (WACC/g, 10 FCFF, pvExplicit/TV/pvTerminal/EV, rolled/net cash/equity, spot 152.15, canonical 112.74 + divisor, finite 113.87), then scenarios/grid/opsens with structural asserts (orderings, footings, monotonicity, axis steps). Volatile + Data-Table guard over all 1150 formula cells.
- `scratch/verify_p12_4.mjs` (Task-1 gate): rewrote the pre-flight draft (it sketched 5 WACC rows contradicting the brief's 9×5, and a premature 19-tab gate). Now: 17-tab order; 45 formula cells live-vs-cache (0 errors/mismatches); sheet-internal re-derivations (headline tracks DCF, centre+base OK, footings, axes, deltas, 30 check rows / 34 cells all OK); independent engine agreement (10 scenario lanes ×3, all 45 grid cells, 12 opsens lanes, strict monotonicity both directions); TABLE(/volatile scans; **2 turn probes** (Cover WACC +200 bps, Cover g +100 bps → shipped centre check OK→BREAK); labelling + names checks; full regressions inside.
- `scratch/verify_p12_3.mjs`: ORDER extended 16→17 tabs + message (only change; Task 1/2 logic untouched).

## Tests / verification (exact commands + output)

- `node scratch/build_p12_4_sens.mjs` → 218 asserts, `volatile/Data-Table scan: 1150 formula cells, 0 hits`, `WROTE …duolingo-fm_phase10_20261006.xlsx`, `sheets: 00_Cover,…,15_DCF,16_Scenarios_Sens`. Exit 0.
- `node scratch/verify_p12_4.mjs` → `P12.4 TASK 1: ALL CHECKS HELD`, incl: 17 tabs OK; 45 formula cells 0 errors 0 stale; centre+base OK vs live headline 112.7414; footings/axes/deltas OK; 30 check rows / 34 cells all OK; bear<base<bull (61.47<112.74<238.07); 45/45 grid cells agree with independent revaluation; strict monotonicity both directions; opsens agree; no Data Tables; no volatile; **both turn probes OK→BREAK**; labelling + names OK; `regressions: verify_p12_3 green; verify_p12_2 v4 green; verify_p12_1 green; prove_c34 green; probe_b4_negative green`. Exit 0.
- `node scratch/verify_p12_3.mjs` → `P12.3 TASKS 1,2: ALL CHECKS HELD` (Task 1 + Task 2 incl. 4 turn probes; regressions v4 1150 cells 0/0 + v1 green). Exit 0.
- `P12_3_TASKS=1 node scratch/verify_p12_3.mjs` → `P12.3 TASKS 1: ALL CHECKS HELD`. Exit 0.
- `node scratch/verify_p12_2.mjs` → `formula cells: live-evaluated 1150; live errors 0; cache mismatches 0` + `ALL P12.2 v4 VERIFICATION CHECKS PASSED`. Exit 0.
- `node scratch/verify_p12_1.mjs` → `ALL P12.1 v2 VERIFICATION CHECKS PASSED` (27 parts, anonymity/author/no-macro/no-link scans + turn probe). Exit 0.
- `git status --porcelain` → exactly `?? .superpowers/` + `?? assets/excel/`; zero tracked mods. No commit/tag/push (protocol).
- Iterating failures fixed: (1) verifier grid scan `/^WACC /` matched 11 rows (section header + method note) → narrowed to `/^WACC \d/` (9 body rows); (2) `prove_c34` C3 flagged 4 scenario-keyed IFs — my `Sens_*_Base` names tripped its `base|bull|bear` formula regex (baseline≠switch) → renamed to `Sens_WACC_Headline`/`Sens_G_Headline`; C3 green with 0 `Control_Scenario` consumers (switch still inactive, unwired).

## Files changed

Only (per brief + scope lock):
- `assets/excel/muse-spark-1-3-contributor-free/duolingo-fm_phase10_20261006.xlsx` (untracked binary, 16→17 tabs)
- `scratch/build_p12_4_sens.mjs` (new), `scratch/verify_p12_4.mjs` (rewritten draft → Task-1 gate), `scratch/verify_p12_3.mjs` (ORDER 17-tab edit), `scratch/p12_4_sens_rowmap.json` (new audit artifact) — all git-ignored
- `.superpowers/sdd/phase_12_excel_build/task-P12.4-1-report.md` (this file) + `progress.md` ledger entry — untracked `.superpowers/`
- No `src/`/`tests/`/`api/`/`tools/`/`index.html` writes; no tracked-tree mods; no commit.

## Self-review findings

- Completeness: all three brief blocks present with basis+vintage on-sheet; every figure engine-computed + asserted (218 build asserts + independent verifier recomputation, never the same expression restated — F1 lesson applied: checks compare frozen values against LIVE Cover/15_DCF cells, and the verifier recomputes from the engine).
- Quality: blue-frozen/black-live discipline via the same helpers as 15_DCF; evaluator grammar respected (IF/ABS/comparisons only, no SUM/AND); all 45 formula cells cache-exact; 30/30 check rows OK.
- Discipline: anonymity green (v1 unzip+grep, author Faraz Shaikh); 00–15 proven untouched by green v3+v4 engine/cache parity; scope lock held; no subagents dispatched.
- Testing: real behavior throughout (live engine runs, in-memory mutation probes, raw-XML v4/v1 proofs) — no mocks.

## Concerns

1. Pre-flight `verify_p12_4.mjs` draft superseded (5-row grid guess vs brief 9×5; premature 19-tab gate). P12.4-2/3 extend this file for 17/18 — the Task-1 block is structured for that.
2. C3's `base|bull|bear` formula regex is substring-crude; the `*_Headline` rename is honest (names never meant the switch) but any future IF referencing a `*Base*`/`Scen_*` name will trip it again — P12.4-2/3 should keep `Base/Bear/Bull` out of formula-referenced names.
3. Cover index has no 16 hyperlink and tab-color grouping/final protection policy are P12.4-3 polish scope — intentionally not done here.
4. SBC sensitivity is small (±~0.15) by engine construction (SBC added back; only dilution/tax remain) — disclosed on-sheet; not a defect.
