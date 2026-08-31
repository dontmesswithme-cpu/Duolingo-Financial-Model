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

- [P1.2] [Data Integrity] AUDIT BUG: DS build-tool matched statement labels by substring-anywhere and fell through to the next row containing the substring when the true row's cell was a dash — emitting a bottom-line total as a different metric. -> AUDIT RULE: value verification must be COLUMN-PINNED (value at row×period-column) against the filing, never string-somewhere-in-table; an em-dash in the filing must never appear as a dataset value.
- [P1.2] [Verification Blind Spot] AUDIT PATTERN: statement-identity recomputation (A=L+E, sums of components) cannot catch phantom rows that participate in no recomputed sum — only filing-value column-pinned re-verification catches them. Keep both lanes; never rely on identities alone for data sub-phases.
- [P1.2] [Submission Honesty] AUDIT RULE: a submission/log claim that contradicts the shipped dataset (e.g. "no such row emitted" when one exists) is itself a rejection condition — always re-derive the claims, not just the numbers.
- [P1.4] [Fixture Trust] AUDIT BUG: DS hand-built KPI fixtures from IR-letter headline figures, then dataset + fixtures agreed — suite 223/223 green while 3 values were wrong vs the cited filings. -> AUDIT RULE: green tests validate internal consistency, not external truth. When the SAME party generates data and fixtures from one (wrong) source, only an independent re-pull of the cited document can break the circle. At data gates, always verify a sample of fixture values against the filing BEFORE trusting suite greenness.
- [P1.4] [Source Discipline] AUDIT RULE: a figure may only be transcribed into a row citing document X if it is X's own figure. IR-letter/headline values (e.g. December single-month MAU 147.6M) must never fill rows citing the 10-K (which files the 3-month average 133.1M). If the letter value is wanted, it needs its own IR ledger entry + citation.
- [P1.4] [Verbatim Definitions] AUDIT RULE: "verbatim definition" means verbatim from the document the row CITES, per row — not "verbatim from some document". Filings revise definition wording across periods (measurement-period sentences, definition-update sentences, product-era names like "Duolingo Plus"); a single shared definition string across multiple cited docs is a false-citation defect by construction. Fixture maps must be keyed per document.
- [P1.4] [Reported-State Integrity] AUDIT RULE: reconciliation notes may only use figures that exist in filings or the dataset. Back-solved numbers presented as filed figures ("EXACT MATCH" claims built on 872,947 which appears in no filing) are a reported-state integrity violation — grep claimed filing values against the cached filings before accepting any "exact match" claim.

---

## Example Audit Learnings (Delete after project initiation)

### Quality Gate & Audit Best Practices
- [P0.0] [Code Review] RULE: Never trust submission text alone — perform line-by-line inspection of every modified file.
- [P0.0] [Test Verification] RULE: Independently execute the test suite; verify reported test count matches actual test runner output.
- [P0.0] [Boundary Checks] AUDIT PATTERN: Write standalone probe scripts in `scratch/` to test complex mathematical algorithms, data parsers, and edge cases.
- [P0.0] [Resource Safety] AUDIT RULE: Check for open file descriptors, dangling timers, and event listener leaks in test suites and service classes.
- [P0.0] [Visual / UI Deliverables] AUDIT RULE: If a sub-phase touches UI/visual presentation, inspect screenshots in `docs/screenshots/phase_X/v(n)/` against `docs/design_references/`. Blind code-only approvals are prohibited.
- [P1.1] [Table Layouts] AUDIT PATTERN: SEC filings interleave `$` separators between columns and vary labels per period ("Income (loss) from operations", "(Benefit from) provision for income taxes", footnote markers "(1)(2)"); map period?column by numeric-sequence position per filing, normalize labels, and exclude MD&A (tables with `% Change`/`Constant Currency` columns) and %-of-revenue tables ("100 %" cells). Cached filing HTML lives in scratch/op_p1_1_edgar/.
- [P1.1] [Aggregator Lane] AUDIT RULE: Bigdata.com lane can carry typos in MD&A-sourced chunks (e.g. "49,684" vs EDGAR 69,684) � always resolve discrepancies to the canonical EDGAR document and log them (spec �4.7).
