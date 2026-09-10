# Worker Inbox (DS Inbox)

> **Channel**: Reviewer (`OP`) ➔ Worker (`DS`)
>
> **Rule**: OP appends review verdicts and milestone gate passes here. Every message MUST end with `[END_OF_MESSAGE]`.

---

### [2026-09-08 13:25] REVIEW: RP2.1 [FAIL ❌] (cycle 1/3) — recalculation budget miss + double-recompute wiring

**What passed (locked)**: slider/pill/tooltip/unit-badge structure per contract; all 38 drivers render with schema-exact min/max/step (OP re-derived from raw `assumptions.json`); text+slider clamp both directions; `onChange`+`onDriverChange` fire synchronously; category filter works in sliders AND matrix with `all` restore; toggle preserves (edited) values; `update()` uses query path without full rebuild; loader fails closed on stripped bounds; MKT asOf+provider+URL live on all 5 anchors (rf 0.0479 / beta 1.47 / ERP 0.0425 / price 157.85 / shares 50031000); EST badges; V1 full-bleed (OP-measured nav 0–1280 = viewport), V3 borders/icons/amber, V4 sentence (index + cover), V2 size kept; zero `style=`/bare-numerics/`protocol`; suite 758/758; live fair $144.08 reproduces the P6R3 Base pin and moves correctly ($136.56 on beta→1.60); disclosure complete. Evidence: `docs/logs/op/redesign_phase_2.md`, `scratch/op_rp21_probe.mjs` (234/234), `op_rp21_vision.mjs` (0 console errors), `op_rp21_timing.mjs`.

**F1 — double-recompute (RP2.1-turn, must-fix)**: `dispatchChange` (`assumptionsTab.js:320-327`) fires both callbacks per input event and the app mount (`app.js:992-993`) wires BOTH to `app.setDriver` → every slider input runs the full pipeline twice (3-scenario valuations + 4× multi-method + sensitivity grid + all view updates; `setDriver` has no dedup). Fix: wire ONE callback in the mount. Both callbacks must still FIRE (your dual-fire test stands — it pins firing, not wiring).

**F2 — <16ms budget miss (must-fix + pin)**: warm input→repaint median **38.3ms** (11 samples, 32.4–45.9ms; `scratch/op_rp21_timing.mjs`) vs contract `redesign_phase_2.md:58` recalculation <16ms — 2.4× over, reproducible. After F1, prove warm median <16ms in a real browser (coalesce/debounce input→recalc, narrow the per-keystroke pipeline, or equivalent — the `onChange` FIRE stays synchronous) and add a timing pin to `tests/redesign.tab2.test.js` (no current test asserts the 16ms half — gate-scope gap).

**RP2.2 entrance conditions (binding, verdict-neutral)**: matrix FY2021–FY2025 columns currently repeat current-driver values flat — RP2.2 must resolve per-year values (historicals corpus-derived + cited; forecast = driver values). Cosmetic backlog: 2dp pill truncation (edit-path drift ≤0.003pp); empty pct unit badges.

Resubmit as `SUBMISSION: RP2.1 (Resubmission)` with re-measurement numbers. consecutive_fails: 1.

[END_OF_MESSAGE]

---

### [2026-09-08 13:46] REVIEW: RP2.1 [PASS ✅] (cycle 2 — F1+F2 closed)

**F1 closed**: app mount wires only `onDriverChange` (`src/app.js:1023` — verified in code); dual-FIRE preserved in view (`assumptionsTab.js:322-326`, dual-fire test green). One pipeline per input event.
**F2 closed**: OP re-measured warm input→repaint in real browser (`scratch/op_rp21_timing.mjs`, untouched by DS): **[10.3–16.1ms], median 12.1ms < 16ms** (11 samples) — DS claim 11.4ms reproduced within env variance. Timing pin added to tab2 suite (21/21). Note: the pin measures `app.setDriver` in stub-DOM; the browser median above is the binding proof.
**No-regression proof on the lazy design**: caches are recalculate-locals (null per recalc — no stale closures); `sensitivityView` refreshes on tab activation (`app.js:546-547`) AND when visible (`:825-827`) — OP staleness probe (`scratch/op_rp21_stale.mjs`): edit beta→1.60 while hidden → switch → pane shows new fair $136.56, old $144.08 gone, 0 errors. Eager fields (dcf/wacc/methods/verdict) untouched; suite 759/759 (OP-run) incl. all sensitivity/scenario/monotonicity gates; probe 234/234 re-run green.
**Carry-forward (unchanged)**: RP2.2 entrance — matrix FY2021–FY2025 must resolve per-year (corpus-derived + cited); flat replication prohibited. Backlog: 2dp pill truncation; empty pct badges. Scratch probes remain auditor instruments — appreciated that they were run, not edited.
Proceed to **RP2.2** (Multi-Year Forecast Table View & Input Color-Coding) per `docs/phases/redesign_phase_2.md`. consecutive_fails: 0.

[END_OF_MESSAGE]

---

### [2026-09-08 14:15] REVIEW: RP2.2 [FAIL ❌] (cycle 1/3) — five content/integrity findings (all live on capture)

Suite 765/765 OP-verified (green as expected — every finding below evades your presence-gates; see gate-scope note). Probe: `scratch/op_rp22_probe.mjs` (169 pass + 32 fail analyzed below; 8 of the 32 are probe-tolerance artifacts of literal-rounding dust, the rest are product).

**F1 — per-MAU rows 1000× off** (`assumptionsTab.js:350-351`): `(r*1e3)/(mau*1e6)` with r in $M and mau in millions divides dollars-by-1000. Live on your own capture: Ad Rev/MAU `$0.00` ×10 (corpus $0.95/$0.74/$0.56/$0.47/$0.60), Tot Rev/MAU `$0.01` ×10 (corpus $6.19/$6.09/$6.01/$6.41/$7.80). Fix: `r/mauM`. Your tests only assert the rows EXIST (`assert.match /Ad Revenue per MAU/`) — no value pin, so green proves nothing here.

**F2 — Deferred row unit flip** (display `String(Math.round(defRevPct*365))` = "175" vs every sync path writing `formatDriverDisplay(pct)` = "47.82%"): live capture shows historical "175" beside forecast "47.82%" in ONE row, and editing the displayed "175" dispatches clamp-to-max (OP stub: `["deferred_revenue_pct_revenue",0.9]` vs driver 0.4782). Fix: one unit lane end-to-end (days display + days→pct parse, or pct display).

**F3 — D&A row corrupts its driver** (display dep+amort SUM "1.39%" bound to `depreciation_pct_revenue` alone): live capture shows historical "1.4%" collapsing to forecast "0.50%" (amortization silently dropped); editing the displayed value dispatches the SUM into the depreciation-only driver (OP stub: `["depreciation_pct_revenue",0.0139]` vs 0.005 — engine then double-counts amortization). Fix: split into two driver-bound rows or make the sum display-only (calc).

**F4 — Cash Tax FY2025 "21.0%" unsourced**: no cash-tax-paid metric exists in the corpus (full metric sweep); provision/pretax = −127.0% (benefit year). FY23/24 cells equal provision/pretax (9.6/13.4 ✅), FY21/22 correctly '—' — but FY25 is the statutory-looking 21% under a "Cash Tax Rate" label with the row's own definition broken. Fix: source it or render '—' (benefit year, same rule as FY21/22).

**F5 — NWC row non-derived + hardcoded forecast**: `h.nwcPct` (−0.5→0.0 glide) matches NO working-capital definition (engine schedule ΔNWC/rev = −10.55/−6.48/−9.51/−5.47%; balance-diff and CF-flow candidates likewise distant); FY21 −0.5% is impossible without an FY20 baseline (the engine itself reports change 0 — P2.2 roll-forward-honesty rule). Forecast hardcodes `'0.0%'` (`:650-651`) while the engine schedule computes real changes (context.schedules is already wired — use it). Fix: derive both lanes from the WC schedule or remove the row.

**Locked PASS-side**: 38-row/4-section structure, sticky label col, blue `.cell-input` forecast vs `.cell-calc`, tabular-nums, column titles; 18/20 literal arrays corpus-exact (MAU/paid/subs/ad/DET+IAP+other agg/rev/margins/DSO/defDays/DPO/capex/DNA/SBC/tax23-24); YoY/mix/conversion derivations; tsIncome forecast branch arithmetic; 3-way sync on clean rows; category filter incl. matrix; precision fix verified (worst drift 2.78e-17); `%` badges; V-hold; disclosure complete; captures provided.
**Minors (carry, not fail)**: M1 ratio literals 3dp → 0.1pp display dust (SBC 13.3 vs 13.2) — use 4dp; M2 historical totals = segment-sum vs filed total ($531.2 vs $531.1 — $89k filing-rounding gap) — disclose or use filed; M5 hygiene — `0.092` baked conversion (live path, derive from h.paid[4]/h.mau[4]), `getDriverVal` financial fallbacks, `0.98` Other-decay (dead branch — use `other_revenue_growth`); M6 timing pin measures `setDriver`, not dispatch (browser median remains the proof); M7 forecast cells show full-precision echoes ("18.3929%") vs historical 1dp — format forecast YoY at 1dp.

Resubmit as `SUBMISSION: RP2.2 (Resubmission)` with cell-level re-verification. consecutive_fails: 1.

[END_OF_MESSAGE]

---

### [2026-09-08 14:45] REVIEW: RP2.2 [PASS ✅] (cycle 2 — F1–F5 closed)

**F1 closed**: per-MAU uses `r/mauM` — live Ad $0.95…$0.38, Tot $6.19…$7.07 (OP browser-read). **F2 closed**: deferred days-lane end-to-end ("175" initial/update/sync; 180→180/365 exact in OP stub; same-edit dispatch = driver no-op). **F3 closed**: Depreciation 0.50% input row + DNA 1.4% calc-only summary (OP stub: edit dispatches dep value exactly; live DNA row has no inputs). **F4 closed**: FY25 tax '—' (live cells —/—/9.6/13.4/—). **F5 closed**: NWC = engine schedule (live −10.5/−6.5/−9.5/−5.5, FY21 '—'; forecast −3.2…−3.6 from `supporting.workingCapital`, OP-recomputed from raw engine chain). Forecast Total Rev FY26–30E == engine `threeStatement` exactly (OP chain: $1,193.9M lane verified; live matrix $1,193.9 == projections $1,193,853). Minors M1/M2/M5/M7 verified in code+render. Suite 765/765 OP-run; probe 226/226; live 0 console errors; timing median 13.4ms holds. consecutive_fails: 0. Proceed: GATE PASS below.

[END_OF_MESSAGE]

---

### [2026-09-08 14:45] GATE PASS: Phase RP2 [PASS ✅] — Redesign Tab 02 Assumptions / Drivers DONE

RP2.1 ✅ (cycle 2) + RP2.2 ✅ (cycle 2). Suite 765/765 × 230. ref_02 structure conforms (top-tab shell per R1; content per engine per R2); figures engine-true; agreement-only untouched; $144.08 pin live. Archive: `docs/logs/inboxes/redesign_phase_2/`. Signals reset RP3/RP3.1 seq 0; live inboxes reset. NO commit/tag — Director release authority. DS: if your RP2.2 watcher lapses on the reset, run §4.2 and await the Director's RP3 kick-off (precedented). Carry-forward: **B1** deferred same-value-edit transient ≤$0.08, converges by 2nd edit, display always stable — polish candidate (no-op path vs step-quantized slider sync); RP3 contract `docs/phases/redesign_phase_3.md`.

[END_OF_MESSAGE]
