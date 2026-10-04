# Redesign Phase TYPE: Font Size Hierarchy Correction (Max 20px)

> **Milestone**: Redesign Phase TYPE — Font Size Hierarchy Correction
> **Protocol**: 1.0
> **Status**: 🟡 Active — RTYPE.2 ✅ + RTYPE.3 ✅ (Gate Passed 2026-09-14); RTYPE.4 pending (Director order 2026-09-14)
> **Owner**: Drafted by Reviewer (`OP`), Implemented by Worker (`DS`)
> **Objective**: Fix the font-size hierarchy only. No font-family changes, no display/layout changes, no color changes. Cap all type at 20px, eliminate half-pixels and strays, unify duplicate-selector conflicts, all on the RP0-locked Helvetica + SFMono stack.

---

## 1. Milestone Objective & Scope

The type system has no scale: 17 distinct `font-size` values (10px–32px), 5 weights used ad-hoc, 11 rules over 20px, 5+ duplicate selectors with conflicting sizes, and SVG chart text outside the system. This phase corrects sizes/weights/line-heights only:

1. **Audit (RTYPE.1 — DONE 2026-09-14)**: full inventory of every `font-size/weight/line-height/family` in `index.html` `<style>` (269 font rules) + `src/ui/*.js` formatters + `src/ui/charts.js` SVG text.
2. **Tokens (RTYPE.2)**: define canonical `--text-*` / `--leading-*` tokens capped at 20px, weight discipline (400/500/600/700 only), on the original RP0 stack.
3. **Migration (RTYPE.3)**: replace all ad-hoc declarations with tokens. Size-only diff — computed layout must not shift except where over-cap text shrinks.

### Non-goals (explicit)

- No `font-family` changes. `--font-sans` (`Helvetica Neue`, Helvetica, Arial) and `--font-mono` (`SFMono-Regular`, Menlo, Monaco, Consolas) stay exactly as-is per Director ("original fonts I agreed upon").
- No layout, spacing, color, or component redesign.
- No new vendored fonts (zero-network policy holds — no `vendor/fonts/` in this phase).
- No Tabulator formatter logic changes (they only emit `cell-input/cell-calc/cell-formula/cell-link` classes already).

---

## 2. Prerequisites & Dependencies

- **Prior Completed Phases**: RP0 (Helvetica stack, tokens) GATE PASS.
- **Reference audit run**: 2026-09-14 live parse of `index.html` + `src/ui/` (counts below are measured, not estimated).
- **Binding constraints**: Director 2026-09-14 — "No display changes. Only font size correction", "Keep system stack", "Max 20px".

---

## 3. Sub-Phase Artifact Contracts

### Task RTYPE.1: Deep Audit (COMPLETE — results recorded here as ground truth)

#### A. Deliverable Files

- This section (audit table). No code changed in RTYPE.1.

#### B. Measured Findings

**Size distribution** (`index.html` `<style>`): `12px:65, 11px:46, 13px:35, 14px:8, 15px:8, 16px:7, 12.5px:8, 10.5px:6, 11.5px:6, 10px:5, 18px:3, 20px:3, 22px:7, 24px:1, 25px:1, 26px:1, 32px:1`.
**Weights**: `700:90, 600:72, 500:17, 400:1 (.cover-card-sub), 650:1 (.driver-group-header)`.
**Line-heights**: `1, 1.1, 1.2, 1.3, 1.4, 1.45, 1.5, 1.55, 1.6` + fixed `20px` on `.tabulator .tabulator-cell` (maps to ~1.5 at 13px).
**Family outlier**: `.gate-ledger-val` uses `var(--font-family-mono, monospace)` — must become `var(--font-mono)`.

**Over-20px violators (11 rules, all → 20px)**:

| Selector | Current | Target |
|---|---|---|
| `.dcf-primary-price` | 32px/700 | 20px/700 |
| `.historicals-kpi-card-val` | 26px/700 lh1.2 | 20px/700 lh1.2 |
| `.projection-kpi-value` | 25px/700 lh1 | 20px/700 lh1.1 |
| `.rec-hero-value` | 24px/700 | 20px/700 |
| `.projections-title, .assumptions-title, .historicals-title, .schedules-title` | 22px/700 (4 rules) | 20px/700 |
| `.sparkline-value` | 22px/700 lh1.1 | 20px/700 lh1.1 |
| `.operating-kpi-val` | 22px/700 | 20px/700 |
| `.drawer-close-btn` | 22px lh1 (icon glyph) | 20px lh1 |

**Duplicate-selector font conflicts (unify to single declaration each)**:

| Selector | Declaration 1 (first in file) | Declaration 2 (wins today) | Resolution |
|---|---|---|---|
| `.scenario-picker-title` | 13px/600 ls.05em | 11px/700 upper ls.5px | Keep 11px/700-upper (assumptions context); delete 13px/600 block |
| `.driver-group-header` | 14px/650 | 11px/700 upper | Keep 11px/700-upper; `650` weight banned globally → 600 |
| `.app-footer` | 11px | 12px | Keep 11px (footer meta); delete 12px block |
| `.scenario-btn` | 13px/600 | 11px/700 | Keep 11px/700 (matches `.scenario-btn-group` context) |
| `.driver-notes` | 12px | 11px lh1.3 ellipsis | Keep 11px lh1.4 (drop nowrap-ellipsis only if it clips — verify visually, do not redesign) |
| `.driver-label` | unstyled (inherits) | 13px/600 | Keep 13px/600 |

**Half-pixel + stray elimination**: `10, 10.5, 11.5px → 11px`; `12.5px → 12px`; `650 → 600`. `400` retained solely for `.cover-card-sub`.

**`src/ui` side**:
- Tabulator formatters emit only color classes (`cell-input/cell-calc/cell-formula/cell-link`) — `assumptionsTab.js:206,212,790-798`, `projectionsTab.js:124`, `schedulesTab.js:53`, `valuationTab.js:45`. No font-size logic there; no changes required.
- `src/ui/charts.js:172-1207` SVG text uses attrs `9, 10, 11, 13, 15px` + hardcoded `font-family="monospace"` + `font-weight="bold"`. Mapping: `9,10 → 11`; `11` keep; `13` keep; `15 → 16`; `monospace → var(--font-mono)`; `bold → 700`. Chart titles (13px bold) stay 13px.

#### C. Invariants & Automated Quality Gates (RTYPE.1)

- [x] Counts re-derived from live file parse, not hand-estimates.
- [x] Every over-20px rule named with selector + current value.
- [x] Every duplicate font conflict named with both declarations.

---

### Task RTYPE.2: Canonical Token Scale (Max 20px)

#### A. Deliverable Files

- `index.html` — `:root` additions only (no consumer rewiring in this task).

#### B. Exported Interfaces & Types

```css
--text-xs: 11px;   /* captions, pills, eyebrows, table sub-labels (replaces 10/10.5/11.5) */
--text-sm: 12px;   /* secondary UI, tab labels, callout body (replaces 12.5) */
--text-base: 13px; /* body / table cells / prose */
--text-md: 14px;   /* driver labels, gate periods, emphasis rows */
--text-lg: 15px;   /* card titles (.cover-card-title, .statement-card-header, audit titles) */
--text-xl: 16px;   /* workspace/method/drawer titles */
--text-2xl: 18px;  /* rec-headline, kpi-box-value */
--text-hero: 20px; /* hard cap — app-title, bridge-kpi-value, all former 22–32px */
--leading-tight: 1.2;
--leading-snug: 1.4;
--leading-base: 1.5;
```

Weight discipline: `400` (sub-labels only), `500` (secondary/meta labels), `600` (labels/headers), `700` (headlines/numbers). `650` banned.

#### C. Invariants & Automated Quality Gates

- [ ] Exactly 8 `--text-*` tokens, largest is 20px; grep for `--text-` confirms no `--text-3xl` or larger.
- [ ] No `--font-*` family token added or modified.
- [ ] `npm test` green (tokens are additive; zero consumer impact in this task).

---

### Task RTYPE.3: Size-Only Migration

#### A. Deliverable Files

- `index.html` — all `font-size/font-weight/line-height` declarations rewired to tokens; duplicate blocks deleted per RTYPE.1 resolution table; `.gate-ledger-val` family fixed to `var(--font-mono)`; `.tabulator-cell` `line-height:20px` → `var(--leading-base)`.
- `src/ui/charts.js` — SVG text mapping only (`9,10→11`, `15→16`, `monospace`→`var(--font-mono)`, `bold`→`700`).
- `tests/redesign.type.test.js` — headless regression: parses `index.html` `<style>`, asserts cap + ban list.
- `docs/screenshots/redesign/rtype/` — before/after captures at 390px + 1280px (Cover, Assumptions, Historicals minimum).

#### B. Exported Interfaces & Types

- No JS API changes. CSS contract: every `font-size:` value in `<style>` is a `var(--text-*)` reference; every `font-weight:` is `400/500/600/700`; every `line-height:` is a `var(--leading-*)` or unitless `1/1.1`.

#### C. Invariants & Automated Quality Gates

- [ ] `grep -o 'font-size:[^;]*'` over `<style>`: zero `px` literals, zero values >20px, zero half-pixels (`10.5/11.5/12.5`).
- [ ] `font-weight: 650` absent repo-wide; `font-weight` values ⊆ {400,500,600,700} (+ `bold`→700 normalized in SVG).
- [ ] Each RTYPE.1 duplicate selector appears exactly once with the resolved declaration.
- [ ] `font-family` diff vs baseline is exactly one line (`.gate-ledger-val` fix) — verified via `git diff`.
- [ ] `npm test` 100% green including new `tests/redesign.type.test.js`.
- [ ] Screenshots show no layout shift except shrinkage of former >20px heroes; no overlapping cards at either viewport.

---

### Task RTYPE.4: Tooltip Icon Swap (Director order 2026-09-14)

#### A. Deliverable Files

- `src/ui/assumptionsTab.js` — driver-row info buttons only (`.tooltip-btn`, ~line 197).
- `tests/redesign.type.test.js` — regression coverage for the swap.
- `docs/screenshots/redesign/rtype/` — Assumptions captures proving no layout shift.

#### B. Exported Interfaces & Types

- Every `.tooltip-btn` renders the user-authored asset `assets/icons/ui/info-circle.svg` (blue circle-i, 24×24 viewBox) instead of the Unicode glyph `&#x24D8;` (ⓘ). No other button/tooltip markup changes.
- Implementation latitude: `<img src="assets/icons/ui/info-circle.svg" …>` reusing the asset byte-for-byte (preferred — pixel-identical to the user's file), or inline SVG mirroring it. Icon box fixed at 13px (matches current `font-size: var(--text-base)` glyph metrics — no layout shift).
- Preserved exactly: `aria-label` (= note text), `title` (= note text), `type="button"`, `.tooltip-btn` class + hover behavior. (Note: the asset carries hardcoded `#2563EB` strokes, so the current `color` hover transition won't recolor an `<img>` — accepted cosmetic nuance unless DS inlines with `currentColor`, disclosed either way.)
- Untouched: the two static callout `<img>` references (Methodology/Assumptions Notes) — already correct, pinned by test.

#### C. Invariants & Automated Quality Gates

- [ ] Zero `24D8` / `ⓘ` literals in `src/ui/assumptionsTab.js`.
- [ ] Every `.tooltip-btn` in rendered output contains the info-circle graphic (img ref or inline svg) at 13px box.
- [ ] `aria-label` + `title` still equal the driver note text per row (spot-pin ≥3 drivers + empty-note row if one exists).
- [ ] `assets/icons/ui/info-circle.svg` byte-untouched (no asset edits — the file is the authority).
- [ ] `npm test` 100% green including updated `tests/redesign.type.test.js`; pins IN SYNC; zero engine/data impact.
- [ ] Assumptions captures @1280 + @390: icon renders on every driver row, no overlaps, no row-height change vs pre-swap.

#### D. Non-goals

- No tooltip content/behavior/positioning changes. No other icon swaps. No `.tooltip-btn` CSS redesign (sizing declarations only as needed to hold the 13px box).

---

## 4. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] RTYPE.2 tokens present, max 20px, families untouched.
- [ ] RTYPE.3 migration satisfies every RTYPE.3 gate checkbox.
- [ ] OP verifies with independent parse (re-run size/weight grep + `git diff --stat` family check), not DS self-report.
- [ ] Visual diff confined to type shrinkage; Director confirms "no display changes" holds.
