# OP Working Memory (RAM State)

> **Rule**: This file represents the Reviewer's active working memory. It is **overwritten** after every review cycle, audit outcome, or phase boundary transition.

---

## 1. Ground Truth Verification (Incoming Model Handshake)
- **Protocol Version**: 1.0
- **Current Phase**: `P1` Historical Data: Full 3-Statement Actuals FY2021–FY2025 + TTM — 🟡 Active
- **Active Sub-Phase**: `P1.5` (OP Independent Re-Verification Sweep — OP-owned; DS HALTED, no watcher re-arm)
- **Consecutive Fail Count**: 0 (reset at P1.4 Resubmission 2 PASS)
- **Last Verified Test Count**: 224/224 passing (frozen state confirmed on resubmission 2)
- **Last Verified Build**: Clean
- **Queue Status**: P1.4 RESUBMISSION 2 PASSED [2026-09-02 01:20]. `status_ds.json` → `worker_active` (seq 7, P1.5). NO watcher armed — P1.5 is OP-owned. OP now executes the sweep; then either GATE PASS (status_ds → completed, archive, HALT) or P1.5 FAIL (worker_active, seq++, re-arm).

---

## 2. Current Audit State
- **Last Action**: REVIEW: P1.4 (Resubmission 2) [PASS ✅] issued [2026-09-02 01:20].
  - Log-only fix verified 3 ways: invented numbers absent (0 grep hits);
    frozen files untouched (224/224; MAU/defs byte-identical); claims match
    shipped state. Recon now: gaps 122,826/123,206/90,813/58,296, rolls
    123,321/123,692/91,642/59,283, residuals 495/486/829/987.
  - Circuit breaker stood down (was 2/3).
- **P1.5 SWEEP PLAN (execute NOW, per phase_1.md §P1.5 contract + ledger README §3):**
  1. URL/ledger set-diff BOTH directions over the full corpus (grep, not eyeball)
     — zero orphans beyond LED-001, zero uncited.
  2. **100% value re-verification** — I have already column-pinned ALL 630 rows
     across the sub-phase audits (P1.1: 162/162; P1.2: 159/159; P1.3: 257/257;
     P1.4: 52/52 after MAU fix + per-doc defs 52/52). Re-run all four probes once
     more against the CURRENT files to confirm frozen state == verified state,
     and record the consolidated sweep in docs/logs/op/phase_1.md.
  3. Statement identities re-asserted independently (IS identity, BS balance per
     year from components, CF net-change identity, segment sums, unearned-revenue
     roll vs bookings gap residuals 495/486/829/987).
  4. Bigdata.com lane spot-checks recorded (P1.1 10-K + Q2 FY2026 done; one more:
     FY2023 10-K via pinned lane).
  5. Grep gates: zero magic numbers in new src/ (ttm.js clean); isEstimate 100%
     false across all 4 datasets; test suite ×3 (224/224).
  6. Probe scripts: URL/ledger set-diff probe + fixture-echo probe (re-assert
     every KNOWN_FIGURES / BALANCE / CASHFLOW / KPI anchor vs fresh loadHistorical
     run) in scratch/ — both recorded.
  7. If ALL clean: GATE PASS: Phase 1 → inbox_ds.md + logs; status.md (P1 🟢 tag
     v1.0-P1, P2 🟡); status_ds.json → completed (seq 8); run `node tools
     archive_phase.mjs phase_1`; OPmemory overwrite; HALT.
  8. If ANY defect: P1.5 FAIL (worker_active seq 8), re-arm watcher, fixes to DS.

---

## 3. Quality Gate Priorities (P1 continuation)
- OP cross-check protocol (ledger README §3) BINDING at every P1 data sub-phase — never blind-approve.
- Probe suite for P1.1 preserved (gitignored, `scratch/`): `op_probe_p1_1.mjs` (set-diff/identities), `op_probe_p1_4.mjs` (column-pinned value check), `op_debug_tables*.mjs` (layout mapping), cached filing HTML + submissions API json.
- Known table layouts (reuse): FY2025 10-K — IS = table 29, disagg main = 38, companion = 39, **BS likely = table 28** ("December 31, 2025 / 2024" header, ASSETS row); FY2023 10-K — IS = table 27, disagg = 34. 10-Qs — IS = table 13, disagg = 20 (Q2 FY2026) / 19 (Q1 FY2026) / 21-22 (Q3 FY2025). MD&A tables carry % Change / Constant Currency columns — exclude; %-of-revenue tables have "100 %" cells — exclude.
- Filing label variants seen: "Income (loss) from operations", "(Benefit from) provision for income taxes", "IAPs" vs "In-App Purchases", footnote markers "(1)(2)", `$` interleaved between columns (numeric-sequence extraction, not raw cell index).
- Ledger: 6 entries (LED-001 index + LED-002…006). P1.2 will need ledger appends only if new documents cited (BS data lives in already-ledgered filings — expect zero new entries, verify).

---

## 4. Carry-Forward Audit Notes (binding into P1.2+)
- P0.3 wiring obligation (`requireLedger` at production call site) — **CLOSED** (P1.1).
- Orphaned JSDoc cosmetic — **CLOSED** (P1.1).
- DSreflection starter examples — still owed by DS (non-blocking; collect at next FAIL or phase boundary).
- Ruling on record: P1.1 contract's "four quarters from 10-Q three-month columns" is
  amended-by-ruling to the 3 quarters actually filed discretely; Q4 FY2025 = computed
  in P1.3 (spec §4.4 governs over contract phrasing).
- GROWTH_FIXTURE pattern (derived fixtures computed from cited anchors, never hand-typed)
  is the accepted standard for all future derived fixtures.
- Bigdata aggregator lane can carry OCR/typo noise (Q2 FY2025 cost "49,684" vs EDGAR
  69,684) — always resolve to canonical EDGAR and log the discrepancy.
- `tests/_ledger.js` underscore-prefix convention = helper not test — reuse pattern OK.

---

## 5. End-of-Turn Checklist
- [x] Watcher fired on P1.4 resubmission (seq 6); integrity assertion passed
- [x] MAU fix, per-doc definitions, per-doc fixtures, 224/224 ×3 — all verified CORRECT & frozen
- [x] Reconciliation-note defect confirmed (2nd consecutive) — FAIL-2 issued, scope narrowed to log-only fix
- [x] FAIL verdict appended to `docs/inbox_ds.md` with `[END_OF_MESSAGE]`
- [x] Signal updated: `status_ds.json` → `worker_active`, seq 6
- [x] Audit logged to `docs/logs/op/phase_1.md`
- [x] `OPmemory.md` overwritten (consecutive_fails: 2 — breaker armed)
- [x] Watcher re-armed: `node tools/watch_op_inbox.mjs` (baseline seq 6)
- **P0 Audit Trail** (all verification methods recorded per checklist §C):
  - P0.1: 31/31 × 3; independent DOM-stub probes (interface/frozen state/disposal/loader) — PASS.
  - P0.2: 89/89 × 3; adversarial probes (totality, estimate semantics, UNITS matrix,
    cross-dataset DUP_KEY, buried uncited row, ledger fail-closed) — PASS.
  - P0.3: 118/118 × 3; ledger machine-parse probe, ConfigError/constants probes,
    **real headless-browser verification** (0 console/page errors, 8 tabs wired) — PASS.
  - OP probes preserved (gitignored, `scratch/`): `op_probe_p0_1.mjs`, `op_probe_p0_2.mjs`,
    `op_probe_p0_3.mjs`, `op_probe_p0_3_browser.mjs`. Methods recorded in
    `docs/logs/op/phase_0.md`.

---

## 3. Quality Gate Priorities (P1 — Historical Data, the Accuracy Gate's first real use)
- **OP cross-check protocol now BINDING** (`docs/sources/README.md` §3): at every P1 data
  sub-phase, OP must grep-extract every `source.url` from dataset JSON, diff against the
  ledger URL set (both directions — orphan ledger entries flagged too), independently
  **re-pull each cited EDGAR/IR source and re-verify every value, unit, and period**,
  and record the method in `docs/logs/op/phase_1.md` before any verdict. Blind approval
  prohibited (spec §4.5).
- Known-figure fixtures (`tests/fixtures/duolingo_facts.js`) — forged-number rejection gate.
- Spec §4.1 pins 10-K accessions: 0001628280-26-012494 (FY2025), 0001562088-25-000042 (FY2024),
  0001562088-24-000050 (FY2023), 0001562088-23-000052 (FY2022), 0001562088-22-000039 (FY2021).
- Statement identity checks (revenue − CoR = gross profit; BS balances per year-end).

---

## 4. Carry-Forward Audit Notes (binding into P1+)
- **P1 wiring obligation (DS)**: wire `requireLedger: SOURCE_LEDGER_REQUIRED` at the app's
  load call site in P1's first data sub-phase (P0.3 ruling). Verify in the first P1 audit.
- Cosmetics owed by DS (non-blocking, collect opportunistically): orphaned JSDoc block at
  `src/app.js:50-54`; starter example learnings still in `DSreflection.md` (DS self-noted).
- Binding rulings on record: async `loadHistorical()` signature FROZEN; `HISTORICAL_DATASETS`
  manifest canonical; grep-gate scope = configuration values only (structural literals exempt).
- `tools/archive_phase.mjs` had a pre-existing framework syntax bug (unescaped backticks in
  template literals) — fixed by OP during Gate Pass (commit `bb486a9`). If a Phase 1
  archiver run misbehaves, check for the same pattern.
- `docs/logs/ds/phase_0.md` final DS log ends at P0.2 entry (P0.3 entry pending DS wake;
  archived signals already moved to P1). Historical record; no action.

---

## 5. End-of-Turn Checklist
- [x] Cold-start reads & signal reconciliation completed (session start)
- [x] Line-by-line audit against Artifact Contract executed (P0.1, P0.2, P0.3)
- [x] Tests and validation scripts executed independently (118/118 × 3; probes ALL PASS incl. real browser)
- [x] Review verdict appended to `docs/inbox_ds.md` with `[END_OF_MESSAGE]` (P0.3 PASS + GATE PASS)
- [x] Signal updated in `docs/status_ds.json` (seq 3, `completed`)
- [x] Audit logged to `docs/logs/op/phase_0.md` (P0.3 + Gate Pass entries)
- [x] `OPmemory.md` updated and overwritten
- [x] `status.md` updated (P0 Done, P1 Active)
- [x] Archiver executed: inboxes archived, commit `bb486a9`, tag `v1.0-P0`, signals reset to P1.1
- [x] **HALT — Phase 0 closed. No watcher re-armed. Awaiting Director Phase 1 initiation.**
