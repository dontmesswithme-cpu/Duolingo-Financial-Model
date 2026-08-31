# Phase 1: Historical Data — Full 3-Statement Actuals FY2021–FY2025 + TTM

> **Milestone**: Phase 1 — Historical Data: Full 3-Statement Actuals FY2021–FY2025 + TTM
> **Protocol**: 1.0
> **Status**: 🟡 Active
> **Owner**: Drafted & Audited by Reviewer (`OP`), Implemented by Worker (`DS`)
> **Objective**: Transcribe Duolingo, Inc.'s complete historical financial base — full income statements, balance sheets, and cash flow statements for FY2021–FY2025, the quarterly TTM window from 10-Qs, and KPIs — with every single record carrying a verbatim citation. This is the Accuracy Gate's first real use: the audit layer built in P0 now guards real numbers. No estimates, no derived values entered as data, no uncited figures — the loader refuses to boot otherwise.

---

## 1. Milestone Objective & Scope

Phase 1 fills `src/data/historical/*.json` with verified actuals: annual 3-statement data for FY2021–FY2025 (from the three-year columns of the 10-K filings), the discrete-quarter income statements and YTD cash flows covering the TTM window (from 10-Q filings), and KPIs (DAU, MAU, paid subscribers, bookings, adjusted EBITDA) with verbatim definitions. Every record passes schema validation and the full audit (citation present, URL in ledger, units honest, no estimate marked as historical). DS transcribes; OP independently re-pulls every cited source and re-verifies every value (blind approval prohibited). The TTM computation module ships here and is verified against anchor fixtures.

**Out of scope**: projections (P3), schedules (P2), any forward-looking figure, any UI rendering of the data (P5). Assumptions file defaults may be seeded only where the contract says so.

---

## 2. Prerequisites & Dependencies

- **Completed Prior Phases**: Phase 0 — GATE PASSED 2026-08-31, tag `v1.0-P0` (118/118 tests; audit engine, schemas, loader, ledger, typed errors all live).
- **External Dependencies / Manifests**: None at runtime. Agent-time retrieval tools per spec §4.7 (EDGAR primary; Bigdata.com as DS transcription aid and OP verification lane — never a citation target).
- **Reference Documents**:
  - `docs/spec.md` §3.1 (record schema — FROZEN by P0.2), §4 (Data Sourcing & Verification Protocol incl. §4.7 Retrieval Tools), §7 (Resolved Decisions).
  - `docs/sources/README.md` (ledger rules + OP cross-check protocol — BINDING).
  - `docs/conventions.md` (Financial Data Integrity rules — project-critical).
  - P0 binding rulings (carry-forward): `loadHistorical()` async signature FROZEN; `HISTORICAL_DATASETS` manifest canonical; wire `requireLedger: SOURCE_LEDGER_REQUIRED` at the app's load call site in P1's first data sub-phase.

---

## 3. Sub-Phase Artifact Contracts

### Task P1.1: Annual Income Statements FY2021–FY2025 + TTM-Window Quarterly IS

#### A. Deliverable Files
- `src/data/historical/income.json` — Annual FY2021–FY2025 income statements from the 10-K three-year columns (FY2021 from the FY2023 10-K's comparative column or the FY2021 10-K directly — DS cites whichever document the figure is actually read from), plus discrete quarterly income statements for the four quarters of the TTM window from 10-Q three-month columns. Line items: revenue by segment (subscription, advertising, other — as disaggregated in filings), cost of revenue, gross profit, operating expense lines (R&D, S&M, G&A and any other filed lines), operating income, interest/other income, income tax, net income. As-reported units (`thousands_usd`).
- `src/app.js` (load call site only) — Wire `requireLedger: SOURCE_LEDGER_REQUIRED` and the ledger URL set into the production `loadHistorical()` call (binding P0.3 ruling; app must refuse to boot on out-of-ledger citations).
- `docs/sources/sources.md` — Ledger entries (append-only) for every 10-K and 10-Q cited in this sub-phase, added at transcription time.
- `tests/fixtures/duolingo_facts.js` — Anchor fixtures with sources: FY2025 and FY2023 total revenue, FY2025 and FY2023 net income, FY2025 revenue by segment, YoY revenue growth FY2024→FY2025. Each fixture records metric, period, value, and source filing.
- `tests/income.data.test.js` — Dataset tests: every row cited + in-ledger; segment sums = total revenue; IS identity (revenue − cost of revenue = gross profit) per period; annual fixture matches; quarterly rows are discrete (`periodType: "quarter"`) with 10-Q 3-month column citations.

#### B. Exported Interfaces & Types
- Income dataset JSON: array of historical-statement records per the frozen `SCHEMAS.historicalStatement` (P0.2): `{ metric, label, klass: "flow", period, periodType, value, units, scale, source{filing, period, statement, url, accessedAt}, isEstimate: false }`. No new schema fields — the P0 schema is frozen; a needed field is an escalation, not an improvisation.
- `tests/fixtures/duolingo_facts.js` exports: `KNOWN_FIGURES` — frozen array of `{ metric, period, value, units, source }` used by every later data test; single source of truth for anchor checks.

#### C. Invariants & Automated Quality Gates
- [ ] `loadHistorical()` resolves with the income dataset: 100% of rows pass `validateRecord` + `auditDataset` (cited, in-ledger, correct units); zero `HIST_NO_SOURCE`, `SOURCE_NOT_IN_LEDGER`, `DUP_KEY`, `BAD_UNITS`.
- [ ] Segment revenue rows sum exactly to total revenue per period (asserted per fiscal year; per quarter where segments are filed).
- [ ] IS identity holds per period: revenue − cost of revenue = gross profit (as filed; if a filing presents subtotals differently, transcribe as filed and record the deviation in the sub-phase log — never force-fit).
- [ ] Every fixture value matches the dataset exactly (a forged number cannot slip in).
- [ ] Quarterly IS rows cite 10-Q three-month columns; no YTD row is relabeled as a discrete quarter in this dataset.
- [ ] App boots (headless stub) with `requireLedger: SOURCE_LEDGER_REQUIRED` wired; removing a ledger entry makes the boot fail — proven by test.
- [ ] `npm test` green, 0 flakes × 3 runs.

---

### Task P1.2: Annual Balance Sheets FY2021–FY2025 + Latest Quarter-End

#### A. Deliverable Files
- `src/data/historical/balance.json` — Full balance sheets at fiscal year-ends FY2021–FY2025 plus the latest reported quarter-end. Line items (as filed): cash + equivalents, short-term investments, accounts receivable, prepaid expenses, other current assets, total current assets, PP&E (net), operating lease ROU assets, intangibles, deferred tax assets, other non-current assets, total assets; accounts payable, accrued expenses, operating lease liabilities (current + non-current), unearned/deferred revenue (current + non-current), other liabilities, total liabilities; and full equity components (common stock, APIC, accumulated other comprehensive loss, retained earnings/accumulated deficit, total stockholders' equity). All `klass: "stock"`. As-reported units.
- `docs/sources/sources.md` — Appended ledger entries for each additional document cited.
- `tests/balance.data.test.js` — Dataset tests: cited + in-ledger totality; `assets = liabilities + equity` per balance date; sub-total identities (current assets sum, total liabilities sum, equity components sum); balance-sum fixtures per year.

#### B. Exported Interfaces & Types
- Balance dataset JSON: historical-statement records, `klass: "stock"`, `periodType: "fiscal_year"` (year-ends) and `"quarter"` (latest quarter-end). Frozen P0 schema only.

#### C. Invariants & Automated Quality Gates
- [ ] `assets = liabilities + equity` holds per balance date, asserted from the transcribed component lines (not from a filed "total" alone — totals are transcribed AND recomputed; a mismatch is a transcription error to fix, not a test to weaken).
- [ ] Balance-sum fixtures in `duolingo_facts.js` pin at least: FY2025 total assets, FY2025 total equity, FY2023 total assets.
- [ ] Unearned revenue (current + non-current) present per year — the P2 WC schedule and the bookings→revenue mechanics depend on it.
- [ ] Every row cited + in-ledger; `loadHistorical()` green over the combined income+balance corpus.
- [ ] `npm test` green, 0 flakes × 3 runs.

---

### Task P1.3: Annual Cash Flow Statements FY2021–FY2025 + 10-Q YTD Rows + Discrete Derivation

#### A. Deliverable Files
- `src/data/historical/cashflow.json` — Annual FY2021–FY2025 cash flow statements (operating / investing / financing sections, net change in cash, beginning/ending cash) + the 10-Q **year-to-date** rows for the TTM window transcribed as `periodType: "ytd"` exactly as filed.
- `src/engine/ttm.js` — TTM module: discrete-quarter derivation from consecutive YTD values by differencing; Q4 discrete = FY − 9M YTD; TTM = sum of 4 discrete quarters; `stock` → latest balance date; `kpi` → latest reported value. All outputs labeled `computed`. Pure module (no DOM/fetch/Date.now/Math.random).
- `tests/cashflow.data.test.js` — Dataset tests: cited + in-ledger; annual sections sum (operating + investing + financing + FX effect = net change in cash); YTD rows labeled `ytd` with 10-Q citations.
- `tests/ttm.test.js` — Derivation tests: YTD differencing against hand-computed fixture differences; Q4 derivation; TTM sum; classification rules (`flow`/`stock`/`kpi`); `computed` labeling on every output.

#### B. Exported Interfaces & Types
- `ttm.compute(historical): TtmOutput` — per spec §3.2 signature (FROZEN): accepts the loaded dataset, returns TTM values for `flow` metrics, latest-dated `stock` metrics, latest-reported `kpi` values; every output record carries `isComputed: true` and the derived-from chain.
- Cash flow dataset JSON: `klass: "flow"` records with `periodType: "fiscal_year"` (annuals) and `"ytd"` (10-Q rows). **A YTD row must never be labeled a discrete quarter** — the engine derives discretes; the data layer stays verbatim.

#### C. Invariants & Automated Quality Gates
- [ ] Annual CF identity per year: operating + investing + financing + FX = net change in cash; ending − beginning cash = net change.
- [ ] Every YTD row cites its 10-Q; period labels state the YTD span as filed (e.g. "nine months ended September 30").
- [ ] `ttm.compute` derives discrete quarters that exactly match fixture differences; TTM totals match anchor fixtures (TTM revenue pinned in `duolingo_facts.js` once the window is complete).
- [ ] Engine purity: grep-verifiable — no `fetch`, `Date.now`, `Math.random`, or DOM references in `src/engine/ttm.js`.
- [ ] `npm test` green, 0 flakes × 3 runs.

---

### Task P1.4: KPIs — Annual + Quarterly, Verbatim Definitions, TTM Verification

#### A. Deliverable Files
- `src/data/historical/kpis.json` — DAU, MAU, paid subscribers, bookings, adjusted EBITDA: annual FY2021–FY2025 + quarterly for the TTM window, sourced from IR shareholder letters/press releases (and 10-K where filed). Each KPI record carries `definition` (verbatim from the source — never paraphrased) and `category` per the frozen P0.2 `SCHEMAS.kpi`.
- `docs/sources/sources.md` — Appended ledger entries for every IR release/letter cited.
- `tests/kpis.data.test.js` — Dataset tests: cited + in-ledger; definitions verbatim (fixture compares exact strings for at least DAU + bookings); quarterly continuity (no missing quarter in the TTM window without an explicit gap note); units `count` where applicable.
- `tests/ttm.integration.test.js` — Full-pipeline test: `loadHistorical()` → `ttm.compute()` over the real corpus; TTM revenue matches the income-statement-derived anchor; KPI headline = latest reported value.

#### B. Exported Interfaces & Types
- KPI dataset JSON: records per frozen `SCHEMAS.kpi`: `{ metric, label, klass: "kpi", period, periodType, value, units, scale, definition, category, source, isEstimate: false }`.
- No new engine modules; `ttm.compute` consumes KPIs per its classification contract.

#### C. Invariants & Automated Quality Gates
- [ ] Every KPI definition is verbatim from source; paraphrasing is a rejection condition (the definition IS the metric's contract).
- [ ] Bookings reconciliation note: bookings ≠ revenue; the gap equals the unearned-revenue roll — DS records the roll (ending − beginning unearned revenue per year, from P1.2) in the sub-phase log as a cross-check note (not new data).
- [ ] Adjusted EBITDA is transcribed only where the IR release defines it; the definition string is carried verbatim; no re-derivation in data.
- [ ] `npm test` green, 0 flakes × 3 runs.

---

### Task P1.5: OP Independent Re-Verification Sweep (Quality Gate Sub-Phase)

#### A. Deliverables (OP-owned)
- `docs/logs/op/phase_1.md` — Full re-verification record: every cited URL extracted (grep, not eyeball), diffed both directions against the ledger; every value re-pulled and re-verified against the filing; verification method per source recorded (direct EDGAR re-pull + Bigdata.com independent lane per spec §4.7, pinned filter lanes documented).
- Independent probe scripts in `scratch/` (gitignored): URL/ledger set-diff probe, fixture-echo probe (re-asserts every `KNOWN_FIGURES` anchor against a fresh `loadHistorical()` run).

#### B. Contract
- OP re-verifies 100% of transcribed values independently — not DS's transcript, the filings themselves. Blind approval prohibited (spec §4.5, ledger README §3).
- Bigdata.com lane: same filings via the aggregator pipeline (entity `493F45`, pinned `reporting_periods`/`document_type` filters per sub-phase); discrepancies between lanes resolve in favor of the canonical EDGAR document and are logged.
- Ledger completeness: zero orphan ledger entries; zero in-data URLs missing from the ledger.
- Statement identities re-asserted independently: IS identity, BS balance per year, CF net-change identity, segment sums, unearned-revenue roll vs bookings gap.

#### C. Milestone Gate Criteria
- [ ] 100% re-verification recorded with method per source; any unresolved discrepancy blocks the gate.
- [ ] Test suite green with the full P1 corpus loaded (`loadHistorical()` over income + balance + cashflow + kpis), 0 flakes × 3 runs.
- [ ] Zero magic numbers in new `src/` code (grep gate per P0.3 ruling).
- [ ] No forward-looking value entered as historical anywhere (grep `isEstimate` distribution: historical corpus is 100% `false`).

---

## 4. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] All sub-phase Artifact Contracts (P1.1–P1.5) individually submitted and approved by OP.
- [ ] Full corpus loads through the unmodified P0 pipeline: `loadHistorical()` (with `SOURCE_LEDGER_REQUIRED`) resolves with zero violations across income, balance, cashflow, kpis.
- [ ] Every historical figure in `src/data/historical/*.json` carries a full `source` object whose `url` exists in `docs/sources/sources.md` — mechanically enforced + independently re-verified.
- [ ] Known-figure fixtures pass; statement identities hold per period; balance sheets balance per year-end from components.
- [ ] TTM module verified: YTD→discrete derivation correct, TTM sums match anchors, all `computed`-labeled.
- [ ] 10-Q cash-flow rows are `ytd`-labeled as filed — the transcription-honesty invariant survives contact with real data.
- [ ] KPI definitions verbatim; no derived metric hand-typed as data.
- [ ] Zero estimates in the historical corpus (`isEstimate: false` on 100% of rows).
- [ ] No runtime dependency additions; `npm test` fully offline and green, 0 flakes × 3 runs.
- [ ] App still boots clean headless (stub DOM) with the real corpus — the P0 browser verification stays true with real data.

---

> **Drafting note (OP → DIR)**: This contract was drafted by OP per protocol. The Director approves, amends, or rejects it before DS begins P1.1. The 10-Q accession numbers for the TTM window are pinned by DS at transcription time (per spec §4.1) and recorded in the ledger — the contract fixes the *rules*, the transcription fixes the *documents*.
