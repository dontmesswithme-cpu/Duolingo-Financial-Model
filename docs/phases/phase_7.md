# Phase 7: Multi-Method Valuation — Six Methods, Agreement-Only Verdict

> **Milestone**: Phase 7 — Multi-Method Valuation (Director-directed; second phase of the two-phase split ruled 2026-09-03)
> **Protocol**: 1.0 (internal workflow only — no protocol mentions in the product UI, per standing Director ruling)
> **Status**: 🟡 Drafted by OP 2026-09-03 — pending Director approval & kick-off. **Sequenced: Phase 6R2 (cleanups + live pricing) ships FIRST; this phase consumes its outputs as baseline.**
> **Owner**: Drafted & audited by Reviewer (`OP`); implemented by Worker (`DS`); **final approval authority: Director**
> **Objective**: One DCF can no longer solely produce the undervalued/fair/overvalued verdict (Director 2026-09-03: "we cannot just say that the stock is undervalued or whatever based on one valuation method. We need more valuation methods and if all of them point to one decision then we can do it"). Phase 7 deploys **six methods** and issues a directional verdict **only from unanimous agreement**. DDM excluded (no dividend fabrication). **Precedent transactions SCRAPPED** (Director 2026-09-03: "scrap precedent transaction" — the record is too thin to anchor a method; the candidate rows are not carried into this phase in any form).

---

## 1. Milestone Objective & Scope

Phase 7 exists because the Director ruled that a public-facing verdict must emerge from **convergent independent methods**, not one Gordon terminal. It builds on Phase 6R2's shipped baseline: the re-anchored model state (computed beta, verified ERP/rf, refreshed price), the FCFF-headline dual-path DCF, the restructured terminal-value presentation, and the **live-price plumbing** (`src/engine/market.js`, `/api/price` proxy, fetched-price state object) that this phase's verdict consumes as its price input.

**Lifted frozen decisions** (exactly and only for the enumerated surfaces):
- spec §3.4 Tab 6/7: "Comps … excluded by Director decision — shown as marked N/A lines". The N/A rows are retired; trading comps and the multi-method verdict land in this phase.
- spec §2/§5 offline-determinism: NO additional lift. The live-price fetch was lifted in 6R2; Phase 7's new modules are all pure/offline — they consume the already-fetched price state, they never fetch.

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
- `src/engine/{wacc,dcf,recommend,threeStatement,forecast,schedules,beta,market}.js` — behavior-frozen (6R2's enumerated lifts were the last sanctioned engine edits). Phase 7 methods are NEW modules, additive only; they READ engine output, they never modify it.
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
8. **Peer set (locked in the prior ruling round, carried here)**: Coursera + Udemy (trading comps, EBITDAR basis) · Spotify (90%) + Roblox (92%) + Netflix (per-user/engagement, native KPIs). Chegg permanently excluded; Pinterest excluded (below the Director's 90% SOTP bar); Tier C removed; Babel/Busuu not carried (precedent context died with the method).
9. **Lease capitalization (carried from the prior ruling)**: all relative methods on the capitalized basis — lease liabilities into EV, filed rent expense added back → EBITDAR; DUOL idem ($86.14M Q2 FY2026 filed). DCF keeps rent in operating flow; the cross-method convention difference is footnoted, never silently mixed.
10. **OP does its own maths (standing)**: no Director-supplied or external-analyst figure is ever a tie-out target, gate, pin, or input. OP re-derives everything from corpus + live market data.

---

## 3. Sub-Phase Artifact Contracts

### Task P7.1: Peer Corpus + Relative Methods (Comps, EV Multiples, P/FCF)

#### A. Deliverable Files
- `src/data/historical/peers.json` (new, additive)
- `src/engine/methods/comps.js`, `src/engine/methods/evMultiples.js`, `src/engine/methods/pfcf.js` (new, pure)
- `tests/comps.test.js`, `tests/evMultiples.test.js`, `tests/pfcf.test.js` (new, additive)

#### B. Semantics (binding)
1. **Peer rows (the locked five)**: Coursera, Udemy (trading-comps methods) + Spotify, Roblox, Netflix (per-user method — their financial rows also render for transparency but they do NOT enter the trading-multiple medians). Every peer row, every figure cited with asOf: market cap (price × shares, derived) · revenue (LTM + FY+1 where a cited source exists) · EBITDA (LTM, adjusted definition disclosed) · **rent/lease expense (filed, EBITDAR add-back)** · operating lease liabilities (EV add) · debt · cash & investments · EV (= mcap + debt + operating lease liabilities − cash) · native KPIs (MAU/ARPU · DAU/bookings-per-user · paid-subs/ARPU — cited). Engine computes per-peer: EBITDAR · EV/Revenue · EV/EBITDAR · P/FCF · FCF yield · per-user multiples per native basis.
2. **Lease basis (all relative methods)**: peers' EVs and multiples on the capitalized basis (Director ruling #9); DUOL idem. The method table footnotes the materiality (~1.4% of DUOL EV) and the DCF's different convention.
3. **Forward multiples**: FY+1 (Director ruling #6). DUOL's forward revenue/EBITDA come from the model's own explicit forecast (engine-derived, EST-marked) — not external consensus. Where a peer's cited source offers only NTM, that peer renders with its basis disclosed per-row (no blending, no fabrication; absence of forward data excludes the peer from the forward method with the exclusion rendered).
4. **Trading-median disclosure (standing)**: the trading-multiple median is a **2-name median** (Coursera, Udemy). Every rendered comps figure carries the permanent "2-peer median" disclosure with min–max span alongside — thinness visible, never hidden.
5. **P/FCF & FCF yield**: DUOL TTM FCF (engine-derived from corpus) against the live market cap (fetched price × shares) → implied P/FCF and FCF yield; method value = peer-median P/FCF × DUOL TTM FCF → implied per-share. Peers for this method: Coursera + Udemy (the trading set — their P/FCF medians computed on the same 2-name disclosed basis).
6. **Method modules (pure)**: every module returns the common frozen shape `{ method, basis, impliedPerShare, rangePerShare, inputsProvenance }`; fail-closed on non-finite/missing; no fallbacks; zero network; deep-frozen; no clock/random.

#### C. Invariants & Automated Quality Gates
- [ ] Corpus integrity: existing records diff empty; `peers.json` 100% cited with asOf; OP re-pulls and re-verifies EVERY peer figure against its cited source (Finding-C lesson: live-source verification, not internal consistency).
- [ ] **Lease-basis consistency gate**: OP recomputes at least one peer's EV/EBITDAR end-to-end from cited raw figures on the capitalized basis (lease liabilities in EV, rent in the add-back).
- [ ] Method math: implied per-share recomputed by OP from raw corpus rows within 1e-6; 2-name median + span rendered everywhere a trading multiple appears.
- [ ] Purity/determinism: byte-identical reruns; no clock/fetch/random in any method module.

---

### Task P7.2: SOTP + Per-User Methods

#### A. Deliverable Files
- `src/engine/methods/sotp.js`, `src/engine/methods/perUser.js` (new, pure)
- `tests/sotp.test.js`, `tests/perUser.test.js` (new, additive)

#### B. Semantics (binding)
1. **SOTP (Director-ruled segment map — TWO segments)**: (a) **Subscriptions (incl. advertising)** — the folded treatment (Director ruling #3.i): advertising revenue valued inside the subscriptions segment on the same multiple, with the fold disclosed in the segment table footnote; (b) **Duolingo English Test** — its disclosed revenue line from cited filings. **AI tutor: REMOVED from the map** (Director ruling #3.ii) — it is not a segment, not a stub, not a rendered line. Each segment valued on a multiple drawn from the locked peer set (subscriptions → Coursera/Udemy EV/EBITDAR or EV/Revenue family, Director picks the multiple at review; DET → no pure public comp exists, so DET's multiple is EITHER the subscriptions family multiple with the constraint disclosed OR a cited industry multiple OP sources and live-verifies — Director rules at review). Sum of segment EVs → + today's net cash (6R2 convention) → ÷ shares → implied per-share. Segment revenue splits from cited filings/IR only; where a split is not separately disclosed, the segment renders with its allocation basis disclosed, never guessed silently.
2. **Per-User/Per-Subscriber**: three bases, native KPIs, never blended (Director ruling #8): Spotify (MAU, ARPU funnel) · Roblox (DAU, bookings-per-user) · Netflix (paid subs, ARPU). DUOL's matching KPIs from the KPI corpus (DAU, paid subscribers, ARPU context). Method value: DUOL KPI × peer median multiple per basis → implied per-share per basis → the method's single vote = the **median of the three bases** (a 3-name median of native-basis multiples, rendered per-basis with min–max span).
3. **Common module shape** as in P7.1.B.6; same purity/fail-closed rules.

#### C. Invariants & Automated Quality Gates
- [ ] Segment map asserts exactly TWO segments (subscriptions-with-ads-fold + DET); zero AI-tutor surface anywhere in rendered DOM (grep gate — the word must not appear as a SOTP line).
- [ ] Fold disclosure present: the segment table footnote states advertising is valued inside the subscriptions segment.
- [ ] DET multiple treatment ruled by Director at review and disclosed on the row; OP live-verifies any cited industry multiple.
- [ ] Per-user: three native bases rendered separately, never blended; method vote = median of bases with span; DUOL KPIs tie to cited corpus rows.

---

### Task P7.3: Multi-Method Verdict Engine + Summary Rework

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

## 4. Milestone Acceptance Criteria (Gate Requirements)

- [ ] P7.1–P7.3 individually submitted and OP-approved; all-scenario-state rendered sweep standing gate applies every cycle.
- [ ] Six methods live; every input cited; agreement-only verdict at ±15% (imported); dissent rendered; unweighted (grep-provable).
- [ ] Engine frozen surfaces byte-identical (`wacc/dcf/recommend/threeStatement/forecast/schedules/beta/market`); corpus 706 + 6R2 additions diff empty; `peers.json` additive and 100% OP-live-verified.
- [ ] SOTP renders exactly two segments with the fold footnote; no AI-tutor surface; per-user renders three native bases unblended.
- [ ] Suite green ×3, 0 flakes; additive tests only; latency < 16ms re-proven with all methods wired.
- [ ] OP consolidated tie-out in `docs/logs/op/phase_7.md`.
- [ ] **RELEASE BLOCK (carried forward)**: `v1.0` issues only on the Director's explicit final-pass approval of the whole product. OP PASS ≠ release.

---

## 5. Open Rulings Remaining for the Director (at review, not blocking kickoff)

1. **SOTP multiple family** (P7.2.B.1): subscriptions segment — EV/EBITDAR family vs. EV/Revenue family for applying the Coursera/Udemy medians (or both rendered with the primary ruled).
2. **DET multiple source** (P7.2.B.1): subscriptions-family multiple with constraint disclosed vs. a cited industry multiple OP sources + live-verifies.

Everything else is ruled and locked in §2.

---

> **Director decisions encoded (2026-09-03, phase-split revision)**: (1) **Two-phase split**: 6R2 = cleanups + live pricing, FIRST; Phase 7 = multi-method valuation, NEXT. (2) Six methods, unweighted, agreement-only at ±15%: 2-stage FCFF/FCFE DCF (primary, presentational) · EV/Forward EBITDAR · EV/Forward Revenue · P/FCF & FCF yield · SOTP · Per-user/Per-subscriber. (3) Precedent transactions SCRAPPED — absent from the phase entirely. (4) SOTP: advertising folded into the subscriptions multiple (disclosed); AI-tutor segment removed — the map is Subscriptions (incl. ads) + DET. (5) Peer set locked: Coursera, Udemy (trading) + Spotify, Roblox, Netflix (per-user, native KPIs); Chegg/Pinterest/Tier-C exclusions standing. (6) Live-price provider: stockanalysis.com. (7) Forward horizon: FY+1. (8) OP does its own maths — no Director-supplied or external-analyst figure is ever a tie-out target, gate, pin, or input. (9) The P4 single-method recommendation label retires from the Summary surface. (10) Release authority remains Director-only.
