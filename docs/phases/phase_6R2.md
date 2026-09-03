# Phase 6R2: Model-Rigor Revision & Live Market Pricing — Centered Matrix, Computed Beta, Verified MKT Anchors, FCFF/FCFE, Live Price

> **Milestone**: Phase 6R2 — Model-Rigor Revision (Director-directed; continues the P6R release-readiness lineage)
> **Protocol**: 1.0 (internal workflow only — no protocol mentions in the product UI, per Director ruling since P6R)
> **Status**: 🟡 Active — approved & kicked off by Director 2026-09-03 (OP KICK-OFF in `docs/inbox_ds.md`); DS on P6R2.1
> **Owner**: Drafted & audited by Reviewer (`OP`); implemented by Worker (`DS`); **final approval authority: Director**
> **Objective**: Director directives, all release-blocking: (1) re-center the 9×5 sensitivity matrix so the **active WACC and active terminal growth land at the exact matrix center** (row 5, column 3); (2) **compute beta in-model** — OLS on a cited, bundled price-return series — demoting the provider figure to a disclosed cross-check; (3) **re-anchor the ERP** to the verified published Damodaran figure (the shipped 4.42% cites a "July 2026 update" that does not exist — Finding C); (4) **refresh the stale MKT anchors** — rf to the latest published FRED DGS10 observation, market price/cap to the latest completed close (Finding D); (5) **restate the DCF on a consistent FCFF basis and disclose the FCFE path** — retiring the shipped mixed construction that double counts the cash pile (Finding F, material) — with the debt-free equivalence stated explicitly; (6) **restructure the DCF schedule terminal column** so the discounted terminal value is labeled as exactly that (Finding E, Director-escalated); (7) **live market pricing** — auto-fetch the live price at runtime and compute over/undervalued against it, with the snapshot driver demoted to a disclosed fallback (Director 2026-09-03: "I want a feature that auto fetches the market price and calcs the undervalued and overvalued stuff"). Phases 6R2 (cleanups + live pricing) and 7 (multi-method valuation) are sequenced: **6R2 first, 7 next** — Phase 7's methods consume the 6R2 re-anchored model state and live-price plumbing as their baseline. The `v1.0` release block carries forward unchanged from P6R.

---

## 1. Milestone Objective & Scope

Phase 6R2 exists because the Director's review of the shipped P6R interface raised six findings:

- **Finding A (matrix geometry)**: the sensitivity matrix centers only its WACC axis on the active scenario (P6R.1 preserved behavior). The growth axis is a fixed absolute band [1.0%, 3.0%] (`recommend.js:235`), so at base g = 2.50% the active cell renders at row 5, **column 4 of 5** — one column right of center. Director: the active point must land in the very middle of the matrix.
- **Finding B (methodology)**: the `beta` driver (0.89) is consumed as a published stockanalysis.com figure — the driver notes say "used as published and is not re-derived" (`assumptions.json:516`). Director: the model must calculate beta itself, not relay an aggregator's regression.
- **Finding C (ERP external-truth failure — verified 2026-09-03, live source check)**: the `equity_risk_premium` driver cites "as of 2026-07-01 via Aswath Damodaran … implied ERP for the United States of 4.42%, from his July 2026 country risk-premium update (mature-market premium 4.17% plus a 0.25% US default-risk correction)" (`assumptions.json:537`). **No July 2026 update exists.** Damodaran's country premium table (`pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html`) is "Last updated: January 5, 2026" — the latest available — and its US row reads: Moody's **Aa1**, adjusted default spread **0.23%**, **US ERP 4.46%** (consistent: 4.23% Aaa mature-market + 0.23% US spread). The histimpl series confirms no 2026 row yet (latest full year 2025: 4.23%; 2024: 4.33%). The shipped 4.42% and both of its cited components (4.17%, 0.25%) match nothing published — a fabricated citation that passed the P4.1 gate because the notes' "cross-check" values (2024 4.33%, 2025 4.23%) are real and in-range. Classification: external-truth failure of the driver author and of the OP audit that accepted internal consistency as proof.
- **Finding D (stale MKT anchors — verified 2026-09-03, live source checks)**: (i) the `risk_free_rate` driver (4.73%, asOf 2026-08-28) cites the FRED DGS10 release calendar showing "next release 2026-09-01" — that release has since posted: **latest published DGS10 observation = 4.79% (2026-09-01)**. The driver's own stated staleness rationale has lapsed. (ii) the `market_share_price` driver ($148.36, asOf 2026-08-31) is two completed sessions stale: the latest COMPLETED close is **$157.85 (2026-09-02)** (2026-09-03 was intraday ~$159 at check time — not a close; the driver's own close-only convention applies). (iii) `market_cap` is not a stored anchor — it is derived at runtime as price × shares (148.36 × 50,031,000 = 7,422,599,160); it refreshes automatically when the price driver moves.
- **Finding E (DCF schedule presentation defect — Director re-escalated 2026-09-03: "IT DOESN'T EVEN SAY ANYWHERE THAT IT'S THE DISCOUNTED TERMINAL VALUE")**: the Valuation tab's "5-Year Explicit Forecast Free Cash Flow Schedule & Present Value" grid renders the terminal column under the row label "Present Value of Explicit FCF (PV)" — the terminal cell holds the **PV of the terminal *value*** (Gordon TV × df_T ≈ 7.52B), but NOTHING on the screen says so. A reader (the Director did) reads the cell as terminal-FCF×df (~464K) and finds an impossible number. The arithmetic is correct; the presentation is not just imperfect — it is **unlabeled capitalization**, i.e., a reader cannot reconstruct what any terminal cell means from the rendered surface alone. Remediation is a binding row/column restructure (P6R2.4.B.4), not a soft relabel.
- **Finding F (FCFF/FCFE basis mixing — material, engine-level)**: the shipped DCF discounts a **NI-basis FCF** (NI + D&A + SBC − ΔNWC − capex, `threeStatement.js:703`) where net income **includes after-tax interest income on the corporate cash/investment pile** (`threeStatement.js:587`), then adds back the **end-of-horizon FY2030 net cash balance** in the EV→equity bridge (`dcf.js:310-386`). Two compounding errors: (i) the discounted flows are FCFE-basis (interest income belongs to equity holders), yet the bridge performs an enterprise-basis cash add — the retained cash and its compounding interest are valued inside the flow stream AND again in the added pile (double count); (ii) even on a strict enterprise basis the bridge must add TODAY's net cash (~1.35B per latest filed balance sheet), not the FY2030 forecast pile (~2.99B) — end-of-horizon cash is already inside the discounted flows. Combined overstatement ≈ $60+/share on the $249.36 pin (~25%) — material; every perShare/undervalued/Bear/Bull conclusion is affected. Director directive: state **both** valuations explicitly — FCFF as the headline (strip after-tax interest income from the flows, add today's net cash) and FCFE disclosed (flows as-is, no cash add) — with the debt-free equivalence theorem stated in the UI: at D = 0, WACC ≡ Re, so both paths use the same discount rate and must converge to the same equity value; divergence = diagnostic.
- **Finding G (snapshot price vs. live pricing — Director directive 2026-09-03)**: the verdict machinery compares the DCF per-share against a hand-snapshotted `market_share_price` driver (148.36, asOf 2026-08-31 at drafting) that ages the moment the app ships. Director: the app must **auto-fetch the live market price at runtime** and compute over/undervalued against it. The fetch is the ONE sanctioned runtime network call (lifts the absolute-offline rule of spec §2/§5 exactly and only for this surface); the offline deterministic core is untouched. Without the fetch (offline/provider down): fall back to the snapshot driver with a persistent, unmissable staleness banner — never a silent stale verdict. Close-only convention stands: intraday prints render but never enter verdict math.

**In scope** (frozen-surface lifts — ONLY these, all others remain frozen):
- `src/app.js` — pass scenario-relative `growthValues` to `buildSensitivityGrid` + axis guard (P6R2.1; controller-level); boot-time price-fetch wiring + fallback path (P6R2.5)
- `src/ui/sensitivityTab.js` — matrix description text only
- `src/engine/beta.js` (NEW, additive) — pure OLS beta regression module
- `src/engine/market.js` (NEW, additive — P6R2.5) — live-price fetch client + staleness gate
- `vercel.json` (additive route — P6R2.5) — the sanctioned `/api/price` proxy endpoint
- `src/data/historical/` — ADDITIVE price-series dataset; existing 706 records untouched (diff must remain empty)
- `src/data/assumptions.json` — FOUR driver records only: `beta` (value, notes, asOf, source re-anchored to the computed regression; name/label/group/min/max/step/units/scenarioDeltas unchanged), `equity_risk_premium` (value → 4.46%, asOf → 2026-01-05, honest Jan-5-2026 decomposition notes), `risk_free_rate` (value → 0.0479, asOf → 2026-09-01, notes re-citing the posted FRED observation), `market_share_price` (value → 157.85, asOf → 2026-09-02, notes citing the completed session close; scenario deltas stay 0)
- `src/engine/dcf.js` — LIMITED LIFT (Finding F only): additive FCFF/FCFE dual-path valuation. `valuate()` keeps its signature and its existing output shape byte-identical (frozen P4 consumers), and ADDS a dual-path block (e.g. `fcfe: {...}`, `fcff: {...}`, `basis: 'dual'`) computed within the same pure pass. The headline `perShare`/`enterpriseValue`/`equityValue` fields switch to the FCFF basis (correct economics), with the shipped mixed-basis values preserved in a `legacy` sub-block for the migration ledger's before/after. All arithmetic additive, fail-closed, no fallbacks.
- `src/engine/threeStatement.js` — LIMITED LIFT (Finding F only): the `free_cash_flow` line gains an additive `fcff` companion line (NI-basis FCF minus after-tax interest income on the corporate cash/investments pile) per period, alongside the existing `free_cash_flow` (now labeled `fcfe`-basis internally at the derivation comments level; the shipped line object's shape stays intact for frozen consumers).
- `src/ui/valuationTab.js`, `src/ui/summaryTab.js`, `src/ui/assumptionsTab.js` — beta derivation disclosure; DCF schedule restructure (Finding E); FCFF/FCFE dual-path presentation + debt-free equivalence card (Finding F); live-price banner + staleness states (P6R2.5)
- `tests/` — additive suites + migration-ledger-enumerated updates to pinned expectations (P6R2.4)
- `docs/` — this spec, logs, pin migration ledger, status (OP-owned)

**Out of scope**:
- `src/engine/{wacc,recommend,forecast,schedules}.js` — behavior-frozen, byte-identical. The engine diff must stay limited to the NEW `beta.js` + NEW `market.js` plus the two enumerated LIMITED LIFTS (`dcf.js`, `threeStatement.js` — Finding F only); the `recommend.js` default growth band stays UNTOUCHED (the app supplies explicit `growthValues` via the already-sanctioned custom-values path, `recommend.js:236-239`, tested since P4).
- Existing corpus records; existing driver keys/schema/deltas; internal scenario keys `bear/base/bull`; `index.html` shell; URL-hash state schema.
- **Multi-method valuation** — split to **Phase 7** (`phase_7.md`), which consumes this phase's outputs as its baseline. Sequenced: 6R2 first, 7 next.
- Any fix that cannot be achieved within these lifts: STOP and escalate to Director.

---

## 2. Prerequisites & Director Direction Evidence

- **Prior state**: P6R sub-phases per the P6R ledger; suite green ×3; OP tie-outs in `docs/logs/op/phase_6R.md`; P6R release block active (no `v1.0` tag).
- **Director directives (2026-09-03, this session — verbatim intent)**: "Redo the matrix so that the WACC and the GR land in the very middle" · "Why aren't we calculating beta?" · "The ERP for 2026 isn't updated on the Damodaran website — where'd you get that?" · "Update the rf and the market cap too — there's a new price for the stock and a new update for the rf on the FRED website" · "If there's no debt at all then why aren't we stating an FCFE valuation and comparing with FCFF?"
- **Verified evidence (OP investigation, 2026-09-03, read-only)**:
  - `src/engine/recommend.js:227-232` derives the WACC axis base-relative (active WACC ± 200bps in 50bps steps → 6.66%–10.66%; active 8.66% = row 5 of 9 — already centered).
  - `src/engine/recommend.js:235` fixes the growth axis at [0.01, 0.03] absolute regardless of the active g → the base pin (8.66% × 2.50%, $249.36) renders at row 5, column 4 — off-center by one column.
  - `src/app.js:421-427` passes NO `growthValues` → the engine's fixed band is the app's axis.
  - `src/ui/sensitivityTab.js:59` highlight logic already targets the (activeWacc, activeG) cell — once both axes are centered, the highlight lands on the center cell with **no logic change** (geometry fix only).
  - `src/data/assumptions.json:504-523` — beta driver: value 0.89, MKT-labeled, provider stockanalysis.com (5Y monthly), explicitly not re-derived. `wacc.js:267-281` consumes it via `requireDriverValue` into Re = rf + β×ERP.
  - **Live-source pulls (FRED fredgraph.csv DGS10; stockanalysis.com/stocks/duol/history/)**: DGS10 latest published = 4.79% (2026-09-01) — the 2026-09-01 release the shipped rf driver notes flagged as pending has posted. DUOL latest completed close = $157.85 (2026-09-02, volume 1,294,851); 2026-09-03 intraday ~$159 (market open at check) — the close-only convention holds. Market cap is derived (price × shares), not stored.
- **Feasibility (OP re-derivation, 2026-09-03)**: a centered growth axis g_active ± 100bps in 50bps steps passes the `WACC > g` guard at all three scenario presets — Base band 1.5%–3.5% vs min WACC row 6.66% (316bps worst-corner headroom) · Bear band 1.0%–3.0% vs min row 8.35% · Bull band 2.0%–4.0% vs min row 5.13% (113bps worst-corner headroom). The grid remains 9×5 at every preset state. DUOL IPO 2021-07 → a 60-observation monthly window is available for the beta regression. The FY2030-vs-today net-cash gap (~1.64B) and the interest-income PV embedded in the flow stream (~1.5–1.7B) jointly motivate Finding F's ~$60+/share overstatement estimate on the $249.36 pin.

---

## 3. Sub-Phase Artifact Contracts

### Task P6R2.1: Centered 9×5 Sensitivity Matrix (controller-level)

#### A. Deliverable Files
- `src/app.js` (growthValues pass-through + axis guard, minimal diff)
- `src/ui/sensitivityTab.js` (matrix description text only)
- `tests/p6r2.centered_grid.test.js` (new, additive)

#### B. Semantics (binding — DS implements exactly this)
1. **Axis derivation**: WACC axis unchanged (active WACC ± 200bps, 50bps steps, 9 rows — engine default path). Growth axis becomes scenario-relative: **g_active ± 100bps in 50bps steps, 5 columns**, passed via the documented `growthValues` key (`recommend.js:236-239` sanctioned custom path). `g_active` = the `terminal_growth_rate` driver value in the **active (scenario-applied) state** — the same `workingAssumptions` state that centers the WACC axis. Axis width is unchanged from today (2% span); it re-centers rather than widens.
2. **Center invariance**: at every state, the matrix center cell (row 5, column 3) = (activeWacc, activeG) = the active valuation pin. Default: $249.36 at 8.66% × 2.50%; active=bear: $132.16 at 10.35% × 2.00%; active=bull: $532.17 at 7.13% × 3.00% (values re-pinned in P6R2.3 if the computed β moves them).
3. **Axis guard (fail-closed shrink)**: before calling the engine, the controller validates every (wacc, g) pair against `wacc > g`. On violation it narrows deterministically: first the growth radius in 50bps decrements toward 0; then, only if still violated, the WACC radius in 50bps decrements toward 0 (floor = the active pin itself — 1 row × 1 column, always valid because `dcf.valuate` already succeeded with exactly that pair). Any narrowing triggers a visible grid footnote: *"axis range narrowed to respect WACC > g at current driver settings."* The guard must make the engine's `terminal_growth_exceeds_wacc` unreachable from the app within schema-clamped driver settings. Degenerate states occur only at slider extremes (Gordon headroom ≤ 300bps), never at scenario presets.
4. **UI text**: the matrix description states both axes track the active scenario (WACC ± 200bps · g ± 100bps); the fixed "1.0%–3.0%" literal is purged from user-visible copy (UI literal gate); the highlight cell = the exact center = Active Case valuation (existing logic, unchanged).

#### C. Invariants & Automated Quality Gates
- [ ] **Center-cell invariance sweep (new standing gate)**: real-browser sweep across default, bear-active, bull-active, plus one slider edit in each — the center cell equals the active valuation pin at every state; the highlight renders on the center cell; ACTIVE badge appears exactly ×1.
- [ ] 9×5 at all preset states; strict monotonicity (∂Price/∂WACC < 0, ∂Price/∂g > 0) across all neighbor pairs at every swept state; `WACC > g` on every rendered cell.
- [ ] **Shrink guard**: synthetic low-headroom driver states render without engine error; the narrowing footnote appears when triggered; the degenerate floor renders the active pin; behavior deterministic across repeated recalcs; no `Promise`/`async` added to the hot path.
- [ ] `git diff v1.0-P6R2-base -- src/engine/` EMPTY for P6R2.1 (controller-level only; `recommend.test.js` green and unmodified).
- [ ] **Engine-default regression pin**: tests calling `buildSensitivityGrid` directly without `growthValues` still see [0.01–0.03] — proving the controller-level change leaked nothing into the engine.

---

### Task P6R2.2: Computed Beta — Corpus Series, OLS Engine Module, Driver Re-Anchor

#### A. Deliverable Files
- `src/engine/beta.js` (new, additive, pure)
- `src/data/historical/` price-series dataset (new, additive; path per corpus convention)
- `src/data/assumptions.json` (beta driver record only)
- `src/ui/valuationTab.js`, `src/ui/assumptionsTab.js` (derivation disclosure)
- `tests/beta.regress.test.js` (new, additive)

#### B. Semantics (binding)
1. **Price series (corpus, cited)**: monthly closes for DUOL and the S&P 500 Index, from the first full calendar month after DUOL's 2021-07 IPO through the latest completed calendar month at snapshot (target n = 60 return observations; if fewer are available, use the maximum and disclose the shortfall). Adjusted-close basis; simple monthly returns. Every number carries a retrievable citation (series-level source block: provider, retrieval date, URL; per-observation dates). Existing corpus files byte-identical.
2. **Engine module**: `beta.regress(observations) → { beta, alphaMonthly, r2, stderr, n, windowStart, windowEnd }` — OLS with intercept of stock returns on market returns; fail-closed (`n < 24` → typed error; non-finite input → typed error); pure (no DOM/fetch/clock/Math.random); deeply frozen output. Benchmark = **S&P 500** (CAPM market-portfolio proxy; matches the provider's convention so the cross-check is apples-to-apples).
3. **Driver re-anchor**: the `beta` driver value = the computed OLS slope rounded to the driver step (0.01). Notes disclose: window, n, benchmark, R², monthly α, the provider cross-check (stockanalysis.com 5Y monthly, 0.89) and the deviation |computed − provider|. Marking stays **MKT** (precedent: the ERP is itself a derived implied premium and is MKT-labeled); `asOf` = regression end month; `source` = the corpus series (provider cross-check URL retained). Key, label, group, min/max/step, units, and scenarioDeltas byte-identical — bear +0.15 / bull −0.15 apply to the computed base. Disclosure line: Duolingo is debt-free (D = 0), so the raw regression (levered) beta equals the asset beta — no Hamada adjustment applies.
4. **Presentation**: the Valuation tab gains a **Beta Derivation block** (n, window, benchmark, β, R², α, stderr, provider cross-check) computed at runtime from the bundled corpus via `beta.js`; the block states the driver remains user-adjustable and shows the driver's current value. The Assumptions tab beta control shows the re-anchored provenance.
5. **Consistency gate**: runtime `beta.js` output ≡ driver value (tolerance = rounding to the driver step). A stale-driver state (series updated without re-anchoring the driver) must FAIL loudly at the OP gate and be disclosed — never silently tolerated.

#### C. Invariants & Automated Quality Gates
- [ ] **External truth (OP)**: OP independently re-derives β from the raw cited series (scratch probe on the corpus, not DS fixtures) and reproduces `beta.js` output (β, R², α within 1e-6). Cross-check vs the provider figure disclosed with |Δ| and a materiality note: |Δβ| × ERP > 50bps → flagged to the Director in the submission, never silent.
- [ ] **Corpus integrity**: existing 706 records diff empty; the new series is 100% cited; UI/engine literal gates hold (no bare numerics > 999 in `beta.js` outside pinned test fixtures).
- [ ] **Purity/determinism**: two runs byte-identical; no clock/fetch; deep-frozen; O(n) at n=60 — must not degrade the recalc budget (compute-once per corpus version; the display block is not a blocking dependency of the recalc hot path).
- [ ] `assumptions.json` diff limited to the beta driver record fields enumerated in B.3.

---

### Task P6R2.3: MKT Anchor Refresh — rf, ERP, Price (Findings C & D)

#### A. Deliverable Files
- `src/data/assumptions.json` (three driver records only: `risk_free_rate`, `equity_risk_premium`, `market_share_price`)
- `tests/` (migration-ledger-enumerated pin updates only — enumerated in P6R2.4, executed with it)

#### B. Semantics (binding)
1. **`risk_free_rate`**: value 0.0473 → **0.0479**, asOf 2026-08-28 → **2026-09-01**; notes cite the posted FRED DGS10 observation (the release the prior notes flagged as pending has published — the staleness rationale is retired, not silently extended). Key/schema/deltas byte-identical.
2. **`equity_risk_premium`**: value 0.0442 → **0.0446**, asOf 2026-07-01 → **2026-01-05**; notes carry the full published decomposition (Aaa mature-market 4.23% + US Aa1 adjusted default spread 0.23% = 4.46%), the real cross-check series (2024: 4.33%, 2025: 4.23%), and state plainly that the January 5, 2026 table is the latest available update — never implying a more current one. The retired 4.42%/July-2026 citation is disclosed in the phase log as a Finding C remediation.
3. **`market_share_price`**: value 148.36 → **157.85**, asOf 2026-08-31 → **2026-09-02** (last COMPLETED session close; the 2026-09-03 intraday print is excluded by the driver's own close-only convention, disclosed as such). Scenario deltas stay 0 (benchmark immobility rationale unchanged). Market cap (derived) refreshes automatically: 157.85 × 50,031,000 = 7,897,393,350.
4. **Standing rule codified (Findings C+D)**: no driver may cite a dated provider "update" or "next release" state that OP has not verified against the live source at submission. Live-provider verification of every dated MKT citation enters the standing OP external-truth checklist (alongside the existing asOf/source.provider checks).

#### C. Invariants & Automated Quality Gates
- [ ] `assumptions.json` diff limited to the three enumerated driver records' value/asOf/notes fields; keys, labels, groups, bounds, steps, units, scenarioDeltas byte-identical.
- [ ] OP re-pulls FRED DGS10 and the stockanalysis history page at review time and re-verifies the three citations (values, asOf dates, provider URLs) — internal consistency alone is insufficient (Finding C lesson).
- [ ] New WACC at refreshed anchors, computed and ledged in P6R2.4: Re = 0.0479 + 0.89 × 0.0446 = **8.7394%** (pre-beta-reanchor); the full pin migration executes once, jointly, in P6R2.4.

---

### Task P6R2.4: FCFF/FCFE Dual-Path DCF + DCF Schedule Presentation (Findings E & F) & Pin Migration & Re-Baseline

#### A. Deliverable Files
- `src/engine/threeStatement.js` (limited lift: additive `fcff` companion line)
- `src/engine/dcf.js` (limited lift: additive dual-path block; headline basis switch)
- `src/ui/valuationTab.js` (schedule relabel + TV row; dual-path presentation + debt-free equivalence card)
- `tests/dcf.dualpath.test.js` (new, additive), pin migration ledger + migration-enumerated pin updates across `tests/`
- `docs/screenshots/phase_6R2/`; `docs/status.md` + `OPmemory.md` §3 (OP, post-verification)

#### B. Semantics (binding)
1. **FCFF line (threeStatement)**: each forecast period's `cashFlow.byPeriod[period]` gains `fcff` — NI-basis FCF minus after-tax interest income (`interest_income × (1 − effective_tax_rate)`), provenance-carried (drivers: `interest_income_rate`, `effective_tax_rate`; balance inputs: average invested cash). The existing `free_cash_flow` line object keeps its shape (frozen P4 consumers); its derivation comment labels it FCFE-basis.
2. **Dual-path DCF (dcf.js)**: `valuate()` output ADDS: `fcff: { schedule (fcff, df, pv), pvExplicit, terminalValue, pvTerminal, enterpriseValue, netCashToday, equityValue, perShare }` — FCFF = fcff flows discounted at WACC, bridge adds **today's** net cash (latest filed balance sheet: cash + STI + LTI − funded debt = 0); `fcfe: { schedule, pvExplicit, terminalValue, pvTerminal, equityValue, perShare }` — the existing NI-basis flows as-is, **no cash add**; `equivalence: { debtFree: true, statement: "At D = 0, WACC ≡ Re, so FCFF and FCFE discount at the same rate; both paths value the same equity claim and converge" , divergence: fcff.perShare − fcfe.perShare }`. The headline `perShare`/`enterpriseValue`/`equityValue`/`upsidePct` fields switch to the **FCFF basis** (correct economics — no double count); the shipped mixed-basis values are preserved verbatim in a `legacy` sub-block (before/after evidence for the ledger, and for any consumer that still reads them during migration). Signature, error codes, existing output fields: unchanged.
3. **Interest-income honesty note**: the FCFE path's flows embed interest income on a cash pile the path does NOT add back — economically that values the pile's P&L contribution but not the pile. This is disclosed (not hidden): the FCFE card carries a footnote stating the FCFE number is a *floor* on equity value under the no-cash-add convention, and that the FCFF headline is the model's standing answer. The `equivalence.divergence` field quantifies the gap per scenario.
4. **DCF schedule presentation (Finding E — binding structure)**: the schedule grid restructures the terminal column so every capitalization step is explicit and labeled. Terminal column renders under its own header **"Terminal Year (Gordon)"** with the basis stated in the column, and the schedule EXPOSES these rows, engine-derived, in this order: (a) **Terminal FCF (undiscounted)**; (b) **Gordon multiple [1/(WACC−g)]** — shown as a row so the 16.2× capitalization is visible; (c) **Terminal Value (undiscounted) = terminal FCF × multiple**; (d) **PV of Terminal Value = TV × df_T** — the label MUST contain the words "Terminal Value"; (e) cumulative row relabeled "Cumulative PV incl. Terminal Value". The explicit-period row labels ("PV of Explicit FCF") MUST NOT span the terminal column. The df row already shows 0.6600 for the terminal column — it stays, and the PV-of-TV row uses that same df so the multiplication is checkable on-screen. Gate: a reader must be able to reconstruct (d) = (a)×(b)×df from the rendered grid alone; OP verifies this reconstruction from the DOM.
5. **Migration ledger BEFORE any pin moves** (single joint pass — β + ERP + rf + price + basis switch together): DS enumerates every pin that transitively depends on {beta, ERP, rf, price, FCF basis} — Re/WACC 0.086638 · df FY2026/FY2030 · pvExplicit 1,956,849.68 · terminal FCF 703,279.08 · Gordon TV 11,409,829.69 · pvTerminal 7,531,035.94 · EV 9,487,885.62 · netCash 2,987,770.06 · equity 12,475,655.68 · perShare 249.35851138243592 · upside +68.08% (vs price 148.36 — note the price anchor ALSO moves to 157.85, so upside recomputes against the new benchmark) · Bear $132.16 fair / Bull $532.17 · scenario WACC pins 10.35%/7.13% · app-level sensitivity grid pins including the P6R2.1 re-centered corners · marketCap 7,422,599,160 → 7,897,393,350. New pins are computed and ledged, never hand-derived. Unaffected-by-construction (asserted): hybrid H1 invariants 590,421/78,472/76,618/239,031; corpus 706; balance gate; latency budget; shares 50,031,000.
6. **Test updates are ledger-enumerated ONLY**: no pin constant changes outside the ledger; every changed expectation maps 1:1 to a ledger row. All other test changes additive.
7. **Re-baseline sweep**: all-scenario-state browser sweep (default / bear / bull × one slider edit each), all 8 tabs tied out to re-derived engine values, screenshots refreshed, `docs/status.md` + `OPmemory.md` §3 re-pinned by OP only after independent re-derivation.

#### C. Invariants & Automated Quality Gates
- [ ] **Dual-path convergence**: at debt-free structure and default drivers, `fcff.perShare` and `fcfe.perShare` are both finite, positive, and their `equivalence.divergence` is disclosed per scenario; FCFF headline < legacy mixed-basis perShare (the double count removed) — asserted numerically, tolerance-free.
- [ ] **Basis isolation**: `fcff` schedule contains ZERO interest income (sum of |fcff − fcfe| per period == after-tax interest income per period, within rounding); `fcfe` path adds ZERO cash in its bridge.
- [ ] Engine diff limited to the enumerated lifts (`beta.js` NEW + `dcf.js` + `threeStatement.js` Finding-F blocks); `wacc.js`/`recommend.js`/`forecast.js`/`schedules.js` byte-identical; corpus 706 diff empty.
- [ ] **OP independent full-path tie-out per scenario** (schedules → forecast → threeStatement → wacc → dcf → recommend → sensitivity) — re-deriving CAPM at the new anchors, the FCFF bridge with TODAY's net cash, the FCFE floor, Gordon identities, and the divergence — plus a from-scratch recomputation of the legacy block matching the shipped v1.0-P6R values (proving the migration ledger's "before" column).
- [ ] Suite green ×3, 0 flakes; every changed expectation traceable to a ledger row; latency re-proven median < 16ms over 100 iterations (dual-path is one extra O(horizon) pass).
- [ ] Rendered DOM values = engine re-derivation on all tabs at all swept states; **Finding E structural gate: the terminal column renders under its own "Terminal Year (Gordon)" header with the four terminal rows (terminal FCF, Gordon multiple, undiscounted TV, PV of Terminal Value) all present, and OP reconstructs PV-of-TV = terminalFCF × multiple × df_T from the rendered DOM alone; no "Explicit FCF" label spans the terminal column (DOM-text sweep asserts absence)**.

---

### Task P6R2.5: Live Market Pricing — Fetch Client, Proxy, Staleness Gate (Finding G)

#### A. Deliverable Files
- `src/engine/market.js` (new, additive)
- `vercel.json` (route addition)
- `src/app.js` (boot wiring, fallback path)
- `src/ui/summaryTab.js`, `src/ui/valuationTab.js` (price banner, staleness states, refreshed price everywhere it renders)
- `tests/market.fetch.test.js` (new, additive)

#### B. Semantics (binding)
1. **Fetch client** (`src/engine/market.js`): pure, injectable transport (`fetch` via DI — no global coupling, testable with a stubbed transport). `market.fetchLatestPrice(transport) → { price, asOf, source, isOfficialClose }`. On success, the live price REPLACES the snapshot `market_share_price` driver value for ALL verdict computations (upside %, over/undervalued, verdict card) and the driver's own UI control re-renders showing the fetched value with its live citation. The snapshot driver remains the deterministic fallback (below) and the scenario-comparison benchmark (deltas stay 0 — a fallback anchor, not a scenario input).
2. **Proxy** (`vercel.json` + a minimal serverless function): browser→provider direct fetch is CORS-blocked (verified). The sanctioned path is a Vercel serverless endpoint `/api/price` that calls the provider server-side and returns `{ symbol: "DUOL", price, asOf, isOfficialClose, provider, retrievedAt }`. **Provider pinned per Director ruling 2026-09-03: stockanalysis.com** (S&P Global-sourced data, same provider family as the existing corpus citations — provenance consistency; zero API keys — the repo's zero-secrets policy holds). The proxy adds `Cache-Control: no-store` passthrough; returns provider-native JSON re-shaped only, no transformation of values.
3. **Staleness gate**: fetched price enters verdict math ONLY if `isOfficialClose === true` (close-only convention, standing). An intraday print updates the banner ("last completed close $X (date) · intraday $Y") but NEVER the math. On fetch failure (offline, provider down, proxy 5xx): fall back to the snapshot driver price and render a **persistent, unmissable banner**: "LIVE PRICE UNAVAILABLE — verdict computed against snapshot close $157.85 (2026-09-02). Snapshot may be stale." The verdict is NEVER silently computed against a stale price. `retrievedAt`/`asOf` render next to the price everywhere it appears.
4. **Determinism preserved**: the offline `npm test` suite and the engine core never fetch. The fetch is boot-time + a manual refresh button ONLY (no polling loop — a poller burns the latency/memory budgets and introduces races the sync recalc forbids). A user recalc (slider edit) re-runs the verdict against the LAST FETCHED price synchronously; the refresh button is the only re-fetch trigger. No `Promise`/`async` inside the synchronous recalc chain — the fetch result lands via a single state assignment that triggers the existing sync recalc path.
5. **Phase 7 interface**: the fetched-price state object (`{ price, asOf, source, isOfficialClose }`) is the price input Phase 7's multi-method verdict consumes. P6R2 ships the plumbing; Phase 7 builds the methods on it.

#### C. Invariants & Automated Quality Gates
- [ ] Fetch path: stubbed-transport tests cover success / intraday-reject / failure-fallback states; the fallback banner text asserted in DOM; verdict math uses fetched close on success, snapshot on failure — never undefined, never stale-silent.
- [ ] Proxy: endpoint live on Vercel staging, `no-store` verified, zero secrets in repo (grep gate), provider response shape validated fail-closed (malformed → treated as failure → fallback).
- [ ] `git diff v1.0-P6R2-base -- src/engine/{wacc,recommend,forecast,schedules}.js` EMPTY; engine adds limited to NEW `beta.js` + NEW `market.js` + the two enumerated Finding-F lifts.

---

## 4. Milestone Acceptance Criteria (Gate Requirements)

- [ ] P6R2.1–P6R2.5 individually submitted and OP-approved; every verdict cycle uses the all-scenario-state rendered sweep (standing gate since P6R.1).
- [ ] Engine diff = additive `beta.js` + additive `market.js` + the two enumerated Finding-F lifts in `dcf.js`/`threeStatement.js` ONLY; existing corpus diff empty; `assumptions.json` diff = the four enumerated driver records (`beta`, `equity_risk_premium`, `risk_free_rate`, `market_share_price`) within their enumerated fields; all other frozen surfaces byte-identical.
- [ ] Center-cell invariance + shrink guard + engine-default regression pin (P6R2.1.C) all green; beta consistency + external-truth re-derivation + corpus integrity (P6R2.2.C) all green; live-source re-verification of all refreshed MKT anchors (P6R2.3.C) green; dual-path convergence + basis isolation + pin migration ledger closed (P6R2.4.C) green; live-price fetch states + fallback banner + no-store proxy + zero secrets (P6R2.5.C) green; **the 4.42%/July-2026 ERP citation disclosed in the phase log as a Finding C remediation; the FCFF/FCFE restatement and its per-share impact disclosed as a Finding F remediation; the terminal-column restructure disclosed as Finding E; the live-price fallback disclosed as Finding G**.
- [ ] OP consolidated tie-out in `docs/logs/op/phase_6R2.md` (methods, per-check results, probe inventory).
- [ ] **RELEASE BLOCK (carried forward from P6R)**: OP PASS ≠ release. The `v1.0` tag issues only after the Director's explicit final-pass approval of the shipped interface.

---

> **Director decisions encoded (2026-09-03)**: (1) sensitivity matrix re-centered so the active WACC and active terminal growth land at the exact matrix center (both axes scenario-relative). (2) Beta computed by the model — OLS on a cited corpus price series; the provider figure is demoted to a disclosed cross-check. (3) ERP re-anchored to the verified published Damodaran figure (4.46%, January 5, 2026 update — latest available; the prior "July 2026 / 4.42%" citation is retired as unverifiable). (4) MKT anchors refreshed — rf 4.79% (FRED DGS10, 2026-09-01), price $157.85 (2026-09-02 close), market cap derived. (5) DCF restated on a consistent FCFF basis as headline with the FCFE path disclosed and the debt-free equivalence theorem stated in the UI; the mixed-basis double count is removed (Finding F, material). (6) DCF schedule terminal column restructured with the discounted terminal value labeled as exactly that (Finding E, Director-escalated). (7) Live market pricing: auto-fetched at runtime, close-only into verdict math, snapshot as disclosed fallback with staleness banner (Finding G). (8) Live-provider verification of every dated MKT citation enters the standing OP checklist. (9) **Phase split ruling**: 6R2 = cleanups + live pricing (this phase, FIRST); Phase 7 = multi-method valuation (NEXT, consumes this phase's outputs as baseline). (10) Release authority remains Director-only; OP PASS is not release authority.
