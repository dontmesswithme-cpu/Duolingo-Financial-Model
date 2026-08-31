# Versioned Visual Screenshots

> **Purpose**: Store automated screenshot captures from iterative review cycles here.

## Directory Organization:
```
screenshots/
├── phase_1/
│   ├── v1/     # Initial sub-phase visual captures
│   ├── v2/     # Fix iteration 1 captures (if v1 failed review)
│   └── v3/     # Fix iteration 2 captures
└── phase_2/
    └── v1/
```

## Review Protocol:
- Reviewer (`OP`) compares the latest versioned capture (`vN`) directly against:
  1. The target benchmark in `docs/design_references/`.
  2. The previous iteration (`vN-1`) to confirm bugs were fixed without visual regressions.
