# Redesign Phase 0: Design System Tokens, Helvetica Stack & App Shell

> **Milestone**: Redesign Phase 0 — Design System Tokens, Helvetica Stack & App Shell  
> **Protocol**: 1.0  
> **Status**: 🟢 Gate passed 2026-09-08 (engineering) — visual fixup PENDING: text wordmark + single-row stacked tabs ride with RP1 rework (Director visual FAIL 2026-09-08)  
> **Owner**: Drafted by Reviewer (`OP`), Implemented by Worker (`DS`)  
> **Objective**: Establish the core design system tokens, typography stack, standardized CSS utility classes, dark navy header shell (`#0B1E36`) with Duolingo mascot and logo assets, locked top horizontal tab bar, global context strip, and clean institutional footer—without disturbing existing engine logic or test suites.

---

## 1. Milestone Objective & Scope

Redesign Phase 0 establishes the visual and structural bedrock for the entire application overhaul. It replaces the early prototype styles with a cohesive institutional design system:
1. **Design Tokens**: Standardized CSS custom properties for dark navy surfaces, light gray workspaces, borders, shadows, and semantic colors.
2. **Helvetica Font Stack**: Universal font hierarchy using `"Helvetica Neue", Helvetica, Arial, sans-serif` paired with `font-variant-numeric: tabular-nums` for strict decimal alignment across financial tables.
3. **App Header Shell**: Integration of the official Duolingo mascot (`assets/branding/duolingo-owl.svg`) and wordmark (`assets/branding/duolingo-logo.svg`), ticker badge `NASDAQ: DUOL`, and header metadata cluster (Valuation Date, Model Version, Prepared By).
4. **Locked Top Tab Bar**: Implementation of the locked horizontal tab navigation bar (Tabs 01 through 08) with active state indicators, hover highlights, and numbered prefixes.
5. **Universal Component Primitives**: Reusable classes for segmented pill buttons (`.pill-control`, `.pill-btn`), status callouts (`.callout-info`, `.callout-warning`), and valuation badges (`.badge-undervalued`, `.badge-fair`, `.badge-overvalued`).

---

## 2. Prerequisites & Dependencies

- **Prior Completed Phases**: Phase 0–8 baseline completed and verified green.
- **Assets Present**:
  - `assets/branding/duolingo-owl.svg` (verified)
  - `assets/branding/duolingo-logo.svg` (verified)
  - `assets/branding/favicon.ico` (verified)
  - `assets/icons/ui/` (info-circle, check-circle, alert-triangle, external-link)
- **Reference Document**: `docs/phases/redesign_plan.md` (incl. §1b Visual Authority Map)
- **Visual Authority (binding)**: `ssdesign/target_theme/ref_01_cover_toc.png` — header (owl + wordmark + title block + metadata rows) and single-row tab bar.
- **Brand Assets (both required)**: `assets/branding/duolingo-owl.svg` + `assets/branding/duolingo-logo.svg` (text wordmark — was on disk unused at gate; mandatory in fixup).

---

## 3. Sub-Phase Artifact Contracts

### Task RP0.1: Design Tokens, CSS Architecture & Helvetica Stack

#### A. Deliverable Files
- `index.html` — Updated `<head>` font definitions, CSS root tokens, reset, typography, and utility classes.
- `src/ui/format.js` — Typography helper functions ensuring `tabular-nums` formatting across generated numerals.
- `tests/redesign.shell.test.js` — Unified test suite covering both RP0.1 (design tokens, CSS variables, Helvetica font stack) and RP0.2 (DOM structure, brand header, locked top tab bar).

#### B. Exported Interfaces & Types
- `:root` CSS custom properties:
  - `--font-sans`: `"Helvetica Neue", Helvetica, Arial, sans-serif`
  - `--font-mono`: `"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace`
  - `--color-header-bg`: `#0B1E36`
  - `--color-header-text`: `#FFFFFF`
  - `--color-page-bg`: `#F8FAFC`
  - `--color-card-bg`: `#FFFFFF`
  - `--color-border`: `#E2E8F0`
  - `--color-border-subtle`: `#EDF2F7`
  - `--color-text-primary`: `#0F172A`
  - `--color-text-secondary`: `#475569`
  - `--color-text-muted`: `#94A3B8`
  - `--color-accent-blue`: `#1A56DB`
  - `--color-accent-blue-soft`: `#EBF5FF`
  - `--color-badge-fair-bg`: `#FEF3C7` / `--color-badge-fair-text`: `#B45309`
  - `--color-badge-over-bg`: `#FEE2E2` / `--color-badge-over-text`: `#B91C1C`
  - `--color-badge-under-bg`: `#DCFCE7` / `--color-badge-under-text`: `#15803D`
- Standardized classes:
  - `.pill-control`, `.pill-btn`, `.pill-btn.active`
  - `.callout-info`, `.callout-warning`
  - `.badge-undervalued`, `.badge-fair`, `.badge-overvalued`

#### C. Invariants & Automated Quality Gates
- [ ] CSS `font-family` applies `--font-sans` globally.
- [ ] `font-variant-numeric: tabular-nums` applied to all table cells and metric cards.
- [ ] Zero inline `style=` attributes in HTML; 100% style rules governed by stylesheet classes.
- [ ] Existing core unit tests remain 100% green (`npm test`).

---

### Task RP0.2: App Shell, Duolingo Brand Header & Locked Top Navigation

#### A. Deliverable Files
- `index.html` — Semantic header layout, top tab navigation structure, and footer markup.
- `src/ui/tabs.js` — Tab switcher logic updated to handle top horizontal tab bar with keyboard accessibility (arrow keys, aria-selected, aria-controls).
- `tests/redesign.shell.test.js` — Test suite asserting presence of brand elements, tab bar structure, and keyboard navigation.

#### B. Exported Interfaces & Types
- `<header class="app-header">`:
  - Brand block: Duo mascot SVG + duolingo TEXT WORDMARK (`assets/branding/duolingo-logo.svg`, mandatory — missing at gate) + "Duolingo, Inc." title + `NASDAQ: DUOL` ticker pill + model subtitle (`NASDAQ: DUOL | 3-Statement Financial Model + DCF Valuation` pattern per ref_01).
  - Metadata block: Valuation Date (`Sep 1, 2026`), Model Version (`v1.0-P4`), Prepared By (`Independent Analysis`) as right label/value rows.
- `<nav class="app-tab-nav">`:
  - 8 tab buttons in ONE ROW at ≥1024px (no wrap): stacked number-over-label (`01` over `Cover & TOC` … `08` over `Sensitivity / Scenarios`).
  - Active indicator styling (white card elevation, blue bottom accent border).
- `<footer class="app-footer">`:
  - Standardized legal disclaimer, version tag, and non-affiliation disclosure.

#### C. Invariants & Automated Quality Gates
- [ ] All 8 tabs present in exact order: Cover & TOC, Assumptions/Drivers, Historicals, Supporting Schedules, Projections (3-Statement), Valuation, Summary/Output, Sensitivity/Scenarios.
- [ ] Navigation is 100% horizontal top bar; no left vertical sidebar exists in the DOM.
- [ ] Tab switching toggles active pane visibility cleanly (`aria-selected` and `hidden` attributes updated).
- [ ] App header displays Duolingo branding and metadata without visual collision across screen widths >= 1024px.
- [ ] `npm test` passes with zero failures.

---

## 4. Milestone Acceptance Criteria (Gate Pass Requirements)

- [ ] RP0.1 and RP0.2 implemented, verified, and passing headless test assertions.
- [ ] Visual fixup (rides RP1 rework): wordmark beside owl; tab bar single-row stacked number-over-label at ≥1024px — verified by capture-vs-`ref_01` comparison.
- [ ] Visual verification confirms clean dark navy header, crisp Duo mascot, and sharp Helvetica typography.
- [ ] Tab switching functions smoothly between all 8 panes without JavaScript errors.
- [ ] Existing engine and data loaders remain untouched and fully operational.
