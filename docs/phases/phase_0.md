# Phase 0: Foundation — Test Harness, Data Schema & Audit Layer

> **Milestone**: Phase 0 — Foundation: Test Harness, Data Schema & Audit Layer
> **Protocol**: 1.0
> **Status**: 🟡 Active
> **Owner**: Drafted & Audited by Reviewer (`OP`), Implemented by Worker (`DS`)
> **Objective**: Establish the repository layout, deterministic test harness, historical data schemas, the citation/EST audit engine (the Accuracy Gate), the source ledger structure, and the typed error hierarchy — before ANY financial data is transcribed. The audit layer must be enforced from day one so no uncited number can ever enter the repository.

---

## 1. Milestone Objective & Scope

Phase 0 builds the skeleton every later phase depends on: the schema definitions that every historical record must satisfy (including mandatory `source` when `isEstimate === false`), the audit engine that refuses to load uncited data, the source ledger format that anchors every citation, the loader with fail-fast validation, and the typed error hierarchy. It also establishes the zero-dependency static app scaffold (`index.html` + `src/` module skeleton) and keeps the starter test harness green. No financial figures are transcribed in this phase (that is P1) — only the machinery that will enforce their accuracy.

---

## 2. Prerequisites & Dependencies

- **Completed Prior Phases**: None (project root).
- **External Dependencies / Manifests**: Node.js >= 20 (tooling only); zero runtime dependencies; `package.json` scripts `test`, `watch:ds`, `watch:op`, `archive:phase` already present from framework import (verified green: 3/3 baseline tests).
- **Reference Documents**: `docs/spec.md` (§3.1 Data Layer, §4 Data Sourcing & Verification Protocol), `docs/conventions.md`, `docs/review_checklist.md`.

---

## 3. Sub-Phase Artifact Contracts

### Task P0.1: Repository Scaffolding & App Entry Skeleton

#### A. Deliverable Files
- `index.html` — Static app entry (zero build step, ESM module script tag, semantic 8-tab layout shell: Cover & TOC, Assumptions/Drivers, Historicals, Supporting Schedules, Projections (3-Statement), Valuation, Summary/Output, Sensitivity/Scenarios — placeholder panes only, no data rendering in P0).
- `src/app.js` — `createApp({ data, engine, root, now })` DI-constructor scaffold exporting the App interface (state wiring deferred to P5; this sub-phase delivers constructor, `state()`, and `dispose()` with listener cleanup).
- `src/data/loader.js` — `loadHistorical()` scaffold (schema validation wired in P0.2/P0.3; here: file discovery + JSON parse with typed errors).
- `tests/app.scaffold.test.js` — Constructor/dispose unit tests (headless, no browser: operate on the module with injected stubs).
- Git repository initialized (`git init` + initial commit of framework files) — required by spec §7.8 for Cover-tab version display and Gate Pass tagging.
- `docs/status_op.json` & `docs/status_ds.json` — (already present, verified) directional FSM signals.

#### B. Exported Interfaces & Types
- `function createApp({ data, engine, root, now }): App` — dependency-injected app factory; returns `{ setDriver(name, value): void, setScenario(name): void, state(): AppState, dispose(): void }` (setDriver/setScenario throw `EngineError("not_implemented", ...)` in P0.1 scaffold; signatures frozen now).
- `interface AppState` — `{ assumptions, scenario, schedules, threeStatement, dcf, recommendation, dirty }` (frozen snapshot via `Object.freeze` deep).
- `function loadHistorical(): HistoricalDataset` — scaffold reading `src/data/historical/*.json`; throws `DataValidationError` on parse failure listing offending file + record.

#### C. Invariants & Automated Quality Gates
- [ ] `npm test` returns exit code 0 with all baseline + new tests (0 flakes across 3 consecutive runs).
- [ ] Git repository initialized with framework files committed; `git log` shows the initial commit.
- [ ] `index.html` contains all 8 tab navigation anchors matching spec §3.4 tab structure (probe test asserts presence and ordering; no data rendering).
- [ ] `createApp` accepts injected `now` — no `Date.now` call inside `src/app.js` (grep-verifiable invariant).
- [ ] Zero runtime dependencies in `package.json` (devDependencies for tooling only).

---

### Task P0.2: Historical Record Schemas & Audit Engine (Accuracy Gate)

#### A. Deliverable Files
- `src/data/schema.js` — Record schemas + validators for historical statement rows, KPI records, and source citations.
- `src/data/audit.js` — Dataset audit engine enforcing the citation + EST invariants.
- `tests/schema.test.js` — Schema validation tests: valid record accepted; every field-violation case rejected with precise error messages.
- `tests/audit.test.js` — Audit tests: uncited historical rejected; cited accepted; estimate-without-source rejected as historical; duplicate keys detected; report shape verified.

#### B. Exported Interfaces & Types
- `function validateRecord(rec, schema): ValidationResult` — returns `{ ok: boolean, errors: [{ field, message, source? }] }`; never throws for malformed input (returns errors).
- `const SCHEMAS: { historicalStatement, kpi, source }` — schema objects per `docs/spec.md` §3.1 (metric, label, klass: flow|stock|kpi, period, periodType: fiscal_year|quarter|ytd, value, units, scale, source{filing, period, statement, url, accessedAt}, isEstimate; KPI adds definition + category).
- `function auditDataset(ds: HistoricalDataset): AuditReport` — returns `{ ok, violations: [{ metric, period, rule, message }] }` with rules: `HIST_NO_SOURCE`, `HIST_MARKED_ESTIMATE`, `DUP_KEY`, `BAD_UNITS`, `SOURCE_URL_MISSING`, `SOURCE_NOT_IN_LEDGER`.
- `function loadHistorical(): HistoricalDataset` — now full implementation: file discovery → parse → per-record `validateRecord` → `auditDataset`; on any violation throws `DataValidationError` whose message lists EVERY offending record (metric + period + rule). The app refuses to run on uncited data.

#### C. Invariants & Automated Quality Gates
- [ ] A dataset with a single uncited historical record causes `loadHistorical()` to throw `DataValidationError` naming that record (test proves the Accuracy Gate cannot be bypassed).
- [ ] A fully-cited valid dataset passes with `AuditReport.ok === true` (fixture dataset in tests).
- [ ] `isEstimate === true` records are exempt from the source requirement but flagged separately in report as `EST_ROW` (informational, not violation).
- [ ] Error messages include metric name, period, and violated rule for every violation (no generic "invalid record" messages).
- [ ] 0 linter warnings; all exports typed via JSDoc `@typedef` comments; 100% deterministic tests.

---

### Task P0.3: Source Ledger, Typed Errors & Config Constants

#### A. Deliverable Files
- `docs/sources/sources.md` — Master source ledger established with format specification and entry template (one worked example entry using Duolingo, Inc. EDGAR entity page URL as the canonical anchor; NO financial figures transcribed in P0).
- `docs/sources/README.md` — Ledger usage rules: every `source.url` appearing in `src/data/historical/*.json` must have a corresponding ledger entry; OP cross-check protocol.
- `src/data/errors.js` — Typed error hierarchy: `DataValidationError` (records[]), `EngineError` (code, driverName?), `ConfigError`.
- `src/data/constants.js` — Project constants: fiscal calendar notes, units map (`thousands_usd`, `millions_usd`, `usd`, `count`), EST badge label, scenario names; zero magic numbers elsewhere.
- `tests/errors.test.js` — Error hierarchy tests: instanceof chains, `name`, `code`, serialized `records` payload.
- `tests/constants.test.js` — Constants integrity: units map covers all schema units; scenario names match spec (`bear|base|bull`).

#### B. Exported Interfaces & Types
- `class DataValidationError extends Error` — `constructor(message, records: ViolationRecord[])`; exposes `.records`.
- `class EngineError extends Error` — `constructor(code: string, message: string, driverName?: string)`; exposes `.code`, `.driverName`.
- `const UNITS` — `{ thousands_usd: { scale: 1000, label: "$ thousands" }, millions_usd: { scale: 1_000_000, label: "$ millions" }, usd: { scale: 1, label: "$" }, count: { scale: 1, label: "" } }`.
- `const SOURCE_LEDGER_REQUIRED` (true) — flag consumed by `audit.js` (P0.2) via dependency injection so audit can be tested against a ledger-free mode explicitly.

#### C. Invariants & Automated Quality Gates
- [ ] Ledger format specification includes all fields defined in `docs/spec.md` §4.2 (entity, form type, period, filing date, URL, accessedAt, metrics taken).
- [ ] Every constant value used in `src/data/` and `src/engine/` (when created) originates from `constants.js` — no inline magic numbers (grep gate: `src/**/*.js` contains no bare numeric literals outside `constants.js`, `tests/`, and documented scale factors).
- [ ] Error classes serialize cleanly to JSON (`JSON.stringify(err)` includes code + records) for deterministic test assertions.
- [ ] `npm test` green; watcher scripts unaffected; 0 new devDependencies.

---

## 4. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] All sub-phase Artifact Contracts (P0.1, P0.2, P0.3) individually submitted and approved by `OP`.
- [ ] Full test suite green with 0 flaky tests across 3 consecutive runs (`npm test` × 3).
- [ ] The Accuracy Gate demonstrably enforced: a test proving uncited historical data throws with named violations, and cited fixture data passes.
- [ ] Typed error hierarchy in place and used consistently (no bare `throw new Error()` in `src/`).
- [ ] Zero magic numbers in `src/` (all in `constants.js`); zero hardcoded URLs outside `docs/sources/` and the worked ledger example.
- [ ] App scaffold opens clean (no console errors) with all 8 tab placeholders wired to module boundaries per `docs/spec.md` §2 module table.
- [ ] Git repository initialized; Gate Pass archiver will produce `WORKFLOW_GIT_TAG_PREFIX` tags on milestone completion.
- [ ] No financial figures transcribed yet (P1 scope) — Phase 0 delivers machinery only.
