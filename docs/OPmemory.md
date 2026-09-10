# OP Working Memory (RAM State)

> **Rule**: This file represents the Reviewer's active working memory. It is **overwritten** after every review cycle, audit outcome, or phase boundary transition.

---

## 0. EP-FIX1 — 🟢 COMPLETE (PASS first-review 2026-09-10 21:16 UTC) · consecutive_fails: 0 · Watcher NOT armed (terminal)
- **Ledger**: EP.1 ✅ · EP.2 ✅ · EP.3 ✅ · EP.4 ✅ cycle 2 · EP-FIX1 ✅ first-review. Suite **940/940 ×271 ×3 zero flakes at HEAD** (934 + 6 gate proofs/negative controls).
- **A1–A8 closed**: untracked-aware `_scope_gate.js` helper (union diff ∪ ls-files, fail-closed, tag-pattern guarded); assert-outside-try ×2 with negative controls that go red; market.fetch no-op → real v1.0-anchored diff; CI `fetch-depth: 0` + rationale; status.md Next refreshed; commit subject amended ($118.60 restored — 7ef0c40 → b1ec735) + `v1.0-EP` moved (unpushed history, safe); tag-identical tree verified 0-diff + suite green at amended point.
- **Probes**: `op_epfix1_probe.mjs` 10/10 (ground-truth byte-equality on all 5 baselines, untracked + tracked tamper both bite, missing/malformed tags throw, scope clean, pins stable regen --check, stash intact).
- **Standing new rules (permanent carry)**: freeze gates must union untracked files; assertions never inside swallowing `try`; negative control adjacent to every freeze gate (must go red when allowlist narrows); CI must fetch tags for tag-anchored gates; test names must equal test scope (A5 lesson — a name promising a diff must diff).
- **State**: signals at `status_ds.json` completed seq 15 EP/EP-FIX1 (terminal truth); stash "unprompted scope-gate repair 2026-09-11" retained as reference, never applied; no push, no release actions beyond the Director-ordered amend/tag-move.
- **Next**: Director orders (release/push remain standing P6-lineage items). OP halted.

## 1. Economy Phase — 🟢 GATE PASSED (2026-09-10 18:15 UTC) · history retained
- **Ledger**: 1 FAIL total (EP.4 F1 split-claim → one resubmission). Headline **$118.60167662384697 overvalued −24.86%** (Bear $72.38 / Bull $217.98); EIG A–E green; stamp IN SYNC; labelStable true ($78.18–$122.84).
- **Post-gate**: close-out done (inboxes archived hash-verified to `docs/logs/inboxes/economy_phase/`, headers canonical); rollback point `v1.0-EP` = b1ec735 (amended subject, Director order).

## 2. Prior programs (compacted): RP0–RP9 🟢 (GATE PASSED 2026-09-10 08:11, 888/888 ×259) · P8 🚢 v1.0 · P0–P7 ✅.

## 3. Standing Rules (permanent carry)
1. Evidence honesty: every factual claim cited or derived; submission examples verbatim tool outputs (Warnings #1, #2 standing).
2. Buildability under standing gates (literal/data-content/derived-not-transcribed with tripwires/real-browser/zero-fallbacks).
3. Logs append-only; memory overwritten per turn; payload-first + `[END_OF_MESSAGE]` + flip-signal-second; assert delimiter on wake; reconcile seq on wake.
4. Capture-then-view for UI sub-phases; never fake a capability.
5. Gate-scope discipline: test scope = test name; freeze gates see untracked files; asserts outside swallowing try; negative controls adjacent to every freeze gate; CI fetches tags for tag-anchored gates (EP-FIX1 learnings).
6. Every verdict turn ends with re-arm (or explicit no-rearm on terminal states). DS never edits OP scratch probes.
