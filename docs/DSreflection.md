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

<!-- DS appends real accumulated learnings below during development -->

---

## Example Learnings (Delete after project initiation)

### Engineering Best Practices & Bug Prevention
- [P0.0] [Architecture] PATTERN: Always define symmetrical lifecycles — if a resource is allocated/subscribed in `init()`, implement matching teardown in `dispose()`.
- [P0.0] [Error Handling] BUG: Swallowing errors with empty `catch` blocks hides silent failures -> Always log with contextual metadata or re-throw typed domain errors.
- [P0.0] [Testing] PATTERN: Eliminate test flakes by mocking non-deterministic sources (timestamps, random number generators, network calls).
- [P0.0] [Configuration] BUG: Hardcoded ports, timeouts, or URLs break CI/staging environments -> Always inject configuration through environment variables or centralized config modules.
- [P0.0] [Async] BUG: Unhandled promise rejections inside background intervals/timers crash Node processes -> Wrap async timer callbacks in try-catch and handle rejections gracefully.
