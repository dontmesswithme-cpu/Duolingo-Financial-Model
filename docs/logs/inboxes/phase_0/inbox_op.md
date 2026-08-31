# Reviewer Inbox (OP Inbox)

> **Channel**: Worker (`DS`) ➔ Reviewer (`OP`)
>
> **Rule**: DS appends sub-phase submissions and resubmissions here. OP's background watcher (`tools/watch_op_inbox.mjs`) monitors this file. Every message MUST end with `[END_OF_MESSAGE]`.

---

### [2026-08-31 15:13] SUBMISSION: P0.1 [Repository Scaffolding & App Entry Skeleton]

**Summary**

Delivered the P0.1 Artifact Contract in full: the zero-build static app entry, the
dependency-injected app controller, the historical loader scaffold, the typed error
hierarchy, and 28 new headless tests. Git repository initialized and all framework
files committed, per spec §7.8.

**Files Delivered**

| File | Status | Purpose |
|---|---|---|
| `index.html` | new | Static entry: inline ESM bootstrap, semantic 8-tab shell, placeholder panes only |
| `src/app.js` | new | `createApp({ data, engine, root, now })` DI factory |
| `src/data/loader.js` | new | `loadHistorical()` discovery + parse scaffold |
| `src/data/errors.js` | new | `DataValidationError`, `EngineError` |
| `tests/app.scaffold.test.js` | new | App interface, AppState shape, tab lifecycle/disposal |
| `tests/scaffold.test.js` | new | 8-tab probes, purity & quality gates, loader error paths |
| `tests/_dom_stub.js` | new | Zero-dependency headless DOM stub (helper, not collected as a test) |

**Contract §B — Exported Interfaces & Types**

- `createApp({ data, engine, root, now }): App` returns exactly
  `{ setDriver(name, value), setScenario(name), state(), dispose() }`; every missing
  dependency throws `EngineError('invalid_dependency', …, <name>)`.
- `setDriver` / `setScenario` throw `EngineError('not_implemented', …, <name>)` —
  signatures frozen for Phase 5.
- `state()` returns a deep-frozen `AppState` with exactly
  `{ assumptions, scenario, schedules, threeStatement, dcf, recommendation, dirty }`;
  defaults `scenario: 'base'`, `dirty: false`, pipeline slots `null`.
- `loadHistorical()` resolves the four datasets and throws `DataValidationError`
  listing **every** offending file (never failing on the first).

**Contract §C — Invariants & Gates (all verified)**

| Gate | Evidence |
|---|---|
| `npm test` exit 0, 0 flakes × 3 runs | 31/31 pass × 3 consecutive runs (3 baseline + 28 new) |
| Git initialized, framework committed | 2 commits: `e841c57` (framework, 36 files), `641763b` (P0.1); tree clean |
| 8 tab anchors in spec §3.4 order | Probe test asserts link order, pane order, and `aria-controls` ↔ pane `id` pairing |
| No `Date.now` in `src/app.js` | Source-scan test (`tests/scaffold.test.js`) |
| Zero runtime dependencies | Gate test asserts `package.json.dependencies === undefined`, `type === 'module'` |
| No bare `Error` throws in `src/` | Source-scan test across all of `src/**/*.js` |

**Deviation Notes — Please Audit Explicitly**

1. **`src/data/errors.js` implemented now, though it is a P0.3 deliverable.** The P0.1
   contract itself mandates that `loader.js` throw `DataValidationError` and `app.js`
   throw `EngineError`, while milestone gate #4 forbids bare `throw new Error()` in
   `src/`. Satisfying P0.1 is impossible without the hierarchy. `ConfigError` and the
   P0.3 error tests remain deferred as contracted.
2. **`loadHistorical()` is `async` (`Promise<HistoricalDataset>`), contract wrote it
   synchronous.** The target runtime is a zero-build browser app where `fetch` is the
   only file-access mechanism, so a sync signature is not implementable. The loader
   never imports `node:fs`; tests inject a `readText` reader, keeping it deterministic.
3. **Discovery uses an explicit manifest, not a directory scan.** A browser cannot
   enumerate directories, so the file list (`income`, `balance`, `cashflow`, `kpis`,
   per spec §3.1) is the single source of truth in both runtimes and is exported as
   `HISTORICAL_DATASETS` for the audit layer.
4. **`src/data/constants.js` deliberately NOT delivered** (P0.3 scope). Module-local
   named constants are used instead and will migrate to `constants.js` in P0.3. No
   bare numeric literals exist under `src/` today, so the P0.3 grep gate starts clean.

**Reproduction for OP**

```
npm test                         # expect 31/31, run 3x for flake check
git log --oneline                # expect framework + p0.1 commits
grep -rn "Date.now" src/         # expect no matches
grep -rn "throw new Error" src/  # expect no matches
```

**Not done (correctly out of scope):** no financial figures transcribed (P1); no
schema/audit engine (P0.2); no source ledger (P0.3); no `ConfigError` (P0.3).

**Next:** P0.2 — Historical Record Schemas & Audit Engine (Accuracy Gate).

[END_OF_MESSAGE]

### [2026-08-31 16:15] SUBMISSION: P0.2 [Historical Record Schemas & Audit Engine (Accuracy Gate)]

**Summary**

Delivered the P0.2 Artifact Contract in full: the record schemas, the
citation/EST audit engine (Accuracy Gate), and the full validation pipeline
wired into `loadHistorical()`. All 58 new tests pass alongside the 31
pre-existing tests (89/89, 0 flakes).

**Files Delivered**

| File | Status | Purpose |
|---|---|---|
| `src/data/schema.js` | new | `SCHEMAS` {historicalStatement, kpi, source}, `validateRecord()` (total), `extractRows()` |
| `src/data/audit.js` | new | `auditDataset(ds, options)` Accuracy Gate with 6 rules + `EST_ROW` flag |
| `src/data/constants.js` | new | `UNITS`, `UNIT_KEYS`, `KLASS_VALUES`, `PERIOD_TYPE_VALUES` |
| `src/data/loader.js` | modified | Upgraded to full pipeline: discovery → parse → `validateRecord` → `auditDataset` |
| `tests/schema.test.js` | new | Schema validation tests: happy path, every field violation, totality |
| `tests/audit.test.js` | new | Audit tests: uncited rejected, cited passes, estimate flagged, DUP_KEY, ledger gate, end-to-end through `loadHistorical()` |

**Contract §B — Exported Interfaces & Types**

- `function validateRecord(rec, schema, [origin]): ValidationResult` — returns `{ ok: boolean, errors: [{ field, message, source? }] }`; never throws for malformed input.
- `const SCHEMAS: { historicalStatement, kpi, source }` — per `docs/spec.md` §3.1.
- `function auditDataset(ds: HistoricalDataset, [options]): AuditReport` — returns `{ ok, violations: [{ metric, period, rule, message }], flags }` with rules `HIST_NO_SOURCE`, `HIST_MARKED_ESTIMATE`, `DUP_KEY`, `BAD_UNITS`, `SOURCE_URL_MISSING`, `SOURCE_NOT_IN_LEDGER`.
- `function loadHistorical([options]): Promise<HistoricalDataset>` — full pipeline; on any violation throws `DataValidationError` naming every offender.

**Contract §C — Invariants & Gates (all verified)**

| Gate | Evidence |
|---|---|
| `npm test` exit 0, 0 flakes × 3 runs | 89/89 pass × 3 consecutive runs (31 prior + 58 new) |
| Accuracy Gate cannot be bypassed | One uncited historical record makes `loadHistorical()` throw `DataValidationError` naming that record |
| Fully-cited fixture passes | `AuditReport.ok === true` with cited fixture dataset |
| `isEstimate === true` rows exempt from source, flagged `EST_ROW` | Tested; flag never affects `ok` verdict |
| Every violation names metric, period, and rule | Source-scan verified; no generic messages |
| `validateRecord` is total | Null/primitive/array/malformed-schema all return errors |

**Deviation Notes — Please Audit Explicitly**

1. **`constants.js` pulled forward from P0.3** for `UNITS` — P0.2's `BAD_UNITS` rule is unimplementable without the canonical unit→scale registry. Same dependency-forced justification OP accepted for `errors.js` in P0.1.
2. **Layering consequence:** because the schema requires `source` whenever `isEstimate === false`, an uncited actual is caught by `validateRecord` and never reaches the audit engine. Via `loadHistorical()` it reports as `SCHEMA_VIOLATION`, not `HIST_NO_SOURCE`. `HIST_NO_SOURCE` remains live as the second line of defence for callers that audit without validating first, and is tested directly. A dedicated end-to-end test proves the audit stage itself is genuinely wired (fully-cited duplicate rows → `DUP_KEY`).
3. **Audit rule semantics** chosen to reconcile two overlapping contract sentences: an estimate row WITH a valid citation passes (only `EST_ROW` flagged); an estimate row WITHOUT any provenance is rejected as `HIST_MARKED_ESTIMATE`, implementing "estimate-without-source rejected as historical".
4. **`SOURCE_NOT_IN_LEDGER` is off by default.** P0.3's `SOURCE_LEDGER_REQUIRED` does not exist yet; the gate is injected via `{ requireLedger, ledger }` exactly as the contract specifies, and fails closed when enforcement is requested with no ledger supplied.
5. **P0.3 grep-gate heads-up:** `src/` contains structural numeric literals that a mechanical "no bare numerics" grep will flag — `links[0]`, `links.length > 0`, `listeners.length = 0`, `violations.length === 0`, `parts.length > 0`, `value > 0`, `index + 1` (1-based row numbering), and the `\d{4}-\d{2}-\d{2}` date regex. None are configuration values. Requesting an OP ruling on gate scope before P0.3.

**Reproduction for OP**

```
npm test                         # expect 89/89, run 3x for flake check
git log --oneline                # expect framework + p0.1 + p0.2 commits
grep -rn "Date.now" src/         # expect no matches
grep -rn "throw new Error" src/  # expect no matches
```

**Not done (correctly out of scope):** no financial figures transcribed (P1); no source ledger (P0.3); no `ConfigError` (P0.3); no `constants.js` beyond `UNITS`/`UNIT_KEYS`/`KLASS_VALUES`/`PERIOD_TYPE_VALUES`.

[END_OF_MESSAGE]

---

### [2026-08-31 18:22] SUBMISSION: P0.3 — Source Ledger, Typed Errors & Config Constants

**Commit**: `226a0e2` (8 files: 4 new, 4 modified).

**Deliverable File Table**:

| File | Status | Contents |
|---|---|---|
| `docs/sources/sources.md` | new | Master ledger: format spec (entity, form, period, filed, url, accessedAt, metrics — spec §4), entry template, worked example LED-001 (Duolingo EDGAR entity-page anchor, CIK 0001562088). No figures (P0 scope). |
| `docs/sources/README.md` | new | Usage rules (append-only LED ids; entry at transcription time; accessedAt semantics) + OP cross-check protocol (URL-set diff, independent re-pull, method logging). |
| `src/data/errors.js` | modified | `ConfigError` added: `name`, `message`, optional `key`, `toJSON()` → `JSON.stringify(err)` carries the payload. |
| `src/data/constants.js` | modified | Completed per contract: `SCENARIO_NAMES` (`bear\|base\|bull`), `DEFAULT_SCENARIO`, `EST_BADGE_LABEL`, `FISCAL_CALENDAR_NOTES`, `SOURCE_LEDGER_REQUIRED` (true); plus migrated config values `HISTORICAL_DIR`, `HISTORICAL_DATASETS`. |
| `src/app.js` | modified | Consumes `DEFAULT_SCENARIO` from constants.js (P0.1 fix-forward closed). |
| `src/data/loader.js` | modified | Imports `HISTORICAL_DIR`/`HISTORICAL_DATASETS` from constants.js; re-exports unchanged, no consumer surface change. |
| `tests/errors.test.js` | new | Hierarchy tests: instanceof chains, names, `code`/`driverName`/`key` payloads, `JSON.stringify` round-trips, sibling-not-subclass. |
| `tests/constants.test.js` | new | Integrity tests: units↔schema enum parity (both directions), scenario names per spec, app boots on `DEFAULT_SCENARIO`, manifest bijectivity (loader ↔ SCHEMAS), freeze integrity, config-values grep gate. |

**Test Suite**: `npm test` × 3 consecutive runs → **118/118 pass, 0 flakes**
(89 prior + 29 new). Zero new devDependencies (`package.json` untouched).

**Contract Gates Verified**:
1. Ledger format includes all `docs/spec.md` §4 fields; worked EDGAR example cites no figures.
2. Error classes serialize cleanly — `JSON.stringify(err)` includes code + records (+ `key`).
3. Units map covers all schema units; scenario names match spec; every registry value frozen.
4. Config-values grep gate (per your binding Deviation 5 ruling): `src/**/*.js` scanned
   with comments stripped — no URL fragments, no `src/data/` path literals, no hardcoded
   `bear`/`bull` outside `constants.js`. Implemented as a **live test**, not a one-off.
5. No bare `Error` throws, no `Date.now`, no `Math.random` under `src/` (prior gates re-verified).

**Scoping decisions under your Deviation 5 ruling (please audit)**:
- Migrated as genuine configuration values: `DEFAULT_SCENARIO`, `HISTORICAL_DIR`,
  `HISTORICAL_DATASETS`.
- Not migrated, with rationale: loader-local rule-id strings (`FILE_UNREADABLE`,
  `SCHEMA_VIOLATION`, …) are single-module, never reused across modules; app.js tab
  selector/attribute names are DOM wiring local to that module; audit.js rule ids are
  already exported from their owning module.
- `ConfigError` constructor shape was not frozen by the contract; chose
  `new ConfigError(message, key?)` mirroring the family's minimal-payload style.

**Known state**: `SOURCE_LEDGER_REQUIRED` is exported but not yet consumed by the
app bootstrap (wiring `requireLedger: SOURCE_LEDGER_REQUIRED` at the app's load
call site lands with P1, when real data first flows; the injection path is tested
end-to-end from P0.2). Flagged for OP ruling if it should be wired earlier.

[END_OF_MESSAGE]

