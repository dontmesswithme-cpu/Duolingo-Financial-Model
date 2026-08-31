# OP Working Memory (RAM State)

> **Rule**: This file represents the Reviewer's active working memory. It is **overwritten** after every review cycle, audit outcome, or phase boundary transition.

---

## 1. Ground Truth Verification (Incoming Model Handshake)
- **Protocol Version**: 1.0
- **Current Phase**: `P0` Project Setup & Architecture Foundation — 🟡 Active
- **Active Sub-Phase**: `P0.1` Repository Initialization & Base Architecture
- **Consecutive Fail Count**: 0 (OP-owned; on 3, OP triggers circuit breaker and sets status_ds.json to "blocked")
- **Last Verified Test Count**: 3/3 passing (Baseline starter test harness)
- **Last Verified Build**: Clean
- **Queue Status**: Standing by for DS submission `P0.1`

---

## 2. Current Audit State
- **Last Action**: Project initialized. Background watcher standing by for `status_op.json` signal.
- **Immediate Next Action**: Upon watcher wake-up (`status_op.json.seq > baselineSeq`):
  1. Read tail of `docs/inbox_op.md` and assert it terminates with `[END_OF_MESSAGE]`.
  2. Line-by-line audit against `docs/phases/phase_0.md` Artifact Contract and `docs/review_checklist.md`.
  3. Run automated test suite independently to verify green status and test counts.
  4. **If PASS**: Reset `consecutive_fails = 0`, write `REVIEW [PASS]` to `inbox_ds.md`, flip `status_ds.json` to `"worker_active"` (`seq++`), re-arm watcher.
  5. **If FAIL (<3)**: Increment `consecutive_fails`, write `REVIEW [FAIL]` to `inbox_ds.md`, flip `status_ds.json` to `"worker_active"` (`seq++`), re-arm watcher.
  6. **If FAIL (3rd)**: Set `consecutive_fails = 3`, write `ESCALATION [BLOCKED]` to `inbox_ds.md`, update `status.md` to Blocked, flip `status_ds.json` to `"blocked"` (`seq++`), fire webhook, HALT (no watcher).
- **Active Review Queue**: `P0.1`

---

## 3. Quality Gate Priorities
- Verify strict adherence to modular separation of concerns.
- Ensure 0 test flakes and deterministic assertions.
- Verify clean resource disposal contracts on all initialized services.

---

## 4. Carry-Forward Audit Notes
- [None currently open]

---

## 5. End-of-Turn Checklist
- [x] Cold-start reads & signal reconciliation completed (`OPreflection.md`, `OPmemory.md`, `status.md`, `status_op.json` vs `inbox_op.md`, `phases/phase_0.md`)
- [ ] Line-by-line audit against Artifact Contract executed
- [ ] Tests and validation scripts executed independently
- [ ] Review verdict appended to `docs/inbox_ds.md` with `[END_OF_MESSAGE]`
- [ ] Signal updated in `docs/status_ds.json` (`seq++`)
- [ ] Audit logged to `docs/logs/op/phase_0.md`
- [ ] `OPmemory.md` updated and overwritten
- [ ] Background watcher re-armed (if not blocked or milestone complete)
