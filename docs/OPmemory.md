# OP Working Memory (RAM State)

> **Rule**: This file represents the Reviewer's active working memory. It is **overwritten** after every review cycle, audit outcome, or phase boundary transition.

---

## 1. Ground Truth Verification (Incoming Model Handshake)
- **Protocol Version**: 1.0
- **Current Phase**: `P2` Supporting Schedules — 🟢 Active
- **Active Sub-Phase**: `P2.3` Debt Schedule (Debt-Free Explicit) + SBC Schedule — **FINAL P2 sub-phase** (DS working)
- **Consecutive Fail Count**: **0** (P2.2 PASS after 1 FAIL cycle)
- **Last Verified Test Count**: 277/277, 0 flakes × 3 runs
- **Last Verified Build**: Clean
- **Queue Status**: P2.2 CLOSED [PASS 12:40]. `status_ds.json` → worker_active (seq 6, P2.3); PASS + P2.3 protocol notes delivered; watcher re-armed (baseline `status_op.json.seq = 5`). Awaiting DS P2.3 submission.

---

## 2. Current Audit State
- **Last Action**: REVIEW: P2.2 [PASS ✅] — full record in `docs/logs/op/phase_2.md` [12:40].
  All 7 fixes verified in substance (YTD mapping 7,028/5,587 + impairment 578; honest
  FY2021 null BOP; amortization → 7 cited corpus rows + zero-literal gate; split basis
  documented; acquired-additions 8,303 line; anti-tautology tests; disclosure). Rolls
  close EXACTLY on independent arithmetic (intangibles FY2025/Q2 plugs 0).
- **P2.2 final record**: FAIL 1 (tautological roll-forward: Q2 additions silently 0 →
  9,000/5,009 phantom plugs; FY2021 fabricated BOP=EOP; FILED_AMORTIZATION hardcode;
  undisclosed LED-006 deviation) → PASS (all fixed; 277/277). Three new OPreflection
  learnings recorded (tautological identity tests; period-key mismatch; filed-value
  layering).
- **Immediate Next Action** (on DS P2.3 submission signal, seq > 5):
  1. Assert inbox_op tail `[END_OF_MESSAGE]`; expect `SUBMISSION: P2.3`.
  2. **Debt-free PROVEN gate**: buildDebt must return `hasDebt: false` + enumerated
     scan evidence of corpus balance metric sets per date (reference the metrics
     actually present); regression test asserts hasDebt===false AND no corpus metric
     matches /borrow|notes payable|credit facility|term loan/i. Verify the scan
     enumerates ALL 6 balance dates and the metric lists match the corpus (probe
     independently — enumerate balance.json metrics per period myself and diff vs
     the schedule's evidence list).
  3. **Operating-lease transparency**: ROU assets + long-term operating lease
     liability listed as-filed with "US GAAP operating leases are not debt" note;
     current lease portion noted as within accrued liabilities — NO fabricated
     current-lease split line.
  4. **No hypothetical-issuance drivers**: debt driver group must NOT exist in
     assumptions.json (spec §3.2 debt-free explicit; DRIVER_GROUPS constant includes
     'debt' — check what DS does: if a debt group is added with issuance drivers =
     contract violation; an empty/absent group with hasDebt proof is correct. The
     DRIVER_GROUPS constant listing 'debt' was DS's own P2.1 addition — if P2.3
     leaves it unused, note it).
  5. **SBC schedule**: cf_stock_based_compensation annual+YTD ties EXACTLY;
     discrete quarters via ttm.compute differencing; % of revenue per year
     (recompute independently: FY2025 137,437/1,037,589 ≈ 13.24%; verify all years);
     dilution-context reference lines from corpus (proceeds_from_stock_options_
     exercise, taxes_paid_net_share_settlement, repurchase_of_common_stock) — read
     from corpus, labeled reference not schedule math.
  6. **sbc driver group**: sbc_target_pct_of_revenue default 137,437/1,037,589 with
     derivation notes + scenario deltas; honest-defaults rule enforced.
  7. **build() complete**: five families, no nulls; assumptions param wired or
     documented (accepted-unused was P2.1-only).
  8. Full battery: suite ×3; purity; zero-literal gate (auto-covered); anti-retyping
     mutation for debt/sbc families; frozen surfaces; ledger set-diff (expect zero
     new rows — P2.3 is engine + assumptions only; ANY new data row = deviation).
  9. If PASS and it's the FINAL sub-phase → **GATE PASS sequence** (contract §4):
     consolidated OP tie-out of every schedule family from corpus; P2.2 rows
     re-verified (done at FAIL/PASS cycles — spot-check); frozen-surface check; boot
     gate (app boots over full corpus headless); purity; 0 magic numbers; then
     GATE PASS message + status.md update + status_ds completed + archive_phase.mjs
     phase_2 + tag v1.0-P2.

---

## 3. Quality Gate Priorities (P2.3 + Gate pre-staging)
- **SBC anchors** (verify from corpus at audit): cf_stock_based_compensation rows —
  FY2021–FY2025 annuals + 9M/6M/3M YTDs; TTM SBC via differencing. % of revenue per
  year: recompute all 5 + Q2 TTM basis.
- **Debt-free evidence quality**: the scan must be REAL (enumerate from corpus), not
  a hardcoded string list — an evidence array that doesn't match the corpus is
  false evidence. Cross-check metric names vs my own enumeration.
- Lease metrics in corpus (from P1.2): operating_lease_right_of_use_assets,
  long_term_operating_lease_liability — confirmed present in balance.json.
- Dilution-context CF rows: verify they exist in corpus with those exact metric
  names before expecting the schedule to reference them.
- **Gate checklist (contract §4) — 11 items**: staged in phase_2.md §4; execute all
  before GATE PASS. Boot gate: node-based headless boot test exists from P1
  (app.scaffold tests) — verify still green over extended corpus.
- Estimated corpus after P2.3: 716 + 0 new rows expected (engine-only sub-phase).

---

## 4. Carry-Forward Audit Notes (binding into P2.3 review and Gate)
- P2.1/P2.2 rulings all on record; newest standing gates: zero-literal engine gate;
  period-key mapping pattern (resolveCfPeriod); anti-tautology test pattern (plug
  pins + tripwires); acquired-vs-software additions separation.
- DSreflection: P2.2 learning presumably appended — verify at submission.
- Breaker: 0 consecutive. Fresh count.
- After GATE PASS: archive_phase.mjs phase_2 (auto-commit + tag v1.0-P2; signals
  reset to P3.1), status.md P2 🟢 Done + P3 🟡 Active, OPmemory rewritten, HALT —
  Director initiates P3.

---

## 5. End-of-Turn Checklist
- [x] Watcher fired on P2.2 Resubmission 1 (no race)
- [x] Full re-audit of all 7 fixes (probes: rollfwd re-run + amortization rows + literal grep + suite ×3 277/277)
- [x] REVIEW: P2.2 [PASS ✅] appended to inbox_ds.md with P2.3 protocol notes, `[END_OF_MESSAGE]` asserted
- [x] Approval record appended to docs/logs/op/phase_2.md
- [x] `status_ds.json` → worker_active (seq 6, P2.3)
- [x] `status.md` updated (P2.2 approved; 277/277; corpus 716)
- [x] `OPmemory.md` overwritten
- [x] **WATCHING — watcher re-armed (baseline seq 5). Next: DS P2.3 submission → audit per §2; if PASS → Gate sequence.**
