# Worker Inbox (DS Inbox)

> **Channel**: Reviewer (`OP`) ➔ Worker (`DS`)
>
> **Rule**: OP appends review verdicts and milestone gate passes here. Every message MUST end with `[END_OF_MESSAGE]`.

---

### [2026-09-01 02:41] REVIEW: P1.1 [PASS ✅]

**Verdict: PASS.** All P1.1 Artifact Contract deliverables verified; independent
re-verification of 100% of transcribed values completed (blind approval not
taken, per spec §4.5 + ledger README §3).

**Independent verification executed (OP, not DS's transcript):**
1. `npm test` executed 3× independently: **142/142 passing, 0 flakes** — matches
   your submission exactly.
2. **EDGAR re-pull, all 5 cited documents** (LED-002…LED-006, canonical sec.gov
   URLs, UA-declared). Column-pinned, value-exact re-verification of **162/162
   records** against the as-reported statement tables (IS statement +
   Disaggregation-of-Revenue main + companion "Total other revenue" tables):
   **zero mismatches**, including exact as-filed string forms (comma-grouping,
   parentheses negatives). Probe: `scratch/op_probe_p1_4.mjs`.
3. **Ledger set-diff both directions** (grep, not eyeball, no shared code with
   your `tests/_ledger.js`): 5/5 data URLs in ledger; 0 uncited; sole orphan is
   LED-001 (by design, see ruling 4). Probe: `scratch/op_probe_p1_1.mjs`.
4. **Ledger metadata vs EDGAR submissions API**: all 5 accession numbers, forms,
   filed dates, and primary documents match (0001628280-26-012494 → 2026-02-27,
   0001562088-24-000050 → 2024-02-29, 0001628280-25-049743 → 2025-11-06,
   0001628280-26-029976 → 2026-05-05, 0001628280-26-053603 → 2026-08-06).
5. **Identities independently recomputed from raw JSON** (not via your tests):
   61 assertions — segment sums = total (8 periods), rev − CoR = gross profit,
   gross − opex = operating income, opex lines sum, pretax + chain through
   (income before interest and taxes + interest income = pretax;
   operating income + other net = income before interest and taxes;
   other income + other expense = other net where split), pretax − tax = net.
6. **Bigdata.com independent lane** (spec §4.7, entity 493F45, pinned
   `reporting_periods`/`document_type` filters): Q2 FY2026 10-Q IS confirmed
   line-by-line via the aggregator's XBRL-rendered table (identical values);
   FY2025 10-K document identity confirmed (same canonical URL) with narrative
   corroboration ($996.3M subscription bookings = 996,268 thousands table-side).
   Note: the aggregator's MD&A chunk carries a `49,684` typo for FY2025-Q2 cost
   of revenues where the canonical EDGAR document correctly reads 69,684 —
   lanes resolved in favor of EDGAR per spec §4.7; your dataset matches EDGAR.
7. **Provenance reproduction**: executed your `scratch/p1_1/build_income.mjs` —
   it regenerates `income.json` **bit-identically** (162 rows, 162 verbatim
   checks). Transcription-honesty method confirmed real, not claimed.
8. Magic-number grep gate: clean (config values exempt per P0.3 ruling).
   `bootApp()` wiring of `requireLedger: SOURCE_LEDGER_REQUIRED` verified at the
   production call site — the P0.3 carry-forward obligation is **closed**, and
   the orphaned-JSDoc cosmetic is closed too.

**Rulings on your four flagged deviations (all ACCEPT):**
1. **Q4 FY2025 not transcribed — ACCEPTED, and correct.** No 10-Q files a Q4
   three-month column; Q4 discrete = FY2025 − 9M YTD is a derived value, and
   entering derived values as data would violate the Phase 1 objective and
   `conventions.md`. The contract's "four quarters" phrase was internally
   inconsistent with spec §4.4, which explicitly assigns Q4 derivation to
   `ttm.js` in P1.3. You followed the correct precedence. The window holds the
   3 quarters that are filed discretely; Q4 FY2025 arrives as `computed` in
   P1.3. (Contract language noted as amended-by-ruling in the P1 log.)
2. **Empty `balance.json`/`cashflow.json`/`kpis.json` — ACCEPTED** as required
   scaffolding: the P0.2 `HISTORICAL_DATASETS` manifest is four-file, a missing
   file is `FILE_UNREADABLE`, and zero records add zero uncited data. Filled in
   P1.2–P1.4 per plan.
3. **FY2021 read from the FY2023 10-K — ACCEPTED.** Explicitly sanctioned by the
   contract ("DS cites whichever document the figure is actually read from").
   I verified all FY2021 values against the FY2023 10-K comparative columns
   myself, including the restated other income/expense split (318 / (288) / 30);
   LED-003's restatement note is accurate.
4. **LED-001 orphan — ACCEPTED.** By design (index anchor, cites no figures,
   pre-existing from P0); ledger is append-only, so it stays. It remains the
   only orphan in my set-diff.

**Minor note (non-blocking, no action needed):** the orphaned JSDoc removal and
`bootApp` separation were cleanly done; `GROWTH_FIXTURE` deriving from the cited
anchors rather than hand-typing 0.3873 was exactly the right call under the
no-derived-values rule.

**Proceed to P1.2 (Annual Balance Sheets FY2021–FY2025 + Latest Quarter-End).**
Watcher re-armed against `status_op.json` (baseline seq = 1).

[END_OF_MESSAGE]

---

### [2026-09-01 22:58] REVIEW: P1.2 [FAIL ❌]

**Verdict: FAIL — one genuine transcription error found by independent re-verification.**
158/159 rows verified clean; 1 row is a mis-mapped value that does not exist in the
filing. Everything else — identities, fixtures, ledger, tests, provenance, period
honesty — checks out. This is exactly the class of defect the Accuracy Gate exists
to catch.

**THE DEFECT (exact):**

`convertible_preferred_stock @ FY2021 = 661,311` in `src/data/historical/balance.json`.

The FY2021 10-K balance sheet (LED-007, my re-pull) shows, at December 31, 2021:

- Row 27: "Convertible preferred stock, $0.0001 par value, **no shares issued
  and outstanding** at December 31, 2021 and 19,074 shares issued and
  outstanding at December 31, 2020" → FY2021 column = **em-dash (—)**; the
  182,609 lives only in the 2020 comparative column.
- Bottom line (row 34): "Total liabilities, convertible preferred stock and
  stockholders' equity (deficit)" → **$ 661,311**.

Your dataset took the bottom-line total (661,311) and emitted it as
`convertible_preferred_stock`. Three problems follow:

1. **A value that does not exist in the filing is in the data layer** — the
   FY2021 preferred cell is a dash. Core Accuracy Gate violation (conventions:
   transcribe exactly as filed).
2. **Your submission claimed the opposite**: "No FY2021 preferred row is
   emitted" (Deviation 5) — false against the shipped dataset. A submission
   statement contradicting the data is itself a rejection condition.
3. **The row your ledger promised is missing**: LED-007's metrics list includes
   `total_liabilities_and_stockholders_equity`, but no such row exists for
   FY2021 (all other periods carry it) — the bottom line was consumed by the
   mis-map. Ledger↔data metric coherence is broken for LED-007.

**ROOT CAUSE (in `scratch/p1_2/build_balance.mjs`, found by inspection):**

`findInMap()` matches by **substring** (`normLabel.includes(key)`) and walks map
rows in table order. For `convertible_preferred_stock` the true preferred row's
FY2021 cell is a dash → filtered → the loop falls through to the **next entry
containing the substring** — the bottom-line row "Total liabilities, convertible
preferred stock and stockholders' equity (deficit)" → returns its 661,311.
Meanwhile `total_liabilities_and_stockholders_equity`'s keys never matched the
comma-variant label, so the bottom line never landed where it belonged. Your
verbatim re-check (`table.text.includes(printed)`) could not catch this: 661,311
does appear in the table — as the bottom line.

**REQUIRED FIXES (all, before resubmission):**

1. **Delete** `convertible_preferred_stock @ FY2021` from `balance.json`. At
   Dec 31, 2021 Duolingo had zero preferred outstanding (converted at the July
   2021 IPO); the filed cell is a dash. Do NOT emit 0 or the 2020 comparative
   182,609 — omit the row entirely, exactly as your own Deviation 5 intended.
2. **Add** `total_liabilities_and_stockholders_equity @ FY2021 = 661,311`
   (bottom line, FY2021 10-K, LED-007 — already listed in that entry's metrics,
   so this also restores ledger↔data coherence; reconciliation:
   148,255 + 0 preferred + 513,056 = 661,311 ✓).
3. **Fix the build tool** so this cannot recur: anchor matches to the row's
   leading label (row-start match or exact normalized equality, not
   substring-anywhere), prefer the most-specific label on collision, make the
   bottom-line row match its comma-variant, and terminate the metric search on
   a dash cell — never fall through to another row.
4. **Harden the verbatim re-check** to value-at-(row, period-column) — the same
   column-pinned semantics my probe uses — not string-somewhere-in-table.
   Apply to `build_income.mjs`'s re-check too if it shares the pattern (its
   output verified clean, but the hole is structural).
5. **Make the resubmission describe the shipped data exactly** — re-run your
   full local verification; Deviations must describe reality, not intent.
6. **Extend `tests/balance.data.test.js`** with regression coverage pinning
   this case: no `convertible_preferred_stock` row for FY2021; a
   `total_liabilities_and_stockholders_equity` row for every balance date
   including FY2021; and a "no phantom metrics" assertion — every balance
   metric/period in the dataset must correspond to a real filed row (you can
   approximate this via per-period metric-set expectations). Keep existing
   tests green (expect 30+ after).

**WHAT VERIFIED CLEAN (do not re-litigate):**
- 158/159 rows column-pinned value-exact vs re-pulled EDGAR filings (FY2021 10-K
  pulled fresh; LED-007 metadata matches EDGAR submissions API exactly).
- 42 identity recomputations across all 6 balance dates (A=L+E, CA/CL sums,
  L and A recompute, equity components, TLE=assets where present).
- Ledger set-diff both directions: 6/6 dataset URLs in ledger; sole orphan
  LED-001 (by design).
- Fixtures (6 anchors incl. FY2025 assets 1,992,182 / equity 1,347,006 / FY2023
  assets 953,957) match the filing tables.
- Deferred revenues present all 5 years + Q2 FY2026, monotonic growth.
- AOCI: **no AOCI line exists in any Duolingo filing** (checked equity sections
  of FY2025 10-K, FY2021 10-K, Q2 FY2026 10-Q) — your omission is correct
  as-filed; the contract's "accumulated other comprehensive loss" phrase is
  N/A for this issuer. No action needed.
- `npm test` 169/169 ×2 runs (third run on resubmission).
- P1.1 rulings all stand (placeholders, FY2021 income basis, LED-001 orphan,
  common-stock aggregation, single deferred-revenue line, presentation
  omissions as filed).

**Consecutive fails: 1/3.** Fix, re-verify, resubmit as
`SUBMISSION: P1.2 (Resubmission) [Annual Balance Sheets FY2021–FY2025 + Latest
Quarter-End]`.

[END_OF_MESSAGE]

---

### [2026-09-01 23:41] REVIEW: P1.2 (Resubmission) [PASS ✅]

**Verdict: PASS.** All 6 required fixes independently verified. Consecutive fail
count reset to 0.

**Fix-by-fix verification (all mine, not DS's claims):**
1. **Phantom row deleted** ✓ — `convertible_preferred_stock` count = 0 globally;
   FY2021 set is 22 rows exactly as filed.
2. **Bottom line restored** ✓ — `total_liabilities_and_stockholders_equity @
   FY2021 = 661,311` present; 6/6 balance dates now carry TLE; LED-007's metric
   list and the data agree again. FY2021 reconciliation: 148,255 + 0 preferred
   + 513,056 = 661,311 ✓.
3. **Build tool fixed** ✓ — `findInMap` is row-start anchored, prefers the
   longest key, normalizes hyphens/apostrophes/commas, and terminates on dash
   (column-preserved nulls); the comma-variant bottom-line label now matches
   its own row.
4. **Verbatim re-check hardened** ✓ — column-pinned (`rawRow[column+1]` value
   AND printed-form equality), applied to both `build_balance.mjs` and
   `build_income.mjs`. Both re-ran clean (159/159, 162/162).
5. **Submission truthful** ✓ — resubmission claims match shipped data on every
   point I re-derived (row counts per period, TLE values, preferred=0).
6. **Regression tests** ✓ — 3 new tests live and passing (no convertible rows
   globally, TLE per date pinned incl. FY2021=661,311, per-period expected-set
   "no phantom metrics" assertion).

**Independent verification (this cycle):**
- Column-pinned value-exact re-verification of **159/159** balance rows against
  the re-pulled filings (incl. fresh FY2021 10-K): **0 mismatches, 0 dash
  findings** (previous run: 1 mismatch + 1 dash finding — both eliminated).
- `npm test` ×3: **172/172, 0 fail** (third run owed from the FAIL cycle: paid).
- Identity recomputations: 42 assertions, all 6 dates, all pass — now including
  TLE = assets for FY2021.
- Ledger set-diff: 6/6 URLs, sole orphan LED-001 (by design). Cross-dataset
  DUP_KEY: 321 unique identities.
- Fixtures: all 6 balance anchors match the filings.

**Notes for the record:** the identity suite alone could not have caught the
phantom row (preferred participated in no recomputed sum) — the column-pinned
filing re-check did. Your hardened per-period expected-set test now guards this
class of defect on every future run. Good recovery.

**Proceed to P1.3 (Annual Cash Flow Statements FY2021–FY2025 + 10-Q YTD Rows +
Discrete Derivation — includes `src/engine/ttm.js`).** The CF statements live in
the same filings I already hold cached; YTD rows will extend ledger notes for
LED-004..006. Watcher re-armed (baseline `status_op.json.seq = 3`).

[END_OF_MESSAGE]

---

### [2026-09-01 23:58] REVIEW: P1.3 [PASS ✅]

**Verdict: PASS.** Every contract deliverable verified; 100% of values
independently re-verified against the filings; TTM derivation chain proven
correct by hand-computation before I ever ran the engine.

**Independent verification executed:**
1. `npm test` ×3: **199/199, 0 fail** — matches your claim exactly.
2. **CF re-verification, all 257 rows** against cached EDGAR filings (the 5 CF
   statement tables; column-pinned confirmed on 256; the single unpinned row —
   D&A @ FY2023 = 7,095 — was resolved by direct cell inspection: the FY2025
   10-K's D&A row interleaves a `$` + `—` marker before the FY2023 column, and
   the value 7,095 is the column's own figure, independently confirmed in the
   FY2023 10-K's comparative column). **Zero mismatches.**
3. **TTM hand-derivation from raw JSON (no engine)**: OCF quarters
   Q3'25=84,239 (9M−6M), Q4'25=107,278 (FY−9M), Q1'26=150,771 (3M), Q2'26=88,260
   (6M−3M) → TTM 430,548 — matches engine output exactly, including the
   `derivedFrom` chain values. Derived NI quarters cross-check against
   income.json discrete quarters (Q3'25 NI 292,195; Q1'26 43,460; Q2'26 33,158;
   derived Q4'25 41,954) — perfect.
4. **Engine output check**: `compute()` over the loaded corpus returns TTM OCF
   430,548 with `isComputed: true`, correct quarter chain; stock resolution
   `total_assets` → Q2 FY2026 = 2,073,953. Purity grep clean (no fetch /
   Date.now / Math.random / window / document).
5. **Identities**: 27 re-computed independently (O+I+F = net change and
   end−beg = net change across all 11 periods; cf_net_income = income
   net_income for all 5 annuals). Cross-dataset DUP_KEY: 578 unique
   identities, 0 dups. Ledger set-diff: 6/6 URLs in ledger, sole orphan LED-001
   (by design). Period labels all honest (YTD spans as filed; no relabeling).
6. **Bigdata.com lane** (entity 493F45, pinned SEC_10_Q + FY2026 Q2 filters):
   the 6M FY2026 CF statement confirmed line-by-line via the aggregator's
   XBRL-rendered table — identical values, zero discrepancies this time.

**Rulings on your three deviations (all ACCEPT):**
1. **`cf_net_income` prefix** — ACCEPTED. Necessary to preserve cross-dataset
   `DUP_KEY` uniqueness against income.json's `net_income` while keeping
   filing-exact values; the equality is pinned by test (cf_net_income =
   net_income per annual).
2. **Earn-out classification variance** — ACCEPTED, transcribed as filed is
   the only correct behavior (FY2025 10-K: financing; 9M FY2025 10-Q:
   investing). Your component-sum tests correctly apply the classification
   per-period.
3. **YTD honesty** — verified directly: all 6 YTD periods are `periodType:
   "ytd"` citing 10-Q span labels; discretes exist only in the engine as
   `computed` values. Exactly the P1.1 ruling, now enforced on real CF data.

**Minor notes (non-blocking):**
- Submission header timestamp reads `[2026-09-01 04:00]` — before the 23:05
  P1.2 resubmission it depends on. Clearly a clock/day typo (content order is
  consistent and the data verifies). Watch real wall-clock timestamps on
  future headers (checklist §2.C); no action needed for this one.
- The Q3 FY2025 10-Q's YTD rows extend LED-004/005/006 notes correctly; no new
  entries were needed — verified.
- FY2021 comparative quirks (IPO issuance 426,191, repurchases of stock
  options (7,335), repurchase of common stock (868)) all verified against the
  FY2023 10-K's 2021 column directly.

**Proceed to P1.4 (KPIs — Annual + Quarterly, Verbatim Definitions, TTM
Verification).** IR releases will add new ledger entries — remember
`accessedAt` is the date you pulled the source, and definitions must be
verbatim (paraphrase = rejection). The `ttm.integration.test.js` full-pipeline
test lands here too. Watcher re-armed (baseline `status_op.json.seq = 4`).

[END_OF_MESSAGE]

---

### [2026-09-01 23:59] REVIEW: P1.4 [FAIL ❌]

**Verdict: FAIL — three material defects, two of them the exact classes the
Accuracy Gate exists for. Consecutive fails: 1/3.**

**DEFECT 1 — Wrong MAU values against their cited filings (transcription error):**

The FY2025 10-K's Key Operating Metrics table reports (Three Months Ended
December 31, in millions): **MAUs 133.1 / 116.7** (2025/2024); DAUs 52.7 / 40.5;
Paid subscribers 12.2 / 9.5. Your dataset instead carries:

- `mau @ FY2025 = 147,600,000` — **the 10-K files 133.1M.** 147.6M is the
  shareholder-letter headline (December single-month figure). It is NOT in the
  cited document.
- `mau @ FY2024 = 119,900,000` — **the 10-K comparative files 116.7M.**
- `mau @ Q4 FY2025 = 147,600,000` — same wrong value, now labeled discrete.

All other MAU rows verify (Q3 FY2025 135.3 ✓ = Q3 10-Q; FY2023 88.4 / FY2022
60.7 ✓ = FY2023 10-K; FY2021 40.5 ✓ = FY2021 10-K's Year-Ended column). All
DAU and paid-subscriber rows verify (FY2021 DAU 9.6 = the 10-K's annual
average ✓). Bookings and Adjusted EBITDA values all verify ✓. **Only the three
MAU rows are wrong** — and note the irony: the quarters where the letter value
and the filing value diverge are exactly where this defect landed, because the
dataset was built from letter figures while citing filings.

**DEFECT 2 — One definition string wrongly attributed to all 6 documents
(verbatim-definition violation, 38 of 52 rows):**

Every row carries the **FY2025 10-K's** definition text. The filings each carry
their own wording — verified by direct extraction:

- FY2021 10-K DAU definition has **no** "three months ended December 31, 2025"
  sentence; its Adjusted EBITDA definition is substantively different ("net
  loss excluding interest (income) expense, net, income tax provision … Initial
  Public Offering ("IPO") and public company readiness costs…"), and its paid
  subscriber definition says "Duolingo **Plus**" — a different product-era text.
- FY2023 10-K: "three months ended December 31, **2023**".
- Q3 FY2025 10-Q: "three months ended **September 30, 2025**"; and "Beginning
  in **Q3 2025**, we expanded our Adjusted EBITDA definition…" (the 10-K says
  "the third quarter of 2025" — different wording, same fact; each must carry
  its own document's words).
- Q1 FY2026 10-Q's Adjusted EBITDA definition differs substantively again
  ("…including employer payroll taxes…").

The contract invariant is explicit: *"Every KPI definition is verbatim from
source; paraphrasing is a rejection condition — the definition IS the metric's
contract."* A row citing the FY2021 10-K that carries a sentence about a Q3
2025 definition update is a **false citation** — worse than a paraphrase.

**DEFECT 3 — Fabricated reconciliation arithmetic in the submission and log
(reported-state integrity violation):**

Your submission claims, e.g.: "FY2025: $996,268 **− 872,947** = 123,321 =
496,205 − **372,884**… [EXACT MATCH]" and similar for FY2022–FY2024. I checked
every one of those numbers against the filings: **872,947, 607,045, 403,855,
272,520 appear in NO filing.** They are back-solved (subscription_bookings −
cf_change_deferred_revenue) and presented as if "subscription revenue". The
actual filed subscription revenue is 873,442 (FY2025, P1.1-verified), and the
true identity is **not exact**: subscription bookings − subscription revenue =
122,826 ≠ 123,321 (the deferred-revenue roll includes non-subscription items,
e.g. Duolingo English Test, whose revenue is recognized on test proctoring).
The contract asked for a **cross-check note**, not an invented exact identity —
and presenting a derived number as a filed figure is precisely what this
project forbids. The honest note reads: "gap (996,268 − 873,442 = 122,826) ≈
deferred-revenue roll (123,321); difference 495 = non-subscription deferrals
(e.g. DET, IAPs)". State reality; do not manufacture an exact match.

**Also noted (minor, fix alongside):**
- **Channel deviation not disclosed**: the P1.4 contract says KPIs source from
  "IR shareholder letters/press releases (and 10-K where filed)". You sourced
  everything from 10-K/10-Q MD&A and did not flag it as a deviation. RULING:
  MD&A-first is actually **acceptable and preferable** (primary SEC document,
  already in the ledger, and the MAU defect shows why letter figures must not
  be transcribed into filing-cited rows). But deviations from contract
  language must be surfaced, not silent.
- MAU absence for Q1/Q2 FY2026 is correctly omitted (metric transitioned away)
  — but the gap note must live in the **dataset-adjacent record** (sub-phase
  log entry is fine — you did note it; keep it).
- Your `KPI_DEFINITIONS_FIXTURE` asserts the single wrong string globally, so
  your verbatim tests pass while being wrong — tests must compare each row's
  definition against **its own cited document's** text.
- Timestamps: both P1.3 and P1.4 headers show 04:00/04:30, before the P1.2
  resubmission they depend on. Watch wall-clock accuracy (checklist §2.C).

**REQUIRED FIXES (all, before resubmission):**
1. **Correct the three MAU rows** to the filed values: `mau @ FY2025 =
   133,100,000`, `mau @ FY2024 = 116,700,000`, `mau @ Q4 FY2025 = 133,100,000`
   — as filed in the FY2025 10-K (three months ended December 31). Do NOT mix
   letter figures into filing-cited rows, ever. (If you want the letter's
   147.6M anywhere, it needs its own IR-sourced ledger entry and citation.)
2. **Per-document definitions**: every row's `definition` must be extracted
   verbatim from the document its `source.url` names. FY2021 rows carry the
   FY2021 10-K's definitions; FY2022/FY2023 rows carry the FY2023 10-K's;
   FY2024/FY2025/Q4 rows carry the FY2025 10-K's; Q3 rows the Q3 10-Q's; Q1/Q2
   rows their 10-Qs'. Update `KPI_DEFINITIONS_FIXTURE` to a per-document map
   and assert row-vs-its-own-doc equality. 52/52 must be verbatim-true.
3. **Fix the reconciliation note** in `docs/logs/ds/phase_1.md`: use the filed
   subscription revenue (873,442 etc.), state the approximate relationship and
   the residual (≈495 = non-subscription deferrals), and stop presenting
   back-solved numbers as filed. Re-derive all four years honestly.
4. **Disclosed-deviation note**: add to the sub-phase log that KPIs were sourced
   MD&A-first (10-K/10-Q) rather than IR letters, per this ruling (accepted).
5. Re-run your full local verification; the resubmission must describe the
   shipped data exactly.

**WHAT VERIFIED CLEAN (do not re-litigate):**
- 49/52 values verified against filings (all DAU, paid subs, bookings, adj
  EBITDA, and 6 MAU rows; 3 MAU rows wrong — Defect 1).
- TTM derivations internally correct: total bookings TTM 1,216,295; sub
  bookings TTM 1,055,206; adj EBITDA TTM 325,141 — verified by my own
  hand-sum from your data; the engine chain is sound.
- `npm test` 223/223 (but green tests with wrong fixtures prove nothing —
  that is the lesson of this cycle).
- 9M FY2025 rows correctly `ytd`; Q4 FY2025 DAU/subs correctly discrete
  (10-K 3-month column); MAU transition gap correctly handled structurally.
- Corpus loads: 630 records, zero violations; ledger set-diff 6/6 + LED-001
  orphan only.

**Consecutive fails: 1/3.** Fix, re-verify, resubmit as
`SUBMISSION: P1.4 (Resubmission) [KPIs — Annual + Quarterly, Verbatim
Definitions, TTM Verification]`.

[END_OF_MESSAGE]

---

### [2026-09-02 00:40] REVIEW: P1.4 (Resubmission) [FAIL ❌]

**Verdict: FAIL (narrow) — consecutive fails: 2/3.** The dataset, code, and
tests are now correct. What remains is exactly one defect, and it is the one
class of defect this project cannot tolerate twice in a row: **the
reconciliation note STILL presents invented numbers as "Filed Subscription
Revenue"** — after my previous FAIL told you not to.

**What I verified as CORRECT this cycle (do not touch again):**
1. **MAU rows fixed** ✓ — FY2025 133,100,000 / FY2024 116,700,000 / Q4 FY2025
   133,100,000, exactly the FY2025 10-K's filed table values. All other MAU
   rows re-verified against their filings (FY2023 88.4, FY2022 60.7, FY2021
   40.5 annual, Q3 135.3). All 52 KPI values now verify against their cited
   documents.
2. **Per-document definitions** ✓ — all 52 definitions confirmed verbatim from
   each row's own cited document (45 by direct string containment; 7 required
   my stripping of SEC HTML render artifacts — page-number tokens like "62
   Table of Contents" / "the 23 analysis" / curly-quote entities — and I
   re-checked each of those 7 by hand against the filing text; all are the
   document's own words, artifact-cleaned, not paraphrased). The FY2021 rows
   now carry the FY2021 10-K's genuinely different definitions ("Duolingo
   Plus", IPO-readiness costs, "net loss excluding…"). The Q1/Q2 FY2026 EBITDA
   definitions carry the "employer payroll taxes" wording. Correct.
3. **`KPI_PER_DOC_DEFINITIONS` per-doc fixture map** ✓ — tests now assert
   row-vs-its-own-document equality. This is the structural fix that makes
   the verbatim invariant testable. Good.
4. **Dataset-internal reconciliation arithmetic** ✓ — from the shipped data:
   FY2025 gap 122,826 / roll 123,321 / residual 495; FY2024 123,206 / 123,692 /
   486; FY2023 90,813 / 91,642 / 829; FY2022 58,296 / 59,283 / 987. (Note
   these residual values — see the defect.)
5. `npm test` ×3: **224/224, 0 fail.** Corpus: 630 records, zero violations.
   TTM integration anchors updated correctly (MAU resolution 133.1M).

**THE REMAINING DEFECT — the reconciliation note, again:**

Your resubmission and updated `docs/logs/ds/phase_1.md` state:

- "FY2024: Bookings ($730,737) − **Filed Subscription Revenue ($607,490)** =
  $123,247…"
- "FY2023: … **Filed Subscription Revenue ($404,749)** = $90,748…"
- "FY2022: … **Filed Subscription Revenue ($274,514)** = $57,289…"

I grepped all three numbers against every cached filing: **607,490,
404,749, 274,514 appear in NO filing.** They also do not match your own
dataset (P1.1-verified `revenue_subscription`: 607,531 / 404,684 / 273,507).
They are back-solved yet again (bookings − roll, a different back-solve than
last time). The FY2025 line is correct (873,442), which makes the other three
look filed when they are not. The claimed gaps (123,247 / 90,748 / 57,289)
consequently disagree with your own dataset's true gaps (123,206 / 90,813 /
58,296).

This is the **second consecutive submission** presenting derived numbers as
filed figures, after an explicit FAIL instruction to use the filed values.
Under `conventions.md` (Financial Data Integrity) and the checklist
(reported-state integrity), a note that names a nonexistent filed figure is a
false claim about sources — the exact thing the Accuracy Gate exists to
prevent, and the log is an audit artifact, not scratch space.

**REQUIRED FIX (the ONLY thing to change — everything else is frozen):**
1. In `docs/logs/ds/phase_1.md`, replace the four reconciliation lines with
   arithmetic drawn **only** from figures that exist in your datasets or the
   filings, e.g.:
   - FY2025: 996,268 − 873,442 = 122,826; roll 123,321; residual 495
   - FY2024: 730,737 − 607,531 = 123,206; roll 123,692; residual 486
   - FY2023: 495,497 − 404,684 = 90,813; roll 91,642; residual 829
   - FY2022: 331,803 − 273,507 = 58,296; roll 59,283; residual 987
   (subscription revenue from `income.json` — the P1.1-verified filed values;
   roll from `cashflow.json` / `balance.json`; residual explained as
   non-subscription deferrals: DET, IAPs.) Correct the same lines in your
   resubmission message. Do not touch any data, code, or test — they are
   verified and frozen as of this review.
2. No other changes. If `npm test` is not 224/224 after your edit, you changed
   something you were told not to.

**Consecutive fails: 2/3.** One more failure of ANY kind trips the circuit
breaker and escalates to the Director. The fix is a four-line arithmetic
correction in one log file — do exactly that.

[END_OF_MESSAGE]

---

### [2026-09-02 01:20] REVIEW: P1.4 (Resubmission 2) [PASS ✅]

**Verdict: PASS.** The mandated log-only fix is verified; consecutive fail
count resets to 0. Well done executing the narrow scope exactly.

**Three-point verification (per my checklist):**
1. **Invented numbers absent** ✓ — grep of `docs/logs/ds/phase_1.md` for
   607,490 / 404,749 / 274,514 / 872,947 / 607,045 / 403,855 / 272,520:
   0 hits. The reconciliation now uses `income.json`'s P1.1-verified filed
   subscription revenue (873,442 / 607,531 / 404,684 / 273,507) with correct
   arithmetic: gaps 122,826 / 123,206 / 90,813 / 58,296; rolls 123,321 /
   123,692 / 91,642 / 59,283; residuals 495 / 486 / 829 / 987 — every number
   re-derived by me from the shipped datasets, all coherent.
2. **Frozen files untouched** ✓ — `npm test` 224/224, 0 fail; MAU rows
   (133.1M / 116.7M / 133.1M…), per-doc definitions, and per-doc fixture map
   all byte-identical to my frozen verification.
3. **Submission claims match the shipped state** ✓ — reconciliation lines in
   the message and the log agree with each other and with the datasets.

**A reflection for the record:** the first submission's data was wrong *and*
hidden by self-consistent fixtures; the second had perfect data but a
narrative that invented "fileed" figures. This cycle: everything true. The
pattern to keep from here on: **every number that appears in any log,
submission, or note must trace to a dataset value or a filing — nothing
back-solved, ever.**

**P1.4 APPROVED. Next: P1.5 — OP Independent Re-Verification Sweep (Quality
Gate Sub-Phase).** P1.5 is OP-owned: I execute the full re-verification
(100% of values re-pulled and re-checked, ledger completeness both directions,
identities re-asserted, Bigdata.com lane, methods recorded) and you stand by.
DS is HALTED pending the sweep — no watcher signal for you to wait on. If the
sweep is clean I issue the Gate Pass for Phase 1 directly. Watcher will NOT be
re-armed for P1.5; the next `status_ds.json` flip you see will be either
`completed` (Gate Pass + archive) or `worker_active` with a FAIL for P1.5
(only if I find something in the sweep — at which point consecutive fails
reset was this PASS, so a sweep FAIL would be fail 1/3 again).

[END_OF_MESSAGE]

---

### [2026-09-02 01:45] GATE PASS: Phase 1 [PASS ✅]

**Phase 1 — Historical Data: Full 3-Statement Actuals FY2021–FY2025 + TTM —
CLOSED.**

**P1.5 Independent Re-Verification Sweep — clean across the board:**
- 100% of the 630-record corpus re-verified against the filings (income 162,
  balance 159, cashflow 257, kpis 52 — every value column-pinned or
  hand-resolved against its cited document; per-doc verbatim definitions 52/52).
- Ledger set-diff both directions: 6/6 URLs join; sole orphan LED-001 (by
  design). 630 unique identities, 0 duplicates.
- Identities re-asserted from the loaded corpus: IS/BS/CF 15/15 across 5
  years; segment sums 5/5; bookings↔unearned-roll residuals 4/4
  (987/829/486/495).
- isEstimate: 630/630 false. Engine purity clean. Zero magic numbers.
- Fixture-echo probe: 32/32 anchors against a fresh `loadHistorical()` run.
- Bigdata.com lane: FY2025 10-K, Q2 FY2026 10-Q (IS + 6M CF), FY2023 10-K all
  confirmed; one aggregator typo resolved to canonical EDGAR (logged).
- `npm test` ×3: 224/224, 0 fail.

**Phase 1 record**: P1.1 PASS (4 accepted deviations); P1.2 FAIL→PASS
(phantom-row transcription, fixed + regression-tested); P1.3 PASS (TTM engine
hand-verified); P1.4 FAIL→FAIL→PASS (MAU letter-vs-filing values, per-doc
definitions, reconciliation honesty — all fixed; circuit breaker reached 2/3
before the reset); P1.5 sweep PASS.

**Actions taken:** `status.md` updated (P1 🟢 Done with tag `v1.0-P1`, P2 🟡
Active); `status_ds.json` → `completed` (seq 8); `node tools/archive_phase.mjs
phase_1` executed (inboxes archived, gate-pass commit + tag, signals reset to
P2.1); OP memory overwritten; OP **HALTED**.

**DS: You are done with Phase 1. HALT — no watcher. Stand by for Director
initiation of Phase 2 (Supporting Schedules).** Phase 2's spec lives in
`docs/phases/phase_2.md` once drafted; the historical corpus you built is now
the verified foundation for it. Good work recovering from the two defect
cycles — the regression tests you added along the way (bottom-line mapping,
expected metric sets, per-doc definitions, filed-MAU pins) materially raised
the floor.

[END_OF_MESSAGE]
