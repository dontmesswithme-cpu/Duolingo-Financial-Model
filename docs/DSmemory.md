# DS Working Memory (RAM State)

> **Rule**: This file represents the Worker's active working memory. It is
> **overwritten** after every sub-phase completion, review feedback receipt, or
> session transition.

---

## 1. Ground Truth Verification (Incoming Model Handshake)
- **Protocol Version**: 1.0
- **Current Phase**: `P1` Historical Data — ACTIVE (Gate Passed on P0: 2026-08-31, tag `v1.0-P0`)
- **Active Sub-Phase**: `P1.5` Quality Gate Sweep — **STANDBY** (OP Executing Independent Sweep)
- **Verified Test Count**: 224/224 passing, 0 flakes × 3 runs (118 P0 baseline + 24 P1.1 + 30 P1.2 + 16 cashflow data + 11 TTM engine/purity + 16 KPI data + 6 TTM integration + 3 Project/harness)
- **Last Review / Gate**: REVIEW: P1.4 (Resubmission 2) [PASS ✅] 2026-09-02 01:20 (Consecutive fails reset to 0)

---

## 2. Current Execution State
- **Last Action** (2026-09-02 01:20): P1.4 APPROVED by OP. Consecutive fails reset to 0. All 4 statements frozen and verified.
- **Current Sub-Phase**: `P1.5` OP Independent Re-Verification Sweep (Quality Gate).
- **DS Status**: STANDING BY. Watcher not armed per OP protocol instructions.
- **Immediate Next Action**: Wait for OP to complete the P1.5 Quality Gate Sweep. On Gate Pass, proceed to Phase 1 archive and Phase 2 (Projections & Modeling).
- **Current Blockers**: none.

---

## 3. The Corpus DS Has Transcribed (P1.1 + P1.2 + P1.3 + P1.4 - Full 4 Statements FROZEN & VERIFIED)
- `src/data/historical/income.json` — 162 rows (column-pinned verbatim 162/162).
- `src/data/historical/balance.json` — 159 rows (column-pinned verbatim 159/159, 6/6 TLE, 0 convertible, 42 identities hold).
- `src/data/historical/cashflow.json` — 257 rows (column-pinned verbatim 257/257, 11 periods, O+I+F identities hold 100%).
- `src/data/historical/kpis.json` — 52 rows (column-pinned verbatim 52/52, 5 FYs + 4 TTM quarters + 9M YTD, per-document verbatim definitions for DAU, MAU, Paid subs, Bookings, Adjusted EBITDA, filed MAU figures).
- `src/engine/ttm.js` — pure module (discrete derivation via YTD differencing, Q4 FY2025 derived, TTM 4-quarter sum, stock/kpi resolution, isComputed labeling, derivedFrom tracking).
- Total Historical Records: **630 records** across full 4-statement corpus. Zero audit violations.
- Fixtures: `KNOWN_FIGURES` 10 + `BALANCE_KNOWN_FIGURES` 6 + `CASHFLOW_KNOWN_FIGURES` 7 + `KPI_KNOWN_FIGURES` 9 + `ALL_DATA_FIXTURES` 32; `GROWTH_FIXTURE` derived; `KPI_PER_DOC_DEFINITIONS` verbatim per filing.
- Tests: 224/224 (118 P0 + 24 P1.1 + 30 P1.2 + 16 cashflow data + 11 TTM engine/purity + 16 KPI data + 6 TTM integration + Project harness).

## 3b. Citation Map (documents DS has actually read)
| LED | Document | Accession | Filed | Read for |
|---|---|---|---|---|
| LED-002 | FY2025 10-K | 0001628280-26-012494 | 2026-02-27 | FY2025, FY2024, FY2023 (IS, BS, CF, KPIs) + Q4 FY2025 KPIs |
| LED-003 | FY2023 10-K | 0001562088-24-000050 | 2024-02-29 | FY2022, FY2021 (IS, BS, CF, KPIs) + FY2023 CF & KPIs |
| LED-004 | Q3 FY2025 10-Q | 0001628280-25-049743 | 2025-11-06 | Q3 FY2025 (IS, KPIs) + 9M FY2025/9M FY2024 CF & KPIs |
| LED-005 | Q1 FY2026 10-Q | 0001628280-26-029976 | 2026-05-05 | Q1 FY2026 (IS, KPIs) + 3M FY2026/3M FY2025 CF & KPIs |
| LED-006 | Q2 FY2026 10-Q | 0001628280-26-053603 | 2026-08-06 | Q2 FY2026 (IS, BS, KPIs) + 6M FY2026/6M FY2025 CF & KPIs |
| LED-007 | FY2021 10-K | 0001562088-22-000039 | 2022-03-04 | FY2021 (BS Dec 31, 2021, KPIs) |

All `accessedAt: 2026-09-01`.

---

## 4. Open Items Raised to OP / DIR
**P1.1 (ACCEPTED):** Q4 not transcribed; empty scaffolding; FY2021 income from FY2023; LED-001 orphan.
**P1.2 (ACCEPTED):** FY2021 balance from FY2021 10-K; filing-specific presentation; common stock aggregated; single deferred line; LED-001 sole orphan; phantom fixes verified.
**P1.3 (ACCEPTED):** Top-line Net Income named `cf_net_income`; earn-out classification difference between 10-K (financing) and Q3 10-Q (investing); YTD honesty preserved with discrete differencing exclusively in `src/engine/ttm.js`.
**P1.4 (ACCEPTED):** Sourcing MD&A-first disclosed; exact filed MAU (133.1M FY2025 / Q4 FY2025, 116.7M FY2024); per-document verbatim definitions (52/52 rows); honest dataset reconciliation arithmetic: FY2025 (gap 122,826 / roll 123,321 / res 495), FY2024 (gap 123,206 / roll 123,692 / res 486), FY2023 (gap 90,813 / roll 91,642 / res 829), FY2022 (gap 58,296 / roll 59,283 / res 987).

---

## 5. Binding Carry-Forwards
- `requireLedger: SOURCE_LEDGER_REQUIRED` wired at `bootApp()` over complete 4-dataset corpus.
- P1 transcription rules: every row cited; ledger append-only; 10-Q CF & KPI spans as `ytd`; balance `klass: stock`; engagement KPIs `klass: kpi`; bookings/EBITDA `klass: flow`; TTM/Q4 computed; column-pinned verbatim re-check for all probes.
- `loadHistorical()` async signature FROZEN; `HISTORICAL_DATASETS` manifest canonical; App interface frozen to 4 members.
- `findInMap` must be row-start anchored, longest-key wins, dash terminates, hyphen/apostrophe normalized; verbatim must be column-pinned.

---

## 6. End-of-Turn Checklist (P1.4 Approved / P1.5 Standby)
- [x] P1.4 passed review with 0 consecutive fails
- [x] Full historical corpus (630 records) verified and frozen
- [x] Test suite passing 224/224 with 0 flakes × 3 runs
- [x] This file updated
- [x] Standing by for OP's P1.5 Independent Re-Verification Quality Gate Sweep
