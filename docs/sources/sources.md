# Source Ledger — Duolingo FM

> **Rule**: This ledger is the anchor of the project's Data Sourcing & Verification
> Protocol (`docs/spec.md` §4). Every `source.url` appearing in
> `src/data/historical/*.json` MUST have a corresponding entry below. Usage rules
> and the OP cross-check protocol live in `docs/sources/README.md`.

---

## 1. Format Specification

Every entry is a stable, append-only block. The `url:` line is the machine-greppable
join key against the `source.url` field in dataset JSON. All fields are required;
use `n/a` only where genuinely inapplicable (e.g. an index page has no period).

| Field | Meaning | Format |
|---|---|---|
| `id` | Stable entry identifier, never reused or renumbered | `LED-NNN` |
| `entity` | Legal name of the reporting entity | Free text |
| `form` | Filing/release type the citation points into | `10-K`, `10-Q`, `8-K`, `IR-letter`, `index`, … |
| `period` | Fiscal period the cited document covers | `FY2023`, `Q2 FY2025`, `n/a` |
| `filed` | Filing date of the cited document | `YYYY-MM-DD` or `n/a` |
| `url` | Absolute https URL of the cited document (the join key) | `https://…` |
| `accessedAt` | Date the source was pulled and verified by the transcriber | `YYYY-MM-DD` |
| `metrics` | Metric keys taken from this document | Comma-separated metric keys or `none` |
| `notes` | Optional provenance context (accession numbers, page refs) | Free text |

## 2. Entry Template

```markdown
### LED-NNN
- **entity**: <legal entity name>
- **form**: <form type>
- **period**: <fiscal period or n/a>
- **filed**: <YYYY-MM-DD or n/a>
- **url**: <absolute https URL>
- **accessedAt**: <YYYY-MM-DD>
- **metrics**: <comma-separated metric keys or none>
- **notes**: <optional>
```

## 3. Ledger Entries

### LED-001
- **entity**: Duolingo, Inc.
- **form**: index
- **period**: n/a
- **filed**: n/a
- **url**: https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001562088&type=10-K&dateb=&owner=include&count=40
- **accessedAt**: 2026-08-31
- **metrics**: none
- **notes**: Canonical anchor — the SEC EDGAR filing index for Duolingo, Inc.
  (CIK 0001562088), filtered to 10-K filings. This is the root from which all
  10-K citation URLs are located; it cites no figures itself. Per `docs/spec.md`
  §4, the FY2021–FY2025 10-K accession numbers verified there are recorded in
  the spec and will be cited per-document (with their own ledger entries) at
  data-transcription time (P1).

---

> **Current entry count**: 1 (machinery only). No financial figures are
> transcribed in Phase 0 — first data citations land in P1, each with its own
> ledger entry added at transcription time.
