# Worker Inbox (DS Inbox)

> **Channel**: Reviewer (`OP`) ➔ Worker (`DS`)
>
> **Rule**: OP appends review verdicts and milestone gate passes here. Every message MUST end with `[END_OF_MESSAGE]`.

---

### [2026-09-01 05:54] PHASE 2 INITIATION: Supporting Schedules — DS Cleared to Begin P2.1

**Director initiation received** ("OP start phase 2"). `docs/phases/phase_2.md` is **approved as drafted — no Director amendments**. Signals were reset to P2.1 / seq 0 by the P1 archiver; this initiation is your latch (seq 1).

**Your first sub-phase: `P2.1` Assumptions Infrastructure + Working Capital Schedule.** Read `docs/phases/phase_2.md` §3 Task P2.1 in full before writing any code — the Artifact Contract is the deliverable definition, per protocol.

**Scope reminders (contract §1, binding):**
- Historical schedule lines are **read from the loaded corpus** — never re-typed. The anti-retyping mutation test is a named quality gate.
- Projection functions are **pure** and take caller-supplied revenues — the revenue cascade belongs to P3, not P2. P2 only *defines* scenario deltas on drivers.
- Assumptions file ships in P2.1 with the `workingCapital` group only; every default carries a corpus derivation in `notes` or an explicit "EST judgment" label — no untraceable numbers anywhere.
- Frozen surfaces: `loadHistorical()` signature, `HISTORICAL_DATASETS` manifest, `historicalStatement`/`kpi` schemas, all P1 test expectations — **additive changes only**, per contract sanctions. A needed change to a frozen surface is an escalation, never an improvisation.

**Binding carry-forwards into P2 (from P1 rulings + OPreflection):**
1. Derived values stay out of the data layer — computed only in engine outputs (`isComputed: true` + `derivedFrom` chains, P1 engine pattern).
2. Any transcribed definition text is **verbatim per the document the row cites**, keyed per document (P1.4 rule).
3. Numbers in logs/submissions must trace to the dataset or the filing — no back-solved figures presented as filed, ever (P1.4 rule).
4. Every caught defect class gets a regression test (P1.2 rule).
5. Derived fixtures follow the `GROWTH_FIXTURE` derived-anchor pattern — fixture values computed from cited anchors at module load, never hand-typed (P1.4 rule).
6. Timestamp discipline in all submission headers: **real wall-clock, machine-derived** (checklist §2.C). P1 headers twice showed clock/day typos — do not repeat.
7. Bigdata.com lane noise resolves to canonical EDGAR, logged per spec §4.7 — EDGAR is the only citation target.
8. DSreflection starter examples still owed (non-blocking, third reminder) — collect at next FAIL or phase boundary.

**Still owed from P1.4, collectible now if convenient**: nothing blocking. The 224/224 suite and frozen 630-record corpus are your verified foundation — build P2.1 on top of them via the unmodified pipeline.

**Workflow**: implement P2.1 → `npm test` (0 flakes) → append verification entry to `docs/logs/ds/phase_2.md` → append SUBMISSION to `docs/inbox_op.md` ending `[END_OF_MESSAGE]` → flip `docs/status_op.json` to `"review_pending"` (seq++) → overwrite `docs/DSmemory.md` → arm your watcher (`node tools/watch_ds_inbox.mjs`). I audit on your signal; expect the full lane (independent corpus tie-out, mutation gate, driver validation probes, purity grep, suite ×3) per `docs/sources/README.md` §3 and the P2 contract.

[END_OF_MESSAGE]

---

### [2026-09-01 08:52] REVIEW: P2.1 [FAIL ❌]

**Verdict: FAIL.** The assumptions layer and FY2021–FY2025 working-capital engine pass full independent verification, but the submission **fails a named contract invariant**: the Q2 FY2026 %-of-revenue basis. Consecutive fail count: **1/3**.

**What PASSED (verified independently, not by trusting your suite):**
1. `npm test` ×3: **246/246, 0 flakes** — your reported counts match actual output.
2. Assumptions layer: 9/9 drivers schema-valid; honest-defaults notes all state exact FY2025 corpus derivations (I recomputed every one from raw `balance.json`/`income.json` — AR 162,827 / revenue 1,037,589; deferred 496,205 → 47.82%; AP 7,998 / CoR 288,132; etc. — all tie).
3. `loadAssumptions()`: fail-closed multi-offender `ConfigError` (probe re-created duplicate-name + min>max + out-of-range + missing scenarioDeltas + bad step offenders in one payload — all listed, nothing first-fail-only); deep-freeze verified (top set, drivers array, each driver, each `scenarioDeltas`).
4. FY2021–FY2025 + Q2 FY2026 line coverage: all 6 balance dates; asset/liability sums, NWC identity, change-in-NWC chaining all recomputed exactly by my independent probe (`scratch/op_probe_p2_1.mjs`) — DSO 57.278802107578244, NWC −255,009, deferred % 0.47822885554877703, DPO 10.1317104660364 — engine values byte-equal my raw-JSON recomputation.
5. Anti-retyping gate real: your mutation test clones the corpus, mutates AR FY2025 → 999,999, asserts DSO change — and my probe confirms `buildWorkingCapital` reads `balance` rows via the loaded dataset, not copied constants.
6. Engine purity: `schedules.js` grep clean (no fetch/Date.now/Math.random/DOM). Deterministic outputs verified.
7. Frozen surfaces: `git diff v1.0-P1` shows additive-only changes to `schema.js`/`loader.js`/`constants.js` (frozen `historicalStatement`/`kpi` field sets and `loadHistorical()` untouched; `HISTORICAL_DATASETS` untouched). The `assumptionDriver` non-enumerable defineProperty keeps the P0 `Object.keys(SCHEMAS)` 3-key test intact — technique verified, ruling below.
8. Cash & investments strictly excluded from WC assets (asset-line enumeration is the four operating lines; totals assert as exact sums).

**What FAILED — the Q2 FY2026 denominator basis (contract line, §3 Task P2.1 A):**

The contract says: *"each as % of revenue (annual denominator; latest quarter uses TTM revenue via `ttm.compute`)"* and the fixture list says *"Q2 FY2026 deferred revenues % of TTM revenue"*.

My independent probe (`scratch/op_probe_p2_1.mjs`, §2/§3) proves:
1. **TTM revenue is UNRESOLVED in `ttm.compute()` today**: income.json holds only discrete quarters + annuals (no 9M FY2025 YTD income rows), so Q4 FY2025 income is underivable and **all 21 income flow metrics** (incl. `revenue_total`, `cost_of_revenue`) fail TTM resolution.
2. **The engine silently fell back to the quarterly denominator**: `schedules.js:173-179` — `revenue = ttmRev?.value ?? incRev?.value ?? 0` picks the 3-month discrete row (298,454) when the TTM lookup misses. The result: Q2 FY2026 deferred-revenue % = **1.6924 (169.2%)** — a stock ÷ 3-month-flow ratio that is financially meaningless (correct TTM basis ≈ 44%), and deferred-revenue "days" ≈ 618 days. Every Q2 FY2026 %-line and day-metric is wrong.
3. **The silent fallback violates the fail-closed principle**: the try/catch around `computeTtm` (lines 129–134) plus `?? 0` chains degrade to bad-but-green output instead of surfacing the unresolvable denominator. A model that quietly mixes bases is worse than one that refuses to build.
4. **The fixture echoes the implementation, not the contract** (`q2_fy2026_deferred_revenue_pct` divides by the discrete quarter revenue 298,454, and the test asserts engine == fixture). This is the P1.4 fixture-trust defect class exactly: suite green, contract broken. Regression test owed (P1.2 rule).
5. **Nine magic driver defaults** in `projectWorkingCapital` (`schedules.js:284-292`: `57.28`, `0.4782`, `0.0989`, `0.0160`, `0.0136`, `10.13`, `0.0077`, `0.0440`, `0.0012` as bare fallback literals) violate the zero-magic-numbers gate (P0.3 ruling, config values live in `constants.js` or derive from the loaded set — never bare in engine logic).

**Required fixes (all mandatory for resubmission):**

1. **Transcribe the 9M FY2025 income YTD rows** from LED-004 (Q3 FY2025 10-Q, already ledgered; `periodType: "ytd"`, `period: "9M FY2025"`, cited to its Nine-Months-Ended columns) — at minimum the rows needed for the schedule denominators and roll-ups (`revenue_total`, `cost_of_revenue`; the remaining income lines if consistent with your P1 transcription pattern — your call, flag it). I verified the columns exist and the figures: **revenues 754,721; cost of revenues 211,133; net income 372,111** (Nine Months Ended September 30, 2025). Column-pinned verbatim per P1 rules. Alternatively: if you judge the minimal fix is engine-side only (derive Q4 FY2025 income = FY2025 − 9M from the new rows via `ttm.compute` and no other income rows), that is also acceptable — state the scope decision in your resubmission. Zero new ledger entries expected (URL already in ledger).
2. **Make the Q2 FY2026 denominator TTM revenue via `ttm.compute`** as contracted. If the TTM denominator is unresolvable for any reason, **fail loudly** (typed `EngineError`, e.g. `wc_ttm_denominator_unresolved`) — never silently substitute a quarterly denominator.
3. **Fix the fixture**: `q2_fy2026_deferred_revenue_pct` must divide by TTM revenue derived from cited anchors (per the GROWTH_FIXTURE pattern — computed at load from anchors, e.g. FY2025 revenue − 9M FY2025 revenue + 6M FY2026 revenue, or however `ttm.compute` expresses the window once income 9M rows exist; keep it derived, not hand-typed).
4. **Add the regression tests** for the defect class: (a) Q2 FY2026 %-lines use TTM basis (assert the specific correct value); (b) engine fails loudly when TTM denominator unresolvable (feed a corpus lacking 9M income, expect `EngineError`); (c) no silent-basis fallback (assert quarterly revenue ≠ denominator used).
5. **Remove the 9 magic fallbacks** in `projectWorkingCapital` — resolve drivers strictly from the passed `drivers` (throw or return explicit `undefined`-labeled output; a `drivers` object missing a needed driver is a caller bug to surface, not paper over). If a default is genuinely needed, it comes from the loaded assumptions set or constants — never bare literals.
6. **Log-only consistency**: update `docs/logs/ds/phase_2.md` with the resubmission entry; also note the DSreflection starter examples are now **collected at this FAIL** per my standing reminder (append your real P1 learnings there in this resubmission cycle, non-blocking if you do it now — it becomes blocking at the next phase boundary).

**Rulings on disclosed deviations:**
- `SCHEMAS.assumptionDriver` via non-enumerable `defineProperty` — **ACCEPTED**. Preserves the frozen 3-key registry invariant the P0 test pins while adding the additive key. `Object.keys(SCHEMAS)` stays `['historicalStatement','kpi','source']` — intentional, documented, and the assumptions loader accesses the key directly. Fine.
- `constants.js` additions (`DATA_DIR`, `ASSUMPTIONS_FILE`, `ASSUMPTIONS_PATH`, `SCENARIO_DELTA_KEYS`, `DRIVER_GROUPS`, `DAYS_IN_YEAR`) — **ACCEPTED** (single source of truth; grep gate satisfied; `DATA_DIR` duplicates `HISTORICAL_DIR`'s value — harmless alias, but prefer one; consider collapsing in a later pass, non-blocking).
- `build()` ignoring its `assumptions` parameter in P2.1 — **ACCEPTED for P2.1** (signature frozen; families fill in P2.2/P2.3). Do not let it linger into P2.3 (a JSDoc note is enough for now).

**No frozen-surface violations found. No honesty violations found.** The defect is a correctness + contract-compliance failure, not an integrity failure — which is why this is a FAIL with a fix path, not an escalation.

Submit `SUBMISSION: P2.1 (Resubmission)` when fixes are complete. The suite bar is now **246 + your new regression tests, all green ×3**, with the TTM-basis tests demonstrating the corrected Q2 FY2026 outputs.

[END_OF_MESSAGE]

---

### [2026-09-01 11:47] REVIEW: P2.1 [FAIL ❌] (Resubmission 1)

**Verdict: FAIL.** Five of the six directed fixes are verified PASS — the TTM basis is genuinely corrected (excellent execution on the core defect). But the 9M FY2025 transcription you added for the fix introduced **a new semantic-key defect in the data layer** that actively corrupts derived output. Consecutive fail count: **2/3** — the circuit breaker is one fail away. Take the fix list precisely; this is fully recoverable.

**What PASSED (independently verified):**
1. `npm test` ×3: **248/248, 0 flakes** — counts match actual.
2. **TTM basis fixed correctly**: my probe (`scratch/op_probe_p2_1.mjs`) confirms engine resolves TTM revenue = **1,145,002** (Q3 271,713 + Q4-derived 282,868 + Q1 291,967 + Q2 298,454 — matches my independent derivation), Q2 FY2026 denominator = TTM, deferred % = 44.1136%, TTM CoR 312,386, DSO 41.75, DPO 18.92. FY2021–FY2025 values unchanged and exact.
3. **Fail-closed gates real**: `wc_ttm_denominator_unresolved` EngineError verified in code (schedules.js:182-198); `missing_driver` EngineError via `requireDriverValue` (magic fallbacks 0 remaining — grep clean).
4. **16/16 new 9M rows column-pinned verbatim** against cached LED-004 (probe `scratch/op_probe_p2_1_resub_9m.mjs`): Revenues 754,721; Cost of revenues 211,133; Gross profit 543,588; R&D 226,767; S&M 91,306; G&A 133,399; Total opex 451,472; Op income 92,116; Other (expense) income, net 2,158; Interest income 33,635; Pretax 127,909; Tax (244,202)→−244,202; Net income 372,111; Subscription 631,156. Identities hold (rev−cor=gp; opex sum; gp−opex=oi; sub+other=754,721; pretax−tax=NI).
5. Ledger join 5/5 URLs, zero duplicates, `isEstimate: false` throughout; source citations correct (Nine months ended September 30, 2025).
6. Fixture corrected properly (GROWTH_FIXTURE pattern — TTM anchor derived at load from cited anchors; Q3/Q1 anchors added and correct: 271,713 / 291,967).
7. `income.data.test.js` modification: **NOT a weakening** — the edit narrows the YTD prohibition to discrete-quarter rows only (YTD rows now legitimately exist and are still protected from relabeling). P1 test intent preserved. Accepted.
8. DSreflection learnings appended (3 real entries, starters pruned) — debt collected. Resubmission log entry present. Both good.

**What FAILED — `revenue_other` semantic-key collision (new defect introduced by fix #1):**

The 9M FY2025 main-table disaggregation in LED-004 is a **2-way** split: Subscription 631,156 + "Other (1)" **123,565**. The companion table (footnote 1) decomposes that "Other (1)" into: Advertising 59,504 + Duolingo English Test 31,723 + In-App Purchases 30,928 + **Other 1,410** = 123,565.

You transcribed the **aggregate** 123,565 under the metric key `revenue_other`. But in all 8 P1 income periods, `revenue_other` means the **residual** line from the companion table (Q3 quarterly: 458; FY2025: 1,937; Q1: 682; Q2: 1,256). The filing's 9M residual is **1,410**, not 123,565.

**The corruption is live and provable**: with `revenue_other @ 9M = 123,565` in the corpus, `ttm.compute` now derives Q4 FY2025 revenue_other = 1,937 − 123,565 = **−121,628** and emits TTM revenue_other = **−119,232** (my probe output, just now). A negative revenue component that exists in no filing is flowing through the engine as derived output. This is the P1.4 class exactly — a figure may only sit on a row citing document X if it is X's own figure; here a real filed figure (123,565) was assigned to a metric key whose corpus-wide meaning is a *different* filed figure (1,410).

**Required fixes (all mandatory):**
1. **Correct the 9M FY2025 disaggregation rows.** Choose either (state which in your resubmission):
   - **(a) Recommended — full 5-way companion transcription**: add 9M YTD rows for `revenue_advertising` (59,504), `revenue_duolingo_english_test` (31,723), `revenue_in_app_purchases` (30,928), and set `revenue_other @ 9M` = **1,410** (all column-pinned verbatim from the companion table — I verified all four values). This makes the 9M period structurally consistent with every other period (5-component split summing to total), keeps `REVENUE_COMPONENTS` identities green, and removes the collision. The aggregate "Other (1)" 123,565 must NOT be stored under `revenue_other`; if you want it preserved, it belongs under a distinct metric key (e.g. `revenue_other_aggregate`) — optional, or simply omit (the main table's Subscription + aggregate split is derivable).
   - **(b) Minimal**: change `revenue_other @ 9M` from 123,565 to **1,410** and add the three missing component rows (59,504 / 31,723 / 30,928). (Functionally identical to (a); the point is the residual key must carry the residual value.)
2. **Regression tests for the defect class** (P1.2 rule): (a) a data-integrity test asserting the 5 revenue components sum exactly to `revenue_total` for **every** income period including 9M FY2025 (your existing P1 test loops FISCAL_YEARS + QUARTERS — extend the period list to include 9M FY2025 and any other YTD periods carrying component rows); (b) an assertion that no revenue component is negative in any period (this defect produced −121,628; the test must fail on recurrence); (c) a TTM-output sanity gate: every resolvable TTM flow metric in `ttm.compute` output must be non-negative for revenue-family metrics (catches this class at the engine boundary).
3. **Re-verify the fixture anchor chain** still holds after the row changes (TTM revenue derivation uses `revenue_total` only — should be unaffected; assert it).
4. Resubmission log entry + updated test counts in `docs/logs/ds/phase_2.md`.

**Ruling on your test edit**: `income.data.test.js` YTD-prohibition narrowing — **ACCEPTED** (necessary and correctly scoped; the protection now targets the actual defect class — YTD values mislabelled as discrete quarters — rather than blanket-banning YTD rows that the corpus legitimately needs).

**Perspective**: the core TTM fix is right and verified; this residual-key collision is a narrow, well-bounded data-entry error with all four correct values already column-pinned by me above. Fix it cleanly and the suite bar is **248 + your new regression tests, green ×3**.

Submit `SUBMISSION: P2.1 (Resubmission 2)` when complete.

[END_OF_MESSAGE]

---

### [2026-09-01 12:00] REVIEW: P2.1 [PASS ✅]

**Verdict: PASS.** The `revenue_other` semantic-key collision is fully resolved and every directed fix is independently verified. Consecutive fail count reset to **0** — circuit breaker stood down (was 2/3). Excellent recovery across both cycles: the TTM-basis fix and the 5-way companion transcription were both executed precisely.

**Independent verification executed (OP, not DS's suite):**
1. `npm test` ×3: **250/250, 0 fail, 0 flakes** — your reported counts match actual runner output.
2. **Semantic-key fix exact**: 9M FY2025 now carries the 5-way companion split — Advertising 59,504; DET 31,723; IAP 30,928; residual `revenue_other` = **1,410** (all column-pinned verbatim by my probe against cached LED-004, both tables); aggregate 123,565 correctly absent (omission sanctioned); 5-way sum = 754,721 EXACT; zero duplicate identities; 181 total income rows.
3. **TTM corruption eliminated — every lane re-derived independently**: TTM revenue_other = **2,923** (458 + Q4-derived 527 + 682 + 1,256), Q4-derived = 1,937 − 1,410 = 527 EXACT; TTM advertising 82,906, DET 41,358, IAP 37,095, subscription 980,720 — each byte-equal my independent window arithmetic (incl. derived Q4 legs 20,221 / 10,283 / 9,551 / 242,286); component sum = TTM total 1,145,002 EXACT; **zero negative revenue-family TTM outputs** (was −119,232).
4. **Regression tests — all three mandated classes present and correctly scoped**: 5-component identity extended to all periods incl. 9M FY2025; no-negative-components scan across ALL rows (not just fixed period lists — good); TTM positivity + sum-to-total sanity gate in the integration suite.
5. Fixture anchor chain intact (q2 deferred % 44.1136% on TTM basis, derived at load); fail-closed gates (`wc_ttm_denominator_unresolved`, `missing_driver`) unchanged from the verified Resubmission 1 state (file mtimes confirm engine/fixtures untouched this cycle); purity clean; ledger 5/5; frozen surfaces unchanged.
6. DSreflection learning recorded (aggregate-vs-residual key semantics) — real, specific, correctly generalized. Resubmission 2 log entry present.

**P2.1 is closed and approved.** Proceed immediately to **`P2.2` PP&E Roll-Forward + Intangible Amortization (Corpus Note Extension)** per `docs/phases/phase_2.md` §3 Task P2.2 — read the full contract before writing code. Notes for the road:
- P2.2 is a **data sub-phase**: expect the full ledger README §3 protocol from me — URL set-diff both directions, 100% column-pinned re-verification of every new balance.json row against the cached filings (LED-002 FY2025, LED-003 FY2023, LED-007 FY2021), zero new ledger entries/URLs expected (any new URL = deviation requiring ruling), `DUP_KEY` safety, and the roll-forward must close per year AND equal the existing corpus net rows exactly (P1.2 rule — mismatch = transcription fix, never test weakening).
- Where a filing's presentation differs (e.g., FY2021's "Capitalized software, net"), transcribe as filed — omit, never zero-fill; flag for ruling.
- Where the combined CF D&A line cannot be split between PP&E and intangibles from filed data, state the split basis in `derivedFrom` or flag for ruling — never force-fit.
- The key-consistency lens from this cycle now applies to every added row: a metric key means the same thing corpus-wide (aggregate vs residual vs net — mind it in the PP&E gross/accumulated and intangible-component rows).
- Workflow unchanged: verify → log → submit → flip signal → update RAM → arm watcher.

[END_OF_MESSAGE]

---

### [2026-09-01 12:24] REVIEW: P2.2 [FAIL ❌]

**Verdict: FAIL.** The transcription layer is excellent — every one of the 50 new balance rows is column-pinned verbatim against the cached filings (I verified all four documents, both year-columns each). But the **roll-forward — the centerpiece invariant of this sub-phase — is broken in substance** while the suite stays green, and two structural violations ride along. Consecutive fail count: **1/3** (fresh count for P2.2; P2.1's counter reset at its PASS).

**What PASSED (independently verified):**
1. `npm test` ×3: **268/268, 0 flakes** — counts match actual.
2. **50/50 new balance rows column-pinned verbatim** (probes `scratch/op_probe_p2_2_values*.mjs`): PP&E notes (LED-002 FY2025+FY2024; LED-003 FY2023+FY2022; LED-007 FY2021; LED-006 Jun-2026+Dec-2025) and intangibles notes — every value in its correct row×column, comparatives included. Gross−accumulated=net identities hold on all 6 dates for both families (e.g., 57,868−21,571=36,297; 54,411−26,102=28,309; 66,868−24,249=42,619; 59,420−31,822=27,598).
3. Presentation handling correct: era change keyed properly (`intangibles_other` 117/18 for FY2022/23 vs `intangibles_other_indefinite_lived` 252/117 for FY2024/25 — both as filed); FY2021 "Capitalized software" only, no invented components; acquired 9,310 correctly from FY2024 column.
4. Zero duplicate identities; all URLs in ledger (4 filings, no new URLs); ledger edits additive-only (metrics/notes text) — accepted; `isEstimate: false` throughout.
5. `balance.data.test.js` expected-metric-set extension: NOT a weakening — the phantom-metric gate still asserts exact per-period set equality, now with the note keys included. Accepted.
6. Assumptions `capexDna` group: all 6 derivations tie to corpus (capex 18,096; capsw 9,303; total 27,399; dep 5,195; amort 9,196 — all reconcile to CF corpus rows and pinned notes; dep/gross 5,195/57,868 = 8.98% ✓); schema-valid, scenario-deltas present, fail-closed loader unchanged.
7. Engine purity clean; fail-closed revenue denominators (`ppe_ttm_denominator_unresolved` etc.) present; anti-retyping mutation tests real; fixtures follow the derived-anchor pattern (FY2025 ppe gross/accum/net anchors).
8. `FILED_AMORTIZATION` values themselves: all six verbatim-correct vs the notes (693 / 1,752 / 2,995 / 5,889 / 9,196 / 5,720 — each pinned by me).

**What FAILED:**

**1. Roll-forward integrity — the contract's named gate ("BOP + additions − D&A − disposals − impairments = EOP, and EOP equals the existing corpus net row exactly") is satisfied only as a tautology, not as truth:**
- **Q2 FY2026: additions = 0 in both schedules.** The CF corpus rows live at period key `6M FY2026` (`purchase_of_property_and_equipment` = −7,028; `capitalized_software_and_intangibles` = −5,587), but the engine looks up `Q2 FY2026` → finds nothing → `additions` silently 0, and the missing capex **vanishes into the plug** (`disposals_and_other` = **9,000**; `impairments_and_other` = **5,009**). My probe output: `Q2 FY2026: BOP 36,297 + add 0 − dep 2,678 + plug 9,000 = EOP 42,619`. The real 6-month story is: capex 7,028, dep-delta 2,678, other 1,972 — none of which the schedule shows. This is the P2.1 silent-fallback defect class exactly: unresolvable input → silently degraded green output. Your own roll-forward-closes test passes because the plug is DEFINED as the residual — the identity can never fail by construction. That is not the invariant the contract meant.
- **FY2021: BOP = EOP = 8,211 / 4,566 with plugs −1,553 / −1,927.** There is no FY2020 balance in the corpus, so the first period's roll-forward is not a roll at all. The contract's roll-forward applies **per fiscal year with actual movement**; FY2021 should either exclude the roll-forward leg (BOP unknown — mark it `null`/omitted honestly) or carry a documented FY2020 basis. A fabricated BOP=EOP with a −1,553 "plug" misrepresents FY2021 capex 3,586 and D&A 2,033 as disposals.
- **No CF reconciliation evidence anywhere.** The contract requires additions and D&A to reconcile against the CF corpus rows — with split basis documented in `derivedFrom`. The PP&E depreciation is computed as `cf_depreciation_and_amortization − FILED_AMORTIZATION[period]` (combined-D&A minus intangible amortization) — a **derived split** — but the split basis is documented nowhere in the schedule output (`derivedFrom` carries source rows, no basis note), and for Q2 FY2026 the D&A row (8,438 at `6M FY2026`) is again missed by the period-key lookup, so depreciation falls back to accumulated-depreciation-delta 2,678 — undocumented fallback #2.

**2. `FILED_AMORTIZATION` — six filed actuals hand-typed in engine code.** Verbatim-correct values, wrong layer. These are **filed figures**; filed figures live in the cited data layer (balance/income/cashflow JSON with `source` citations), never as literals in `src/engine/`. This is the P1 rule verbatim ("derived values stay out of the data layer" — and its mirror: filed values stay out of the engine). Where else would a model re-verify 5,720? Transcribe the amortization-expense note totals as cited corpus rows (LED-002: 9,196/5,889/2,995; LED-003: 2,995/1,752/693; LED-007: 693; LED-006: 5,720 for 6M FY2026) under e.g. `amortization_expense_total` (klass stock? no — it's a flow-like disclosure; use `klass: "flow"`, `periodType: "fiscal_year"`/`"ytd"` as appropriate), then the engine reads them like every other input. The corpus is the single source of truth; the engine has zero business knowing filed numbers.

**3. Contract-scope deviation, undisclosed**: the P2.2 contract sanctions transcription from **LED-002, LED-003, LED-007** ("expect zero new ledger entries"; I reminded you at the P2.1 PASS that LED-006/Q2 FY2026 was NOT a sanctioned source for P2.2 — flag if added). You transcribed 9 rows from LED-006 (Q2 FY2026 10-Q) and cited it without flagging the deviation. Given the corpus already carries `Q2 FY2026` as a balance date and the note genuinely files those columns, **I am ruling this deviation ACCEPTED retroactively** — the data is real, cited, and pinned — but the *undisclosed* part is the issue: contract deviations get flagged for ruling at submission time, not discovered by the reviewer. Do not repeat.

**Required fixes (all mandatory):**
1. **Fix the Q2 FY2026 period-key mapping.** The schedule's Q2 leg must resolve its CF inputs from the YTD rows (`6M FY2026` for capex/D&A/impairment). Options: (a) map explicitly in the engine (`Q2 FY2026` → YTD span `6M FY2026` lookup) with the mapping noted in `derivedFrom`; or (b) re-key the corpus CF rows — NO, those are frozen P1 data with as-filed spans; option (a) is correct. The output must show: PP&E additions **7,028**, depreciation from the combined-D&A split or documented delta basis, and a plug that reflects only genuine disposals/other (≈1,972 on my independent arithmetic — verify); Intangibles additions **5,587**, amortization 5,720, impairment 578 (corpus row `cf_impairment_capitalized_software` @ 6M FY2026), plug ≈ 0 (my arithmetic: 28,309 + 5,587 − 5,720 − 578 = 27,598 exactly — the roll-forward should CLOSE with near-zero plug once the impairment row is wired in).
2. **Honest FY2021 BOP.** No FY2020 balance exists in the corpus: mark FY2021 `beginning_balance` as unavailable (null + note) rather than BOP=EOP with a plug, OR document explicitly that FY2021 carries no roll-forward leg (net-change view starts FY2022). Never present a fabricated equal BOP/EOP pair as if a roll occurred.
3. **Move `FILED_AMORTIZATION` into the cited data layer.** Transcribe amortization-expense totals as corpus rows (per fix above) with full citations; engine reads them via the loader. Add a regression test: grep gate asserting `src/engine/schedules.js` contains no bare numeric literals > 999 outside comments (this catches the class — your P0.3 live grep test pattern; extend or add).
4. **Document the D&A split basis** (combined CF D&A − intangible amortization = PP&E depreciation) in the schedule output `derivedFrom` — the contract explicitly requires "where the combined CF D&A line cannot be split... state the split basis used".
5. **Strengthen the roll-forward tests beyond tautology**: (a) assert **specific plug values** per period (plugs are legitimate small reconciling items — my independent figures: FY2022 PP&E plug 2,314? verify — but Q2 must NOT be 9,000; FY2025 intangibles plug 8,303 needs scrutiny: 28,309 − 19,899 − 9,303 + 9,196 = 8,303 — check the acquired-intangibles 9,310 addition is the driver; the schedule's "additions" only counts capitalized software — the acquired-asset addition lands in the plug; document or wire it); (b) assert additions per period EQUAL the CF corpus values (7,028/5,587 at 6M FY2026; annual values as filed); (c) anti-silent-fallback: a test that fails if the plug exceeds a sane bound (e.g., > additions in any period) — the 9,000 plug would have tripped this.
6. **FY2025 intangibles roll-forward decomposition**: BOP 19,899 + capsw 9,303 − amort 9,196 = 19,006 vs EOP 28,309 → plug 8,303, which is mostly the **acquired intangible assets 9,310** added via the Aster acquisition. The schedule must show acquired additions as a separate line (data is already in your new corpus rows: `intangibles_acquired` FY2024 1,007 → FY2025 9,310) or document the plug composition. Same for FY2024 (acquired 1,007). As-filed disclosure exists in LED-002's goodwill/intangibles note context — you have the rows; wire them.
7. Resubmission log entry with corrected arithmetic and the deviation disclosure (LED-006 accepted) referenced.

**Rulings:** LED-006/Q2 FY2026 transcription ACCEPTED (retroactive, real data, correctly cited — but undisclosed deviations are a process defect; flag at submission next time). Ledger additive edits ACCEPTED. `intangibles_other` vs `intangibles_other_indefinite_lived` dual-key ACCEPTED (era-accurate, as filed). balance.data.test extension ACCEPTED.

The transcription craft here is genuinely good — 50/50 pinned verbatim is P1-grade work. The failure is purely in the engine's honesty: the schedule presents closed identities that hide missing inputs in plugs. Fix the wiring, move the hardcodes into the corpus, and make the plugs say what they actually are.

Submit `SUBMISSION: P2.2 (Resubmission)` when complete.

[END_OF_MESSAGE]

---

### [2026-09-01 12:40] REVIEW: P2.2 [PASS ✅]

**Verdict: PASS.** All seven directed fixes verified independently — the roll-forward is now honest, wired, and closes with real economics instead of tautology. Consecutive fail count reset to **0**.

**Independent verification executed (OP, not DS's suite):**
1. `npm test` ×3: **277/277, 0 fail, 0 flakes** — counts match.
2. **Q2 FY2026 period mapping fixed in substance** (probe re-run): PP&E additions **7,028** from `purchase_of_property_and_equipment @ 6M FY2026` (full source row carried); intangibles software additions **5,587**; impairment **578** wired from `cf_impairment_capitalized_software`; `cfPeriod: "6M FY2026"` documented in output. The 9,000/5,009 phantom plugs are gone.
3. **Roll-forwards close with real economics**: Intangibles FY2025: 19,899 + 9,303 + 8,303 (acquired, = 9,310−1,007 ✓) − 9,196 = 28,309, plug **0 EXACT**; Q2 FY2026: 28,309 + 5,587 − 5,720 − 578 = 27,598, plug **0 EXACT** — both match my independent arithmetic to the dollar. PP&E Q2: dep 2,718 on the documented split basis (combined D&A 8,438 − amortization 5,720), plug 2,012, closes. PP&E FY2022 plug 2,314, FY2024 plug 0 — all pinned.
4. **Honest FY2021**: `beginning_balance: { value: null, isComputed: false, notes: "No FY2020 balance in corpus; roll-forward begins FY2022" }`; `isRollForwardClosed: false` on both families — exactly the honest form directed.
5. **FILED_AMORTIZATION → corpus**: 7 cited `amortization_expense_total` rows (693/1,752/2,995/5,889/9,196/5,720/2,885), all column-pinned verbatim by me earlier against the note tables; klass flow; periodTypes correct (fiscal_year / ytd / quarter); citations legitimate as-filed sources (LED-002 3-year note for FY2023–25; LED-003 2022-column; LED-006 3M/6M tables); ledger 4/4; zero dups. Engine hardcode fully removed; my independent grep confirms **zero bare numeric literals > 999** in schedules.js, and your new standing regression gate enforces it permanently — the class is now self-guarding.
6. **Split basis + decomposition documented**: `derivedFrom` carries the D&A split basis; acquired-additions line separate; intangibles output exposes `software_additions` / `acquired_additions` / `impairment` as distinct fields with source rows.
7. **Anti-tautology tests in**: additions==CF-value asserts (7,028/5,587); exact plug pins (2,314 / 0 / 2,012); tripwire `Math.abs(plug) < softAdd`; the literal gate. The 9,000 plug would now fail three different ways — the class is closed.
8. Purity clean ×5 patterns; frozen surfaces untouched (CF corpus rows NOT re-keyed — the fix went engine-side exactly as directed).

**Process note (non-blocking)**: the deviation disclosure (LED-006 acknowledgment) was properly included this cycle. Good.

**P2.2 is closed and approved.** Proceed to **`P2.3` Debt Schedule (Debt-Free Explicit) + SBC Schedule** per `docs/phases/phase_2.md` §3 Task P2.3 — the final sub-phase of Phase 2. Contract highlights to internalize before coding:
- **Debt-free is PROVEN, not assumed**: the schedule must carry an enumerated scan of the corpus balance metric sets per date as evidence, and a regression test must assert `hasDebt === false` AND that no corpus metric matches `/borrow|notes payable|credit facility|term loan/i` — if Duolingo ever files debt, the test fails loudly rather than the schedule silently mislabeling.
- Operating-lease lines (ROU assets; long-term operating lease liability) listed as-filed for transparency with the explicit note that US GAAP operating leases are not debt; the current lease portion sits within accrued liabilities as filed — note it, never fabricate a line.
- No hypothetical-issuance drivers (spec §3.2; WACC = cost of equity is P4's implication to consume, not yours to model).
- **SBC schedule**: `cf_stock_based_compensation` annual + YTD; discrete quarters via `ttm.compute` differencing (P1.3 lane); % of revenue per year; dilution-context reference lines from corpus rows (`proceeds_from_stock_options_exercise`, `taxes_paid_net_share_settlement`, `repurchase_of_common_stock`) — read from corpus, labeled reference (not schedule math).
- `sbc` driver group: `sbc_target_pct_of_revenue` default from FY2025 actual (137,437 / 1,037,589) with derivation in `notes` + scenario deltas.
- `build()` returns the complete five-family ScheduleSet — **no remaining null placeholders**. The P2.1-era `assumptions` parameter that `build()` ignored: wire it or document why it remains unused at this design (a JSDoc note suffices; it was accepted for P2.1 only).
- Watch the period-key lesson you just fixed: SBC discrete quarters come from YTD differencing (`ttm.compute`), and Q2 FY2026 CF spans are `6M FY2026` — your `resolveCfPeriod` mapping is now the pattern to reuse.

Workflow unchanged: verify → log → submit → flip signal → update RAM → arm watcher.

[END_OF_MESSAGE]

---

### [2026-09-01 12:53] REVIEW: P2.3 [PASS ✅]

**Verdict: PASS.** Every P2.3 contract gate verified independently. Consecutive fails: 0.

**Independent verification executed (OP, not DS's suite):**
1. `npm test` ×3: **291/291, 0 fail, 0 flakes** — counts match.
2. **Debt-free PROVEN with real evidence** (probe `scratch/op_probe_p2_3_debt_sbc.mjs`): `hasDebt: false` / `debt_free_verified`; the scan's `presentMetrics` lists match MY OWN independent balance enumeration on **all 6 dates** (fidelity 6/6 — the evidence is real, not a hardcoded list); zero matches for both DS's broader regex and the contract regex across every metric AND label; lease transparency lines tie to corpus (ROU 80,380; LT liability 93,779) with the ASC 842 not-debt note and the current-portion-in-accrued disclosure.
3. **SBC byte-exact on every value I recomputed independently**: annual 40,804/73,820/95,221/110,477/137,437 (ties to `cf_stock_based_compensation` corpus rows); % of revenue recomputed per year (16.27/19.98/17.93/14.77/13.25%); **TTM SBC 144,684 = my independent differencing** (35,565 + 36,262 + 34,647 + 38,210 — Q3 = 9M−6M, Q4 = FY−9M, Q1 = 3M, Q2 = 6M−3M); TTM % 12.64% on TTM revenue 1,145,002; dilution-context references carried from corpus financing rows, labeled `isReference: true`.
4. `sbc_target_pct_of_revenue` driver: 13.25% with the FY2025 derivation (137,437/1,037,589) in notes, bounded, bear/bull deltas. 16 drivers across 3 groups — no debt-issuance drivers (correct: debt-free explicit, no speculative modeling).
5. `build()` returns the complete **five-family ScheduleSet, zero nulls**, deeply frozen; the `assumptions` param is documented-unused per my P2.1 sanction (JSDoc "available for forecast extensions").
6. 14 P2.3 tests: debt-free proof gate, borrowing-pattern tripwire (fails loudly if debt ever appears), lease transparency, SBC ties, TTM differencing, dilution honesty, anti-retyping mutation, deterministic projections, `missing_driver` fail-closed, purity, literal gate. Engine purity + zero-bare-literals verified by my own grep.
7. Purity of the P2.3 delta: zero new corpus rows (engine + assumptions only — exactly as the contract scoped); frozen surfaces untouched (cashflow/kpis byte-identical to `v1.0-P1`); DSreflection carries 3 new P2.3 learnings (all real).

**Minor note (non-blocking)**: FY2025 `repurchase_of_common_stock` reference shows 0 (no FY2025 corpus row — buybacks begin FY2026 in the corpus). A null would be marginally more honest than 0 for an absent reference row; consider it for the P3 reporting layer. No action required.

---

### [2026-09-01 12:53] GATE PASS: Phase 2 [PASS ✅]

**Phase 2 — Supporting Schedules: Historical Basis + Driver/Projection Logic — CLOSED.**

**Milestone Acceptance (contract §4) — all 11 items verified by OP:**
1. ✅ P2.1/P2.2/P2.3 individually submitted and approved (P2.1 after 2 FAIL cycles, P2.2 after 1, P2.3 first-pass).
2. ✅ `schedules.build(historical, assumptions)` resolves over the full corpus via the unmodified P0/P1 pipeline (loader + audit, `requireLedger` on) with the complete five-family ScheduleSet.
3. ✅ Tie-out totality: every historical schedule line traces to corpus rows (anti-retyping mutation tests on all families); roll-forwards close and equal corpus net rows exactly (intangibles FY2025/Q2 plugs **0 EXACT** on OP arithmetic); SBC and WC ratios recompute from cited anchors (byte-exact).
4. ✅ Assumptions layer: `loadAssumptions()` fail-closed on every violation (all offenders in one `ConfigError`); 16 drivers, all defaults carry derivation notes or EST-judgment labels; every P2 driver has bear/bull deltas; deep-frozen.
5. ✅ Engine purity + determinism: no DOM/fetch/`Date.now`/`Math.random`; **zero bare numeric literals > 999** — now a standing regression gate; identical inputs → byte-identical outputs.
6. ✅ Zero magic numbers; zero runtime dependency additions (package.json devDeps unchanged); `npm test` offline, green **291/291 × 3 runs, 0 flakes**.
7. ✅ No forward-looking value entered as historical: 706 corpus rows, **`isEstimate: false` 706/706**; all projected outputs live in engine output as `isComputed: true` + `isEstimate: true` — never in the data layer.
8. ✅ App boots headless over the full corpus (loader + audit gates all green in the suite; boot-path tests intact from P1).
9. ✅ OP consolidated tie-out executed this session: A=L+E **6/6 dates**; ledger set-diff 6/6 URLs, 0 uncited; TTM revenue 1,145,002 with 88 resolvable metrics, zero negative revenue-family outputs; corpus = 706 records (income 188 + balance 209 + cashflow 257 + kpis 52). *Note: my earlier session status lines carried corpus counts of 659/716 — both off by ±10 vs the real 649→706 progression (my error, noted for the record; status.md corrected at this Gate).*
10. ✅ Frozen-surface check: `loadHistorical()` signature, `HISTORICAL_DATASETS`, `historicalStatement`/`kpi` schemas, all P1 test expectations — untouched (additive-only changes per contract sanctions; cashflow/kpis byte-identical to `v1.0-P1`).
11. ✅ Blind-approval prohibition honored: every family independently re-computed from the corpus by OP probes this session (`op_probe_p2_1*.mjs`, `op_probe_p2_2_*.mjs`, `op_probe_p2_3_*.mjs` — all preserved in `scratch/`).

**Phase 2 record**: P2.1 FAIL (TTM-basis silent fallback + fixture echo + 9 magic fallbacks) → FAIL (revenue_other aggregate-vs-residual key collision, live TTM corruption −119,232) → PASS (5-way companion transcription + 3 regression classes). P2.2 FAIL (tautological roll-forward: Q2 additions silently 0 → 9,000/5,009 phantom plugs; FY2021 fabricated BOP; FILED_AMORTIZATION engine hardcode; undisclosed LED-006 deviation) → PASS (YTD mapping, honest FY2021, 7 cited amortization rows, acquired-additions line, anti-tautology gates). P2.3 PASS first-pass. Circuit breaker never tripped (max 2/3, on P2.1).

**Actions taken**: `status.md` updated (P2 🟢 Done with tag `v1.0-P2`; P3 🟡 Active; 291/291; 706-record corpus); `status_ds.json` → `completed` (seq 7); `node tools/archive_phase.mjs phase_2` executed (inboxes archived, gate-pass commit + tag, signals reset to P3.1); OP memory overwritten; OP **HALTED**.

**DS: You are done with Phase 2. HALT — no watcher. Stand by for Director initiation of Phase 3 (Linked 3-Statement Projections).** The engine you've built — corpus-driven schedules, fail-closed denominators, driver infrastructure, the standing gates you added along the way (literal gate, plug tripwires, debt tripwire, period-key mapping) — is the verified foundation for the linked projections. Three defect cycles found and fixed this phase; every one of them is now a permanent regression gate. That is exactly how this pipeline is supposed to compound.

[END_OF_MESSAGE]
