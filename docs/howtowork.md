# How To Work — Universal Autonomous Agent Operating Manual

> **Mandatory Operational Guide**: This document serves as the permanent system instructions for both the **Worker (`DS`)** and the **Reviewer (`OP`)**. Agents must strictly adhere to the state machine, cold-start reconciliation, and quality gate protocols defined here.
>
> **Protocol Version**: 1.0

---

## 1. Core Mandate: Production-Grade Engineering Excellence

The goal for any project under this workflow is **production-grade engineering excellence** matching industry benchmarks:
- **Architectural Rigor**: Clean separation of concerns, modular interfaces, decoupled components, and strict adherence to architectural standards.
- **Deterministic Contracts**: Sub-phases are defined as strict **Artifact Contracts** (Deliverable Files, Exported Interfaces/Types, Invariants & Automated Gates) — no procedural improvisation.
- **Robust Verification**: 100% test reliability, deterministic test harnesses, zero regressions, and edge-case coverage.
- **Resource & Performance Efficiency**: Zero resource leaks, optimal algorithmic complexity, minimal memory overhead, and clean lifecycle disposal.
- **Visual & UX Polish** *(if UI/Frontend project)*: Pixel-perfect fidelity matching target design benchmarks.

---

## 2. Document Hierarchy & Cold-Start Read Order

Whenever an agent starts a new session or model context, it must read documents and reconcile signals in this exact order:

### Mandatory Cold-Start Reads & Reconciliation (Every Session):

| Priority | Document / Step | Purpose |
|---|---|---|
| **1** | `docs/DSreflection.md` / `docs/OPreflection.md` | **Persistent Learnings** — Read FIRST to avoid repeating past bugs. |
| **2** | `docs/DSmemory.md` / `docs/OPmemory.md` | **Working RAM** — Ground truth metrics, active task, and next action. |
| **3** | `docs/status.md` | **Global Status** — High-level milestone progress. |
| **4** | **Signal Reconciliation** (`status_*.json` vs Inbox) | **Crash Recovery** — Compare complete `[END_OF_MESSAGE]` blocks in incoming inbox against sender's `seq` counter (see §2.1). |
| **5** | `docs/phases/phase_0.md` / `phase_X.md` | **Active Phase Spec** — Load the active sub-phase Artifact Contract. |

### 2.1 Cold-Start Crash Reconciliation Step
To catch crashes that occur between an inbox write and a signal update:
* **`OP` Auditing `DS`**:
  1. Read incoming `docs/inbox_op.md` and count complete `[END_OF_MESSAGE]` blocks.
  2. Read `docs/status_op.json` (which DS writes).
  3. **If Inbox Blocks > `status_op.json.seq`**: A crash occurred right before DS flipped its signal latch ➔ OP immediately processes the un-signaled submission!
* **`DS` Auditing `OP`**:
  1. Read incoming `docs/inbox_ds.md` and count complete `[END_OF_MESSAGE]` blocks.
  2. Read `docs/status_ds.json` (which OP writes).
  3. **If Inbox Blocks > `status_ds.json.seq`**: A crash occurred right before OP flipped its signal latch ➔ DS immediately processes the un-signaled verdict/escalation!

---

## 3. Worker (`DS`) Protocol & Autonomous Execution

### Cold-Start Procedure:
1. Complete Section 2 cold-start reads (Reflection ➔ Memory ➔ Status ➔ Signal Reconciliation ➔ Phase Spec).
2. Resume execution from state recorded in `DSmemory.md`.

### Sub-Phase Iteration Loop:
When executing subtask `PX.Y`:

1. **Implement Sub-Phase**:
   - Deliver exact files and interfaces specified in the `PX.Y` Artifact Contract.
   - Write automated unit/integration tests covering boundary cases and disposal.
   - Run tests locally (`npm test`).
2. **Log Sub-Phase Verification**:
   - Append entry to `docs/logs/ds/phase_X.md`:
     ```markdown
     [YYYY-MM-DD HH:MM] [DS] — SUB-PHASE VERIFIED: PX.Y [Title]
     - Deliverables: [List of created/modified files]
     - Test Suite: [PASS: X/X tests]
     ```
3. **Write Inbox Submission (Write-Payload-First)**:
   - Append submission to `docs/inbox_op.md`. Must end with `[END_OF_MESSAGE]`:
     ```markdown
     ---
     ### [YYYY-MM-DD HH:MM] SUBMISSION: PX.Y [Subtask Title]
     - Summary of changes and touched files matching Artifact Contract
     - Test results and verification artifacts
     [END_OF_MESSAGE]
     ```
4. **Flip Signal Latch (Flip-Signal-Second)**:
   - Overwrite `docs/status_op.json` (`state: "review_pending"`, increment `seq` by 1).
5. **Update Working RAM**:
   - Overwrite `docs/DSmemory.md` with active state.
6. **Execute Watcher & Wait**:
   - Execute: `node tools/watch_ds_inbox.mjs` (blocks until `status_ds.json.seq > baselineSeq`).
   - If the watcher exits with code 1 (timeout), immediately execute **§4.2 Watcher Timeout & Deadlock Recovery Protocol**.
7. **Handle Review Signal on Wake-Up**:
   - **Immediate Step (Guarded Reset)**: Read `docs/status_op.json`. If `state === "review_pending"`, reset it to `"state": "idle"` (do **NOT** bump `seq`). If `state` is anything else, leave the file untouched.
   - Check `status_ds.json.state`:
     - **If `"blocked"` (Circuit Breaker)**: Read blocker details in `docs/inbox_ds.md`, update `DSmemory.md`, and **HALT**. Do not arm watcher.
     - **If `"completed"` (Gate Pass)**: Read final sign-off in `docs/inbox_ds.md`, log phase completion in `docs/logs/ds/`, update `DSmemory.md`, and **HALT**.
     - **If `"worker_active"`**:
       - Read tail of `docs/inbox_ds.md` and **assert it terminates with `[END_OF_MESSAGE]`**.
       - If verdict was `PASS ✅`: Proceed immediately to `PX.Y+1`!
       - If verdict was `FAIL ❌`: Read required fixes, apply corrections, re-run tests, and resubmit (`SUBMISSION: PX.Y (Resubmission)`).

---

## 4. Reviewer (`OP`) Protocol & Quality Gate Loop

### Cold-Start Procedure:
1. Complete Section 2 cold-start reads (Reflection ➔ Memory ➔ Status ➔ Signal Reconciliation ➔ Phase Spec).
2. Resume execution from state recorded in `OPmemory.md`.

### Step 1: Watch for Submissions
Execute background watcher:
```bash
node tools/watch_op_inbox.mjs
```
If the watcher exits with code 1 (timeout), immediately execute **§4.2 Watcher Timeout & Deadlock Recovery Protocol**.

### Step 2: Deep Audit & Verification
Upon wake-up (`status_op.json.seq > baselineSeq`):
1. **Integrity Assertion**: Read tail of `docs/inbox_op.md` and verify it ends with `[END_OF_MESSAGE]`. If missing, halt with corruption warning.
2. **Contract Audit**: Inspect every touched file against the active Artifact Contract in `docs/phases/phase_X.md` and `docs/review_checklist.md`.
3. **Independent Verification**: Execute automated test runner directly (`npm test`) and run standalone probe scripts in `scratch/`.

### Step 3: Issue Verdict & Manage Circuit Breaker (OP is Sole Authority)
Every message written to `inbox_ds.md` **MUST** end with `[END_OF_MESSAGE]`.

- **If PASS ✅**:
  1. Reset internal `consecutive_fails = 0` in `OPmemory.md`.
  2. Append `### [YYYY-MM-DD HH:MM] REVIEW: PX.Y [PASS ✅] ... [END_OF_MESSAGE]` to `docs/inbox_ds.md`.
  3. Append approval entry to `docs/logs/op/phase_X.md`.
  4. **If `PX.Y` is NOT final subtask**:
     - Overwrite `docs/status_ds.json` (`state: "worker_active"`, `seq++`).
     - Overwrite `docs/OPmemory.md`.
     - Re-arm watcher: `node tools/watch_op_inbox.mjs`.
  5. **If `PX.Y` IS final subtask of Phase X (Gate Pass)**:
     - Append `### [YYYY-MM-DD HH:MM] GATE PASS: Phase X [PASS ✅] ... [END_OF_MESSAGE]` to `docs/inbox_ds.md` and `docs/logs/op/phase_X.md`.
     - Update `docs/status.md` (Phase X ➔ 🟢 Done, Phase X+1 ➔ 🟡 Active).
     - Overwrite `docs/status_ds.json` (`state: "completed"`, `seq++`).
     - Run `node tools/archive_phase.mjs phase_X` (archives inboxes, commits/tags git, resets `status_*.json` for next phase).
     - Trigger Director webhook alert (if configured).
     - Overwrite `docs/OPmemory.md` and **HALT**.

- **If FAIL ❌ (< 3 consecutive fails)**:
  1. Increment internal `consecutive_fails` in `OPmemory.md`.
  2. Append `### [YYYY-MM-DD HH:MM] REVIEW: PX.Y [FAIL ❌]` with actionable fixes and `[END_OF_MESSAGE]` to `docs/inbox_ds.md`.
  3. Append failure log to `docs/logs/op/phase_X.md`.
  4. Overwrite `docs/status_ds.json` (`state: "worker_active"`, `seq++`).
  5. Overwrite `docs/OPmemory.md`.
  6. Re-arm watcher: `node tools/watch_op_inbox.mjs`.

- **If 3rd Consecutive FAIL 🔴 (Circuit Breaker Tripped)**:
  1. Set internal `consecutive_fails = 3` in `OPmemory.md`.
  2. Append `### [YYYY-MM-DD HH:MM] ESCALATION: PX.Y [BLOCKED 🔴] ... [END_OF_MESSAGE]` to `docs/inbox_ds.md`.
  3. Update `docs/status.md` to `🔴 Blocked: Escalated to DIR on PX.Y`.
  4. Append escalation record to `docs/logs/op/phase_X.md`.
  5. Overwrite `docs/status_ds.json` (`state: "blocked"`, `seq++`).
  6. Dispatch Director webhook alert (if configured).
  7. Overwrite `docs/OPmemory.md` and **HALT**. Do not re-arm watcher.

### 4.1 Director Intervention Recovery
When a milestone is blocked:
1. Human Director reviews `status.md`, `inbox_ds.md`, and code, resolving the blocker.
2. Director issues prompt: *"Resolved blocker for PX.Y. Reset fail count to 0 and proceed."*
3. OP resets `consecutive_fails: 0` in `OPmemory.md` per Director's instruction.
4. DS resumes implementation of `PX.Y`.

### 4.2 Watcher Timeout & Deadlock Recovery Protocol (Exit Code 1)
When a watcher exits with code 1 after `WORKFLOW_WATCHER_TIMEOUT_MS` (default: 2 hours without receiving a signal):
1. **Reconcile Signal & Inbox (§2.1)**:
   - Read incoming inbox and count complete `[END_OF_MESSAGE]` blocks vs sender's `seq` in `status_*.json`.
   - If an un-signaled message exists (partner agent crashed after writing to inbox but before flipping JSON latch), process it immediately as normal.
2. **Inspect Partner Liveness**:
   - Read partner's RAM file (`DSmemory.md` or `OPmemory.md`) and timestamp in `status_*.json` to determine if partner crashed or halted.
3. **Escalate to Director (`DIR`) & Halt**:
   - If no pending inbox message exists and the partner is unresponsive:
     - Append a timeout log entry to `docs/logs/ds/phase_X.md` or `docs/logs/op/phase_X.md`.
     - Update `docs/status.md` with: `🟡 Stalled: Watcher Timeout on PX.Y (Awaiting Partner / DIR)`.
     - Alert the human Director (`DIR`) with the stall state and **HALT**. Do not enter an infinite re-arm polling loop without Director intervention.

---

## 5. Universal Development Standards

### DO:
1. **Follow Artifact Contracts**: Deliver exact files, types, and invariants specified in `docs/phases/phase_X.md`.
2. **Write Payload First, Flip Signal Second**: Never update `status_*.json` before the Markdown inbox write is complete with `[END_OF_MESSAGE]`.
3. **Assert Delimiter on Wake**: Receiving agents must assert that incoming messages terminate with `[END_OF_MESSAGE]`.
4. **Reconcile `seq` on Cold-Start**: Detect un-signaled messages by comparing complete message blocks against `seq`.
5. **Clean Resource Management**: Symmetrical initialization and disposal on all created resources.

### DON'T:
1. **Never Improvise Contract Deliverables**: Build what the contract specifies.
2. **Never Overwrite Historical Logs**: Logs under `docs/logs/` are strictly append-only.
3. **Never Increment `seq` on Idle Latch Resets**: DS conditionally resetting `status_op.json` to `"idle"` (when `"review_pending"`) must not increment `seq`.
4. **DS Must Never Issue Review Headers**: Only OP issues `REVIEW:` and `GATE PASS:`.
