# Multi-Agent Team Protocol & Communication Architecture

> **Protocol Version**: 1.0

## 1. Team Structure & Responsibilities

| Role | Tag | Entity | Primary Responsibility |
|---|---|---|---|
| **Director** | `DIR` | Human / Lead | Vision holder, product owner, sets high-level requirements, milestones, resolves design decisions, and unblocks escalations. |
| **Worker** | `DS` | Autonomous Dev Agent | Implements code, architecture, data structures, and tests adhering strictly to declarative Artifact Contracts. |
| **Reviewer** | `OP` | Autonomous QA Agent | Audits deliverables line-by-line against Artifact Contracts, evaluates test suites independently, manages failure circuit breaker, and issues binding verdicts. |
| **Domain Subagents** | `SUB` | Specialized Agents | On-demand subagents (e.g. Visual UI Critic, Security Auditor, Performance Profiler) spawned as needed. |

---

## 2. Role Definitions

### Director (`DIR`)
- **Authority**: Sets project priorities, resolves design ambiguities, authorizes phase progression, and manually resets circuit breakers.
- **Key Actions**:
  - Reviews high-level milestone progress in `docs/status.md`.
  - Initiates new phases (`"Start Phase 1"`) or unblocks escalations (`"Resolved blocker for PX.Y. Reset fail count to 0 and proceed."`).

### Worker (`DS` — Development Specialist)
- **Authority**: Generates all code, architectural components, test suites, and documentation.
- **Key Responsibilities**:
  - Implements sub-phases adhering strictly to the active Artifact Contract in `docs/phases/phase_X.md`.
  - Runs automated test suites locally (`npm test`).
  - Appends verification entries to `docs/logs/ds/phase_X.md` (append-only).
  - Appends submissions to `docs/inbox_op.md` ending with `[END_OF_MESSAGE]`.
  - Flips signal in `docs/status_op.json` (`state: "review_pending"`, `seq++`).
  - Resets `docs/status_op.json` to `"idle"` upon wake-up only if currently `"review_pending"` (without bumping `seq`).
- **Restrictions**:
  - Cannot mark a task as Done without Reviewer sign-off (`PASS ✅`).
  - Cannot evaluate failure circuit breakers — OP is the sole failure authority.

### Reviewer (`OP` — Quality Gatekeeper & Auditor)
- **Authority**: The definitive quality gatekeeper. Sole evaluator of pass/fail verdicts and the 3-cycle failure circuit breaker.
- **Key Responsibilities**:
  - Monitors `docs/status_op.json` via background watcher (`seq > baselineSeq`).
  - Performs line-by-line audit against Artifact Contracts and `docs/review_checklist.md`.
  - Runs automated test suites and validation probes independently in `scratch/`.
  - Tracks consecutive failure count in private RAM (`OPmemory.md`).
  - On 3rd consecutive FAIL: trips circuit breaker, writes `ESCALATION:` to `inbox_ds.md`, updates `status.md`, flips `status_ds.json` to `"blocked"`, and halts.
  - Exclusively updates `docs/status.md` and issues `GATE PASS` upon completing all sub-phases in a milestone.

### Domain Subagents (`SUB` — On-Demand Task Specialists)
- **Authority**: Task-scoped ephemeral workers spawned directly by `DS` or `OP`.
- **Operating Protocol**:
  - **No Persistent Mailboxes**: SUB agents do not have persistent mailboxes or JSON signals (`inbox_sub.md` / `status_sub.json`).
  - **Delegation Lifecycle**: Spawned on-demand (e.g., Visual UI Critic, Security Auditor, Performance Profiler) with a focused prompt.
  - **Reporting**: SUB agents return structured reports directly to the calling parent agent (`DS` or `OP`), who incorporates the results into `docs/logs/` and formal submissions/verdicts.

---

## 3. Directional State Machine & Mailbox Architecture

All inter-agent communication is decoupled into **Pure FSM Signals (JSON)** for machine triggering and **Rich Mailboxes (Markdown)** for human-readable content:

| Channel / File | Exclusive Writer | Readers | Purpose & Schema |
|---|---|---|---|
| **OP Signal** (`docs/status_op.json`) | **`DS`** | `OP` Watcher | Machine latch: `{ protocol, seq, state, phase, subphase, updated_at }`. States: `"idle"`, `"review_pending"`. |
| **DS Signal** (`docs/status_ds.json`) | **`OP`** | `DS` Watcher | Machine latch: `{ protocol, seq, state, phase, subphase, updated_at }`. States: `"worker_active"`, `"blocked"`, `"completed"`. |
| **OP Inbox** (`docs/inbox_op.md`) | **`DS`** | `OP` Reader | Worker's sub-phase submissions. Must terminate with `[END_OF_MESSAGE]`. |
| **DS Inbox** (`docs/inbox_ds.md`) | **`OP`** | `DS` Reader | Reviewer's review verdicts and escalations. Must terminate with `[END_OF_MESSAGE]`. |
| **Global Status** (`docs/status.md`) | **`OP`** | `DIR`, `DS`, `OP` | High-level milestone tracker table. Single-writer owned by OP. |
| **DS RAM** (`docs/DSmemory.md`) | **`DS`** | `DS` | Worker's private working memory — overwritten per sub-phase. |
| **OP RAM** (`docs/OPmemory.md`) | **`OP`** | `OP` | Reviewer's private working memory and consecutive fail counter. |
| **Historical Logs** (`docs/logs/`) | Per Role | All | Append-only audit trail per phase (`ds/`, `op/`, `inboxes/`). |

---

## 4. Message Header Formatting Rules

1. **Strictly Directional**: DS writes only to `inbox_op.md`. OP writes only to `inbox_ds.md`.
2. **Standard Message Headers**:
   - Submission: `### [YYYY-MM-DD HH:MM] SUBMISSION: PX.Y [Subtask Title]`
   - Resubmission: `### [YYYY-MM-DD HH:MM] SUBMISSION: PX.Y (Resubmission) [Subtask Title]`
   - Review Pass: `### [YYYY-MM-DD HH:MM] REVIEW: PX.Y [PASS ✅]`
   - Review Fail: `### [YYYY-MM-DD HH:MM] REVIEW: PX.Y [FAIL ❌]`
   - Milestone Gate Pass: `### [YYYY-MM-DD HH:MM] GATE PASS: Phase X [PASS ✅]`
   - Deadlock Escalation: `### [YYYY-MM-DD HH:MM] ESCALATION: PX.Y [BLOCKED 🔴]`
3. **Closing Delimiter**: Every single message MUST terminate with `[END_OF_MESSAGE]` on its own line.

---

## 5. Zero-Token Polling Watcher Mechanism

Instead of consuming LLM context tokens in polling loops, agents execute lightweight Node.js watcher scripts that block execution until the sender increments `seq` (`seq > baselineSeq`):

- **DS Watcher** (monitoring `docs/status_ds.json`):
  ```bash
  node tools/watch_ds_inbox.mjs
  ```
- **OP Watcher** (monitoring `docs/status_op.json`):
  ```bash
  node tools/watch_op_inbox.mjs
  ```

> **CRITICAL EXECUTION REQUIREMENT — FOREGROUND-BLOCKING ONLY**:
> - **LLM Turn-Driven Wakeup**: LLM agents do not possess persistent OS listener threads. Control returns to an agent **only** when an active tool call returns stdout/exit into its context.
> - **NEVER Detach / Background**: Never use `Start-Process`, `&`, or background daemon commands. A backgrounded process returns immediately to the LLM turn, leaving the agent dormant and unable to wake when the partner agent submits.
> - **Synchronous Blocking**: The watcher command must hold the tool execution open in the foreground until `seq > baselineSeq` triggers `exit 0`, which immediately delivers output to the agent context and wakes the agent to perform the audit or next phase.

> **Timeout Policy**: Watchers exit with code 1 after `WORKFLOW_WATCHER_TIMEOUT_MS` (default: 2 hours). On timeout, agents execute the recovery procedure in `howtowork.md` §4.2 (signal reconciliation ➔ partner liveness check ➔ Director escalation).

---

## 6. End-to-End Lifecycle Sequence

```
[DS] Implement Sub-Phase PX.Y (Artifact Contract)
  │
  ├─► Run tests locally (npm test)
  ├─► Log verification in docs/logs/ds/phase_X.md
  ├─► Append SUBMISSION: PX.Y ... [END_OF_MESSAGE] to docs/inbox_op.md
  ├─► Flip docs/status_op.json: "state": "review_pending", seq++
  ├─► Overwrite docs/DSmemory.md
  └─► Execute Watcher: node tools/watch_ds_inbox.mjs (waits for status_ds.json.seq > baselineSeq)
        │
        ▼
[OP] Watcher triggers (status_op.json.seq > baselineSeq)
  │
  ├─► Assert inbox_op.md tail ends with [END_OF_MESSAGE]
  ├─► Deep audit touched files against Artifact Contract & review_checklist.md
  ├─► Execute automated test suite independently
  │
  ┌────┴─────────────────────────────────────────┐
  ▼                                              ▼
[FAIL ❌]                                      [PASS ✅]
- OP increments consecutive_fails in OPmemory  - OP resets consecutive_fails = 0 in OPmemory
- Is consecutive_fails >= 3?                    - OP appends REVIEW [PASS] to inbox_ds.md
  ├────────────────────────┐                     - Is PX.Y the final milestone subtask?
  ▼ (NO, < 3)              ▼ (YES, 3rd FAIL)          │               │
- OP appends REVIEW       [CIRCUIT BREAKER]          [NO]            [YES]
  [FAIL] to inbox_ds.md   - OP appends ESCALATION      │               │
- OP flips status_ds.json   [BLOCKED 🔴] to inbox_ds   ▼               ▼
  ("worker_active", seq++)- OP updates status.md to  - OP flips      - OP appends GATE PASS
- OP logs in logs/op/       "🔴 Blocked"               status_ds.json  - OP flips status_ds.json
- OP RE-ARMS watcher      - OP flips status_ds.json    ("worker_active"  ("completed", seq++)
  on status_op.json         ("blocked", seq++)           seq++)        - OP runs archive_phase.mjs
        │                 - OP fires Webhook & HALTS - OP RE-ARMS    - OP updates status.md
        ▼                          │                   watcher         & HALTS
- DS wakes (seq++)                 │                     │                 │
- DS resets status_op.json         ▼                     ▼                 ▼
  to "idle" (no seq bump)    - DS wakes (seq++)     - DS wakes (seq++)- DS wakes (seq++)
- DS reads fixes from        - DS resets            - DS resets       - DS resets
  inbox_ds.md                  status_op to "idle"    status_op to      status_op to "idle"
- DS applies fixes           - DS sees "blocked",     "idle"          - DS logs completion
- DS resubmits (seq++)         updates DSmemory,    - DS starts next    in logs/ds/
                               and HALTS!             sub-phase PX.Y+1!- DS stands by for DIR!
                             - Awaiting DIR!
```
