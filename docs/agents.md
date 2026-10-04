# Multi-Agent Team Protocol & Communication Architecture

> **Protocol Version**: 1.0

## 1. Team Structure & Responsibilities

| Role | Tag | Entity | Primary Responsibility |
|---|---|---|---|
| **Director** | `DIR` | Human / Lead | Vision holder, product owner, sets high-level requirements, milestones, resolves design decisions, and unblocks escalations. |
| **Worker** | `DS` | Autonomous Dev Agent | Implements code, architecture, data structures, and tests adhering strictly to declarative Artifact Contracts. |
| **Reviewer** | `OP` | Autonomous QA Agent | Audits deliverables line-by-line against Artifact Contracts, **independently verifies external truth (not just internal consistency)**, evaluates test suites, manages failure circuit breaker, and issues binding verdicts. |
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
- **Core Mandate — External Truth, Not Just Internal Consistency**: OP does **not** merely confirm that DS's code and DS's tests agree with each other (internal consistency — `412/412` green). OP independently verifies that the **deliverable is true against the external authoritative source** (SEC EDGAR filings, market-provider `MKT` snapshots `asOf`/`source`, contract arithmetic `WACC = rf+β×ERP`, `df=1/(1+WACC)^t`, `terminalValue` Gordon) and that the **tests themselves actually prove what their names claim** (gate scope = gate name, literal discipline across `src/engine/*.js`, disclosure completeness, bearing). A green suite that asserts a tautology (`plug ≡ residual`, `wacc ≡ costOfEquity` without levered probe, `market inputs live only in assumptions.json` that only greps `wacc.js`) is a **FAIL** even at `412/412` — external truth is the gate.
- **Key Responsibilities**:
  - Monitors `docs/status_op.json` via background watcher (`seq > baselineSeq`).
  - Performs line-by-line audit against Artifact Contracts and `docs/review_checklist.md` — including a **gate-scope audit** (does each test grep/scan the files its name promises? `wacc.build.test.js:590` only scanning `wacc.js` while `recommend.js:346` contains `148.36` is a bullcrap gate).
  - **Independently verifies external truth**: re-derives every market/valuation anchor from raw `assumptions.json`/`historical`/`FRED`/`SEC` filings (not DS fixtures — `GROWTH_FIXTURE` pattern in reverse), cross-checks `MKT` `asOf`/`source.provider` against provider, re-runs `WACC×g` monotonicity, `WACC>g` guard, `Bear<Base<Bull` per-share ordering, `H1 590,421/78,472/76,618/239,031` invariance per scenario, and runs standalone literal/fallback probes in `scratch/` that **fail even if DS suite is green** (e.g. grep all `src/engine/*.js` outside comments for `\b\d{4,}\b` and `\?\?\s*148\.36`, call engine with missing `MKT` driver and assert `ConfigError`/`missing_driver`).
  - Runs automated test suites **and** independent validation probes in `scratch/` — the suite is the cross-check, not the proof.
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
> - **Always Arm in the Foreground**: Watchers must **always** be armed in the foreground as a synchronous, blocking tool call that holds the turn open until a signal triggers `exit 0`.
> - **Harness Premature Timeout / Force-Close Recovery**: If the agent harness force-closes the watcher or times it out before the prescribed timeout (`WORKFLOW_WATCHER_TIMEOUT_MS`, default: 2 hours), the agent must immediately **rearm in the foreground and keep rearming until the prescribed timeout is reached** (or until a signal is received).
> - **Synchronous Blocking**: The watcher command must hold the tool execution open in the foreground until `seq > baselineSeq` triggers `exit 0`, which immediately delivers output to the agent context and wakes the agent to perform the audit or next phase.

> **Timeout Policy**: Watchers exit with code 1 after the prescribed timeout (`WORKFLOW_WATCHER_TIMEOUT_MS`, default: 2 hours without receiving a signal). Premature termination or timeouts by the harness are NOT deadlocks — agents must rearm in the foreground until the full prescribed timeout is reached. Only when the full prescribed timeout is reached without a signal do agents execute the recovery procedure in `howtowork.md` §4.2 (signal reconciliation ➔ partner liveness check ➔ Director escalation).

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
  ├─► Deep audit touched files against Artifact Contract & review_checklist.md — plus **gate-scope audit** (does each test's grep/scan actually cover the files its name promises?)
  ├─► Execute automated test suite independently **and** run external-truth probes in `scratch/` that would fail even if DS suite is green (re-derive `MKT` anchors from raw `assumptions.json`/`SEC` filings, grep all `src/engine/*.js` for `??` fallbacks and bare literals `>999`)
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
