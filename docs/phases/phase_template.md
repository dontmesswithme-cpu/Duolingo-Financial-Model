# Phase Specification Template

> **Milestone**: Phase X — [Milestone Title]
> **Protocol**: 1.0
> **Status**: ⚪ Pending / 🟡 Active / 🟢 Completed
> **Owner**: Drafted & Audited by Reviewer (`OP`), Implemented by Worker (`DS`)
>
> **Usage Instructions**: Copy this file to `docs/phases/phase_X.md` (e.g. `phase_1.md`, `phase_2.md`) when defining a new milestone.

---

## 1. Milestone Objective & Scope
Provide a clear, 2-3 sentence overview of what this milestone accomplishes, the architectural layer it builds, and the business/technical problem it solves.

---

## 2. Prerequisites & Dependencies
- Completed Prior Phases: [e.g. Phase X-1 completed with GATE PASS]
- External Dependencies / Manifests: [Libraries, configurations, external APIs]

---

## 3. Sub-Phase Artifact Contracts

### Task PX.1: [Sub-Phase 1 Title]

#### A. Deliverable Files
- `src/path/to/moduleA.js` — [Core domain implementation]
- `tests/unit/moduleA.test.js` — [Unit test suite]

#### B. Exported Interfaces & Types
- `function createEntity(params: EntityParams): Entity` — Validates and instantiates domain entity.
- `function processEntity(entity: Entity): Result` — Executes business calculation.
- `interface EntityParams` — `{ id: string, name: string, config: object }`

#### C. Invariants & Automated Quality Gates
- [ ] 100% deterministic test execution (`npm test` passing with >= X assertions).
- [ ] Boundary condition handling verified (null/undefined inputs, empty collections, zero limits).
- [ ] Clean resource disposal contract implemented (`dispose()` method).
- [ ] 0 linter warnings, 0 type errors.

---

### Task PX.2: [Sub-Phase 2 Title]

#### A. Deliverable Files
- `src/path/to/moduleB.js` — [Service implementation]
- `tests/unit/moduleB.test.js` — [Integration test suite]

#### B. Exported Interfaces & Types
- `class ServiceB` — `execute(command: Command): Promise<Outcome>`

#### C. Invariants & Automated Quality Gates
- [ ] Integration tests pass headlessly.
- [ ] Explicit error hierarchy with custom error codes.
- [ ] Zero unhandled promise rejections.

---

## 4. Milestone Acceptance Criteria (Gate Pass Requirements)
- [ ] All sub-phase Artifact Contracts individually submitted and approved by `OP`.
- [ ] Full test suite green with 0 flaky tests.
- [ ] Bounded memory allocation verified under load.
- [ ] Zero magic numbers or hardcoded secrets.
