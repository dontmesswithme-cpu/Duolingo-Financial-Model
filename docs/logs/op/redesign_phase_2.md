# OP Redesign Phase 2 Review Log

> **Channel**: Reviewer (`OP`) audit trail for RP2. Append-only.

---

### [2026-09-08 13:25] REVIEW: RP2.1 [FAIL ❌] (cycle 1/3) — recalc budget miss + double-recompute wiring

**Submission**: `SUBMISSION: RP2.1` 2026-09-08 13:12 (inbox_op.md seq 1). Integrity: tail `[END_OF_MESSAGE]` ✅.

**Independent suite**: `npm test` 758/758 × 229 suites, 0 fail (OP-run, matches claim) ✅.

**OP probes (scratch/, gitignored)**: `op_rp21_probe.mjs` 234/234 ALL PASS (raw-JSON bounds exact all 38 drivers; over/under clamp; sync dual-dispatch; filter both modes; toggle preserves values; update() query-path no-rebuild; loader fail-closed on stripped min; zero style=/numerics/protocol; V1/V3/V4 static; MKT asOf+provider+URL all 5 live anchors rf 0.0479/beta 1.47/ERP 0.0425/price 157.85/shares 50031000). `op_rp21_vision.mjs` real-browser: 38 sliders, 8 pills, 38 labeled tooltips, 0 console errors (1280+390); V1 full-bleed navLeft 0/navRight 1280 ✅; filter/restore ✅; beta 1.47→1.60 live fair $144.08→$136.56 correct direction ✅ ($144.08 reproduces P6R3 Base pin — external truth holds); toggle preserves edited 1.6 ✅. `op_rp21_timing.mjs`: warm input→repaint 32.4–45.9ms, median 38.3ms (11 samples) vs contract <16ms ❌.

**FINDINGS (must-fix)**:
- **F1 — RP2.1-turn double-recompute**: `assumptionsTab.js:320-327` `dispatchChange` fires both callbacks per event AND `app.js:992-993` wires BOTH to `app.setDriver` → 2 full pipelines per slider input (each = 3-scenario full valuations + 4× multi-method + sensitivity grid + all view updates; `setDriver:812-849` no dedup). Fix in RP2.1 scope: wire ONE callback in the app mount (both must still FIRE — `redesign.tab2.test.js` pins dual-fire, keep it); re-measure.
- **F2 — <16ms budget miss**: median 38.3ms ≈ 2.4× over `redesign_phase_2.md:58`. After F1, prove warm median <16ms (coalesce/debounce input→recalc, narrow per-keystroke pipeline, or equivalent — onChange FIRE stays synchronous); add a timing pin to `tests/redesign.tab2.test.js` (no DS test currently asserts the 16ms half — gate-scope gap).

**PASS-side (locked, not re-litigated)**: slider/pill/tooltip structure per contract; schema clamp both paths; sync dispatch; category filter sliders+matrix; MKT/EST badges; V1/V3/V4 (+V2 keep); disclosure complete (RP2.1-turn files all disclosed; tabs.js/format.js mtimes 06:xx = pre-existing RP0-era; erp/p6r2_3 filters = adopted standing pattern, scope unexpanded 1 line × 2 files); corpus 706 invariant; zero-gates.

**RP2.2 binding entrance conditions (recorded, verdict-neutral)**: forecast-matrix historical columns FY2021–FY2025 currently repeat current-driver values flat (17 rows verified) — RP2.2 must resolve per-year values (historical corpus-derived + cited; forecast = driver values); same-value replication prohibited. Cosmetic backlog: pill display truncates to 2dp (edit-path precision drift ≤0.003pp, probe §7 list); pct unit badges render empty (`humanizeUnits` pre-existing).

**Captures**: DS `docs/screenshots/redesign/rp2/` ×4 viewed (conform ref_02 structure; table flatness as noted). OP `scratch/op_rp21_sliders_1280.png` (= table view, script labeled pre-toggle — valid table capture), `op_rp21_table_1280.png`, `op_rp21_sliders_390.png` (mobile stacks clean, tabs scroll).

---

### [2026-09-08 13:46] REVIEW: RP2.1 [PASS ✅] (cycle 2 — F1+F2 closed, consecutive_fails → 0)
- F1: single wiring verified `src/app.js:1023`; dual-fire intact. F2: OP browser median 12.1ms [10.3–16.1] < 16ms; timing pin 21/21 (stub-side tripwire; browser number binding).
- Lazy-design safety: recalculate-local caches; activation-refresh (`:546-547`) + visible-refresh (`:825-827`); staleness probe exit 0 (new fair $136.56 present, old gone).
- Suite 759/759 OP-run; probe 234/234 re-run; scratch instruments unmodified by DS; DS log resubmission entry present; status.md untouched by DS.
- RP2.1 not final → `status_ds.json` worker_active seq 2, subphase RP2.2. RP2.2 entrance conditions + backlog stand as recorded above.

---

### [2026-09-08 14:15] REVIEW: RP2.2 [FAIL ❌] (cycle 1/3 — consecutive_fails → 1)
- Submission 14:05 (seq 3), integrity ✅. Suite 765/765 OP-run (presence-gates only — all findings evade them).
- Probe `scratch/op_rp22_probe.mjs`: corpus re-derivation of all 20 literal arrays — 18/20 exact (failures: taxRate[4], nwcPct[0-4]); per-MAU scale bug; deferred/DNA dispatch corruption (stub-evidenced, capture-confirmed).
- **F1** per-MAU ×1000 (`:350-351`, live $0.00/$0.01 vs $0.95/$6.19). **F2** deferred days/pct flip (live "175" vs "47.82%"; edit→max 0.9). **F3** DNA sum→dep-only (live "1.4%"→"0.50%"; edit reallocates 0.005→0.0139). **F4** tax FY25 21.0% unsourced (no cash-tax metric; provision −127%). **F5** NWC glide non-derived (engine −10.55/−6.48/−9.51/−5.47%; FY21 impossible w/o FY20 baseline) + forecast '0.0%' hardcode.
- PASS-side locked: structure/sticky/blue/tabular/titles; 18 arrays; YoY/mix/conv; tsIncome branch; 3-way sync (clean rows); filter; precision 2.78e-17; % badges; disclosure; captures.
- Minors M1 (4dp literals) / M2 (segment-sum vs filed totals) / M5 (0.092 derived, fallbacks, 0.98→other driver) / M6 (pin scope) / M7 (forecast 1dp formatting).
- `status_ds.json` worker_active seq 3. Re-arm baseline status_op seq 3.

---

### [2026-09-08 14:45] REVIEW: RP2.2 [PASS ✅] (cycle 2 — F1–F5 closed, consecutive_fails → 0)
- Resubmission 14:32 (seq 4), integrity ✅. Scratch instruments unmodified (op_rp22 mtime predates verdict); DS ran unmodified probe (197 + 4 stale-auditor asserts — correctly read as non-product; auditor updated probe to v2 rather than penalizing).
- Probe v2 226/226: 39 rows; literals vs filed; NWC == engine schedule; forecast == engine chain; DNA split; deferred days-lane; tax dash; precision; badges; static gates.
- Live browser: per-MAU $0.95/$7.80 lanes; deferred "175" stable; DNA 1.4% calc + 0.50% input; tax —/—/9.6/13.4/— (+13.4225% forecast inputs); NWC engine lanes; matrix FY26E $1,193.9 == projections $1,193,853; 0 console errors; timing 13.4ms.
- Suite 765/765 OP-run. DS log resubmission entry present. B1 recorded (deferred same-edit transient ≤$0.08, converges, display-stable).

### [2026-09-08 14:45] GATE PASS: Phase RP2 [PASS ✅]
- RP2.1 ✅ + RP2.2 ✅. status.md → RP2 🟢 Done, RP3 🟡 Active. status_ds.json → completed seq 4. Manual RP-aware archive → docs/logs/inboxes/redesign_phase_2/ (inbox_ds/inbox_op/status_ds/status_op copies); live inboxes + signals reset RP3/RP3.1 seq 0. NO commit/tag. Watcher NOT re-armed (terminal; next = Director RP3 kick-off).
