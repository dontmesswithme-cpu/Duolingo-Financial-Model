# DS Reflection — Persistent Learnings & Engineering Patterns

> **Purpose**: This document contains permanent, accumulated learnings from past bugs, tool failures, and architecture patterns. Worker (`DS`) must read this FIRST upon every session start to avoid repeating past mistakes.
>
> **Format Rules**:
> - `[Phase.Sub] [Subsystem] BUG: [Root Cause] -> [Permanent Rule / Fix]`
> - `[Phase.Sub] [Subsystem] PATTERN: [What works and when to use it]`
>
> **Template Instruction**: Entries under **Example Learnings** are starter guidance. Delete the examples after project initiation and append real project-specific learnings under **Active Learnings**.

---

## Active Learnings & Bug Prevention

- [P1.2] [Workflow] BUG: Forgot to arm watcher after submission — Director escalation "ARM WATCHER DUMBASS" -> Permanent Rule: After EVERY `SUBMISSION` or `RESUBMISSION` (and after every `PASS` wake that resets `status_op.json` to `idle`), immediately arm `node tools/watch_ds_inbox.mjs` with its native 2h watchdog (`WORKFLOW_WATCHER_TIMEOUT_MS=7200000`). Never use a short bash `timeout` that kills the watcher early (10s probe is not arming); never skip arming. Baseline is `status_ds.json.seq` at arm time; watcher wakes only on `seq > baseline`. Document baseline in `DSmemory.md` checklist every turn.
- [P1.2] [Transcription] BUG: `findInMap` used substring `includes` and fell through on dash → bottom-line total 661,311 mis-mapped to `convertible_preferred_stock` and `total_liabilities_and_stockholders_equity` left missing for FY2021 -> Permanent Rule: Anchor matches to row-start (`label === key || label.startsWith(key+' ')`), prefer longest key, normalize hyphens/apostrophes/commas in `normLabel`, preserve column positions (null for dash) and terminate on dash — never fall through to another row. Verbatim re-check must be column-pinned (`rawRow[column+1]` value AND printed form), not `table.text.includes`.
- [P1.2] [Testing] PATTERN: Hardened per-period expected-set "no phantom metrics" test (FY2021 22, FY2022 24, FY2023 25, FY2024 29, FY2025 29, Q2 30) catches phantom rows that identity tests cannot (preferred participated in no sum). Use this pattern for all future balance/CF/KPI transcriptions.

---

## Example Learnings (Delete after project initiation)

### Engineering Best Practices & Bug Prevention
- [P0.0] [Architecture] PATTERN: Always define symmetrical lifecycles — if a resource is allocated/subscribed in `init()`, implement matching teardown in `dispose()`.
- [P0.0] [Error Handling] BUG: Swallowing errors with empty `catch` blocks hides silent failures -> Always log with contextual metadata or re-throw typed domain errors.
- [P0.0] [Testing] PATTERN: Eliminate test flakes by mocking non-deterministic sources (timestamps, random number generators, network calls).
- [P0.0] [Configuration] BUG: Hardcoded ports, timeouts, or URLs break CI/staging environments -> Always inject configuration through environment variables or centralized config modules.
- [P0.0] [Async] BUG: Unhandled promise rejections inside background intervals/timers crash Node processes -> Wrap async timer callbacks in try-catch and handle rejections gracefully.
