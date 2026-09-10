# Consistency Rework Round 1 (RWC.1) — Cross-Tab Figure, Narrative & Control Conformity

> **Authority**: Director order 2026-09-09 ("It goes to rework ofcourse" + full-tab visual sweep).
> **Protocol**: 1.0 · **Lane**: RWC/RWC.1 · **Type**: cross-cutting rework — all phase gates stand.
> **Owner**: Amended by Reviewer (`OP`), Implemented by Worker (`DS`)
> **Audit basis**: `scratch/op_sweep_*_1280/390.png` (16 captures, 0 console errors) + `scratch/op_fcf_divergence.mjs` (quantified) + `scratch/op_header_conformance.mjs` (pane-scoped) + `scratch/op_overflow_probe2.mjs` (inner-scroll audit).

---

## 1. Findings Ledger (all evidenced, all live at 2026-09-09)

### F1 [CRITICAL — figure integrity] Tab 07 Rule of 40 43.1% vs gated 47.4%
- Tab 07 card renders **43.1% = 27.0% FCF margin + 16.1% CAGR**, where 27.0% = `dcf.schedule[last].fcf` (591,200.80) ÷ FY2030 revenue (`src/ui/summaryTab.js:371-377`).
- Tab 05 KPI + `tests/e2e.accuracy.test.js` + README + P6.1 gate pin **47.4% = 31.4% + 16.1%**, where 31.4% = `threeStatement.cashFlow.FY2030.free_cash_flow` (686,125.93) ÷ revenue.
- Same label ("FY2030 Free Cash Flow Margin"), two engine values, 4.3pp apart. The e2e/P6.1 gates certify the threeStatement basis — which Tab 07 does not render. A rendered-view tie-out that re-derives the concept instead of reading the card cannot catch this (standing-rule gap, recorded in OP reflection).
- Companion defect (P8.2 class): `summaryTab.js:428` null-fallback literals `33.9%` / `16.5%` / `50.4%` — a THIRD value set, hardcoded in methodology text (renders only on the null path, still a letter violation).
- Companion irritant: two CAGR bases under near-identical labels — Tab 05 "Revenue CAGR (2026E–2030E)" 16.4% (FY26 base) vs Tab 07 "5-Year Revenue CAGR" 16.1% (FY25 base). Each correct per its basis; the Tab 07 label must name its base.

### F2 [HIGH — stale hardcoded narratives] Tab 08 scenario descriptions
- `src/ui/sensitivityTab.js:188` base case: hardcoded `33.9% terminal FCF margin` vs live base-engine 31.35%. Stale P5-era vintage; matches nothing live (same vintage as the F1 fallback literals).
- `sensitivityTab.js:202` upside case: hardcoded `38.0% FCF margin` — unverifiable as written (no derivation).
- Both must derive from their scenario engines at render time.

### F3 [MEDIUM — control conformance] Tab 05 units toggle vs RW2.2 ruling
- Tab 05 Thousands/Millions toggle is rectangular (`.projection-unit-toggle`, 6px radius, blue block) where the Director-ordered RW2.2 treatment for that exact function is the round capsule (`.pill-control` 20px + `.pill-btn` 16px, reference `src/ui/assumptionsTab.js` + Tab 04 `units-mode-toggle`). Same function, adjacent tabs.
- Tab 05 statement switcher is a close rectangular-group cousin (4px / 7px 12px vs group spec 4px / 6px 14px) — align padding while nearby.
- Headers verified CONFORMANT app-wide (15px/700 + 3px `rgb(26,86,219)` + transparent + borderless, 6/6 Tab 05 + 9/9 Tab 06 live) — no header work needed.

### Downgraded on measurement (NOT defects — no action)
- Table "clipping" at 1280: Tabulator holders scroll internally by design (`overflow-x:auto`; worst +140px on Tab 05 income). First-paint hides FY2030E until scroll — UX friction only.
- Tab 03 donut legend: all entries inside viewport/card (right=1250px) — tight to the card edge (6px), not clipped.

---

## 2. Artifact Contract (RWC.1)

### Task RWC.1a: Single Rule-of-40 definition (Tab 07)
- **Files**: `src/ui/summaryTab.js`, `tests/` (extend e2e or tab-level: rendered-card read).
- **Fix**: Rule-of-40 FCF margin reads `threeStatement.cashFlow.FY2030.free_cash_flow` (the e2e/README basis) → card + citation render **47.4% = 31.4% + 16.1%**. Citation names the CAGR base explicitly (`FY2025–FY2030E`). Null-fallback literals (`33.9%`/`16.5%`/`50.4%`) replaced with fail-closed dashes in card AND citation.
- **Gates**: live card reads 47.4%/31.4%/16.1%; null-path renders dashes everywhere (no hardcoded financial figure in one); e2e stays green; no other tab disturbed (Tab 05's FY26-based CAGR card keeps its explicit label).

### Task RWC.1b: Derived scenario narratives (Tab 08)
- **Files**: `src/ui/sensitivityTab.js`, `tests/`.
- **Fix**: base + upside margin figures computed from their scenario engines at render (base must read 31.4% live); zero hardcoded `xx.x%` margin literals in scenario `desc` strings (grep gate).
- **Gates**: rendered descs match per-scenario engine recomputation; P6R3 scenario pins (84.39/144.08/277.84) undisturbed; suite green.

### Task RWC.1c: Canonical units capsule (Tab 05)
- **Files**: `src/ui/projectionsTab.js`, `index.html`, `tests/redesign.tab5.test.js` (selector maintenance with one-line rationale + no-expansion proof, RP0 precedent).
- **Fix**: units toggle rebuilt as `.pill-control` + `.pill-btn` (Tab 04 `units-mode-toggle` is the reference implementation); switcher padding aligned to 6px 14px. Behavior preserved: rescale + round-trip (RP5.2 F1 regression stays green).
- **Gates**: computed-shape conformance vs Tab 04 capsule (inactive-pill geometry identical — OP probe pattern); rescale live; suite green with disclosed maintenance.

### Out of scope
Engine math, corpus, MKT/methods/pins, Tab 06 lever content, B1/B2/B3 (→RP9), first-paint scroll UX + legend spacing (friction-only advisories above).

## 3. Submission Proof Bar
`SUBMISSION: RWC.1` with per-item before/after (F1: live 47.4%/31.4%/16.1% + null-dash evidence; F2: rendered descs vs scenario-engine recomputation + zero-hardcode grep; F3: capsule geometry conformance + rescale round-trip), suite count, uniquely-named hash-checked captures (1280 + 390) with 0 console errors. Watcher is NOT armed by OP for this lane — after resubmission, Director prompts OP for review (RW-lane precedent).

## 4. Contract Hardening (anti-recurrence, binding on RP7/RP8 builds)
- Single-FCF-definition rule: exactly one engine path may back a labeled margin figure; any second basis needs a distinct label + methodology note. The e2e/README basis (`threeStatement` FCF) is authoritative for "FY2030 Free Cash Flow Margin".
- No hardcoded narrative percentages: any `xx.x%` in descriptive/narrative UI text must derive at render or be removed; null paths render dashes, never vintage literals.
- Rendered-card-read rule for tie-outs: view tie-outs assert the DOM text, never a re-derivation of the concept (this lane's meta-lesson).

## 5. Task RWC.1d: Beta cross-check relabel + reframe (Director order 2026-09-09 — disclosure-only, no pin moves)

**Background (accepted, verified by OP)**: own-stock OLS β = 0.89 (SE 0.519, n = 60, R² 4.83%, t ≈ 1.72); 95% CI = 0.890 ± 2.002 × 0.519 = [-0.15, 1.93], which contains the 1.47 peer median. The regression cannot reject the peer beta — at R² 4.83% it is silent, not disagreeing. Headline beta stays **1.47 peer median**; no change to WACC, valuation, or pins. Out of scope: engine, corpus, peer set, beta value, ERP, price, grids.

**Fix** (`src/ui/valuationTab.js` beta-derivation block, heading ~:1002 + table ~:1005–1070):
1. Rename the block to **"Single-Stock Regression Cross-Check"**. Remove any claim that shrinkage was performed (the raw 0.89 was shown next to 1.47 with no shrinkage — a reviewer would assume otherwise).
2. Reframe from "our regression disagrees, peers override" to "our regression is too imprecise to have an opinion — shown for transparency", disclosing the CI above as proof.
3. Add the footnote below verbatim (em-dash-free Director copy):
> Single-Stock Regression Cross-Check: Duolingo own-stock regression (60 monthly returns, Sep 2021 – Aug 2026 vs S&P 500) gives β = 0.89 (SE 0.52, R² 4.8%). 95% confidence interval is -0.15 to 1.93, which includes the 1.47 peer-median beta. The own regression is therefore too imprecise to reject or confirm the peer beta, and is shown for transparency only. Valuation uses the 1.47 bottom-up peer median (Spotify / Roblox / Netflix, Hamada-unlevered).

**Gates**: before/after copy in submission; suite green; rendered Tab 06 tie-out — 1.47 still anchors (HUD, lever 2, derivation header) and the 0.89 block reads transparency-only with CI shown. Proof bar joins the §3 submission (`SUBMISSION: RWC.1` covers RWC.1a–d).
