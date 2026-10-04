# Phase 10 — Release Integrity Reconciliation

**Designation:** P10 — MAIN phase
**Protocol:** 1.0
**Status:** Draft — Pending OP review
**Owner:** OP audits and authorizes; DS implements
**Messages:** `SUBMISSION: P10.Y` / `REVIEW: P10.Y`
**Release authority:** Director/OP sign-off required before commit or tag

## 1. Objective

Restore one correct, reproducible, secure, and deployable mainline after the P6R, EP/FP, and RP presentation forks.

P10 repairs release integrity across:

- repository provenance and clean-checkout reproducibility;
- local-server and deployment security;
- valuation-date, H1/H2, forecast-horizon, and share-schedule alignment;
- one canonical market benchmark;
- transactional assumption and scenario updates;
- current fully diluted share treatment;
- SBC add-back and future dilution;
- FCFF/FCFE disclosure;
- relative-method period and denominator consistency;
- corrected and validated peer data;
- SOTP vote treatment;
- safe HTML and URL rendering;
- Pages/Vercel deployment;
- real-browser CI;
- final generated pins and documentation.

No new valuation method, forecast driver, visual redesign, or economic-theory expansion is permitted unless explicitly authorized inside P10.

## 2. Locked Economic Rulings

1. `market_share_price` is a **benchmark-only** input. It must not control DCF cash flows, share issuance, or intrinsic per-share value.
2. All present-day relative methods use the same **current fully diluted share count**, initially approximately 50.7m, sourced from a point-in-time share schedule.
3. The Q2 weighted-average diluted share count remains an EPS diagnostic only.
4. SBC remains added back to operating cash flow. Corresponding future dilution must be modeled exactly once.
5. The DCF reports:
   - current-share value; and
   - canonical value after modeled future dilution.
6. Relative methods never use the DCF terminal share roll.
7. SOTP receives no vote while it duplicates EV/Revenue. It remains an optional segment decomposition only.
8. FCFF is the primary valuation method.
9. FCFE is a disclosed reconciliation check only—not a floor, range, recommendation, or independent vote.
10. The production forecast horizon is 10 periods. The five-year model is a disclosed legacy comparison and cannot control production relative values.
11. GitHub Pages serves the static application. Vercel serves `/api/price`.
12. Final version, valuation date, and release metadata are Director-owned and generated from the final approved model state.

## 3. Prerequisites and Governance

- `FP-FIX1` must receive OP review and an explicit terminal state before implementation begins.
- P10 is the only active phase. No concurrent RP, EP, FP, P11, or redesign work.
- The current dirty tree must be inventoried by hash and classified as:
  - reviewed existing work;
  - unreviewed FP-FIX1 work;
  - user assets or mockups;
  - unrelated material;
  - authorized P10 work.
- Do not automatically reset, clean, stash, discard, commit, tag, archive, or overwrite existing work.
- P10 implementation requires a Director-authorized clean baseline.
- `tools/archive_phase.mjs` must not be used until the tree is clean and the Director explicitly authorizes archival. P10 suspends automatic archival across `docs/agents.md`, `docs/howtowork.md`, and the starter workflow (`WORKFLOW_STARTER_GUIDE.md` / any watcher auto-advance path); no archive, commit, tag, reset, or P11 handoff may run as part of any P10 gate.
- P10 final gate records a verdict only. It never invokes `archive_phase.mjs`, never commits, never tags, never resets, and never starts P11. Archival, commit, tag, reset, and next-phase start each require a separate explicit Director instruction after the P10 verdict.
- No `v1.0-P10` tag is promised by this phase. Tags require explicit Director instruction.

> Before any clean-tree gate, P10.0 MUST create a hash-pinned manifest covering every tracked and untracked path, classify each path with owner and disposition, and preserve an external copy or approved baseline artifact. No path may be deleted, reset, cleaned, stashed, discarded, or silently absorbed merely to satisfy `git status --porcelain`.

## 4. Reading and Merge-Back Order

1. Mainline: `phase_0.md` → `phase_1.md` → `phase_2.md` → `phase_3.md` → `phase_4.md` → `phase_5.md` → `phase_6.md`
2. Polish appendix: `phase_6R.md` → `phase_6R2.md` → `phase_6R3.md`
3. Valuation extension: `phase_7.md` → `phase_7_solution.md` → `phase_8.md` → `economy_phase.md` → `phase_9.md`
4. Presentation track: `redesign_plan.md` → `redesign_phase_0.md` → … → `redesign_phase_10.md` → `redesign_phase_type.md` → `redesign_phase_rwc.md`
5. Convergence: `phase_10.md`

RP10 is completed presentation work and is distinct from main P10.

---

# P10.0 — Authority, Baseline, and Economic Contract

## Scope

- Record the twelve economic rulings above in the phase contract.
- Confirm the FP-FIX1 terminal state.
- Inventory and classify the dirty tree without modifying it.
- Establish the authorized clean baseline.
- Create P10 DS/OP logs if absent.
- Write the preservation manifest to `docs/p10_baseline/manifest.json` (canonical JSON, UTF-8, sorted keys): entries `{ path, kind: tracked|untracked|ignored, sha256, bytes, owner, disposition: preserve|baseline|exclude-with-reason }`. Hash with SHA-256 over file bytes. `git status` enumeration covers tracked/untracked; ignored paths are enumerated explicitly — `.env`/`.env.*`, `scratch/`, `docs/logs/`, `mockup/`, `ssdesign/` captures, and editor/OS artifacts each get an entry with `exclude-with-reason`; `node_modules/` (see `.gitignore:2-31`) is never hashed or copied and is recorded once as `excluded-by-policy: dependency tree, reinstall via npm ci`. Verify the external copy by re-hashing after copy and record `external_copy_sha256` plus Director sign-off (`director_id`, `signed_at`) in the manifest before any clean-tree gate.
- Define the immutable valuation context:
  - effective valuation date;
  - reporting cutoff;
  - benchmark price and provenance;
  - current fully diluted shares;
  - weighted-average diluted shares;
  - forecast periods;
  - DCF periods;
  - terminal period;
  - share-issuance policy;
  - method evidence clusters.

## Required Decisions

- Confirm that 10 periods is the sole production horizon.
- Confirm that the five-year model is legacy-only.
- Confirm that SOTP is excluded from the verdict.
- Confirm that FCFF is canonical and FCFE is diagnostic.
- Confirm that the current fully diluted share schedule requires a separate frozen `sbc_issuance_price` for dilution sensitivities.

## Gates

- OP-passed FP-FIX1 state exists.
- Dirty-tree inventory is complete.
- No file is lost, overwritten, or silently classified.
- Clean baseline is explicitly authorized.
- Valuation context contract has no unresolved fallback.

> Before any clean-tree gate, P10.0 MUST create a hash-pinned manifest covering every tracked and untracked path, classify each path with owner and disposition, and preserve an external copy or approved baseline artifact. No path may be deleted, reset, cleaned, stashed, discarded, or silently absorbed merely to satisfy `git status --porcelain`. Executable baseline: enumerate with `git ls-files` plus `git status --short --untracked-files=all`, apply the declared ignored-file allowlist (`.env`, logs, scratch enumerated by explicit walk — never silently dropped), hash every path (SHA-256), preserve an external copy with re-hash verification, and run the final gate against the Director-approved immutable candidate snapshot.

- `git status --porcelain` is empty before implementation gate approval.

---

# P10.1 — Secure the Local Server

## Files

- `tools/local_server.mjs`
- `run.bat`
- `tests/server.security.test.js`

## Requirements

- Bind to `127.0.0.1` by default.
- LAN exposure requires an explicit opt-in flag.
- Serve an allowlisted static tree rather than the repository root.
- Deny:
  - dotfiles;
  - `.git`;
  - `.env`;
  - source-control metadata;
  - tests;
  - tools;
  - logs;
  - `node_modules`;
  - path traversal;
  - encoded traversal;
  - unexpected extensions and MIME types.
- Return 403/404 without disclosing forbidden paths.
- `run.bat` must not force-kill unrelated processes.
- No silent firewall modification.
- If a port is occupied, print the owning PID and exit safely.
- Add security headers to local responses.

## Gates

- LAN-bind probe fails by default.
- Dotfile, `.git`, `.env`, traversal, and source-tree probes are blocked.
- Explicit LAN mode serves only allowlisted assets.
- No `Stop-Process -Force` kill-all behavior remains.
- No silent firewall rule is created.
- Tests pass without opening external network access.

---

# P10.2 — Valuation Context, Horizon, and Period Alignment

## Files

- `src/data/constants.js`
- `src/data/schema.js`
- `src/data/loader.js`
- `src/engine/forecast.js`
- `src/engine/schedules.js`
- `src/engine/threeStatement.js`
- `src/engine/shares.js`
- `src/engine/dcf.js`
- `src/ui/projectionsTab.js`
- `src/ui/valuationTab.js`
- New period/share alignment tests

## Requirements

### Canonical horizon and date convention

- Use 10 periods in production, Node tests, scenarios, sensitivity, pins, and documentation. Production is always 10 periods; 3-/5-period paths are unit-test fixtures only and never control production output.
- Dates are ISO `YYYY-MM-DD`, UTC calendar, 365-day year basis. Cash flows are period-end timed; the terminal date is the last day of the terminal period.
- Remove environment-dependent horizon selection.
- Keep the five-year path only as an explicitly labeled legacy comparison.
- No relative method may change when the DCF horizon changes.

### Dated valuation seam

- Use the latest reported balance sheet as the historical BOP.
- Forecast and discount only cash flows occurring after the effective valuation date.
- Roll the BOP balance sheet to the valuation date through an explicit, disclosed pre-valuation stub.
- Split the FY2026 H2 forecast into:
  - pre-valuation roll-forward period;
  - post-valuation discounted period.
- Do not discount H1 actual FCFF when Q2/H1 cash is already represented in the BOP bridge.
- Use date-based fractional discount exponents.
- A cash flow must never appear in both the BOP roll-forward and discounted DCF.

### Statement consistency

- Expose every FY2026 component as explicit H1 actual, H2 forecast, roll-forward, or post-valuation data.
- Full-year totals must equal their disclosed components.
- `endingCash - beginningCash = netChangeCash` under one declared period frame.
- OCF, ICF, CFF, FCFF, and FCFE components must articulate exactly.

### Schedule completeness

- Required rows fail closed when missing.
- Explicit zero remains distinguishable from missing data.
- No engine-critical missing row may silently become zero.
- No implicit `periods[0]` may stand in for a declared valuation period.

## Gates

- H1 FCFF overlap equals zero.
- OCF component gap equals zero.
- ICF and CFF component gaps equal zero.
- Cash-roll gap equals zero.

> The cash-flow intervals from the latest reported balance-sheet date through the effective valuation date and terminal period MUST form a complete, contiguous, pairwise-disjoint partition. Coverage gaps and interval intersections MUST equal zero. Discount exponents MUST derive from declared dates, not integer period indexes.

- Discount exponents match dated cash-flow intervals.
- 3-, 5-, and 10-period schedule tests reject mismatched terminal years.
- Supplied share schedules must match DCF periods exactly.
- All output is finite.
- Production and test construction use the same 10-period context.

---

# P10.3 — Canonical Benchmark and Transactional State

## Files

- `src/app.js`
- New `src/engine/benchmark.js`
- `src/engine/market.js`
- `api/price.js`
- `src/ui/coverTab.js`
- `src/ui/valuationTab.js`
- `src/ui/summaryTab.js`
- `src/ui/sensitivityTab.js`
- `src/ui/assumptionsTab.js`

## Benchmark Contract

Create one immutable benchmark object:

```js
{
  value,
  asOf,
  source,
  status,
  isEdited,
  reason
}
```

Precedence:

1. Explicit manual benchmark override;
2. Valid live response;
3. Dated snapshot fallback.

> A manual benchmark override remains active until explicitly cleared. The latest valid live response wins only among live responses and never replaces an uncleared manual override. All consumers receive the same immutable benchmark object.

Every recommendation, scenario comparison, sensitivity calculation, method verdict, cover card, summary card, and valuation view must consume this same object.

`market_share_price` must not affect:

- FCFF;
- FCFE;
- share issuance;
- terminal dilution;
- intrinsic DCF per-share value.

Any share-issuance sensitivity must use a separate explicit `sbc_issuance_price`.

## Transactional Updates

- Clone assumptions and overrides before applying a candidate edit.
- Validate cross-driver relationships.
- Recalculate candidate state.
- Commit only after successful recalculation.
- On failure:
  - restore overrides;
  - restore scenario;
  - restore dirty state;
  - restore model snapshots;
  - restore UI controls;
  - display a visible field error.
- Disposed controllers reject all subsequent operations.

## Live-Price Lifecycle

- Add monotonically increasing request sequence tokens (and `AbortController` for transport cancellation).
- "Latest" means highest request sequence, not arrival order. A malformed or failed late response can never downgrade a newer valid live response; it falls back to the snapshot benchmark with visible status while preserving the newer valid price.
- Manual override remains sticky until explicitly cleared and is never replaced by any live response.
- Responses after disposal cannot mutate state.
- Timeout includes response-body consumption.
- Validate method, content type, body size, symbol, date, provider, URL, and market state.
- Malformed or stale responses fail to the snapshot benchmark with visible status.

## Gates

- Cover, Summary, Valuation, Sensitivity, scenarios, and verdict show identical benchmark price/as-of/source.
- Changing benchmark price changes upside and market-cap presentation only.
- DCF and share issuance remain byte-identical.
- Invalid driver edit preserves state byte-for-byte and shows an error.
- The next valid edit succeeds.
- Older price response cannot overwrite a newer response; "latest" means highest request sequence, not arrival time.
- A malformed, stale, or late response never downgrades an active manual override or a newer valid live response; it falls back visibly without mutating the held benchmark.
- Post-dispose response cannot mutate state.
- Repeated equal values are idempotent.

---

# P10.4 — Peer Data and Relative-Valuation Consistency

## Files

- `src/data/historical/peers.json`
- `src/data/schema.js`
- `src/data/loader.js`
- `src/app.js`
- `src/engine/methods/comps.js`
- `src/engine/methods/evMultiples.js`
- `src/engine/methods/pfcf.js`
- `src/engine/methods/sotp.js`
- `src/engine/methods/perUser.js`
- `src/engine/methods/aggregate.js`
- `src/ui/valuationTab.js`
- `src/ui/summaryTab.js`
- `src/ui/sensitivityTab.js`

## Peer Data

- Correct Spotify, Roblox, and Netflix KPIs against primary filings.
- Store filing URLs, accessions, measurement periods, and retrieval dates.
- Add a `peers` schema and loader gate.
- Reject uncited or period-missing material KPIs.
- Remove direct unvalidated JSON imports.
- Disclose the corrected Per-User output movement.

## Common Share Denominator

All present-day relative methods use the same current fully diluted share count:

- EV/Revenue;
- EV/EBITDAR;
- P/FCF;
- SOTP decomposition;
- Per-User.

They must not receive the DCF terminal share roll.

Required provenance:

- basic period-end shares;
- incremental options;
- RSUs and other awards;
- founder awards where applicable;
- current fully diluted total;
- measurement date;
- filing/source.

Weighted-average diluted shares remain diagnostic and cannot appear as a valuation denominator.

## Period Policy

- EV/Revenue and EV/EBITDAR use the same target and peer period.
- Until true NTM data is sourced, label the current-year estimate **FY2026E**, not FY+1.
- EV/EBITDAR uses full-period D&A and period-matched rent/lease treatment.
- P/FCF uses the same TTM period for DUOL and every peer.
- If P/FCF numerator remains OCF less capex, label it **Levered FCF**, not FCFE.
- Per-user KPIs must share compatible periods and definitions; stale mixed-period bases are excluded.

## SOTP

- No vote.
- No additional confidence breadth.
- Displayed as a subscriptions-versus-DET decomposition under EV/Revenue.
- Must satisfy:
  - `subscriptionsRevenue + detRevenue = totalRevenue`;
  - same current FD denominator;
  - same EV-to-equity bridge.
- UI must not say “independent” or “six methods.”

## Aggregate Evidence

Use three evidence clusters:

```text
Intrinsic:            DCF
Enterprise-relative:  EV/Revenue, EV/EBITDAR, Per-user
Equity-cash-flow:     P/FCF
SOTP:                 decomposition only, no vote
FCFE:                 diagnostic only, no range/count/confidence
```

Collapse rule: multiple methods in one cluster collapse to one breadth observation by majority vote within the cluster. Verdict ordering (weakest/conservative first): `overvalued < fair < undervalued`; exact ties keep the weaker (minimum) verdict for breadth. Final verdict truth table: 3/3 clusters agree → that verdict; 2/3 agree → majority verdict with minority disclosed; otherwise → `fair` with HOLD note. Breadth counts clusters (max 3), never raw method counts.

## Gates

- Every material peer KPI has a valid citation and period.
- All five relative outputs use the same share count.
- Relative outputs are invariant to DCF horizon.
- 5- and 10-year runs produce identical relative values.
- EV/EBITDAR uses full-period D&A.
- P/FCF label matches its numerator.
- Mixed-period per-user bases are rejected or visibly excluded.
- SOTP does not change vote count, verdict, or confidence.
- Neither FCFE nor SOTP may enter `rangePerShare`, min/max/spread, confidence denominators, observation counts, or verdict calculations. Tests assert exclusion by field name.
- P10.4 must keep explicit failing tests for current FCFE-range, SOTP-vote, and aggregate-count violations; these are expected to fail until P10 fixes them and must not be deleted or weakened to pass.
- “Six independent methods” language is removed.
- Exact method ties are valid.

---

# P10.5 — FCFF, SBC Add-Back, and Dilution

## Files

- `src/engine/threeStatement.js`
- `src/engine/dcf.js`
- `src/engine/shares.js`
- `src/engine/recommend.js`
- `src/engine/methods/fcffDcf.js`
- `src/ui/projectionsTab.js`
- `src/ui/valuationTab.js`
- `src/ui/summaryTab.js`
- `src/ui/charts.js`

## SBC Policy

- Keep SBC added back in GAAP-derived operating cash flow.
- Start future issuance from current fully diluted shares, not Q2 weighted-average shares.
- Model each period’s issuance exactly once.
- Use an explicit `sbc_issuance_price`; never use the mutable benchmark.
- Preserve the current SBC assumptions in P10 unless a separate model ruling changes them.
- Show the existing 8% SBC/revenue terminal endpoint (an SBC-expense endpoint, not a dilution rate) plus explicit 8%–15% SBC/revenue sensitivity.
- Do not net buybacks against issuance unless the corresponding repurchase cash is charged.
- Add a perpetual post-terminal dilution rate `d_perm` with default `1.0%` and sensitivity range `0%–2%`: each future share count compounds as `shares_{t+1} = shares_t * (1 + d_perm)`; terminal diluted divisor is `shares_T * (1 + d_perm)` and `per_share_perm = equity_TV / shares_adj`. Positivity rule: `(1 + d_perm) > 0` and `(ke - d_perm) > 0`, else fail closed.
- A finite issuance roll cannot be described as a complete terminal policy.

## DCF Outputs

Report separately:

1. **FCFF DCF — Current-Share Value**
   Present equity value divided by current fully diluted spot shares.

2. **FCFF DCF — After Modeled Future Dilution**
   Canonical intrinsic result after explicit, fade, and perpetual dilution treatment.

3. **SBC Expense Cross-Check**
   Economic FCFF after SBC expense using current fully diluted shares.

Only the second is the canonical add-back DCF recommendation.

## FCFE

For every period:

```text
FCFE - FCFF = after-tax interest income
```

For equity value:

```text
FCFE equity value - FCFF equity value
= PV(after-tax forecast interest income) - current net cash
```

Requirements:

- FCFF remains primary.
- FCFE is diagnostic only.
- FCFE is never called a floor.
- FCFF/FCFE endpoints never define a valuation range.
- FCFE never enters votes, ranges, confidence, or verdict math; the `FCFE - FCFF = after-tax interest` identity is valid only under the stated debt-free convention and must be labeled as such.
- Legacy mixed-basis FCFE-plus-terminal-cash is audit-only and excluded from recommendations, verdicts, and visible headline ranges.
- Cash yield, cost of equity, current net cash, and the retained-cash opportunity-cost spread are disclosed.

## Gates

- SBC add-back equals the noncash reconciliation exactly.
- Each SBC period produces issuance exactly once.
- Benchmark changes do not change issuance.
- Current-share and future-diluted DCF values reconcile.
- Finite and perpetual dilution sensitivities are distinct.
- Terminal dilution denominator remains positive.
- FCFF/FCFE reconciliation equals zero residual.
- No output calls FCFE a floor.
- No method range uses FCFF and FCFE as endpoints.
- Legacy value cannot enter recommendation or aggregate calculations.
- DCF UI cumulative PV includes explicit, fade, and terminal stages.

---

# P10.6 — Safe Rendering, Browser Behavior, and Deployment

## Files

- `src/ui/format.js`
- All files under `src/ui/`
- `index.html`
- `.github/workflows/deploy.yml`
- `vercel.json`
- `api/price.js`
- Browser tests

## Rendering Security

- Centralize `escapeText()` and `safeUrl()`.
- Prefer `textContent` and DOM construction.
- Escape text and attributes at every HTML boundary.
- Allow only approved URL schemes.
- Reject `javascript:`, unsafe data URLs, and unapproved providers.
- Apply protection to:
  - driver labels and notes;
  - source names;
  - peer names;
  - provider labels;
  - dates;
  - URLs;
  - market-status messages;
  - methodology labels;
  - exclusion reasons.

## Browser Behavior

Cover:

- all eight tabs;
- Cover, Summary, Valuation, and Sensitivity benchmark parity;
- 10-period production boot;
- Base, Downside, and Upside;
- valid and invalid assumption edits;
- reset/default behavior;
- initial hash and `hashchange`;
- `#sensitivity` deep link;
- keyboard and focus behavior;
- desktop, tablet, and 390px layouts;
- zero console/page errors;
- fallback-price disclosure;
- no stale two-stage, five-year, or six-independent-vote copy.

Projection stage controls must scope all dependent cards, charts, and tables or be renamed so they do not imply page-wide filtering.

## Deployment

- GitHub Pages receives a minimal allowlisted static artifact.
- Vercel deploys `/api/price`.
- Pages obtains the Vercel endpoint through explicit deployment configuration.
- CORS permits only approved Pages/Vercel origins.
- API remains GET-only, bounded, rate-limited, and validated.
- Pages failure falls back to the dated snapshot and displays the fallback banner.
- Neither deployment contains `.git`, `.env`, tests, tools, logs, or source-control metadata.

## Gates

- Malicious HTML remains inert text.
- Unsafe URLs are blocked.
- All eight tabs work in Chromium.
- Deep links restore the intended tab.
- All valuation surfaces display the same benchmark.
- Pages artifact allowlist passes.
- Vercel price API contract tests pass.
- API unavailable produces the correct visible fallback.
- Responsive tests pass at all required widths.
- No console errors occur.

---

# P10.7 — Financial Reality and Economic Plausibility

## Objective

P10 is not considered complete merely because code compiles and tests pass. The model must also agree with:

- filed financial statements;
- primary-source company disclosures;
- basic accounting identities;
- economic definitions;
- reasonable peer and industry ranges;
- the actual Duolingo business.

Financial reality is a separate release gate. DS may provide calculations and evidence; OP/Director must independently review the conclusions.

## 1. Primary-Source Financial Verification

Re-verify every material DUOL input against the latest available filing or investor source, including:

- revenue and revenue growth;
- subscription and advertising/DET revenue;
- gross margin;
- R&D, sales and marketing, and G&A;
- operating income;
- net income;
- cash and investments;
- funded debt;
- lease liabilities;
- operating cash flow;
- capital expenditure;
- capitalized software;
- depreciation and amortization;
- working capital;
- deferred revenue;
- share-based compensation;
- basic, diluted, and fully diluted shares;
- options, RSUs, and founder awards;
- share repurchases;
- MAU, DAU, paid subscribers, bookings, and ARPU;
- tax rate and interest income.

Every material claim must record:

```text
claim
source document
filing or publication date
measurement period
retrieval date
source URL/accession
reported value
model value
difference
explanation
```

Fail closed when a required source, period, or reconciliation is missing.

## 2. Peer and Market Reality

Re-pull peer data from primary filings or clearly identified institutional sources.

Verify:

- Spotify operating KPIs, revenue, cash, debt, and lease treatment;
- Roblox bookings, revenue, cash, investments, debt, and user KPIs;
- Netflix revenue, membership, cash, debt, and lease treatment;
- market prices and valuation dates;
- forward estimates and their retrieval dates;
- currency and unit conversions;
- fiscal-period alignment;
- GAAP versus non-GAAP definitions;
- lease and EBITDAR consistency.

Peer data must not mix:

- TTM and forward periods;
- period-end and weighted-average values;
- total debt and carrying value;
- senior debt and combined obligations;
- period mismatched MAU and DAU;
- currencies without conversion;
- estimates retrieved after the valuation date.

## 3. Accounting Reality Checks

The following must reconcile independently from the application UI:

### Historical statements

- Assets = liabilities + equity.
- Income statement retained earnings roll forward correctly.
- Cash-flow ending cash equals balance-sheet cash.
- Statement of stockholders’ equity share movements reconcile.
- Deferred revenue rolls consistently.
- PP&E and capitalized-software schedules reconcile.
- Goodwill and intangible balances do not appear without support.

### Forecast statements

- Beginning and ending balances use the same declared period frame.
- Net income feeds retained earnings.
- OCF components articulate to OCF.
- ICF components articulate to ICF.
- CFF components articulate to CFF.
- Cash movement reconciles to ending cash.
- Debt movement and interest expense reconcile.
- Interest income and average cash reconcile.
- D&A agrees with PP&E, capitalized software, and intangible schedules.
- Working-capital movements agree with the balance sheet.
- Share movements agree with the share schedule.

### Per-share accounting

- Basic weighted-average shares reconcile to filed EPS.
- Diluted weighted-average shares reconcile to filed diluted EPS.
- Current fully diluted shares reconcile to period-end basic shares plus disclosed dilution.
- Options use an approved treasury-stock calculation.
- RSUs, founder awards, repurchases, and net-share settlements are not double-counted.
- SBC expense, cash-flow add-back, and dilution are internally consistent.

## 4. Cash-Flow Definition Checks

The report must separately identify:

- GAAP operating cash flow;
- levered free cash flow;
- FCFF;
- FCFE;
- economic FCFF after SBC expense;
- current net cash;
- forecast cash accumulation;
- terminal cash.

Requirements:

- P/FCF is not called FCFE unless net borrowing is included.
- FCFF does not add current cash twice.
- FCFE does not receive an EV cash bridge.
- Cash already used to roll the balance sheet to the valuation date is not also discounted.
- Cash interest is treated consistently.
- Legacy mixed-basis values are excluded from headline conclusions.

## 5. Economic Plausibility Review

Financial outputs must be evaluated against reasonable economic ranges and historical relationships.

### DUOL operating review

Check:

- subscriber and MAU growth;
- paid conversion;
- ARPU and bookings growth;
- revenue growth versus user growth;
- gross-margin stability;
- R&D and S&M growth versus revenue;
- operating-margin progression;
- Rule of 40;
- SBC/revenue;
- capital intensity;
- working-capital behavior;
- deferred-revenue growth.

Flag explanations such as “AI investment” only when supported by disclosed expense or product evidence.

### Discount-rate and terminal review

Check:

- risk-free rate;
- beta;
- equity risk premium;
- cost of equity;
- debt weight;
- WACC;
- normalized tax rate;
- cash yield;
- terminal growth;
- terminal operating margin;
- terminal reinvestment;
- terminal SBC treatment;
- terminal-value share of enterprise value.

Mandatory sensitivities:

- WACC;
- terminal growth;
- terminal margin;
- terminal SBC;
- share-issuance price;
- SBC expense/add-back treatment;
- explicit versus perpetual dilution.

No sensitivity may be hidden or used selectively.

### Valuation reasonableness

Cross-check DCF outputs against:

- current market capitalization;
- historical EV/revenue;
- current peer multiples;
- implied forward multiples;
- FCF yield;
- price-to-freecash-flow;
- user-based implied valuations;
- bear/base/bull outcomes.

The DCF must not be rejected merely because it differs from peers, and peers must not be forced to agree with the DCF. Differences require economic explanation.

## 6. Red-Flag Conditions

Place P10 on HOLD if any of the following occurs:

- a material financial input lacks a valid primary source;
- filings do not reconcile to the model;
- a valuation output relies on stale or incorrect peer data;
- reported and modeled periods are mixed without disclosure;
- a cash flow is counted in both the bridge and DCF;
- SBC is omitted or counted twice;
- relative methods use inconsistent share counts without explicit economic justification;
- terminal assumptions create unexplained margin or growth;
- a material result is driven by a hidden fallback;
- source dates post-date the valuation information set;
- documentation disagrees with generated output;
- a failed test is waived without an explicit Director ruling.

## 7. Independent Re-Performance

OP or an independent reviewer must reproduce the major results from source data without relying on the application’s headline outputs.

Required re-performance:

- current fully diluted share bridge;
- Q2-to-valuation-date cash roll;
- FY2026 post-valuation stub;
- three-statement cash movement;
- FCFF calculation;
- SBC add-back and issuance;
- perpetual dilution;
- EV-to-equity bridge;
- DCF per-share value;
- all five relative values;
- evidence-cluster verdict.

The independent result must match the application within declared tolerances.

## 8. Financial Reality Output

P10.7 must produce a signed machine-readable report at `docs/financial_reality/phase_10_report.json` with exact schema:

```json
{
  "schema_version": "p10.7-v1",
  "reviewer_id": "string",
  "reviewed_at": "ISO-8601 UTC",
  "director_approval": {"director_id": "string", "signed_at": "ISO-8601 UTC"},
  "valuation_date": "YYYY-MM-DD",
  "reporting_cutoff": "YYYY-MM-DD",
  "source_bundle_sha256": "hex64",
  "model_state_sha256": "hex64",
  "material_inputs": [{"claim": "string", "claim_type": "filed_fact|sourced_market|assumption|judgment"}],
  "tolerances": {"currency_k": "number", "per_share": "number", "pct": "number"},
  "sources": [{"claim": "string", "claim_type": "filed_fact|sourced_market|assumption|judgment|unresolved", "doc": "string", "filing_date": "YYYY-MM-DD", "period": "string", "retrieved_at": "ISO-8601 UTC", "accession": "string", "url": "string", "reported": "number", "modeled": "number", "difference": "number", "unit": "string", "tolerance": "string", "explanation": "string"}],
  "accounting": {"historical": "pass|fail", "forecast": "pass|fail", "notes": "string"},
  "reperformance": {"inputs_hash": "hex64", "outputs": {"dcf_current": "number", "dcf_diluted": "number", "rel_comps": "number", "rel_ev": "number", "rel_pfcf": "number", "rel_peruser": "number", "sotp_decomposition": "object", "verdict": "string"}, "residuals": "object", "match": "boolean"},
  "unresolved": [{"issue": "string", "severity": "string", "owner": "string"}],
  "verdict": "pass|fail|hold"
}
```

Canonical serialization: UTF-8, sorted keys, LF line endings, no floats-as-strings, numbers with explicit tolerance units from `tolerances`. Hash algorithm: SHA-256 over canonical bytes. Signature: `reviewer_id` + `reviewed_at` plus `director_approval` recorded by OP/Director; automated stale-report check recomputes both hashes and fails P10.8 when either hash mismatches the live tree:

The report must distinguish:

- filed fact;
- sourced market fact;
- model assumption;
- analyst judgment;
- unresolved issue.

Stale-hash rule: any change to sources, model, horizon, shares, SBC, benchmark, methods, or code invalidates the report hash and all dependent P10.8 gates until P10.7 is re-passed.

## P10.7 Gates

- Every material DUOL input is primary-source verified.
- Every material peer input is verified and period-aligned.
- Historical statements reconcile.
- Forecast statements articulate.
- FCFF, FCFE, levered FCF, and SBC treatments are correctly distinguished.
- Current fully diluted shares reconcile independently.
- All relative methods use the same current fully diluted denominator.
- DCF dilution is independently reproducible.
- WACC, terminal assumptions, and sensitivities are economically reviewed.
- Market-implied and method-implied multiples are disclosed.
- Independent re-performance matches within tolerance.
- No unresolved financial-reality issue remains.
- OP/Director records `P10.7 PASS`.

> P10.7 PASS requires `reviewer_id`, `reviewed_at`, `source_bundle_sha256`, `model_state_sha256`, material-input manifest, numeric tolerance table, source reconciliation, accounting reconciliation, independent re-performance, unresolved issues, and final verdict. Any source, model, horizon, share, SBC, benchmark, method, or code change invalidates the report and dependent P10.8 gates.

No final pins may be generated before P10.7 passes.

---

# P10.8 — Generated Evidence, CI, Documentation, and Release Candidate

## Files

- `tools/regen_pins.mjs`
- `tests/coherence.eig.test.js`
- `package.json`
- `.github/workflows/*`
- `README.md`
- `docs/spec.md`
- Current status metadata identified by OP
- Runtime version/date metadata identified by OP
- `index.html`
- Generated-output tests

## Requirements

### Read-Only Tests

- `npm test` must not modify tracked or untracked files.
- Replace writing regeneration calls with `--check` or temporary-directory execution.
- Add post-test:
  - `git diff --exit-code`;
  - `git status --porcelain`.

### Pin Generation

Pins move only in P10.8, after all code, data, period, benchmark, share, method, and UI decisions are final.

Fingerprint lifecycle: `source_bundle_sha256` covers `src/data/historical/*`, `src/data/assumptions.json`, `src/data/constants.js`, plus the single input exception `docs/financial_reality/source_ledger.json` (the ledger is a source input; the P10.7 report output in the same directory is excluded). `model_state_sha256` covers `src/engine/*`, `src/app.js`, `src/data/schema.js`, `src/data/loader.js`, and `src/engine/benchmark.js`. `artifact_sha256` covers generated outputs only (README figures, `docs/spec.md`/`docs/conventions.md` pins, `index.html` metadata, P10.7 report) via semantic selectors (named pin blocks/figure IDs, not whole-file bytes) recorded in the P10.8 gate log. Canonical bytes: paths sorted bytewise (UTF-8), per-file entry `path + 0x00 + sha256(file_bytes)`, concatenated in order, SHA-256 over the concatenation. Store source/model hashes in the P10.7 report and `docs/p10_baseline/fingerprints.json`; store the artifact hash in the P10.8 gate log only. Final P10.7 revalidation must rerun after the last code change and immediately before pin generation; any intervening change invalidates P10.7. `tests/coherence.eig.test.js` (see current write paths around `:454-464`) must run with `--check` or write only to `os.tmpdir()`; it never mutates the tree. CI asserts read-only behavior with `git diff --exit-code` + `git status --porcelain` after the coherence run.

The stamp must cover every claim-producing source, including:

- assumptions;
- canonical historical and peer data;
- constants;
- app selectors;
- forecast;
- schedules;
- three-statement engine;
- DCF;
- shares;
- all valuation methods;
- aggregate verdict;
- recommendation;
- benchmark resolution;
- relevant UI/generated claims.
- the P10.7 financial-reality report and source-ledger fingerprint.

Pin generation must use:

- canonical 10-period production context;
- current fully diluted relative share count;
- post-valuation DCF stub;
- SBC add-back and future dilution;
- FCFF canonical path;
- SOTP excluded from voting;
- all evidence clusters and final verdict.

Pins must not be moved at P10.2 or any earlier financial subphase.

The final test suite must include P10.7 accounting, source, and economic-reality tests.

`regen_pins.mjs` must fail if P10.7 approval is absent.

### Browser CI

CI must run on pull requests and include:

- `npm ci`;
- read-only Node suite;
- real Chromium suite;
- security tests;
- deployment artifact validation;
- pin validation;
- clean-tree validation.

Performance reporting must include median and p95. The existing `<16ms` budget cannot be silently relaxed; any changed budget requires explicit Director approval.

### Documentation

Update only after final pins:

- README;
- current specification (`docs/spec.md`, `docs/conventions.md`);
- runtime version/date;
- test count;
- current market price/as-of;
- DCF value;
- future-diluted value;
- FCFE cross-check;
- relative-method values;
- evidence-cluster verdict;
- Pages/Vercel behavior;
- local-server instructions;
- source/data caveats.
- financial-reality verdict;
- primary-source cutoff;
- key accounting reconciliations;
- FCFF/SBC policy;
- dilution policy;
- terminal assumptions;
- independent re-performance result.

Historical phase logs remain archival and are not rewritten.

The Director may not issue a release PASS if P10.7 is missing, stale, or marked HOLD.

## Final Gates

Run from a clean checkout:

```text
npm ci
node tools/regen_pins.mjs --check
npm run verify:js
npm test
npx playwright test --config=playwright.config.mjs tests/browser
npm audit
git diff --check
git diff --exit-code
git status --porcelain
```

P10.8 must add `verify:js` to `package.json` (`node tools/verify_js.mjs`, which runs `node --check` over every file in the manifest — no hand-expanded lists), create `playwright.config.mjs` + `tests/browser/*.spec.mjs` if absent, pin the test manifest at `tests/manifest.json` with exact file list + count, trigger CI on `pull_request`, and validate the Pages artifact only through the allowlist (`index.html`, `src/`, `assets/`, `vendor/` — required by `index.html:8` / `src/ui/tabulator.js:15` — never `.git/.env/tests/tools/logs`). Keep `vercel.json` and the Vercel function configuration separate from the static artifact. The Playwright command above is the canonical browser suite invocation; record the exact spec paths in the P10.8 gate log.

Required final conditions:

- The exact test manifest and count recorded for the pinned source state (manifest file + count in the P10.8 gate log, not a `1,088+` approximation) passes on three consecutive clean-checkout runs.
- Zero browser console/page errors.
- Zero dependency audit vulnerabilities.
- All balance, cash-flow, period, share, and valuation invariants pass.
- Peer citation and period coverage passes.
- Security probes pass.
- Deployment artifact contains only intended files.
- Test and pin commands are read-only.
- README, runtime metadata, generated pins, and model outputs agree.
- Clean-tree status remains empty after all gates.
- OP and Director approve the final state.
- No commit, push, archive, or tag occurs without explicit Director instruction.

# P10.9 — Live-Close Verdicts and Close-Only Refresh

## Objective

Verdicts calculate against the live price at runtime. Refresh captures the last official close; intraday is unavailable in every layer. Added by Director order after the 12:15 GATE PASS (which stands as history); P10.7/P10.8 verdicts stand — snapshot driver, pins, and the P10.7 report are untouched (runtime-presentation behavior only).

Observed defect: verdicts already consume live price via precedence (override > live > snapshot), but refresh never yields one — `api/price.js` emits `status: 'intraday'` with a live quote and omits `lastOfficialClose`, parking the client on the snapshot; intraday display paths survive in `market.js`.

## Rulings (OP-set under the Director order, countermandable by one line)

- R1 source: stockanalysis.com daily close (already-pinned provider; no new source).
- R2 offline: snapshot fallback with visible banner (existing behavior).
- R3 pins + snapshot driver UNMOVED: a live close moves upside/presentation only — DCF, issuance, and terminal dilution stay byte-identical; P10.7 report untouched. A moving target cannot be pinned; re-basing pins onto live needs a separate explicit re-base order with full P10.7 invalidation.

## Files

- `api/price.js`
- `src/engine/market.js`
- `src/engine/benchmark.js`
- `src/app.js` (fetch path only)
- All files under `src/ui/` (display only)
- Price/benchmark tests + browser refresh spec

## Requirements

1. The server emits official closes ONLY. In-hours it resolves the last completed close from upstream (prior-close field + its date); unresolvable → snapshot fallback with visible reason. Envelope: `{price: close, asOf: closeDate, isOfficialClose: true, intradayPrice: null, status: 'live_close'|'fallback'}`. The `'intraday'` status and non-null `intradayPrice` leave the server vocabulary.
2. The client refuses intraday shapes outright (`isOfficialClose === false`, non-null `intradayPrice`, `status: 'intraday'` → rejected outcome, visible "intraday unavailable" reason, held benchmark byte-preserved).
3. Zero intraday price/banner/strings in any view and any API response (grep `intraday` outside tests/comments empty). Refresh control labeled last-close. Banners survive for fallback/stale/override only.
4. Explicit refresh only; no polling interval introduced.
5. Existing P10.3 lifecycle gates re-greened live (precedence, sequence-over-arrival, post-dispose silence, idempotency).
6. Entailed test conversions disclosed before/after each; none silently deleted.

## Gates

- Close accepted; prior-close-in-hours accepted with the prior date.
- Intraday-shaped envelope refused; intradayPrice-bearing body refused even beside valid close fields.
- Unresolvable-hours → fallback + visible banner.
- `benchmarkToMarketState` never emits intraday status.
- DCF/issuance byte-identical across benchmark changes.
- Suite green; pins IN SYNC; browser refresh shows close asOf with no intraday element and zero console errors.

# P10.10 — Cross-Tab UI Consistency (DEFINED — kicks off on P10.9 PASS)

## Objective

One product, one language, one basis on every tab. OP visual audit (Chromium 1280 captures `scratch/op_uicon_*_1280.png`, zero console errors) found seven live inconsistencies, each verified against code — prose, labels, dates, denominators, separators, and units that disagree across tabs or with the ruled contracts.

## Findings (all OP-proven live + code-read)

- U1 (contract language): Valuation tab header `Multi-Method Valuation Synthesis (6 Valuation Methods)` + `Six institutional valuation methodologies …` (`src/ui/valuationTab.js:2041,2045`) — P10.4 bans "six methods"/"independent" in UI; the ruled system is 3 evidence clusters / 5 voting rows.
- U2 (basis mismatch): Valuation DCF method-detail PV legs render the INTEGER lane ($1,586,880.58 / $1,548,931.85 / $2,914,335.53, EV $6,050,147.96) beside the dated/canonical $113.70 headline (dated legs $3,121,895.69 / $3,124,720.25, EV $6,246,615.95). Root: method detail prefers `m.fcff.pvByStage` (integer sub-block, `fcffDcf.js:243`) over production `currentDcf.pvByStage` — the P10.5-F2 class in a third site (audit card legs `:1272-1277`, bridge `:1442-1443`, method table `:2139-2140` — all three).
- U3 (period mislabel): Projections KPIs call FY2030 figures "Terminal-year" (`src/ui/projectionsTab.js:61-63`) — terminal year is FY2035; FY2030 is the last explicit year.
- U4 (stale hardcoded shell date): app header hardcodes `Sep 1, 2026` (`index.html:5147`) while live tiles render the valuation date Sep 2, 2026 — dead-skeleton class. Companion: `formatDateClean` fallback (`src/ui/coverTab.js:22`) returns the plausible real date `Sep 1, 2026` instead of failing closed.
- U5 (share denominator): Cover `Diluted Shares — Filed (MKT) 50.03M` reads the WA diagnostic driver (`src/ui/coverTab.js:185-191,269`) — ruled FD schedule is 50,061,458 (50.06M); WA is EPS-diagnostic-only. Same class as remediated P10.5 lever-6, which fixed valuationTab only.
- U6 (divisor basis): Cover `DCF Divisor — Rolled (EST) 66.89M` is the finite-roll intermediate (`dcf.sharesOutstanding`), not the canonical perpetual divisor 67.56M — no basis marker (P10.6 carry rule).
- U7 (hygiene): (a) Valuation `Range: $113.70; $113.70` semicolons vs en-dash spreads on Cover/Summary — one separator; (b) Summary `IMPLIED EQUITY VALUE ($MM)` vs `$ in thousands`/$M elsewhere — one unit convention; (c) Sensitivity `Bear β / Bull β` vs Downside/Base/Upside display vocabulary — one scenario vocabulary (check test pins before renaming).

## Files

- `src/ui/valuationTab.js`, `coverTab.js`, `projectionsTab.js`, `summaryTab.js`, `sensitivityTab.js`
- `index.html` (shell date only — version pills stay pinned: no Director tag order)
- UI consistency tests (new pins, both-directions like the F6 pin)

## Requirements

1. U1: 3-cluster/5-voting-row language; repo-wide sweep proves zero banned residuals.
2. U2: method-detail, card, and bridge legs all prefer the basis-declared production lane (F5-extra remedy); lane-identity pin per site.
3. U3: explicit-horizon (2030E) wording; terminal-year reserved for FY2035; pin.
4. U4: header date rendered from valuation context at boot; fallback date never a plausible real date (fail closed or neutral placeholder).
5. U5: ruled FD schedule with build, or diagnostic labeling that cannot be read as the valuation denominator.
6. U6: canonical divisor with basis marker, or explicit intermediate labeling.
7. U7: single separator, unit, and scenario-vocabulary conventions, each test-asserted.
8. Pins/snapshot/P10.7 untouched (display/label behavior only; any figure that moves is disclosed before/after per lane).

## Gates

- All eight tabs re-captured (1280 + 390 spot-check): one header treatment, one pill/toggle shape per function, one date, one FD count, one divisor basis, one separator, one unit convention, one scenario vocabulary.
- Banned-language + lane-identity + period-label pins green; suite green; pins IN SYNC; zero console errors.

## 5. Authority Precedence (temporary)

While P10 is active, this file takes precedence over `docs/spec.md`, `docs/conventions.md`, `README.md`, and prior RP/FP status rows on horizon, share denominator, benchmark-only pricing, `sbc_issuance_price`, comps/FCFE/SOTP policy, and phase status. Conflicts are resolved in favor of P10 §2 rulings until P10.8 reconciles the authoritative documents. Waiver hierarchy per `docs/review_checklist.md:7-15`: checklist §1 items 1–7 (failing tests, crashes, leaks, blind approvals, fabricated metrics, secrets, buried fallbacks/gate-scope mismatch) plus all security, source, accounting, period, XSS, and P10.7 financial-reality failures are non-waivable, including by Director. Any other waiver requires explicit Director approval with recorded reason, owner, and expiry/review condition — P10 grants no blanket waiver.

## 6. Phase Completion Rule

P10 subphases pass in order:

```text
P10.0 → P10.1 → P10.2 → P10.3 → P10.4 → P10.5 → P10.6 → P10.7 → P10.8 → P10.9 → P10.10
```

(P10.9 appended by Director order after the 12:15 gate; the gate record P10.0–P10.8 stands as history. P10.10 defined 13:15 UTC — kicks off on P10.9 PASS per single-active-phase governance.)

Any later change to assumptions, source data, horizon, valuation-date logic, shares, SBC, benchmark behavior, methods, or aggregation invalidates all dependent downstream gates and requires regenerated pins.

Final completion requires both:

```text
P10.7 PASS — Financial Reality
P10.8 PASS — Reproducible Release Candidate
```

Final completion message:

```text
GATE PASS: Phase 10 — Release Integrity Reconciliation
FINANCIAL REALITY: PASS
REPRODUCIBLE RELEASE: PASS
```

---

# O1 — P10.7 Revalidation (1.49 beta basis; Director Option B)

## Authority
Director Option B (2026-10-02): adopt beta 1.49 (peer-mean basis); P10.7 revalidation + P10.8 re-gating (O2) are ordered follow-ups. O1/O2 do not extend the §6 sub-phase order (P10.10 terminal stands) and rewrite no P10 history.

## Objective
Restore a true P10.7 Financial Reality PASS on the authorized 1.49 basis. The 2026-09-26 P10.7 PASS is stale (bundle `6c591c2e…` vs live tree; OP hash proof 2026-10-02).

## Delta scope (everything else carries undisturbed)
1. Cost-of-capital rebuild: beta 1.49 (mean 1.4919 of filed unlevered 1.5657/1.4387/1.4713), Ke = 4.79% + 1.49×4.25% = 11.1225%. C2: correct Rf/ERP vintage labels to filed 2026-09-01.
2. Ledger/pack/report reconciliation on the 1.49 basis (judgment records for beta-mean + WACC construction; every beta-batch test-expectation rewrite audited for engine derivation, not hand-typing).
3. Accounting reconciliations re-proven (residuals published, not adjectives).
4. Independent re-performance of all required outputs + cluster verdict on the new basis (residuals 0; verdict re-derived, never assumed — OVERVALUED must be re-earned).
5. S6 red-flag sweep clean. Peer/market reality carries (beta-untouched, no rework).
6. Report re-signed (reviewer fields + fresh bundle/model hashes); director countersignature stays pending (O2/final).

## Explicitly out of scope
Pin moves of any kind (O2 owns pin finalization); engine/UI behavior changes; test-expectation changes beyond audited beta entailment; commits/tags/archive/reset; P10-history rewrites.

## Gates
- Beta/WACC build re-derived from the filed note; C2 vintages corrected.
- Ledger/pack/report mutually consistent on 1.49; every beta-batch test rewrite derivation-checked.
- Historical + forecast articulation residuals zero; FCFF/FCFE/SBC treatments hold.
- Re-performance matches live engine on all outputs + verdict within tolerances.
- S6 clean; suite green; pins IN SYNC with zero O1 moves (any drift is a finding).
- OP issues REVIEW: O1 [PASS]; O2 kickoff follows under the standing auto-kickoff logic.
