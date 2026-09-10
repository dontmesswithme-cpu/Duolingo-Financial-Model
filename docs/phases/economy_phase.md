# Economy Phase (EP): Economic Identity Gates — SBC Settlement & Terminal Steady-State

> **Milestone**: Economy Phase (EP) — Economic Identity Gates (EIG): SBC Dilution Settlement & Terminal Steady-State Normalisation
> **Protocol**: 1.0
> **Status**: ⚪ Pending — 🅿️ **PARKED** (Director order 2026-09-10; deferred until the Redesign lane (RP7–RP9) completes or Director calls un-park)
> **Owner**: Drafted at Director order 2026-09-10 from an external-review verification session; `OP` audits this contract at un-park before implementation; `DS` implements
> **Phase Designation**: `EP` (message headers use `SUBMISSION: EP.Y`, `REVIEW: EP.Y` per AGENTS.md §4)
> **Scope Freeze**: All content below is locked by Director ruling dated 2026-09-10 (§4). Nothing in this file may be amended except by Director order. The code areas named in §10.2 are frozen until un-park.

---

## 1. Milestone Objective & Scope

EP hardens the valuation layer against **cross-layer coherence failures**: economic identities that must hold between the three-statement model and the DCF, which no existing gate checks. It lands two verified fixes and the gate suite that makes their bug classes structurally impossible to reintroduce:

1. **SBC dilution settlement** — the model adds stock-based compensation back to operating cash flow (GAAP-correct) but the DCF never pays for the offsetting future share issuance. Fixed by a share roll-forward consumed at the per-share division.
2. **Terminal steady-state normalisation** — the final forecast year contains a working-capital inflow driven by 17.0% deferred-revenue growth, which the Gordon perpetuity then capitalises forever at g = 2.5%. Fixed by normalising the terminal cash flow's working-capital component to the perpetuity rate.

Combined effect: headline per-share value moves **$144.08 → ~$118.5–118.6**, and the recommendation label flips **fair → overvalued** under every defensible treatment.

The three statements themselves are **GAAP-clean and remain untouched** (§3.1). Both failures live in the valuation bridge — the seams between layers — which is why the phase is named for **coherence of the model economy**, not "accounting" (the accounting was never wrong).

EP also installs the **Economic Identity Gates (EIG)**: five identity-based gates that re-derive economics from raw drivers and never re-implement engine formulas (the `tests/e2e.accuracy.test.js:263` anti-pattern is the explicit counter-example). EIG registers as a **third verification tier** in the project doctrine — above internal consistency (a green suite that agrees with itself is not a PASS, `conventions.md` §6) and below external truth (OP's filing re-derivation mandate):

```
internal consistency  <  economic identity (EIG)  <  external truth (OP/EDGAR)
```

## 2. Prerequisites & Dependencies

- **Prior phases**: Redesign lane (RP7–RP9) complete, or Director early un-park.
- **Parking context** (why EP waits): the engine fix moves every valuation pin; redesign tabs carry engine-truth tie-outs (RP6 alone pins 144.08 / 141.59 / 116.20 / 240.43 / 443.68). Fixing mid-redesign would invalidate tie-outs in flight; EP after RP7 means one clean tie-out refresh, and EP.4's UI surface builds on the finished RP7 summary card.
- **Engine modules touched**: `src/engine/dcf.js`, `src/engine/threeStatement.js` (read-only consumption), new `src/engine/shares.js` (or schedule extension — DS choice, §5 EP.2), new `src/engine/invariants.js`, `src/engine/recommend.js` (read-only consumption for labelStable), `src/data/assumptions.json` (read-only for SBC/price drivers).
- **Known interims accepted while parked** (§10.3): RP7's exec summary headlines $144.08 / fair — engine-truth to the current model, known-stale vs the verified findings, disclosed-of-record here.
- **Deferred out of EP** (§10.4): SBC fade driver; Pin Genesis could not land before RP7 pins stabilise (it lands with EP.3 regardless).

---

## 3. Finding Provenance (the verified record)

External review (an independent second implementation of the same company) submitted a ranked five-item list on 2026-09-10. Every claim was verified against this repo's source and live engine (784/784 suite passing at verification; 14.1s full run). This section is the permanent citation for why §4 rulings and §6 rules exist.

### 3.1 The verified findings

**F1 — SBC added back, never settled (dilution omission).** `src/engine/threeStatement.js:709` `ocfVal = netIncomeLine.value + dAndA + sbcExpense − deltaNwc`; `:729` `fcffVal = ocfVal + icfVal − afterTaxInterest`. FCFF inherits the add-back (GAAP-required, correct at statement level). `src/engine/dcf.js:303` discounts FCFF with **no dilution term** against a static share count: `assumptions.json:586` `shares_outstanding = 50,031,000`, label "Diluted Shares Outstanding", `asOf 2026-08-06` — treasury-method diluted *as of that date*, capturing grants already made, but never rolled forward. The $158m–$290m/yr of **future** grants — the exact cash added back — is never paid for via issuance. No share schedule exists anywhere in the model; `share_repurchases` ($139.2m/yr), `option_proceeds` ($12.57m/yr), `net_share_settlement_taxes` ($41.6m/yr) flow through CFF and APIC only; shares never appear.

Engine-verified SBC series ($m): FY2026 **152.0 embedded** (H1 filed 72.9 + H2 estimate 79.1; the annualized schedule says 158.2 — the CF statement's embedded value is 152.0), FY2027 182.5, FY2028 212.4, FY2029 247.9, FY2030 290.0.

**F2 — Terminal FCFF not normalised for working capital.** `src/engine/dcf.js:335–337`: `terminalFcff = fcff_T × (1+g)`; `TV = terminalFcff / (wacc − g)`. Engine-verified: FY2030 deferred revenue grows **17.0%** ($1,046.5m vs $894.5m; schedule 570.9 → 658.7 → 766.4 → 894.5 → 1,046.5 across FY26–30) while g = 2.5%. Final FCFF $591.2m contains a working-capital inflow of **$78.1m** (NWC −459.6m → −537.6m). Steady-state equivalent at g: `NWC_T × g` = $13.4m. Excess capitalised into perpetuity: **$64.65m** → TV overstated **$776.2m**, PV(TV) overstated **$460.1m** → **−$9.19/share** (reproduces to the dollar: 460.1 / 50.031).

**F3 — Terminal value dominance.** PV(TV) $4,205.1m of EV $5,792.0m = **72.6%**. Not an error; means F1/F2 — which live almost entirely in the terminal — drive most of the headline.

**F4 — Stale docstring.** `tests/e2e.accuracy.test.js:16–18` pins the dead build ($189.31, beta 0.89, ERP 4.46%, "Bear $102.41 < Base $189.31 < Bull $405.68") while live assertions pin $144.082130498451 (`:274`), Re 11.0375% (`:244`), Bear $84.39 / Bull $277.84 (`:286–288`). The suite stayed green through a −24% valuation rewrite ($189.31 → $144.08, WACC 8.7594% → 11.0375%) with only hand-picked pin updates — which is precisely how F1/F2 stayed invisible.

**F5 — suite count.** The review's "696 passing tests" was itself stale: 784/784 at verification.

### 3.2 Verification record (what reproduced, what did not)

| Review claim | Verdict |
|---|---|
| F1 structure, line cites, SBC series, static shares | **Reproduced exactly** |
| F2 all figures (17.0%, 78.1, 13.4, 64.65, 776.3, 460.1, 9.19) | **Reproduced to the dollar** |
| F3 72.6% | **Reproduced** |
| F4 header/assertion split | **Reproduced** |
| F1 per-share impact "−$21–26" | **Mis-attributed**: that range embeds F2's −$9.19. F1 standalone: −$12 to −$17.5 (treatment-dependent). |
| "696 tests" | Stale (784) |
| FY2026 SBC "$158m" | Annualized schedule value; CF-statement embedded value is $152.0m. Immaterial (~0.08% of shares). |

### 3.3 Rejected alternative: uncharged netting ($137.22 path)

The reviewer's second message "corrected" the SBC impact to −$6.86/share by netting buyback shares (50.031m → 52.53m, +2.50m net shares ≈ 1.0%/yr) **without charging the buyback cash** ($139.2m/yr, $514.0m PV) that the equity value still contains. A two-period toy model (firm: $100 FCF, 100 shares, $50 SBC-funded buyback) proves the incoherence: uncharged netting yields $2.00/share where the direct balance-sheet computation yields $0.71 — the method credits share retirement without paying for it, double-counting buybacks. **Correct netting** (retire shares AND subtract buyback spend) gives $127.44 — within $1 of gross issuance ($126.57), confirming the two are the same treatment in different clothes (buybacks are value-neutral at fair price). The uncharged variant is a **rejection condition** if it ever reappears; notably it was the only treatment keeping a "fair" verdict alive (−13.1%).

### 3.4 Impact table (all engine-verified 2026-09-10; spot $157.85; thresholds ±15%, `constants.js:372–374`)

| Treatment | SBC-only | + NWC fix | Label |
|---|---|---|---|
| Current (broken) | $144.08 (−8.7%) | — | fair |
| **Gross issuance at spot (LOCKED)** | $126.57 (−19.8%) | **$118.51 (−24.9%)** | overvalued |
| Charged netting (fair-value buybacks) | $127.44 | $118.68 | overvalued |
| PV(SBC @ WACC) ÷ spot (4.49m shares) | $132.21 | $123.79 | overvalued |
| Fade SBC 13.25% → ~8% steady state | ~$105 | ~$96 | overvalued |
| Expense SBC perpetually @ 13.25% | $88.68 | $79.48 | overvalued |
| Uncharged net (**REJECTED**, §3.3) | $137.22 (−13.1%) | $128.46 (−18.6%) | fair / overvalued |

Disclosed defensible band post-fix: **$96–$127**. The reviewer's corrected independent model ($110.73) falls inside it, consistent with a modest SBC fade. All defensible treatments land **overvalued**; the verdict flip is robust.

### 3.5 Why the existing gates missed these (root causes EIG answers)

1. **Pins are self-generated** — the "Authoritative Pin Set" (`e2e.accuracy.test.js:15`) was frozen from engine output; assertions assert the output equals the output. `:263` even re-implements the Gordon formula under test — a regression gate, not an error gate.
2. **The suite proved its own indifference** — green through a −24% headline rewrite (F4). A gate that passes a 24% swing measures change, not correctness.
3. **The corpus gate points at historicals** — 706 record tie-outs cover FY2021–FY2025 *data*, not FY2026–FY2030 *treatment*. The SBC add-back is required by the filed statements it ties out to; the error lives at the layer boundary no gate crosses.
4. **Dilution is structurally invisible** — shares enter the model exactly once (`dcf.js:474` division). No roll-forward exists for an invariant to check.
5. **The bug lived in the spec** — `dcf.js:10` documents the unnormalised terminal formula as *intended behaviour*; tests verify conformance to spec; the spec contained the error. Caught only by an **external oracle** (the independent second model converging at ~$110–124).

---

## 4. Locked Director Rulings (2026-09-10 — binding, not relitigable)

**R1 — One-PR landing.** Gates and fixes land together as one phase; the suite is green at merge. No window exists where the suite passes while the errors live unflagged.

**R2 — SBC convention: gross issuance at spot.**
```
shares_DCF = 50,031,000 + Σ (SBC_t ÷ market_share_price),  t = FY2026..FY2030
```
- `market_share_price` = $157.85 (MKT driver, as-of).
- SBC_t = the per-period SBC embedded in each period's cash-flow statement (source of truth: CF statements, not the annualized schedule). FY2026 = $152.0m (H1 filed + H2 est). Σ = $1,084.8m → **6.87m new shares** → **56.90m shares**.
- **No buyback netting** in the headline path. Buybacks remain financing flows (value-neutral at fair price). Verified equivalence: gross vs charged-netting within $1.
- **Rejected**: uncharged netting (§3.3) — double-counts buyback shares without charging cash; a rejection condition on sight.
- Statements stay GAAP-clean; settlement moves to the valuation layer via the share roll (EIG-B). OCF add-back at `threeStatement.js:709` is **untouched**.
- Expected post-fix headline: **~$118.5–118.6** (equity $6,748.5m ÷ 56.90m shares), label fair → **overvalued** (−24.9%).

**R3 — Oracle location: split.** Indisputable identities (cash articulation, BS balance, bridge re-derivation) live in `src/engine/invariants.js` — pure, deterministic, deep-frozen, UI-surfaceable. Policy-laden checks (EIG-A tolerance, EIG-B convention) live in `tests/_invariants.js` (`_ledger.js`-style non-collected helper) so conventions stay visible for human review.

**R4 — Pin genesis: build-hash stamping (Option B).** A regeneration command (`tools/regen_pins.mjs`) writes pins **and** docstring together (drift physically impossible) and stamps the pin table with a hash over `assumptions.json` + engine sources; tests verify the stamp so hand-typed pins fail loudly. Full spec §7.

**R5 — Verdict sensitivity disclosure in scope.** The engine recomputes per-share across the disclosed treatment band; if any defensible treatment yields a different recommendation label than the headline, the result carries `labelStable: false` and the summary surface shows it. Note: post-fix, all defensible treatments land overvalued, so `labelStable` returns true — the flag guards future assumption shifts and boundary crossings (pre-fix it would have flagged the fair↔overvalued boundary the model was sitting on). Full spec §8.

**Standing ruling for all gates:** every EIG check re-derives economics from raw drivers (schedules, CF lines, BS lines, drivers) and **never re-implements an engine formula** — the test must not become a second copy of the code under test. `e2e.accuracy.test.js:263` is the canonical anti-pattern.

---

## 5. Sub-Phase Artifact Contracts

> Build order is dependency order; all four land as one phase (R1). EP.1 is green/zero-behaviour; EP.2–EP.3 turn the red gates green and move the pins; EP.4 consumes the finished RP7 surface.

### Task EP.1: Economic Invariants Module & Green Gates (D, E, Registry)

#### A. Deliverable Files
- `src/engine/invariants.js` — Economic Invariants module (pure; zero DOM/fetch/Date.now/Math.random; deep-frozen output graph; no bare literals > 999 outside comments).
- `tests/_invariants.js` — non-collected helper: shared raw-driver re-derivations + policy tolerances.
- `tests/coherence.eig.test.js` — EIG suite (D & E live here; A/B/C land red in EP.2/EP.3).
- Registry table (in `invariants.js`): `{ addBack: 'sbc', settlement: 'eig-b', status: 'pending-EP.2' }`, `{ addBack: 'd_and_a', settlement: 'icf-capex', status: 'settled' }`.

#### B. Exported Interfaces & Types
- `function checkForecastArticulation(threeStatement): InvariantReport` — per-period FY2026–FY2030: ending cash ≡ prior + net change; A ≡ L + E; all re-derived from raw lines.
- `function checkNetCashBridge(threeStatement): BridgeReport` — `dcf.netCashToday` re-derived from `BOP_Q2_FY2026` raw lines (cash + STI + LTI − debt).
- `function checkPinSync(): PinSyncReport` — every numeric claim in the e2e docstring ties to a live assertion (see §7 for stamp verification, added EP.3).
- `InvariantReport = { id, description, status: 'pass'|'fail', details }[]` (frozen) — the designated feed for RP7's Model Health card (§9).

#### C. Invariants & Automated Quality Gates
- [ ] EIG-D green on current build (verified passing 2026-09-10 by session probe).
- [ ] EIG-E green after EP.3 regen (red until then by design; lands red→green in EP.3 with the docstring rewrite).
- [ ] Registry declares SBC→EIG-B as pending; EIG-C enforcement (registry coverage of every OCF add-back) activates in EP.2.

### Task EP.2: Share Roll-Forward Schedule & SBC Dilution Settlement (fix #1; EIG-B, EIG-C)

#### A. Deliverable Files
- `src/engine/shares.js` (or schedule inside an existing schedules module — DS choice) — share roll-forward per forecast period: `shares_t = shares_{t−1} + SBC_t ÷ market_share_price`, BOP = 50,031,000 (MKT, asOf), provenance on every line.
- `src/engine/dcf.js` — consume **terminal-period rolled shares** (56.90m) at the per-share division (currently `:474` static `sharesOutstanding`); per-share schedule/legacy paths all move to the same denominator.
- `tests/coherence.eig.test.js` — EIG-B, EIG-C go red→green.

#### B. Exported Interfaces & Types
- `function projectShares(assumptions, threeStatement): SharesSchedule` — `byPeriod[period] = { shares, sbcEmbedded, issuance, provenance }`, frozen.
- EIG-B: `shares_DCF == 50,031,000 + Σ(SBC_t ÷ price)` recomputed **from CF-statement SBC lines + MKT price driver** — exact equality (repo culture pins to 12 decimals; exactness is idiomatic).
- EIG-C: registry coverage — enumerate every add-back in OCF construction; any add-back without a registry settlement path is a FAIL.

#### C. Invariants & Automated Quality Gates
- [ ] EIG-B: exact-equality roll-forward identity, raw-driver derived.
- [ ] EIG-C: registry covers D&A (→ ICF capex) and SBC (→ EIG-B); future add-backs cannot enter OCF undeclared.
- [ ] Zero `??` fallbacks on any new path (P2.1 permanent rule; `conventions.md` §6).
- [ ] Statements untouched: `threeStatement.js:709/:729/:477/:879` byte-identical.

### Task EP.3: Terminal Steady-State Normalisation & Pin Genesis (fix #2; EIG-A)

#### A. Deliverable Files
- `src/engine/dcf.js` — terminal construction:
```js
const wcInflowT  = -deltaNwc_T;        // model final-year WC inflow (+78.1m)
const wcInflowSS = -nwc_T * g;         // steady-state replacement (+13.4m)
const fcffTNormalised = fcff_T - wcInflowT + wcInflowSS;   // 591.2 − 78.1 + 13.4 = 526.5
const terminalFcff = fcffTNormalised * (1 + g);
```
- `docs/spec.md` §3.2 update **in lockstep with the `dcf.js` header docstring** (the header cites spec §3.2; spec/code/docstring move in one sub-phase or a new F4-class drift is manufactured).
- `tools/regen_pins.mjs` + hash stamp (§7).
- `tests/coherence.eig.test.js` — EIG-A red→green.

#### B. Exported Interfaces & Types
- EIG-A1 (hard): the DCF's `terminalValue` must equal Gordon on `fcffTNormalised`, all inputs re-derived from raw CF/WC-schedule lines — never from `dcf` output.
- EIG-A2 (disclosure): the terminal-year forecast-vs-perpetuity growth gap (defRev 17.0% vs g 2.5%) must be surfaced through the sensitivity/labelStable band (non-failing, presence-required).
- Expected: TV $7,097.9m → **$6,321.7m** (−$776.2m); PV(TV) → $3,745.0m; EV $5,792.0m → **$5,332.0m**; equity $7,208.6m → **$6,748.5m**.

#### C. Invariants & Automated Quality Gates
- [ ] EIG-A1 exact; EIG-A2 present.
- [ ] Pin table regenerated via stamped protocol only (§7); headline pin moves $144.082130498451 → ~**$118.5–118.6** (exact value machine-born, not hand-typed); docstring rewritten by the tool.
- [ ] F4 remediated: header and assertions agree by construction.
- [ ] Scenario ordering re-pinned: Bear < Base < Bull with Base ≈ $118.6 (Bear/Bull machine-born; do not carry the stale $84.39/$277.84).

### Task EP.4: Verdict Sensitivity Disclosure (`labelStable`) & Summary Surface

#### A. Deliverable Files
- `src/engine/dcf.js` (or `recommend.js` — DS choice where the band recompute lives) — `labelStable` block.
- `src/ui/summaryTab.js` — sensitivity surface on the RP7 summary (consumes RP7's Model Health / headline cards; §9 hook).

#### B. Exported Interfaces & Types
- `result.labelStability = { labelStable: boolean, treatments: [{ name, perShare, label }], headlineLabel }` — recompute across the defensible band {gross-issuance (headline), charged-netting, PV-discounted, fade, perpetual-expense}; any label ≠ headline → `labelStable: false`.
- UI: when `labelStable === false`, the verdict badge carries the sensitivity note (e.g. "verdict sensitive to SBC treatment"); when true, band table renders with no alarm.

#### C. Invariants & Automated Quality Gates
- [ ] Band recompute is engine-derived (no hand-typed $96/$127 literals — recompute from drivers; literals only in tests as pins).
- [ ] All RP1–RP7 engine-truth tie-outs refreshed and green post-fix (RP6 pins 144.08/141.59/116.20/240.43/443.68 re-verified against new engine truth).
- [ ] Suite green ×3, zero flakes.

---

## 6. EIG Gate Specifications (canonical)

| Gate | Identity | Source of truth (raw, never engine output) | Status today | Lands |
|---|---|---|---|---|
| **EIG-A** Steady-State | Terminal FCFF's WC component ≡ `−NWC_T × g`; TV = Gordon on the normalised series | CF lines + WC schedule + `terminal_growth_rate` driver | **RED** (78.1 vs 13.4) | EP.3 |
| **EIG-B** Share Roll-Forward | `shares_DCF ≡ 50,031,000 + Σ(SBC_t ÷ price)` | CF SBC lines + `market_share_price` MKT driver | **RED** (no schedule exists) | EP.2 |
| **EIG-C** Settlement Registry | Every OCF add-back names a settlement path (D&A→ICF capex; SBC→EIG-B) | registry table ∪ OCF add-back enumeration | **RED** (SBC unsettled) | EP.1 table → EP.2 enforcement |
| **EIG-D** Forecast Articulation | Cash articulation + A≡L+E per forecast period + netCash bridge from `BOP_Q2_FY2026` raw lines | BS/CF raw lines | Green (verified 2026-09-10) | EP.1 |
| **EIG-E** Pin Sync & Genesis | Docstring numbers ≡ live pins; pin table hash-stamped | `tools/regen_pins.mjs` stamp | **RED** ($189.31 vs $144.08) | EP.3 |

Tolerances: EIG-B exact; EIG-A1 exact (deterministic construction; float-only slack); EIG-D exact; EIG-A2 presence-check. Policy tolerances live in `tests/_invariants.js` (R3).

---

## 7. Pin Genesis Protocol (R4 — full spec)

1. `tools/regen_pins.mjs` runs the full engine (loader → schedules → forecast → three-statement → WACC → DCF → recommend → sensitivity → scenarios) and emits the pin table: all e2e pins **and** the docstring header numbers, from one machine pass. Hand edits are a **rejection condition**.
2. The emitted table carries `stamp: { hash, generatedFrom: ['src/data/assumptions.json', ...engine sources], createdAt }`; hash = SHA-256 over normalised contents (key-sorted JSON, engine files outside comments).
3. `tests/` verify: stored `hash == recomputed hash`. A hand-typed pin (or a pin regenerated from different sources) fails loudly with a diff of what moved.
4. Commit rule (convention, §9 append): any PR that moves pins states which pins moved and why, e.g. "pins moved: perShare $144.08 → $118.59 (EP.2 SBC settlement + EP.3 terminal normalisation)".
5. Regen is idempotent: running twice with unchanged inputs changes nothing (determinism gate ×3).

## 8. Verdict Sensitivity Disclosure (R5 — full spec)

- Band treatments (all re-derived, none hand-typed): gross issuance at spot (headline), charged netting, PV(SBC @ WACC) ÷ spot, SBC fade to ~8%, perpetual SBC expense. The rejected uncharged-netting is **excluded** from the band (§3.3).
- `labelStable: false` when any band treatment's recommendation label ≠ headline label. Post-fix expectation: all band cells overvalued → `labelStable: true`, band table still renders (the $96–$127 spread is decision-relevant even when the label is stable).
- UI: summary surface (RP7 cards) renders the band; the verdict badge carries the sensitivity note only when unstable.

## 9. Documentation Deliverables (in-phase, land with the code)

- [ ] `docs/conventions.md` §6 append — four permanent rules: **SBC Settlement Rule** (R2 formula), **Terminal Steady-State Law** (`ΔNWC_T ≡ NWC_T × g` in perpetuity construction), **Settlement Registry** (no undeclared add-backs), **Pin Genesis** (hand-typed pins rejected; hash-stamped only).
- [ ] `docs/spec.md` §3.2 + `dcf.js` header docstring — lockstep (EP.3).
- [ ] `docs/status.md` — EP row on un-park (OP-owned, per AGENTS.md single-writer rule).
- [ ] **RP7 hook**: RP7's Model Health card ("6 automated checks") is built **before** EP exists. It must be built as a **named placeholder consumer** of `src/engine/invariants.js` (six checks hardcoded with a TODO wire-to-invariants marker), so EP.1 swaps the feed without RP7 rework. If the placeholder is skipped, EP.1 absorbs ~1h of rework (accepted-cost, §10.3).
- [ ] This file remains the finding provenance citation.

## 10. Parking Protocol

### 10.1 Un-park trigger
Director kick-off order ("Start EP" per AGENTS.md §6). Default expectation: after the Redesign lane completes.

### 10.2 Frozen meanwhile (changes here reopen this plan at Director level)
- `src/engine/dcf.js` terminal math (`:335–337`) and share-count consumption (`:204/:474`).
- `tests/e2e.accuracy.test.js` pin values (except RP-lane mechanical additions elsewhere in the suite).
- SBC-basis drivers (`sbc_target_pct_of_revenue`, `share_repurchases`, `option_proceeds`, `net_share_settlement_taxes`, `shares_outstanding`, `market_share_price`) in `assumptions.json`.

### 10.3 Accepted interim costs (disclosed-of-record, not blockers)
- RP7 exec summary headlines $144.08 / fair — engine-truth for the current model; corrected at EP gate with one tie-out refresh.
- RP7 Model Health card carries placeholder checks until EP.1 (~1h rework if the placeholder pattern is not used).

### 10.4 Deferred out of EP (own PRs, forecast revisions not bookkeeping)
- **SBC fade driver** (`sbc_target_pct_of_revenue` 13.25% → ~8–10% by steady state): moves the headline ~$96–105 band-ward; it is a forecast revision and must not hide inside EP. Sequenced after EP so the accounting fixes are provable in isolation.
- Extended-horizon consideration (10-year explicit forecast would shrink the F2 error independently) — noted, not scheduled.

## 11. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] All four sub-phases individually submitted and OP-approved (PASS ✅ each).
- [ ] Full suite green ×3, zero flakes, at whatever count post-RP7/RP8/RP9 (784 at parking + EIG additions).
- [ ] All five EIG gates green (A–E), red→green history documented in logs.
- [ ] Pins regenerated solely via stamped protocol; hash verifies; docstring ≡ assertions by construction.
- [ ] `docs/spec.md` §3.2, `dcf.js` docstring, and code agree three-way.
- [ ] `docs/conventions.md` §6 rules live.
- [ ] `labelStable` block + summary surface live; band engine-derived.
- [ ] RP1–RP7 engine-truth tie-outs refreshed green post-fix.
- [ ] Statements untouched: `threeStatement.js:709/:729/:477/:879` byte-identical to parking (EP touches the bridge, not the books).
- [ ] Zero `??` fallbacks, zero bare literals > 999 outside comments in all new code; determinism (no Date.now/Math.random/network).

---

## 12. Session Verification Appendix (evidence anchors, 2026-09-10)

- Engine headline: perShare $144.082130; WACC 0.110375; g 0.025; pvExplicit $1,586.9m; TV $7,097.9m; PV(TV) $4,205.1m; EV $5,792.0m; netCash $1,416.6m; equity $7,208.6m; shares 50,031,000; TV/EV 72.6%; upside −8.72% "fair".
- FY2030 FCFF $591.2m = NI 345.4 + D&A 30.4 + SBC 290.0 + ΔNWC inflow 78.1 (less capex/after-tax interest).
- NWC ($m): −293.2 / −338.4 / −393.8 / −459.6 / −537.6 (Δ: −45.2 / −55.3 / −65.8 / −78.1).
- Deferred revenue ($m): 570.9 / 658.7 / 766.4 / 894.5 / 1,046.5 (growth 15.4 / 16.4 / 16.7 / **17.0**%).
- Revenue ($m): 1,193.9 / 1,377.5 / 1,602.8 / 1,870.6 / 2,188.4.
- SBC ($m): 152.0 embedded / 182.5 / 212.4 / 247.9 / 290.0 (Σ 1,084.8 → 6.87m shares @ $157.85).
- Fix math: TV −776.2 → $6,321.7m; EV → $5,332.0m; equity → $6,748.5m; per-share → $118.5 (gross, 56.94m) / $118.6 (embedded, 56.90m); charged-net $118.68; PV-discounted $123.79.
- Suite: 784/784 pass, 235 suites, 14.1s, 2026-09-10.
- Review provenance: independent external model, corrected figure $110.73 (inside disclosed band); uncharged-net $137.22 rejected on double-count grounds (§3.3).

> **Disclaimer**: this document records engineering findings and internal model corrections. It is not investment advice; the model's outputs are estimates (`EST`) and must not be presented as market truth.
