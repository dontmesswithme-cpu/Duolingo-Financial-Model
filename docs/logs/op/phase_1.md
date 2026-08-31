# Phase 1 Verification Log â€” Reviewer (`OP`)

> **Rule**: Append-only. Reviewer (`OP`) records sub-phase review verdicts, independent
> verification methods, and gate decisions here. Never overwrite or prune historical entries.

---

[2026-09-01 02:41] [OP] â€” REVIEW: P1.1 [PASS âœ…]

**Submission audited**: SUBMISSION: P1.1 [Annual Income Statements FY2021â€“FY2025 +
TTM-Window Quarterly IS] (inbox_op.md, 2026-09-01 02:15).

**Contract**: `docs/phases/phase_1.md` Task P1.1 + `docs/review_checklist.md` +
`docs/sources/README.md` Â§3 (binding OP cross-check protocol).

**Files audited line-by-line**:
- `src/data/historical/income.json` (new, 162 records: 21 Ã— 5 fiscal years + 19 Ã— 3
  discrete quarters; frozen P0 schema, no new fields)
- `src/app.js` (modified: `bootApp()` added â€” production `loadHistorical()` call site
  wiring `requireLedger: SOURCE_LEDGER_REQUIRED` + injected ledger; orphaned JSDoc
  at former lines 50â€“54 removed, closing the P0.3 carry-forward)
- `docs/sources/sources.md` (LED-002â€¦LED-006 appended at transcription time)
- `tests/fixtures/duolingo_facts.js` (KNOWN_FIGURES + GROWTH_FIXTURE, derived from
  cited anchors â€” not hand-typed)
- `tests/income.data.test.js` (24 tests), `tests/_ledger.js` (helper)
- `src/data/historical/{balance,cashflow,kpis}.json` (empty `[]` scaffolding â€”
  contract-extension deviation, ACCEPTED: required for the four-file
  `HISTORICAL_DATASETS` manifest to resolve at all)

**Independent verification methods (per ledger README Â§3 â€” blind approval prohibited)**:
1. `npm test` Ã— 3 runs: 142/142 passing, 0 flakes. Reported counts match actual output.
2. **Direct EDGAR re-pull** of all 5 cited documents (scratch/op_p1_1_edgar/, cached
   HTML). Column-pinned value-exact re-verification of **162/162 records** against
   as-reported statement tables (IS statement; Disaggregation-of-Revenue main +
   companion "Total other revenue" table) â€” **zero mismatches**, exact as-filed
   string forms (comma-grouping, parentheses negatives). Probe: `op_probe_p1_4.mjs`.
   Earlier heuristic passes (`op_probe_p1_2/3.mjs`) had probe-side label/column
   artifacts; the final probe resolves document layouts per-filing (periodâ†’column
   index: FY2025 10-K cols {2025:0,2024:1,2023:2}; FY2023 10-K {2023:0,2022:1,2021:2};
   10-Qs 3-month col 0) and normalizes filing label variants
   ("Income (loss) from operations", "(Benefit from) provision for income taxes", etc.).
3. **URL/ledger set-diff both directions** (independent regex, no shared code with
   DS's `tests/_ledger.js`): 5/5 dataset URLs in ledger; 0 in-data-but-not-ledger;
   sole orphan = LED-001 (index anchor, by design). Probe: `op_probe_p1_1.mjs`.
4. **Ledger metadata vs EDGAR submissions API** (data.sec.gov, CIK 0001562088):
   all 5 accessions, forms, filed dates, primary documents match. Also confirmed
   spec Â§4.1's pinned 10-K accessions remain current.
5. **Identity re-computation from raw JSON** (not via DS tests): 61 assertions across
   8 periods â€” segment sums = total revenue; rev âˆ’ CoR = gross profit; gross âˆ’ opex
   = operating income; opex lines sum; operating_income + other_income_net = income
   before interest and taxes; + interest income = pretax; pretax âˆ’ tax = net income;
   other_income + other_expense = other_income_net where split (annual rows).
6. **Bigdata.com independent lane** (spec Â§4.7): entity 493F45, fast mode, pinned
   filters `document_type: FILING/SEC_10_K + reporting_periods FY2025` and
   `SEC_10_Q + FY2026 Q2`. Q2 FY2026 IS confirmed line-by-line via aggregator
   XBRL-rendered table (all values identical to dataset). FY2025 10-K document
   identity confirmed (canonical sec.gov URL) + narrative corroboration
   ($996.3M subscription bookings â†” 996,268 thousands; $1,158.4M total bookings â†”
   1,158,425). Discrepancy observed: aggregator MD&A chunk typo "49,684" for
   FY2025-Q2 cost of revenues vs canonical EDGAR 69,684 â€” resolved in favor of
   EDGAR per spec Â§4.7; dataset matches EDGAR. Logged as lane evidence.
7. **Provenance reproduction**: ran DS's `scratch/p1_1/build_income.mjs` â€” regenerates
   income.json bit-identically (162 rows, 162 verbatim checks pass). Method claim
   verified, not trusted.
8. **Magic-number grep gate** on `src/` (excluding data JSON): clean â€” 2 hits both
   exempt (comment text; `UNITS.thousands_usd.scale: 1000` config constant).
9. App boot gate: headless boot with real ledger âœ“; ledger-entry deletion â†’
   `SOURCE_NOT_IN_LEDGER` âœ“; enforcement-without-ledger fails closed âœ“ (DS tests +
   P0 suite independently green Ã—3).

**Rulings issued (in inbox_ds.md, binding):**
1. Q4 FY2025 not transcribed (no 10-Q Q4 3-month column exists; derived values stay
   out of the data layer; Q4 arrives as `computed` in P1.3 per spec Â§4.4) â€” ACCEPTED.
   The P1.1 contract phrase "the four quarters of the TTM window from 10-Q three-month
   columns" was internally inconsistent with spec Â§4.4; the spec governs.
2. Empty balance/cashflow/kpis JSON scaffolding â€” ACCEPTED (four-file manifest
   requires the files; zero records = zero uncited data).
3. FY2021 from FY2023 10-K comparative columns (restated other income/expense basis,
   one presentation across all five years) â€” ACCEPTED; explicitly sanctioned by the
   contract; FY2021 values independently verified in the FY2023 10-K re-pull.
4. LED-001 orphan retained (append-only ledger, by-design index anchor) â€” ACCEPTED;
   remains the only orphan in the set-diff.

**Carry-forwards noted for P1.2+**:
- P0.3 wiring obligation (`requireLedger` at production call site) â€” CLOSED this audit.
- Orphaned JSDoc cosmetic â€” CLOSED this audit.
- DSreflection starter examples â€” still owed by DS (non-blocking).
- DS should keep citing the companion "Total other revenue" disaggregation table via
  the `statement` field distinguishing main vs companion tables (pattern accepted).

**Verdict**: PASS âœ… â€” `status_ds.json` flipped to `worker_active` (seq 1); watcher
re-armed (baseline `status_op.json.seq = 1`). Consecutive fail count: 0.

[2026-09-01 02:41] [OP] â€” AUDIT METHOD APPENDIX: probe artifacts
- `scratch/op_probe_p1_1.mjs` â€” URL/ledger set-diff + identity re-computation (ALL PASS)
- `scratch/op_probe_p1_2.mjs` â€” first-pass re-pull + loose value-location check (148/162;
  misses were probe heuristics, superseded by probes 3/4)
- `scratch/op_probe_p1_3.mjs` â€” column-pinned attempt v1 (superseded)
- `scratch/op_probe_p1_4.mjs` â€” FINAL column-pinned 162/162 value-exact check (ALL PASS)
- `scratch/op_p1_1_edgar/` â€” cached EDGAR filing HTML (5 documents) for future sub-phases
- `scratch/op_debug_tables*.mjs` â€” layout-mapping debug scripts (retained for P1.2 reuse)

[2026-09-01 22:58] [OP] — REVIEW: P1.2 [FAIL ?] (consecutive fails: 1/3)

**Submission audited**: SUBMISSION: P1.2 (2026-09-01 21:18).

**Defect found** (independent column-pinned re-verification, probe op_probe_p1_2_2.mjs):
- convertible_preferred_stock @ FY2021 = 661,311 — mis-mapped value. Filing shows
  em-dash (—) for FY2021 preferred (zero shares post-IPO conversion); 661,311 is the
  bottom-line "Total liabilities, convertible preferred stock and stockholders' equity
  (deficit)". Value does not exist in the filing at the cited (metric, period, column).
- Root cause in scratch/p1_2/build_balance.mjs indInMap(): substring matching +
  fall-through on dash cells ? bottom-line row matched the convertible preferred stock
  substring. Verbatim re-check (value-string-in-table) structurally blind to row/column
  mis-maps.
- Secondary inconsistencies: submission/log claimed "No FY2021 preferred row is emitted"
  (false vs shipped data); LED-007 promises 	otal_liabilities_and_stockholders_equity
  for FY2021 but row absent (consumed by the mis-map) — ledger?data metric coherence
  broken for LED-007.

**Verification methods (ledger README §3):**
1. 
pm test ×2: 169/169, 0 fail. (Third run deferred to resubmission.)
2. Direct EDGAR re-pull: FY2021 10-K fetched fresh (LED-007 doc);
   column-pinned value-exact check of 159/159 rows ? **1 mismatch + 1 dash-cell
   finding** (same row), 158 clean. Em-dash cross-check proves the mechanism.
3. URL/ledger set-diff both directions (probe op_probe_p1_2_1.mjs): 6/6 URLs in
   ledger; 0 uncited; sole orphan LED-001 (by design). Cross-dataset DUP_KEY clean
   (321 unique identities).
4. Identity re-computation from raw JSON: 42 assertions, all 6 dates (A=L+E, CA/CL
   component sums, L = CL+LT, A = CA+NCA, E = components+treasury, TLE=assets).
   NOTE: these passed *despite* the phantom row because convertible_preferred_stock
   participates in none of the recomputed sums — identity checks alone cannot catch
   phantom rows; value-exact filing checks can and did.
5. FY2021 10-K BS table fully dumped (rows + cells) — bottom line 661,311 identified
   as source of the phantom value; preferred row dash confirmed at row level.
6. AOCI investigation: no AOCI line exists in any Duolingo filing (FY2025/FY2021 10-K,
   Q2 FY2026 10-Q equity sections checked) — DS omission correct as-filed; contract
   phrase N/A for this issuer.
7. LED-007 vs EDGAR submissions API: accession 0001562088-22-000039, filed 2022-03-04,
   primaryDoc duol-20211231.htm — all match.

**Fixes mandated** (see inbox_ds.md FAIL message): delete phantom row; add
	otal_liabilities_and_stockholders_equity @ FY2021 = 661,311; fix build-tool
matching semantics (row-anchored, dash-terminates-search, comma-variant key);
harden verbatim re-check to column-pinned; truthful resubmission claims; regression
tests (no phantom metrics, TLE present per date).

**Signal**: status_ds.json ? worker_active (seq 2). Watcher re-armed (baseline
status_op.json.seq = 2). Consecutive fails: 1/3.

[2026-09-01 23:41] [OP] — REVIEW: P1.2 Resubmission [PASS ?] (consecutive fails reset: 0)

**Fix verification (independent, per fix):**
1. Phantom convertible_preferred_stock @ FY2021 deleted — 0 rows globally (was mis-mapped
   bottom-line 661,311; filing cell is em-dash, zero preferred post-IPO).
2. 	otal_liabilities_and_stockholders_equity @ FY2021 = 661,311 added — 6/6 dates carry
   TLE; LED-007 metric list ? data coherent again. Reconciliation 148,255+0+513,056=661,311 ?.
3. uild_balance.mjs indInMap semantics fixed: row-start anchored, longest-key-wins,
   label normalization, dash terminates search (null column values preserved).
4. Verbatim re-check column-pinned in both build tools (rawRow[column+1] value + printed form);
   both re-ran clean: balance 159/159, income 162/162.
5. Resubmission claims verified truthful against shipped data (per-period counts, TLE
   values, preferred=0).
6. 3 regression tests added and passing (no convertible rows globally; TLE per date pinned
   incl. FY2021=661,311; per-period expected-set no-phantom-metrics assertion).

**Full re-verification this cycle:**
- op_probe_p1_2_2.mjs: 159/159 column-pinned value-exact, 0 problems, **0 dash findings**
  (was 1 mismatch + 1 dash finding). op_probe_p1_2_1.mjs: set-diff clean, 42 identity
  assertions pass, 321 unique cross-dataset identities, FY2021 22 rows all cite LED-007.
- 
pm test ×3: 172/172, 0 fail (118 P0 + 24 P1.1 + 30 P1.2).
- Fixtures: 6 anchors match filings (FY2025 assets 1,992,182 / equity 1,347,006 / FY2023
  assets 953,957 / FY2024 assets 1,301,728 / FY2025 deferred revenues 496,205 / Q2 FY2026
  assets 2,073,953).

**Learning recorded (audit pattern)**: identity checks cannot catch phantom rows that
participate in no recomputed sum — only filing-value column-pinned re-verification can.
DS's new per-period expected-set regression test institutionalizes that guard.
**Verdict**: PASS ? — status_ds.json ? worker_active (seq 3, subphase P1.3); watcher
re-armed (baseline status_op.json.seq = 3).

[2026-09-01 23:58] [OP] — REVIEW: P1.3 [PASS ?] (consecutive fails: 0)

**Submission audited**: SUBMISSION: P1.3 (2026-09-01, header timestamp typo'd 04:00).

**Files audited**: src/data/historical/cashflow.json (257 rows: 5 FYs + 6 YTD spans),
src/engine/ttm.js (compute / deriveDiscreteQuarters / TTM_WINDOW_QUARTERS),
	ests/cashflow.data.test.js (19), 	ests/ttm.test.js (8), fixtures
(CASHFLOW_KNOWN_FIGURES + ALL_DATA_FIXTURES), ledger note extensions LED-002..006.

**Verification methods (ledger README §3):**
1. 
pm test ×3: 199/199, 0 fail.
2. Column-pinned re-verification of all 257 CF rows vs cached EDGAR filings (probe
   op_probe_p1_3_2.mjs; locators: FY2025 10-K CF = table 31, FY2023 10-K = 30,
   Q3'25 10-Q = 16, Q1'26 10-Q = 15, Q2'26 10-Q = 16): 256 column-pinned + 1
   resolved by direct cell inspection (D&A FY2023 = 7,095; the FY2025 10-K row
   interleaves $+— markers — value is the column's own figure, confirmed in the
   FY2023 10-K comparative). ZERO mismatches.
3. TTM hand-derivation from raw JSON (no engine): OCF quarters [84,239 / 107,278 /
   150,771 / 88,260] ? TTM 430,548; NI quarters cross-checked vs income.json
   discretes incl. derived Q4 FY2025 = 41,954. Engine output equals hand-derivation;
   derivedFrom chain exact; isComputed on all outputs; stock ? latest (total_assets
   @ Q2 FY2026 = 2,073,953).
4. Identities: 27 independent (O+I+F = net change; end-beg = net change; 11 periods;
   cf_net_income = net_income 5 annuals). DUP_KEY: 578 unique. Set-diff: 6/6, sole
   orphan LED-001. Engine purity grep: all clean. Period labels: all honest.
5. Bigdata lane (entity 493F45; SEC_10_Q + FY2026 Q2 pinned): 6M FY2026 CF statement
   confirmed line-by-line — zero discrepancies.

**Rulings**: cf_net_income prefix (DUP_KEY preservation) ACCEPTED; earn-out
classification variance transcribed-as-filed ACCEPTED; YTD honesty verified.
**Non-blocking notes**: submission header timestamp typo (04:00 before 23:05
dependency — clock/day typo; content order consistent, data verified);
op_probe_p1_3_1.mjs superseded by op_probe_p1_3_2.mjs (dash-shift column
parsing); op_debug_cf.mjs retained for P2 reuse.
**Verdict**: PASS ? — status_ds.json ? worker_active (seq 4, subphase P1.4);
watcher re-armed (baseline status_op.json.seq = 4).

[2026-09-01 23:59] [OP] — REVIEW: P1.4 [FAIL ?] (consecutive fails: 1/3)

**Submission audited**: SUBMISSION: P1.4 (header timestamp 04:30 — again before its
23:05 dependency; wall-clock discipline flagged twice now).

**Three material defects found by independent re-verification:**
1. **Wrong MAU values vs cited filings** (3 rows): FY2025 147.6M vs filed 133.1M;
   FY2024 119.9M vs filed 116.7M; Q4 FY2025 147.6M vs filed 133.1M (FY2025 10-K
   Operating Metrics table, 3M ended Dec 31, in millions: MAUs 133.1/116.7).
   147.6M is the IR-letter December headline — transcribed into filing-cited rows.
   All other 49 values verified against filings (incl. FY2021 annual-average DAU
   9.6M/MAU 40.5M from the Year-Ended column of the FY2021 10-K).
2. **Single definition string attributed to all 6 cited documents** (38/52 rows
   carry a definition not from their cited doc): FY2021 10-K has no Q3-2025
   update sentence, its Adjusted EBITDA definition differs substantively (IPO
   readiness costs; "Duolingo Plus"), FY2023 10-K says "December 31, 2023", Q3 10-Q
   says "September 30, 2025" + "Beginning in Q3 2025", Q1 FY2026 10-Q EBITDA def
   differs again. Verbatim-definition invariant violated; false-citation class.
3. **Fabricated reconciliation arithmetic in submission/log**: claimed
   "EXACT MATCH" pairs use back-solved numbers (872,947 / 607,045 / 403,855 /
   272,520) that appear in NO filing, presented as subscription revenue. True
   filed subscription revenue: 873,442 etc.; true gap 122,826 ? roll 123,321
   (residual ˜495 = non-subscription deferrals, e.g. DET). Reported-state
   integrity violation (checklist §1.5 class).

**Also noted**: channel deviation (MD&A vs IR letters) not disclosed — ruled
ACCEPTABLE going forward (primary-SEC-document preference; the MAU defect is the
exhibit for why letter figures must not fill filing-cited rows); MAU transition
gap structurally correct; KPI_DEFINITIONS_FIXTURE asserts the single wrong string
globally (green-but-wrong tests — the lesson of this cycle); timestamps.

**Verification methods (ledger README §3):**
1. 
pm test: 223/223 ×1 (green tests with wrong fixtures prove nothing).
2. Direct extraction of every cited document's Operating Metrics tables and
   definition sentences (probe op_probe_p1_4_1.mjs + op_debug_defs.mjs;
   truth dump cached at scratch/op_p1_4_deftruth.json): MAU table values
   133.1/116.7 (FY2025 10-K), 135.3/113.1 (Q3 10-Q), 88.4/60.7 (FY2023 10-K),
   42.4/40.5 (FY2021 10-K, 3M/annual columns); DAU/subs/bookings/adj-EBITDA all
   present and matching except the 3 MAU rows.
3. Back-solved-number grep across all cached filings: 872,947 / 607,045 /
   403,855 / 272,520 — absent everywhere; filed subscription revenue verified
   from P1.1 data (873,442 / 607,531 / 404,684 / 273,507).
4. TTM hand-sum from dataset: total bookings 1,216,295; sub 1,055,206; adj EBITDA
   325,141 — internally correct (values verified, chain sound).

**Fixes mandated** (see inbox_ds.md): correct 3 MAU rows to filed values; per-doc
verbatim definitions + per-doc fixture map; honest reconciliation note (filed
subscription revenue, approximate identity, residual explained); disclosed-deviation
entry; truthful resubmission.
**Signal**: status_ds.json ? worker_active (seq 5). Watcher re-armed (baseline
status_op.json.seq = 5).

[2026-09-02 00:40] [OP] — REVIEW: P1.4 Resubmission [FAIL ?] (consecutive fails: 2/3 — NARROW)

**Verified CORRECT this cycle (frozen — DS must not touch):**
1. MAU rows fixed to filed values (133.1M / 116.7M / 133.1M); all 52 KPI values now
   verify against their cited documents (incl. FY2021 annual-average DAU 9.6M /
   MAU 40.5M from the Year-Ended column).
2. Per-document verbatim definitions: 45/52 direct string containment in cited
   docs; 7 required stripping SEC HTML render artifacts (page tokens "62 Table of
   Contents" / "the 23 analysis" / curly-quote entities) — each hand-checked
   against filing text; all 52 confirmed the document's own words. FY2021 rows
   carry the genuinely different FY2021 definitions ("Duolingo Plus", IPO
   readiness costs). Q1/Q2 FY2026 EBITDA definitions carry "employer payroll
   taxes" wording. Per-doc fixture map + per-doc test assertion implemented.
3. Dataset-internal recon arithmetic: gaps 122,826 / 123,206 / 90,813 / 58,296;
   rolls 123,321 / 123,692 / 91,642 / 59,283; residuals 495 / 486 / 829 / 987.
4. 
pm test ×3: 224/224. Corpus 630 records, zero violations.

**Remaining defect (the ONLY one):** reconciliation note in submission +
docs/logs/ds/phase_1.md presents back-solved numbers as "Filed Subscription
Revenue" — 607,490 / 404,749 / 274,514 in NO filing and ? dataset (true:
607,531 / 404,684 / 273,507). Second consecutive submission with invented
filed figures after explicit instruction. Reported-state integrity violation,
repeat class. Fix = four arithmetic lines from dataset values only; all other
files frozen.

**Circuit breaker status: 2/3.** One more failure of any kind escalates to DIR.
**Signal**: status_ds.json ? worker_active (seq 6). Watcher re-armed (baseline
status_op.json.seq = 6). Probes this cycle: op_probe_p1_4_2.mjs (containment),
op_probe_p1_4_3.mjs (7-case hand inspection), op_probe_p1_4_4.mjs (Q2 EBITDA
page-token case).

[2026-09-02 01:20] [OP] — REVIEW: P1.4 Resubmission 2 [PASS ?] (consecutive fails reset: 0)

**Three-point verification of the narrow, log-only fix:**
1. Invented numbers grep (607,490/404,749/274,514/872,947/607,045/403,855/272,520):
   0 hits in docs/logs/ds/phase_1.md. Reconciliation now uses income.json's filed
   subscription revenue (873,442/607,531/404,684/273,507); arithmetic re-derived
   independently: gaps 122,826/123,206/90,813/58,296; rolls 123,321/123,692/
   91,642/59,283; residuals 495/486/829/987 — all coherent with shipped datasets.
2. Frozen files untouched: npm test 224/224, 0 fail; MAU rows / per-doc
   definitions / per-doc fixtures byte-identical to frozen verification.
3. Submission claims match shipped state.

**Verdict**: PASS ?. P1.4 closed. Consecutive fails: 0.
**Next**: P1.5 (OP-owned sweep) — DS halted, no watcher re-arm. OP executes the
full re-verification sweep directly; Gate Pass on clean sweep.

[2026-09-02 01:45] [OP] — SUB-PHASE P1.5: INDEPENDENT RE-VERIFICATION SWEEP [PASS ?] — GATE PASS: PHASE 1

**Contract**: phase_1.md Task P1.5 (OP-owned) + ledger README §3 (binding cross-check).

**Sweep record (all executed [2026-09-02 01:20–01:45] against CURRENT files):**
1. **URL/ledger set-diff both directions** (probe op_probe_p1_3_3.mjs): 7 ledger URLs /
   6 data URLs; 0 in-data-not-ledger; sole orphan LED-001 (index anchor, by design).
   Cross-dataset DUP_KEY: 630 unique identities, 0 dups. Period labels honest corpus-wide.
2. **100% value re-verification consolidated** (re-runs of the sub-phase probes):
   - income: op_probe_p1_1.mjs identities + segment sums ALL PASS (162/162 verified in
     P1.1 audit; frozen since).
   - balance: op_probe_p1_2_2.mjs — 159/159 checked, 0 problems, 0 dash findings.
   - cashflow: op_probe_p1_3_2.mjs — 257/257 checked, 256 column-pinned + 1 known
     layout artifact (D&A FY2023 = 7,095; $+— interleaving — resolved by direct cell
     inspection in P1.3 audit and re-confirmed by FY2023 10-K comparative).
   - kpis: values 52/52 (P1.4 audit; MAU rows corrected to filed 133.1M/116.7M/133.1M);
     per-doc verbatim definitions 52/52 (45 direct containment + 7 SEC-HTML render
     -artifact cases hand-verified: page tokens '62 Table of Contents'/'the 23
     analysis'/curly-quote entities).
   - Fixture-echo probe (op_probe_p1_5_sweep.mjs): 32/32 anchors re-asserted against a
     fresh loadHistorical() run — income 10 + balance 6 + cashflow 7 + KPI 9.
3. **Identities re-asserted independently from loaded corpus**: IS identity + BS
   balance + CF net-change (15/15 across 5 years); segment sums 5/5; bookings?
   unearned-roll residuals 4/4 (FY2022–FY2025: 987/829/486/495).
4. **isEstimate distribution**: 630/630 rows false (0 forward-looking values entered
   as historical — grep gate PASS).
5. **Engine purity** (src/engine/ttm.js): no fetch/Date.now/Math.random/window/
   document — PASS.
6. **Bigdata.com independent lane** (spec §4.7; entity 493F45, pinned filters):
   - FY2025 10-K (SEC_10_K + FY2025): document identity + narrative corroboration
     (bookings .3M/,158.4M ? dataset 996,268/1,158,425).
   - Q2 FY2026 10-Q (SEC_10_Q + FY2026 Q2): IS confirmed line-by-line; aggregator
     typo '49,684' resolved to EDGAR 69,684 (lane discrepancy logged).
   - 6M FY2026 CF statement: line-by-line identical, zero discrepancies.
   - FY2023 10-K (SEC_10_K + FY2023): revenues .1M ? 531,109; subscription
     revenue .7M ? 404,684; subscription bookings .5M ? 495,497; total
     bookings .2M ? 622,181; MAU 88.4/60.7; DAU 26.9/16.3; paid subs 6.6/4.2 —
     all match dataset.
7. **Test suite**: npm test ×3 ? 224/224, 0 fail (118 P0 + 24 P1.1 + 30 P1.2 +
   27 P1.3 + 25 P1.4/5 including integration).
8. **Zero magic numbers** in new src/ code (constants exempt per P0.3 ruling);
   grep gate PASS.

**Milestone acceptance criteria (phase_1.md §4) — all satisfied:**
- [x] P1.1–P1.5 individually submitted and approved (P1.2 and P1.4 after FAIL?fix cycles).
- [x] Full corpus loads through unmodified P0 pipeline (630 records, zero violations).
- [x] Every source.url joins the ledger; mechanically enforced + independently re-verified.
- [x] Fixtures pass; identities hold per period; balance sheets balance from components.
- [x] TTM module verified (hand-derivation = engine output; computed-labeled).
- [x] 10-Q CF rows ytd-labeled as filed.
- [x] KPI definitions verbatim per document (after P1.4 fix cycle).
- [x] Zero estimates in historical corpus.
- [x] No runtime dependency additions; npm test offline and green ×3.
- [x] App boots clean headless with real corpus (boot-gate tests green).

**GATE PASS: Phase 1 issued [2026-09-02 01:45].** status.md updated (P1 ?? Done,
P2 ?? Active); status_ds.json ? completed (seq 8); archiver to run
(node tools/archive_phase.mjs phase_1). DS halted, stands by for Director (P2).
