# Universal Workflow Starter Guide

> **Protocol Version**: 1.0

This guide explains how to apply and adapt this workflow to **any type of project**.

---

## 🚀 Step 1: Customize Specifications for Your Project

1. **Define Your Technical Requirements**:
   - Open [`docs/spec.md`](docs/spec.md) and specify your system architecture, data models, APIs, and performance budgets.
2. **Establish the Milestone Roadmap**:
   - Open [`docs/plan.md`](docs/plan.md) and define your project milestones (`P0`, `P1`, `P2`, `P3`, etc.).
   - Create phase specs in [`docs/phases/`](docs/phases/) using strict **Artifact Contracts** (copy [`docs/phases/phase_template.md`](docs/phases/phase_template.md) to create `phase_0.md`, `phase_1.md`, etc.).
3. **Adjust Language / Framework Conventions**:
   - Open [`docs/conventions.md`](docs/conventions.md) and add your project-specific language rules (e.g. TypeScript, Python, Rust, Go).

---

## 🛠️ Step 2: Running the Workflow in Practice

### For the Director (`DIR` / Human Lead):
- To kick off a phase, instruct your Worker agent:
  > *"Read docs/howtowork.md and start Phase 0."*
- To review completed milestone gate passes, check [`docs/status.md`](docs/status.md).
- To unblock a 3-FAIL circuit breaker escalation, resolve the ambiguity and prompt:
  > *"Resolved blocker for PX.Y. Reset fail count to 0 and proceed."*

### For the Worker Agent (`DS`):
1. Reads cold-start docs and reconciles signals in order (`DSreflection.md` ➔ `DSmemory.md` ➔ `status.md` ➔ `status_ds.json` vs `inbox_ds.md` ➔ `phases/phase_X.md`).
2. Implements sub-phase `PX.Y` adhering strictly to the Artifact Contract.
3. Runs tests locally (`npm test` or project test runner).
4. Appends verification entry to `docs/logs/ds/phase_X.md`.
5. Appends submission to `docs/inbox_op.md` ending with `[END_OF_MESSAGE]`.
6. Flips `docs/status_op.json` to `"state": "review_pending"` and increments `seq`.
7. Overwrites `docs/DSmemory.md` with active state.
8. Executes watcher in foreground: `node tools/watch_ds_inbox.mjs`. Watcher must always be armed in the foreground; if the harness force-closes it or times it out before the prescribed timeout, rearm in the foreground and keep rearming until timeout is reached.
9. Upon wake-up: Conditionally resets `docs/status_op.json` to `"idle"` (if `"review_pending"`), reads `docs/inbox_ds.md`, and proceeds with next sub-phase or fixes.

### For the Reviewer Agent (`OP`):
1. Awakens when watcher detects `status_op.json.seq > baselineSeq`.
2. Asserts `inbox_op.md` terminates with `[END_OF_MESSAGE]`.
3. Conducts line-by-line audit against the Artifact Contract and [`docs/review_checklist.md`](docs/review_checklist.md).
4. Runs automated tests and independent verification scripts in `scratch/`.
5. If passed: Appends `REVIEW: PX.Y [PASS ✅]` to `docs/inbox_ds.md`, flips `status_ds.json` to `"worker_active"` (`seq++`), re-arms watcher in foreground (`node tools/watch_op_inbox.mjs`; rearm until timeout if harness force-closes early).
   - If final sub-phase: Issues `GATE PASS: Phase X`, updates `docs/status.md`, flips `status_ds.json` to `"completed"` (`seq++`), and runs `node tools/archive_phase.mjs phase_X`.
6. If failed (< 3 times): Increments internal `consecutive_fails`, appends `REVIEW: PX.Y [FAIL ❌]` to `docs/inbox_ds.md`, flips `status_ds.json` to `"worker_active"` (`seq++`), re-arms watcher in foreground (`node tools/watch_op_inbox.mjs`; rearm until timeout if harness force-closes early).
7. If 3rd consecutive failure: Trips circuit breaker, appends `ESCALATION: PX.Y [BLOCKED 🔴]` to `inbox_ds.md`, updates `status.md` to Blocked, flips `status_ds.json` to `"blocked"` (`seq++`), fires webhook, and halts.

---

## 🎯 Domain-Specific Adaptations

### 1. Web & Full-Stack Applications (React, Next.js, Vue, Node, Django)
- **Visual QA**: Use `tools/visual_qa/capture_ui_template.mjs` to automatically screenshot routes and verify them against Figma exports in `docs/design_references/`.
- **E2E Testing**: Add Playwright / Cypress integration tests in `tests/e2e/`.

### 2. Backend Services & REST/GraphQL APIs (Express, Fastify, FastAPI, Go, Rust)
- **API Quality Gates**: Verify schema validation, authentication middleware, error status envelopes, and database connection pooling.
- **Load & Memory**: Run heap churn and stress tests in `tests/perf.alloc.test.js`.

### 3. CLI Tools & Developer Libraries
- **Command Testing**: Validate CLI exit codes, stdout/stderr formatting, help flags, and cross-platform path handling.
- **Package Hygiene**: Verify tree-shaking, minimal bundle size, and 0 external security vulnerabilities.

### 4. Data Science & Machine Learning Pipelines
- **Data Invariants**: Write validation assertions for tensor dimensions, missing values, normalization ranges, and metric thresholds (accuracy/loss).
- **Determinism**: Lock random seeds for model training and feature extraction pipelines.
