# OP Reflection — Persistent Audit Learnings & Verification Patterns

> **Purpose**: This document contains permanent audit learnings, quality gate insights, and inspection rules. Reviewer (`OP`) must read this FIRST upon every session start.
>
> **Format Rules**:
> - `[Phase.Sub] [Category] AUDIT BUG: [Discovered Issue] -> [Audit Rule]`
> - `[Phase.Sub] [Category] AUDIT PATTERN: [Effective verification technique]`
>
> **Template Instruction**: Entries under **Example Audit Learnings** are starter guidance. Delete the examples after project initiation and append real project-specific audit learnings under **Active Audit Learnings**.

---

## Active Audit Learnings & Quality Rules

<!-- OP appends real accumulated audit learnings below during development -->

---

## Example Audit Learnings (Delete after project initiation)

### Quality Gate & Audit Best Practices
- [P0.0] [Code Review] RULE: Never trust submission text alone — perform line-by-line inspection of every modified file.
- [P0.0] [Test Verification] RULE: Independently execute the test suite; verify reported test count matches actual test runner output.
- [P0.0] [Boundary Checks] AUDIT PATTERN: Write standalone probe scripts in `scratch/` to test complex mathematical algorithms, data parsers, and edge cases.
- [P0.0] [Resource Safety] AUDIT RULE: Check for open file descriptors, dangling timers, and event listener leaks in test suites and service classes.
- [P0.0] [Visual / UI Deliverables] AUDIT RULE: If a sub-phase touches UI/visual presentation, inspect screenshots in `docs/screenshots/phase_X/v(n)/` against `docs/design_references/`. Blind code-only approvals are prohibited.
