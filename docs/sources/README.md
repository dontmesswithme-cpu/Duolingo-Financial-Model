# Source Ledger — Usage Rules

> **Scope**: `docs/sources/sources.md` is the master ledger anchoring every
> citation in the data layer. These rules are binding on both agents and are
> enforced mechanically wherever possible (Accuracy Gate, `src/data/audit.js`).

## 1. The Core Rule

Every `source.url` appearing in `src/data/historical/*.json` **must** have a
corresponding entry in `docs/sources/sources.md`. The `url` string is the join
key: it must match the ledger entry verbatim (scheme, host, path, query).

Mechanical enforcement: with ledger enforcement enabled
(`SOURCE_LEDGER_REQUIRED`, wired through `loadHistorical({ requireLedger, ledger })`),
a citation whose URL has no ledger entry fails with `SOURCE_NOT_IN_LEDGER` and
the app refuses to boot — the gate **fails closed** (enforcement requested
without a ledger is itself a violation, never a silent pass).

## 2. Worker (`DS`) Rules

1. Add the ledger entry **at transcription time**, in the same sub-phase as the
   data rows it anchors — never deferred to a later cleanup pass.
2. Entries are append-only: never delete, renumber, or reuse an `LED-NNN` id.
   A corrected URL supersedes the old entry (marked in `notes`); the old entry
   stays for audit history.
3. `accessedAt` is the date **you** pulled and read the source — not the filing
   date, not today-by-default.
4. Figures are transcribed exactly as filed (units and scale preserved); the
   ledger records *which document* a figure came from, not the figure itself.

## 3. Reviewer (`OP`) Cross-Check Protocol

At every data-related quality gate, OP executes independently (blind approval
of DS's citations is prohibited, per `docs/spec.md` §4.5):

1. **Extract** every `source.url` from the submitted dataset JSON (grep, not
   eyeball) and diff it against the ledger's `url:` lines — the sets must match
   exactly (no uncited ledger entries is *also* checked: orphan entries are
   flagged, since they suggest deleted data or transcription drift).
2. **Re-pull** each cited source from the URL and re-verify every value,
   unit, and period label against the filing — not against DS's transcript.
3. **Re-verify** `filed` dates and accession references in `notes` against EDGAR.
4. Record the verification method in `docs/logs/op/` (which sources re-pulled,
   which values re-checked) before issuing a verdict.

## 4. Machine Consumability

Ledger URLs are consumed in tests as a plain `Set<string>` (or an array of
strings / `{ url }` objects) passed to `loadHistorical({ ledger })`. The markdown
format above keeps every URL on a single greppable `**url**:` line so a test or
OP probe can build that set mechanically.
