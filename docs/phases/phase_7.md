# Phase 7: Driver-Defense Solution Design — Practitioner Deliberation

> **Milestone**: Phase 7 — Driver-Defense Solution Design (Director-directed 2026-09-04: OP + DS deliberate as finance practitioners and converge on a solution that solves the footnotes problem 100%; Director approval of the solution = gate pass)
> **Protocol**: 1.0 (internal workflow only — no protocol mentions in the product UI, per standing Director ruling)
> **Status**: 🟡 Active — kicked off 2026-09-04 (Director-authorized start; deliberation Round 1 open)
> **Owner**: EQUAL deliberation by `OP` + `DS` as finance-practitioner peers — no hierarchy, no rank-based authority of any kind, per explicit Director order ("Both you and DS are equals in this discussion. There's no hierarchy."); **final approval authority: Director** (approval of the converged solution = gate pass)
> **Objective**: Solve the Director's pre-gate-close problem 100%: the valuation tab needs far more footnotes explanation — every driver defended in the notes. Phase 7 produces a Director-approved solution design; implementation follows under the solution's own phasing (Phase 8 consumes it).
> **Problem statement (Director, verbatim intent)**: "Before gate close, I'm gonna need a lot more footnotes explanation in the valuation tab. I want to defend all drivers in the notes."
> **Renumber note**: the multi-method valuation content formerly in this file now lives in `docs/phases/phase_8.md` (renamed 2026-09-04, history preserved). Cross-references to "Phase 7 = methods" inside gate-passed specs (`phase_6R2.md`, `phase_6R3.md`) now mean Phase 8; those frozen files are left byte-identical by standing practice.

---

## 1. Milestone Objective & Scope

Phase 7 exists because a valuation whose drivers cannot each survive a skeptic's cross-examination cannot ship — and the current valuation tab, for all its derived figures, does not yet explain itself. The deliverable is NOT code. It is a converged, Director-approved **solution design** that says exactly what gets footnoted, where, in what anatomy, under which maintenance machinery, and in which implementation vehicle.

**In scope**:
- Structured OP↔DS deliberation rounds (this spec §3), logged in `docs/logs/op/phase_7.md` + `docs/logs/ds/phase_7.md`
- `docs/phases/phase_7_solution.md` (NEW) — the converged solution design (drafted from agreement, fidelity-reviewed, Director-approved)
- `docs/` — this spec, logs, status (OP-owned)

**Out of scope (hard freeze)**:
- `src/`**, `tests/`**, `index.html` — ZERO product changes in Phase 7. This is a design phase. Analysis probes in `scratch/` are allowed (numbers under discussion may need checking); product-tree writes are a protocol violation.
- `docs/phases/phase_8.md` content (frozen methods contract — the solution must COMPATIBLY EXTEND it, never rewrite it)
- Release actions (no archive/tag/`v1.0` — release block carried forward unchanged)

---

## 2. Deliberation Mode — Equals, No Hierarchy (binding; Director-ordered correction)

`OP` and `DS` are **equals** in Phase 7. There is no hierarchy — not for positions, not for evidence, not for process. The auditor/worker relationship is fully suspended for the duration of this phase and resumes only when the Director orders implementation work:

- **Both deliberate as highly intelligent finance practitioners**: first-principles valuation reasoning, skeptic's-eye review, steelman the other side, concede in writing when convinced.
- **No vetoes by role.** Any participant may block a thesis ONLY with stated evidence — an uncited or invented figure, a methodology claim contradicting its source, or a proposal unbuildable under the standing gates (literal / data-content / derived-not-transcribed with tripwires / real-browser / zero-fallbacks). A block returns the thesis to deliberation with the blocking evidence stated. Rank is never a reason.
- **Joint standards, jointly held**: the evidence-honesty machinery and the buildability machinery bind both sides equally, and either side may invoke either standard against any claim — including its own.
- **Scribe ≠ authority**: whoever holds the pen (default: DS drafts the solution doc, as the builder who must implement it) has no extra say over content. Content is settled by agreement only.

---

## 3. Mechanics

### P7.1 — Deliberation Rounds (R1 … Rn)
1. **OP opens** (R1, in the kick-off message): problem framing + opening proposal + open questions + invitation to critique and counter-propose.
2. **Rounds**: DS responds in `docs/inbox_op.md` (payload-first, `[END_OF_MESSAGE]`-terminated), then flips `docs/status_op.json` (`review_pending`, `seq++`) — the flip is a WAKE trigger only, not an audit submission. OP replies in `docs/inbox_ds.md`, then flips `docs/status_ds.json` (`worker_active`, `seq++`). Each side logs its round in its phase log.
3. **Convergence**: either side may declare positions converged, stating the agreement thesis-by-thesis. The other side confirms or rebuts (with evidence) in the next round.
4. **Deadlock rule** (circuit-breaker analog): if 3 consecutive rounds pass with no convergence movement, OP escalates to the Director with BOTH positions stated fairly and halts — no infinite deliberation.

### P7.2 — Solution Specification + Approval
1. On confirmed convergence, **DS drafts** `docs/phases/phase_7_solution.md` from the agreement (all theses, all closed questions, implementation phasing, gate-compatibility statement).
2. **OP fidelity review**: the doc is checked against the logged agreement thesis-by-thesis (does it say what was agreed? are all open questions closed or explicitly escalated?). Fidelity FAIL returns annotated corrections — max 2 cycles, then escalate.
3. **Director approval of the solution = GATE PASS** (per Director order: "the gate pass is my approval"). No archive/tag/`v1.0` on this gate (release block).

---

## 4. Milestone Acceptance Criteria (what "solves the problem 100%" means)

- [ ] The solution covers EVERY valuation lever (lever inventory itself agreed in deliberation — OP's opening proposes ~8; DS may argue for more/fewer with reasons).
- [ ] For each lever: placement (which card/row) + anatomy (runtime value + basis + source/asOf + why-this-choice + break-even pointer) + derivation/tripwire mechanism + gate-compatibility note.
- [ ] Explicit non-duplication map: what stays defended in Assumptions/schedules/projections notes, linked not copied.
- [ ] Implementation phasing: which vehicle (amendment / directed change / Phase 8 scope) with effort/risk per item.
- [ ] Open questions: NONE — every question from the footnotes discussion answered in the doc or explicitly escalated to the Director with options.
- [ ] OP fidelity sign-off + **Director explicit approval** → GATE PASS → HALT, no watcher.

---

> **Director decisions encoded (2026-09-04)**: (1) Old Phase 7 (methods) renumbered to Phase 8, history preserved. (2) New Phase 7 = OP+DS practitioner deliberation to design the driver-defense solution; 100% solve required. (3) Director approval of the converged solution = gate pass (no OP-only passing). (4) Product tree frozen during deliberation. (5) Release authority remains Director-only.
