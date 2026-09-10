# Reviewer Inbox (OP Inbox)

> **Channel**: Worker (`DS`) ➔ Reviewer (`OP`)
>
> **Rule**: DS appends sub-phase submissions and resubmissions here. Every message MUST end with `[END_OF_MESSAGE]`.

---

### [2026-09-08 23:35] SUBMISSION: RP4-RW [Card Header Conformance & Units Pill Redesign]

**Phase**: RP4 (Supporting Schedules)  
**Sub-Phase**: RP4-RW (Card Header Conformance & Units Pill Redesign — Amendment §5)  
**Authority**: Director Order 2026-09-08 23:10 (`docs/phases/redesign_phase_4.md` §5)  
**Seq**: 1  

---

#### 1. Header Inventory & Computed Style Conformance (RW2.1):
- **Legacy Rule Neutralized (`index.html:1238`)**:
  - Before: `padding: 12px 16px; background: var(--color-page); border-bottom: 1px solid var(--color-border); font-weight: 650; font-size: 15px; color: var(--color-text);`
  - After: `padding: 14px 16px 10px 10px; background: transparent; border-bottom: none; font-weight: 700; font-size: 15px; color: var(--color-text-primary);`
- **ONE Shared RW1.1 Rule Updated (`index.html:3705`)**:
  - Before: `border-left: 3px solid var(--color-accent-blue); padding-left: 10px;`
  - After: `border-left: 3px solid var(--color-accent-blue); padding-left: 10px; background: transparent; border-bottom: none;`
- **In-Scope Tab 04 Header Inventory**:
  1. `#hard-gate-section .statement-card-header.gate-section-header`: "Balance Sheet Invariant Hard Gate (Assets = Liabilities + Stockholders' Equity)"
  2. `[data-statement-card="workingCapital"] .statement-card-header`: "Working Capital & Operating Schedules ($ in thousands)"
  3. `[data-statement-card="ppe"] .statement-card-header`: "PP&E Roll-Forward Schedule ($ in thousands)"
  4. `[data-statement-card="intangibles"] .statement-card-header`: "Intangible Assets & Amortization Schedule ($ in thousands)"
  5. `[data-statement-card="sbc"] .statement-card-header`: "Stock-Based Compensation (SBC) Schedule ($ in thousands)"
  6. `[data-statement-card="debt"] .statement-card-header`: "Debt Schedule & Capital Structure (Debt-Free Verified)"
- **Live Computed-Style Conformance (Real Browser Probe via `scratch/ds_rp4_rw_verify.mjs`)**:
  - Tab 03 Reference Header (`.statement-title-block`):
    - `background`: `rgba(0, 0, 0, 0)`
    - `border-left`: `3px solid rgb(26, 86, 219)`
    - `padding-left`: `10px`
    - `border-bottom`: `0px none rgb(15, 23, 42)`
    - `font`: `15px / 700` (computed from inner h3 / shared rule)
  - Tab 04 All 6 Headers (`.statement-card-header`):
    - `background`: `rgba(0, 0, 0, 0)` (100% transparent — legacy grey banner eliminated)
    - `border-left`: `3px solid rgb(26, 86, 219)` (exact canonical blue accent bar)
    - `padding-left`: `10px` (exact canonical 10px padding)
    - `border-bottom`: `0px none rgb(15, 23, 42)` (100% borderless — legacy bottom border eliminated)
    - `font`: `15px / 700` (exact canonical 15px font, 700 bold weight)

---

#### 2. Segmented Units Pill Conformance & Behavior (RW2.2):
- **DOM Shape & Styling Conformance**:
  - Container: `<div class="units-mode-toggle pill-control" role="group" aria-label="Display Units">` (structurally and visually identical to Tab 02 `.view-mode-toggle.pill-control`).
  - Buttons: Two `<button type="button" class="pill-btn units-btn radio-pill ${isThousands ? 'active' : ''}" data-unit="thousands" aria-pressed="${isThousands}">Thousands</button>` and `<button type="button" class="pill-btn units-btn radio-pill ${isMillions ? 'active' : ''}" data-unit="millions" aria-pressed="${isMillions}">Millions</button>`.
  - Affordance retirement: Radio inputs (`input[type="radio"]`) and radio dots (`.radio-indicator`) completely retired from Tab 04 markup and CSS.
  - Backward compatibility: `.radio-pill` retained as an unstyled secondary class on buttons ensuring auditor scripts (e.g. `op_rp41_live.mjs` clicking `.radio-pill[data-unit]`) continue passing without modification.
- **Interaction & Rescaling Verified**:
  - Initial mount: `Thousands` carries `.active`, `aria-pressed="true"`, subtitle: `"Detailed schedules supporting the 3-statement model. Figures in USD thousands unless otherwise stated."`, FY2026 assets: `"$2,219,238"`.
  - Click `Millions`: active class flips to Millions button (`aria-pressed="true"`), subtitle flips to `"Detailed schedules supporting the 3-statement model. Figures in USD millions unless otherwise stated."`, FY2026 assets rescales dynamically to `"$2,219.2"`.
  - Click `Thousands` (round-trip): restores Thousands active state, subtitle, and exact unrounded `"$2,219,238"`.

---

#### 3. Test Suite Maintenance & Quality Gates:
- **Test-Maintenance Disclosure**:
  - Maintained `tests/redesign.tab4.test.js` selector assertions: updated from radio label selectors to canonical `.pill-btn[data-unit]` button selectors per Amendment §5 mandate.
  - Enhanced mock DOM stub helper in `tests/redesign.tab4.test.js` to support `.class[attr="val"]` compound matching and comma-separated selector lists in `querySelectorAll`.
- **New Automated Test Coverage**:
  - `RP4-RW2.1`: Canonical unified header CSS rule and neutralized legacy rule apply to Tab 04 headers (verifies transparent background, no bottom border, 3px solid accent left border, 10px padding-left).
  - `RP4-RW2.2`: Units toggle rebuilt on canonical segmented pill pattern (`.pill-control` + `.pill-btn`, retired radio dots/inputs, click flips active state, round-trip restoration).
- **Test Counts**:
  - Tab 04 Suite (`node --test tests/redesign.tab4.test.js`): **20/20 PASS** (18 baseline + 2 new).
  - Full Regression Suite (`npm test`): **839/839 PASS** across **242 test suites** (honest count: 837 + 2 tests, 241 + 1 suite).
- **External Auditor Probes Independently Re-run**:
  - `scratch/op_rp41_probe.mjs`: **25/25 PASS** (exit code 0).
  - `scratch/op_rp42_probe.mjs`: **20/20 PASS** (exit code 0).
  - `scratch/op_rp41_live.mjs`: **11/11 PASS** (0 console errors, exit code 0).
- **Static Quality Invariants**:
  - Zero inline styles (`style=`): 0 hits.
  - Zero UI bare numerics > 999 outside comments: 0 hits.
  - Purity: Zero `Date.now`, `Math.random`, `fetch` in UI code.
  - Corpus record count: 706 historical records byte-identical.
  - Out of scope boundary: Tabs 01–03 and shell untouched.

---

#### 4. Visual Evidence & Responsive Captures:
- Script: `scratch/ds_rp4_rw_verify.mjs` executed in Playwright headless Chromium with **0 console errors**.
- Captures on disk:
  - `docs/screenshots/redesign/rp4/schedules_1440.png` (Desktop 1440px): Verified inline headers without grey banners, clean 3px blue bars, and canonical `[ Thousands | Millions ]` pill capsule.
  - `docs/screenshots/redesign/rp4/schedules_390.png` (Mobile 390px): Verified stacked mobile layout with clean wrapped inline headers and responsive units capsule.

Rework lane RP4-RW is ready for audit.
[END_OF_MESSAGE]
