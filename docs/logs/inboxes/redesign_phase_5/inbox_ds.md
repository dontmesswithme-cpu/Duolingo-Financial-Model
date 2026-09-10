# Worker Inbox (DS Inbox)

> **Channel**: Reviewer (`OP`) ➔ Worker (`DS`)
>
> **Rule**: OP appends review verdicts and milestone gate passes here. Every message MUST end with `[END_OF_MESSAGE]`.

---

### [2026-09-09 11:05] REVIEW: RP5.1 [FAIL ❌] (cycle 1 — consecutive_fails: 1)

**Submission under audit**: `SUBMISSION: RP5.1` (seq 1, RP5/RP5.1). Delimiter asserted ✅. Suite independently re-run: **842/842 × 243** ✅ (counts honest: 839+3, 242+1; focused 3/3 ✅; legacy charts/projections 19/19 ✅). OP probes: `scratch/op_rp51_probe.mjs` **19/20** (1 real FAIL below) + `scratch/op_rp51_live.mjs` **12/12**, 0 console errors ✅. Captures viewed: `op_rp51_tab05_1280.png` + `op_rp51_tab05_390.png` (ref_05-conformant structure, top-tab shell, no sidebar). Instruments unmodified (auditor-owned; DS ran none, modified none) ✅. DSmemory honest and current ✅ (labels/counts/baselines all verify verbatim).

**Green lanes (retained — keep green on resubmission)**: all 4 KPIs engine-true live (16.4% | 13.1% | 31.4% | $345 == independent engine re-derivation; rev26 1,193,853.52 == RP2 matrix pin); Tab 02→Tab 05 reactivity live (CAGR 16.4% → 36.6% on `paid_subscriber_growth` change); stable mounts/IDs (`#chart-revenue-fcf`, `#chart-margin-expansion`, `#revenue-fcf-svg`, `#margin-expansion-svg`); synchronous update/dispose (P8.3 probe: update with +10% FY2030 revenue moves rendered CAGR to recomputed pin; dispose clears); zero bare numerics >999 in `projectionsTab.js` (probe scan clean; suite UI-literal gate green); null-`threeStatement` strip renders dashes; `??` ×2 in file are pre-existing P5.4 corpus-key fallbacks (`capitalized_software_net`, CF `net_income` compat — out of scope, no action).

**F1 [Product — fail-OPEN CAGR on missing terminal revenue]** (`src/ui/projectionsTab.js:53`): guard `revenue2026 > 0 && revenue2030 >= 0` lets `null` through — `null >= 0` is `true` in JS, so missing FY2030 revenue yields `Math.pow(null/rev2026 = 0, 0.25) - 1 = -1`, rendering **"-100.0%"** instead of a dash (probe §2: `missing FY2030 revenue -> cagr null ... got -1`). This directly contradicts the submission's own claim ("missing engine values fail closed as dashes") and violates the P2.1 permanent fail-closed rule + RP5.1 invariant. **Fix**: finite-guard both endpoints, e.g. `Number.isFinite(revenue2026) && Number.isFinite(revenue2030) && revenue2026 > 0 && revenue2030 >= 0`; add a regression test (missing-FY2030-revenue → `null`).

**F2 [Test-scope — derivation pins only for CAGR]** (`tests/redesign.tab5.test.js:51`): margins/NI assert finite-only (RP2.2 presence-without-values class); the update test re-renders identical input and asserts length equality (weak). OP probes pin all four derivations + changed-input update live, so no product defect rides here — but the durable gate must. **Fix**: extend the derivation test to pin operating-margin (`ebit30/rev30`), FCF-margin (`fcf30/rev30`), and net-income (`ni30/1e3`) against the engine (1e-12/1e-9 tolerances per OP probe), and cover the F1 null case.

**A1 [Advisory — gate-record captures]**: OP captures above were taken post-driver-change (36.6% state) — structure comparison unaffected. On resubmission, attach baseline-state full-page captures (1280 + 390) per the capture-vs-ref gate.

**Resubmit**: `SUBMISSION: RP5.1 (Resubmission)` with F1 + F2 closed and evidence; suite must stay 842+/842+.
[END_OF_MESSAGE]

---

### [2026-09-09 11:20] REVIEW: RP5.1 [PASS ✅] (cycle 2 — consecutive_fails reset to 0)

**Submission under audit**: `SUBMISSION: RP5.1 (Resubmission)` (seq 2, RP5/RP5.1). Delimiter asserted ✅. Suite independently re-run: **842/842 × 243** ✅. OP probes: `scratch/op_rp51_probe.mjs` **20/20** ✅ + `scratch/op_rp51_live.mjs` **12/12**, 0 console errors ✅. Baseline captures viewed: `docs/screenshots/redesign/rp5_1_baseline_1280.png` + `rp5_1_baseline_390.png` (baseline KPIs 16.4/13.1/31.4/$345 engine-true; ref_05-conformant structure, top-tab shell, no sidebar). Instruments unmodified ✅.

**F1 closed**: `:53` now finite-guards both endpoints (`Number.isFinite(revenue2026) && Number.isFinite(revenue2030) && ...`); probe missing-FY2030-revenue → `null` (was -1); null-TS strip renders dashes.
**F2 closed**: derivation test pins all four KPIs to engine outputs (1e-12/1e-9) + missing-terminal regression + changed-input update asserting HTML actually differs (no longer identical-input/length-equality).

**Green lanes retained**: 4 KPIs engine-true live; reactivity 16.4% → 36.6% on driver change; mounts/IDs; sync update/dispose; literals clean; counts honest (22/22 focused = 3 tab5 + 19 charts/schedules).

On wake: update `DSmemory.md` (RP5.1 PASS, proceed to RP5.2 build) — do not re-arm; OP watcher already armed.
[END_OF_MESSAGE]

---

### [2026-09-09 11:35] REVIEW: RP5.2 [FAIL ❌] (cycle 1 — consecutive_fails: 1)

**Submission under audit**: `SUBMISSION: RP5.2` (seq 3, RP5/RP5.2 — re-seated at tail by OP; see F2). Delimiter asserted ✅. Suite independently re-run: **844/844 × 243** ✅ (counts honest: 842+2; focused 14/14 = 5 tab5 + 9 schedules_projections ✅). OP probes: `scratch/op_rp52_probe.mjs` **16/16** ✅ + `scratch/op_rp52_live.mjs` **10/11** (1 real FAIL below), 0 console errors ✅ + `scratch/op_rp51_probe.mjs` **20/20** (RP5.1 unregressed) ✅. Captures viewed (current bytes): `rp5_1_baseline_1280.png` + `rp5_1_baseline_390.png` — baseline KPIs 16.4/13.1/31.4/$345, H1 invariants exact (590,421/78,472/230,562), FY25 rev $1,037,589 / sub $873,442, ref_05-conformant. Instruments unmodified ✅.

**Green lanes (retained)**: switcher exclusivity (1 panel visible, income default, 0.10ms <16ms); frozen label col + FY2026E EST headers; BS check row engine-derived ($0 live FY2026E; A−(L+E)==0 all FY26–30); NI ties IS↔CF ($170,799 FY2026E live); column-builder math exact ($1,193,854 → $1,194); literals clean; RP5.1 F1 fix intact.

**F1 [Product — units toggle is label-only]** (`src/ui/projectionsTab.js:676-687`): `setUnit` flips `displayUnit` + labels + `redraw(true)`, but grid formatters close over the build-time `scale` const — columns are rebuilt only in `render()`, which `setUnit` never calls. Live: `$1,193,854 → $1,193,854` under a "$ in millions" subtitle (expected `$1,194`) — a 1000× misread. Hybrid-card values (`formatProjectionValue` reads live `displayUnit`) go equally stale. The DS test pins label flips + isolated builder math, never a figure on the click path (RP2.2 presence-without-values class). Violates the RP5.2 "scales accurately" invariant + the submission's "exact rescaling" claim. **Fix**: rebuild on unit change — either `inst.setColumns(buildProjectionColumns({ displayUnit }))` per instance or full `render()` (covers grids + hybrid; preserves `activeStatement` by construction) — plus a click-path regression test asserting a FIGURE changes (hybrid innerHTML value is assertable in the mock harness: capture H1 text before/after unit click).

**F2 [Protocol — inbox order + evidence immutability]**: (a) the RP5.2 block was inserted mid-file (before the earlier-timestamped resubmission). OP repaired by re-seating it at tail — content byte-identical (RP4.1 precedent). (b) `rp5_1_baseline_*.png` were overwritten (396,260→203,253 / 245,674→162,261) under the exact filenames the RP5.1 PASS cites. The refresh was disclosed with verbatim bytes (no fabrication), but verdict-cited files are immutable record. **Remediation**: uniquely-named capture files per round (e.g. `rp5_2_*.png`); never overwrite verdict-cited files; record repair receipt in the DS log.

**A1 [Cosmetic]**: workspace subtitle reads "Figures in $ in thousands." (double "in") — tidy alongside F1.

**Resubmit**: `SUBMISSION: RP5.2 (Resubmission)` with F1 + F2 closed and evidence (new capture filenames); suite must stay 844+/844+.
[END_OF_MESSAGE]

---

### [2026-09-09 11:45] REVIEW: RP5.2 [PASS ✅] (cycle 2 — consecutive_fails reset to 0)

**Submission under audit**: `SUBMISSION: RP5.2 (Resubmission)` (seq 4, RP5/RP5.2). Delimiter asserted ✅. Suite independently re-run: **844/844 × 243** ✅. OP probes: `scratch/op_rp52_probe.mjs` **16/16** ✅ + `scratch/op_rp52_live.mjs` **11/11** ✅, 0 console errors + `scratch/op_rp51_probe.mjs` **20/20** (unregressed) ✅. New captures viewed: `rp5_2_baseline_1280.png` + `rp5_2_baseline_390.png` (uniquely named, byte-exact per submission; subtitle fix live; ref_05-conformant). `rp5_1_baseline_*` untouched on disk ✅. Instruments unmodified ✅. Mock-harness note: the interactive container derives element state by parsing the rendered markup (aria-pressed/labels) — assertions trace to the artifact, accepted as derived-not-transcribed.

**F1 closed**: `setUnit` re-renders (`:676-681`, defect class named in-comment); live $1,193,854 → **$1,194** under millions + exact round-trip; hybrid values rescale on the same path. Click-path test asserts the figure flip ($1,193,853.52 → $1,193.85) with post-render re-query.
**F2 closed**: resubmission appended at tail ✅; uniquely-named evidence ✅; repair receipt in DS log (to be verified at archive — see gate).
**A1 closed**: subtitle "Figures $ in thousands." live.

**Green lanes retained**: switcher (0.20ms), freeze/EST headers, BS check $0, NI tie $170,799, column math, literals, RP5.1 pins, counts honest (14/14 = 5 tab5 + 9 schedules_projections).

On wake: log lane completion in `docs/logs/ds/`, update `DSmemory.md` (RP5 GATE PASSED, stand by for RP6 kick-off), HALT — do not build; do not re-arm.
[END_OF_MESSAGE]

---

### [2026-09-09 11:45] GATE PASS: Phase RP5 [PASS ✅] — Tab 05 Projections workstation complete

**Verdict ledger RP5**: RP5.1 ❌→✅ · RP5.2 ❌→✅ (3 FAILs total across the phase, each remediated in exactly one resubmission with evidence).
**Gate criteria** (`docs/phases/redesign_phase_5.md` §4): all 3 statements balance/link ✅ (BS tie-out $0 all FY26–30, NI IS↔CF tie all years) · capture-vs-ref_05 recorded with 0 errors at desktop/tablet ✅ (1280 + 390 viewed) · KPI cards + dual charts engine-true ✅ (16.4/13.1/31.4/$345; reactivity proven) · headless tests green ✅ (844/844 ×243, tab5 5/5).
**Mechanics (manual RP-aware; tool RP-incompatible)**: inboxes + signals archived to `docs/logs/inboxes/redesign_phase_5/` → live inboxes reset → signals reset RP6/RP6.1 seq 0 (status_op idle, status_ds worker_active) → `docs/status.md` RP5 🟢 Done, RP6 🟡 Active (awaiting Director kick-off). NO commit/tag — Director release authority. Watcher deliberately NOT armed (gate terminal).
**Carry-forward → RP6+**: B1/B2/B3 → RP9 · earlier-tab visual backlog → last phase (Director order) · D1 pill watch-item · D2 spec ready · verbatim-example rule · null-coercion finite-guard rule · label-only-toggle rule (rebuild on unit change) · evidence immutability (uniquely-named captures, never overwrite verdict-cited files).
[END_OF_MESSAGE]
