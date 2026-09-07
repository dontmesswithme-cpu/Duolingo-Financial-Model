# Phase 8: Multi-Method Valuation — Six Methods, Agreement-Only Verdict

> **Milestone**: Phase 8 — Multi-Method Valuation (Director-directed; RENUMBERED 2026-09-04 — formerly Phase 7; methods phase, sequenced after the Phase 7 solution design)
> **Protocol**: 1.0 (internal workflow only — no protocol mentions in the product UI, per standing Director ruling)
> **Status**: 🟡 Reopened by Director 2026-09-06 — P8.1–P8.3 gate passed 2026-09-05 (status.md); Tasks P8.4 + P8.5 (interface remediation: multi-method detail presentation; defense-panel prose remediation) added per Director order 2026-09-06; DS implements on Director kick-off only; engine + methods byte-frozen; release block carries.
> **Owner**: Drafted & audited by Reviewer (`OP`); implemented by Worker (`DS`); **final approval authority: Director**
> **Objective**: One DCF can no longer solely produce the undervalued/fair/overvalued verdict (Director 2026-09-03: "we cannot just say that the stock is undervalued or whatever based on one valuation method. We need more valuation methods and if all of them point to one decision then we can do it"). Phase 8 deploys **six methods** and issues a directional verdict **only from unanimous agreement**. DDM excluded (no dividend fabrication). **Precedent transactions SCRAPPED** (Director 2026-09-03: "scrap precedent transaction" — the record is too thin to anchor a method; the candidate rows are not carried into this phase in any form).

---

## 1. Milestone Objective & Scope

Phase 8 exists because the Director ruled that a public-facing verdict must emerge from **convergent independent methods**, not one Gordon terminal. It builds on Phase 6R3's shipped baseline: the hardened cost of capital (monthly ERP, peer-median beta over the locked three-name set), the FCFF-headline dual-path DCF, the restructured terminal-value presentation, and the **live-price plumbing** (`src/engine/market.js`, `/api/price` proxy, fetched-price state object) that this phase's verdict consumes as its price input — plus the **Phase 7 driver-defense solution**, which governs how every method input is footnoted and defended in the UI.

**Lifted frozen decisions** (exactly and only for the enumerated surfaces):
- spec §3.4 Tab 6/7: "Comps … excluded by Director decision — shown as marked N/A lines". The N/A rows are retired; trading comps and the multi-method verdict land in this phase.
- spec §2/§5 offline-determinism: NO additional lift. The live-price fetch was lifted in 6R2; Phase 8's new modules are all pure/offline — they consume the already-fetched price state, they never fetch.

**In scope**:
- `src/engine/methods/` (NEW, additive, pure): `fcffDcf.js` (thin wrapper), `evMultiples.js`, `comps.js`, `pfcf.js`, `sotp.js`, `perUser.js`, `aggregate.js`
- `src/data/historical/peers.json` (NEW, additive)
- `src/app.js` — verdict recompute wiring (methods consume the 6R2 fetched-price state)
- `src/ui/summaryTab.js` — Verdict card + method table (the P4 single-method label retires here)
- `src/ui/valuationTab.js` — method blocks with full derivations
- `src/ui/tabs.js`, `index.html` — TOC/architecture rows (N/A lines retired)
- `tests/` — additive suites
- `docs/` — this spec, logs, status

**Out of scope**:
- `src/engine/{wacc,dcf,recommend,threeStatement,forecast,schedules,beta,market}.js` — behavior-frozen (6R2's enumerated lifts were the last sanctioned engine edits). Phase 8 methods are NEW modules, additive only; they READ engine output, they never modify it.
- Existing corpus records (706) and the 6R2 price-series additions; existing driver keys/schema/deltas; URL-hash state schema; the 8-tab shell (no new tabs — Verdict card and method tables live in Summary and Valuation).
- DDM (Director-excluded). Precedent transactions (Director-scrapped). LBO (never ordered).
- Any method, dataset, or surface not enumerated: STOP and escalate to Director.

---

## 2. Director Rulings Encoded (all locked 2026-09-03)

1. **Method set — SIX, unweighted, agreement-only**: 2-Stage DCF (FCFF primary) · EV/Forward EBITDAR (comps) · EV/Forward Revenue (comps) · P/FCF & FCF yield · SOTP · Per-User/Per-Subscriber.
2. **Precedent transactions: SCRAPPED** ("scrap precedent transaction"). Not a method, not a context table, not a dataset row — absent from the phase entirely.
3. **SOTP ruling**: **(i) advertising FOLDED into the subscriptions multiple** ("i a fold it") — one subscriptions segment valued on the locked peer multiples, with the fold disclosed in the segment table footnote; **(ii) AI-tutor segment REMOVED** ("ii remove segment") — the segment map is **Subscriptions (incl. advertising) + Duolingo English Test**. Two segments, nothing else.
4. **Live-price provider: stockanalysis.com** (OP recommendation accepted — "4 cool your rec").
5. **Threshold band: ±15%** (inherited from `RECOMMENDATION_THRESHOLDS`, imported-only — "5 keep 15").
6. **Forward horizon: FY+1** (OP recommendation accepted — "6 cool"), with per-row basis disclosure where a peer's cited source forces NTM.
7. **Aggregation: UNWEIGHTED** ("7 unweighted") — all six must agree beyond the band for a directional verdict; any split → "FAIR, no consensus" with per-method dissent rendered. No weights, no blends, ever.
8. **Peer set (locked; revised — Coursera + Udemy REMOVED from all peer uses per Director model-match ruling)**: **Spotify + Roblox + Netflix everywhere** — trading multiples (3-name medians), per-user/engagement (native KPIs), and the 6R3 peer beta. Coursera/Udemy removed from beta, comps, SOTP, and P/FCF (depressed multiples + high loading would distort medians; homework-help/narrow-demo model mismatch). Chegg permanently excluded; Pinterest excluded (below the Director's 90% SOTP bar); Tier C removed; Babel/Busuu not carried (precedent context died with the method); ATGE/LOPE never carried (regulated degree-factory risk ≠ consumer-fintech risk).
9. **Lease capitalization (carried from the prior ruling)**: all relative methods on the capitalized basis — lease liabilities into EV, filed rent expense added back → EBITDAR; DUOL idem ($86.14M Q2 FY2026 filed). DCF keeps rent in operating flow; the cross-method convention difference is footnoted, never silently mixed.
10. **OP does its own maths (standing)**: no Director-supplied or external-analyst figure is ever a tie-out target, gate, pin, or input. OP re-derives everything from corpus + live market data.

---

## 3. Sub-Phase Artifact Contracts

### Task P8.1: Peer Corpus + Relative Methods (Comps, EV Multiples, P/FCF)

#### A. Deliverable Files
- `src/data/historical/peers.json` (new, additive)
- `src/engine/methods/comps.js`, `src/engine/methods/evMultiples.js`, `src/engine/methods/pfcf.js` (new, pure)
- `tests/comps.test.js`, `tests/evMultiples.test.js`, `tests/pfcf.test.js` (new, additive)

#### B. Semantics (binding)
1. **Peer rows (the locked three)**: Spotify, Roblox, Netflix — every peer row, every figure cited with asOf: market cap (price × shares, derived) · revenue (LTM + FY+1 where a cited source exists) · EBITDA (LTM, adjusted definition disclosed) · **rent/lease expense (filed, EBITDAR add-back)** · operating lease liabilities (EV add) · debt · cash & investments · EV (= mcap + debt + operating lease liabilities − cash) · native KPIs (MAU/ARPU · DAU/bookings-per-user · paid-subs/ARPU — cited). Engine computes per-peer: EBITDAR · EV/Revenue · EV/EBITDAR · P/FCF · FCF yield · per-user multiples per native basis. The trading-multiple median is a **3-name median** (Spotify/Roblox/Netflix) with min–max span rendered everywhere a trading multiple appears — dispersion visible, never hidden.
2. **Lease basis (all relative methods)**: peers' EVs and multiples on the capitalized basis (Director ruling #9); DUOL idem. The method table footnotes the materiality (~1.4% of DUOL EV) and the DCF's different convention.
3. **Forward multiples**: FY+1 (Director ruling #6). DUOL's forward revenue/EBITDA come from the model's own explicit forecast (engine-derived, EST-marked) — not external consensus. Where a peer's cited source offers only NTM, that peer renders with its basis disclosed per-row (no blending, no fabrication; absence of forward data excludes the peer from the forward method with the exclusion rendered).
4. **Trading-median disclosure (standing)**: covered in B.1 — the 3-name median carries min–max span everywhere; thinness-or-dispersion visible, never hidden.
5. **P/FCF & FCF yield**: DUOL TTM FCF (engine-derived from corpus) against the live market cap (fetched price × shares) → implied P/FCF and FCF yield; method value = peer-median P/FCF × DUOL TTM FCF → implied per-share. Peers for this method: the locked three (their P/FCF medians computed on the same 3-name disclosed basis).
6. **Method modules (pure)**: every module returns the common frozen shape `{ method, basis, impliedPerShare, rangePerShare, inputsProvenance }`; fail-closed on non-finite/missing; no fallbacks; zero network; deep-frozen; no clock/random.

#### C. Invariants & Automated Quality Gates
- [ ] Corpus integrity: existing records diff empty; `peers.json` 100% cited with asOf; OP re-pulls and re-verifies EVERY peer figure against its cited source (Finding-C lesson: live-source verification, not internal consistency).
- [ ] **Lease-basis consistency gate**: OP recomputes at least one peer's EV/EBITDAR end-to-end from cited raw figures on the capitalized basis (lease liabilities in EV, rent in the add-back).
- [ ] Method math: implied per-share recomputed by OP from raw corpus rows within 1e-6; 3-name median + span rendered everywhere a trading multiple appears.
- [ ] Purity/determinism: byte-identical reruns; no clock/fetch/random in any method module.

---

### Task P8.2: SOTP + Per-User Methods

#### A. Deliverable Files
- `src/engine/methods/sotp.js`, `src/engine/methods/perUser.js` (new, pure)
- `tests/sotp.test.js`, `tests/perUser.test.js` (new, additive)

#### B. Semantics (binding)
1. **SOTP (Director-ruled segment map — TWO segments; multiple family ruled: EV/Revenue primary, EBITDAR sensitivity)**: (a) **Subscriptions (incl. advertising)** — the folded treatment (Director ruling #3.i): advertising revenue valued inside the subscriptions segment on the same multiple, with the fold disclosed in the segment table footnote; valued on the **EV/Revenue 3-name median** (primary) with the **EV/EBITDAR median rendered alongside as sensitivity** (margin dispersion across the three names makes EBITDAR the weaker median — disclosed, not hidden); (b) **Duolingo English Test** — its disclosed revenue line from cited filings, valued at the **same subscriptions-family EV/Revenue median with the constraint disclosed on the row** (no separate DET multiple exists; no outside multiple imported). **AI tutor: REMOVED from the map** (Director ruling #3.ii) — it is not a segment, not a stub, not a rendered line. Sum of segment EVs → + today's net cash (6R2 convention) → ÷ shares → implied per-share. Segment revenue splits from cited filings/IR only; where a split is not separately disclosed, the segment renders with its allocation basis disclosed, never guessed silently.
2. **Per-User/Per-Subscriber**: three bases, native KPIs, never blended (Director ruling #8): Spotify (MAU, ARPU funnel) · Roblox (DAU, bookings-per-user) · Netflix (paid subs, ARPU). DUOL's matching KPIs from the KPI corpus (DAU, paid subscribers, ARPU context). Method value: DUOL KPI × peer median multiple per basis → implied per-share per basis → the method's single vote = the **median of the three bases** (a 3-name median of native-basis multiples, rendered per-basis with min–max span).
3. **Common module shape** as in P8.1.B.6; same purity/fail-closed rules.

#### C. Invariants & Automated Quality Gates
- [ ] Segment map asserts exactly TWO segments (subscriptions-with-ads-fold + DET); zero AI-tutor surface anywhere in rendered DOM (grep gate — the word must not appear as a SOTP line).
- [ ] Fold disclosure present: the segment table footnote states advertising is valued inside the subscriptions segment.
- [ ] DET at family multiple: the DET row carries the constraint disclosure (no separate multiple, no outside import).
- [ ] Per-user: three native bases rendered separately, never blended; method vote = median of bases with span; DUOL KPIs tie to cited corpus rows.

---

### Task P8.3: Multi-Method Verdict Engine + Summary Rework

#### A. Deliverable Files
- `src/engine/methods/fcffDcf.js` (thin wrapper exposing the 6R2 FCFF 2-stage path as one method among six), `src/engine/methods/aggregate.js` (agreement engine)
- `src/app.js` (verdict wiring — methods consume the 6R2 fetched-price state)
- `src/ui/summaryTab.js` (Verdict card + method table), `src/ui/valuationTab.js` (method blocks)
- `src/ui/tabs.js`, `index.html` (TOC/architecture rows; N/A lines retired)
- `tests/verdict.methods.test.js` (new, additive)

#### B. Semantics (binding)
1. **Aggregation (agreement-only, unweighted — Director ruling #7)**: `aggregate.verdict(methods, livePrice, threshold) → { verdict, methodResults, agreement: { unanimous, spread }, dissent: [...] }`. `undervalued` ⇔ EVERY method's implied per-share ≥ livePrice × (1 + threshold); `overvalued` ⇔ EVERY method's implied per-share ≤ livePrice × (1 − threshold); else `fair`. Dissent always rendered method-by-method ("5 of 6 methods imply undervalued; comps implies fair — verdict: FAIR, no consensus"). Threshold = ±15% imported from `RECOMMENDATION_THRESHOLDS` (Director ruling #5), never a literal.
2. **Method set (six, Director ruling #1)**: 2-Stage FCFF/FCFE DCF (primary — displayed first, largest treatment; presentational primacy only, computational standing equal) · EV/Forward EBITDAR · EV/Forward Revenue · P/FCF & FCF yield · SOTP (two segments) · Per-User/Per-Subscriber. All six vote.
3. **Price input**: the 6R2 live-price state object — fetched close enters the verdict; snapshot fallback + staleness banner state carries through to the Verdict card unchanged. Live price is scenario-invariant (benchmark immobility, standing).
4. **Verdict card (Summary tab)**: headline verdict + agreement state + per-method table (method, basis, implied per-share, upside vs live price, verdict-in-isolation) + live price + staleness state. The P4 single-method label is RETIRED from the user-facing Summary surface (it survives only inside `recommend.evaluate` as frozen arithmetic the DCF-method wrapper consumes).
5. **Scenario semantics**: scenarios shift DRIVERS; the verdict re-runs per active scenario across all six methods. The scenario comparison table gains a verdict column per scenario.
6. **DCF method block**: renders the 2-stage structure explicitly (stage 1 explicit forecast, stage 2 Gordon terminal with the 6R2 Finding-E row structure) and discloses the lease-convention difference vs the relative methods.

#### C. Invariants & Automated Quality Gates
- [ ] **Agreement-logic truth table**: synthetic method-result sets covering all unanimous/split combinations → verdict assertions (no blending, no averaging; dissent always rendered; zero weights anywhere in `aggregate.js` — grep gate).
- [ ] Six methods live at default state; OP re-derives every per-method implied per-share from raw corpus rows + live market data independently (OP does its own maths — no external-analyst tie-outs) and recomputes the verdict by hand from the six numbers.
- [ ] All-scenario-state rendered sweep (default/bear/bull × one slider edit each): Verdict card re-renders per state; verdict column present in scenario comparison; zero console errors; latency median < 16ms (six methods are O(horizon) + O(peer-count) — budget holds).
- [ ] TOC/architecture: N/A rows retired; methods listed with data sources; UI literal gates hold (no bare numerics; ±15% imported from constants).

---

### Task P8.4: Multi-Method Detail Presentation — Dropdown Switcher & Per-Method Derivation Panels (Director order 2026-09-06)

#### A. Deliverable Files
- `src/ui/valuationTab.js` (additive within `renderMultiMethodBlocks`; no engine changes)
- `index.html` (additive CSS for select/panel/active-card)
- `tests/methods.detail.test.js` (new, additive)

#### B. Semantics (binding)
1. **Why**: the shipped synthesis card shows one-line summaries per method; only the DCF carries a full visible derivation. Director order: every method must be inspectable in detail, switchable via a dropdown menu button.
2. **Structure**: (a) a compact summary strip — one interactive card/tile per method (label, implied per-share, range, family badge, isolated-verdict badge); (b) dropdown menu retired in favor of tile/card-only switcher per Director decision (2026-09-08) to preserve clean visual hierarchy and direct tile selection; (c) a detail panel rendering the FULL derivation of the selected method. Selecting via card click sets the active method; the selection state persists across re-render/recalculation and stays valid (falls back to first method if the active key disappears).
3. **Per-method detail content (all figures engine-derived, zero new literals)**:
   - **fcff_dcf**: methodology prose (2-stage structure), component table (PV explicit, PV terminal Gordon, EV, + net cash, equity, ÷ shares), runtime WACC/g, FCFE cross-path.
   - **comps / ev_multiples**: peer-multiple table with per-peer rows, median + min–max span, exclusion rows disclosed (RBLX negative EBITDAR) with reason; Duolingo application table (forward metric, × median, implied EV, + capitalized net cash, per-share).
   - **pfcf**: peer P/FCF + FCF-yield table, median; DUOL TTM FCF application to implied market cap → per-share.
   - **sotp**: two-segment table (name, FY+1 revenue, multiple, implied EV, constraint/footnote), segment sum + net cash → per-share; EV/EBITDAR sensitivity block with margin-dispersion note.
   - **perUser**: native-basis table (basis name, peer EV/user, DUOL KPI count, implied per-share, ARPU context), method vote = median basis with span.
   - **Common footer per method**: Inputs & Provenance table (benchmark price + badge, diluted shares + filing cite, peers asOf) and the method's lease-convention note.
4. **Purity/conventions**: render-only; zero engine edits; no async/fetch in the tab; selection stored in a closure variable, listeners re-bound per render and disposed on `dispose()`; zero `style=`; ±15% and all numerics from engine/imports only.

#### C. Invariants & Automated Quality Gates
- [ ] Card/tile switcher present with exactly 6 method cards; clicking each renders its panel (`data-method-panel` key matches); card active state (`aria-pressed="true"`, `.method-card-active`) synchronizes cleanly.
- [ ] Active selection persists across (a) `view.update()` re-render, (b) a driver edit → full app recalculation.
- [ ] Every panel's numerals re-derive from the frozen method outputs (OP re-computes at least one peer median and one per-share bridge from raw peers.json/corpus by hand).
- [ ] RBLX exclusion disclosed on the EBITDAR panel; SOTP panel shows exactly 2 segments with fold footnote + DET constraint; per-user panel shows 3 unblended bases.
- [ ] Real-browser sweep (Playwright): all six panels cycle with zero console errors/pageerrors; UI literal + no-style gates hold; suite green ×3.

---

### Task P8.5: Defense-Panel Prose Remediation — Rationale-First Writing, Label & Noise Removal (Director order 2026-09-06)

#### A. Deliverable Files
- `src/ui/valuationTab.js` (prose/label edits within `renderThesisDefensePanel` only)
- `src/data/assumptions.json` (beta driver note: remove removed-peer sentence — the only data-file edit; values untouched)
- `tests/p7_solution.defense.test.js` (amend the 2 assertions that pinned the retired sentences; additive rationale assertions)

#### B. Semantics (binding) — AMENDED by Director order 2026-09-06 / 2026-09-08 (P8.5a)
1. **Panel retitle**: header becomes "Thesis Defense & Driver Rationale Directory" (drop "(10 Core Levers)"); intro prose drops "ten core" phrasing.
2. **Directory structure (7 core levers, Director order 2026-09-06 / 2026-09-08)**:
   - The Defense Directory is focused on 7 core valuation drivers (`#defense-lever-1` through `#defense-lever-7`).
   - Four secondary levers from earlier drafting (Net Cash Bridge, Scenario Bands, Benchmark Price, Discount Digest) are retired per Director decision to eliminate noise and redundancy (Net cash and discount digest are directly visible in the bridge and WACC tables; scenario bands are covered in the Sensitivity tab).
   - **Lever 7 — Peer Set Selection (Why This Peer Set)** (`#defense-lever-7`, collapsed `<details>` row, badge "SPOT · RBLX · NFLX"):
     - **Why-prose**: defends the Spotify/Roblox/Netflix set on risk-transfer logic — Spotify (freemium→subscription funnel + MAU/ARPU, Duolingo's core mechanic), Roblox (DAU-scale daily-habit engagement, bookings-per-user, younger demo), Netflix (mature paid-subscriber scale anchor); triangulates the three monetization bases consumed natively in Per-User; small-set-by-design rationale (3-name minimum median with visible min–max dispersion, never hidden; larger sets dilute model match).
     - **Consumption table**: the five consuming surfaces (beta/CAPM, EV multiples, SOTP family multiple, P/FCF, Per-User native bases) with each peer's role and discipline.
     - **Dispersion table**: per-peer unlevered beta (engine-derived at runtime), native basis, D/E; median + span row.
     - Constraints: renders under `#defense-lever-7` as a collapsed `<details>` row; all numerals engine-derived (no new literals); no removed-peer names anywhere (standing).
3. Original P8.5 semantics (items below) unchanged.

#### C. Invariants & Automated Quality Gates — AMENDED
- [ ] Lever 7 mounts with the "Why This Peer Set" prose, consumption table, and dispersion table; all peer figures re-derive from `peers_beta.json` at runtime (OP re-computes median by hand).
- [ ] Panel renders 7 defense rows (`#defense-lever-1..7`); header carries no "(10 Core Levers)"; intro carries no "ten core".
- [ ] All original P8.5 gates below still hold.

**Original P8.5 semantics (carried):**
1. **Rationale-first prose**: every lever's "Why This Choice" must answer *why this value* — the constraint(s) the choice satisfies and the alternatives it beats — before any description of what it is. Rewrites ordered: Lever 4 terminal g (three-constraint derivation: Gordon headroom below WACC, GDP ceiling, mature-growth logic; retain the ratified reachability sentence verbatim), Lever 1 rf (horizon match + FRED canonical-source logic), Lever 2 beta (own-regression statistical weakness → bottom-up peer median, unlevered/median/debt-free logic), Lever 5 tax (year-by-year disqualification walk: FY2025 allowance artifact, FY2021/22 loss years, FY2024 anchor, sub-statutory explanation).
2. **Removals (Director-ordered, exact)**: (a) "(Skeptic Defense)" suffix from both "Why This Choice" labels; (b) ALL ten "Underlying Enforcement Mechanism" blue boxes; (c) the sentence "Coursera and Udemy permanently removed per Director decision" (and its "removed per Director decision" variant) from valuationTab.js prose and the assumptions.json beta note. The locked peer set is cited as "Spotify, Roblox, Netflix" only. No other prose changes; no protocol mentions (standing).
3. **Ratified-sentence protection**: the P8.0-ratified reachability sentence ("within its stated bounds … only the discount rate or the flows can") must survive the Lever 4 rewrite verbatim.
4. **Literal discipline**: no new bare numerals > 999 in code (dates like FY-labels excepted per allowlist); all figures re-derive from live records; driver-note edits do not alter any `value`, bound, or delta in assumptions.json.

#### C. Original P8.5 Invariants & Automated Quality Gates (carried)
- [ ] Grep gates: zero "Skeptic Defense", zero "Underlying Enforcement Mechanism" / `defense-mechanism-box`, zero Coursera/Udemy mentions across `src/ui/` rendered DOM and the assumptions beta note.
- [ ] Ratified reachability sentence present verbatim (existing regex gate); Lever 5 disqualification rationale asserted (amended regex); Lever 2 cites "Spotify, Roblox, Netflix" and no longer names removed candidates (amended assertion).
- [ ] Orphan-figure lint, prose data-content (4 interactive states), style=, /protocol/i gates all hold.
- [ ] assumptions.json: driver `value`/`min`/`max`/`step`/`scenarioDeltas` byte-identical to pre-edit (OP diffs); only the `notes` string changes.
- [ ] Suite green ×3, 0 flakes.

---

## 4. Milestone Acceptance Criteria (Gate Requirements)

- [ ] P8.1–P8.3 individually submitted and OP-approved; **P8.4–P8.5 (reopened scope, Director 2026-09-06) submitted and OP-approved before any release action**; all-scenario-state rendered sweep standing gate applies every cycle.
- [ ] Six methods live; every input cited; agreement-only verdict at ±15% (imported); dissent rendered; unweighted (grep-provable).
- [ ] Engine frozen surfaces byte-identical (`wacc/dcf/recommend/threeStatement/forecast/schedules/beta/market`); corpus 706 + 6R2 additions diff empty; `peers.json` additive and 100% OP-live-verified.
- [ ] SOTP renders exactly two segments with the fold footnote and the DET-constraint disclosure; no AI-tutor surface; per-user renders three native bases unblended.
- [ ] Suite green ×3, 0 flakes; additive tests only; latency < 16ms re-proven with all methods wired.
 - [ ] OP consolidated tie-out in `docs/logs/op/phase_8.md`.
- [ ] **RELEASE BLOCK (carried forward)**: `v1.0` issues only on the Director's explicit final-pass approval of the whole product. OP PASS ≠ release.

---

## 5. Rulings Closed During Draft (no review-time opens remain)

1. **SOTP multiple family — CLOSED**: subscriptions segment on EV/Revenue primary, EV/EBITDAR rendered as sensitivity (margin dispersion across the three names).
2. **DET multiple source — CLOSED**: family multiple with constraint disclosed; no outside multiple imported.
3. **Phase-8 reopening scope — CLOSED (Director 2026-09-06)**: the interface remediation backlog (multi-method detail presentation + defense-prose remediation) is in scope as Tasks P8.4/P8.5 above. Everything in the Director's 2026-09-06 backlog NOT enumerated in P8.4/P8.5 (further items were signaled as pending) requires a new Director order with its own contract text before DS touches it.
4. **Tile-only switcher & 7-lever Defense Directory — CLOSED (Director decision 2026-09-08)**: Dropdown menu retired in favor of card/tile buttons only. Defense Directory streamlined to 7 core levers with 4 secondary levers retired and Lever 7 dedicated to Peer Set Selection.

Everything else is ruled and locked in §2.

---

> **Director decisions encoded (2026-09-03, phase-split revision; peer-set + SOTP rulings revised this session; RENUMBERED 2026-09-04 — this phase was Phase 7)**: (1) **Sequencing**: 6R2 = cleanups + live pricing, FIRST; Phase 8 = multi-method valuation, sequenced after the Phase 7 driver-defense solution design (consumes 6R3 cost-of-capital hardening AND the Phase 7 solution as baselines). (2) Six methods, unweighted, agreement-only at ±15%: 2-stage FCFF/FCFE DCF (primary, presentational) · EV/Forward EBITDAR · EV/Forward Revenue · P/FCF & FCF yield · SOTP · Per-user/Per-subscriber. (3) Precedent transactions SCRAPPED — absent from the phase entirely. (4) SOTP: advertising folded into the subscriptions multiple (disclosed); AI-tutor segment removed — the map is Subscriptions (incl. ads) + DET. (5) Peer set revised: Coursera + Udemy REMOVED from all peer uses (model mismatch, distortion risk); single set Spotify/Roblox/Netflix for trading multiples, per-user, and 6R3 beta. SOTP: EV/Revenue primary + EBITDAR sensitivity; DET at family multiple, constraint disclosed (no separate DET multiple). (6) Live-price provider: stockanalysis.com. (7) Forward horizon: FY+1. (8) OP does its own maths — no Director-supplied or external-analyst figure is ever a tie-out target, gate, pin, or input. (9) The P4 single-method recommendation label retires from the Summary surface. (10) Release authority remains Director-only. (11) Dropdown menu retired in favor of card/tile-only method switcher (2026-09-08). (12) Defense directory streamlined to 7 core levers (4 secondary levers retired; Lever 7 is Peer Set Selection).
