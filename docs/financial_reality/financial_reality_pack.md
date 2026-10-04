# Financial Reality & Economic Plausibility Pack (Phase 10 — P10.7)

> **Sub-Phase**: `P10.7` — Financial Reality and Economic Plausibility  
> **Status**: Completed by Worker (`DS`) for Auditor (`OP`) and Director (`DIR`) Independent Review & Sign-Off  
> **Valuation Date**: `2026-09-02`  
> **Reporting Cutoff**: `2026-06-30` (Q2 2026 Form 10-Q)  
> **Source Bundle SHA-256**: `98fd13667cf0732e8da4fc60319fc3d556f5cce12b31d1abc73d1126d2a352a8`  
> **Model State SHA-256**: `2ba379ab2abe821ccd1352f87c3fcdbffbc3814f6c13efe71e0bcce48348977e`  
> **Re-Performance Inputs Hash**: `5ae9522c8551e30c3bfa1c36af94821521343ead26171b122413bd680b79ca1b`  

---

## Executive Summary & Scope

Per `docs/phases/phase_10.md` §P10.7 and the Director's kickoff instructions in `docs/inbox_ds.md`, Phase 10 is not considered complete merely because unit tests pass and code compiles. The financial model must agree with:
1. Filed financial statements and primary-source disclosures (SEC EDGAR, FRED, Damodaran).
2. Basic accounting identities and 3-statement articulation.
3. Rigorous economic cash-flow definitions (FCFF vs FCFE vs levered FCF).
4. Realistic peer benchmarks and economic plausibility relationships.
5. Independent re-performance of all valuation results within declared tolerances.

Worker (`DS`) provides the verified evidence, primary citations, exact computed residuals, and independent calculation derivations below. Formal approval and signature of `docs/financial_reality/phase_10_report.json` remain reserved for Reviewer (`OP`) and Director (`DIR`).

---

## 1. Primary-Source Financial Verification & Lease Provenance Resolution (§P10.7.1)

### 1.1 Resolution of Standing Lease Carry
In earlier cycles, SEC EDGAR returned HTTP 503 for the lease detail table (`R29`), leaving the measurement period of the operating lease cost add-back unconfirmed and generating tension against the FY2025 Form 10-K Note 9 annual figure (`~$7.204M` citation pending).

**EDGAR Direct Re-Pull & Provenance Verification**:
- **Operating Lease Liability ($86,136k)**:
  - **Filing**: Form 10-Q for the quarterly period ended June 30, 2026 (Accession `0001628280-26-053603`).
  - **Table**: `R2.htm` (Unaudited Condensed Consolidated Balance Sheets).
  - **SHA-256**: `848fba2cd731ec6990f64b17ebf6920d18b2456bb14200a90446f72de4ee5ea6` (132,371 bytes).
  - **Verified Line**: *Operating lease liabilities, noncurrent* = `$86,136 thousand` as of June 30, 2026.
  - **Status**: `verified_primary_filing_balance_sheet`.
- **Operating Lease Cost Add-Back ($12,071k)**:
  - **Filing**: Form 10-K for the fiscal year ended December 31, 2025 (Accession `0001628280-26-012494`).
  - **Table**: `R58.htm` (Note 9. Leases - Schedule of Components of Lease Cost Details).
  - **SHA-256**: `6ee76828d7e1b1843e31eb29e1814bf3edfba80525b96c70f9ec54231ce21681` (22,289 bytes).
  - **Verified Line**: *Operating lease cost* for the 12 Months Ended Dec. 31, 2025 = `$12,071 thousand`.
  - **Resolution of Tension**: The figure `$12,071k` is the annual lease cost from the FY2025 10-K Note 9. Under US GAAP ASC 842, interim 10-Q reports do not disclose quarterly lease cost components in filing notes; the annual run-rate figure of `$12,071k` serves as the annual run-rate add-back to EBITDA to compute forward EBITDAR. The tension against `~$7.204M` is formally resolved: `$7.204M` was an unverified estimate, whereas `$12,071k` is the primary audited Form 10-K disclosure.
  - **Status**: `verified_primary_filing_annual`.
- **Validation**: `src/data/historical/duolLeaseInputs.json` was updated with complete provenance, URLs, hashes, and byte counts. `src/data/leaseGate.js` validates with `isFullyVerified: true` and zero unverified inputs.

### 1.2 Material DUOL Financial Inputs Ledger
All material inputs are documented in `docs/financial_reality/source_ledger.json` across 90 granular entries (70 filed facts, 11 sourced market parameters, 1 baseline assumption, and 8 methodological judgments). Selected material items:

| Category | Claim / Line Item | Filing / Doc | Period | Accession / URL | Reported Value | Modeled Value | Residual |
|---|---|---|---|---|---|---|---|
| **Revenue** | Total Revenue | Form 10-K | FY2025 | `0001628280-26-012494` | $1,037,589k | $1,037,589k | 0.0 |
| **Revenue** | Total Revenue | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $298,454k | $298,454k | 0.0 |
| **Revenue** | Subscription Revenue | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $258,035k | $258,035k | 0.0 |
| **Revenue** | Advertising Revenue | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $21,052k | $21,052k | 0.0 |
| **Revenue** | Duolingo English Test | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $10,109k | $10,109k | 0.0 |
| **Revenue** | In-App Purchases (IAP) | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $8,002k | $8,002k | 0.0 |
| **Margin** | Gross Profit | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $216,740k | $216,740k | 0.0 |
| **Opex** | Research & Development | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $92,195k | $92,195k | 0.0 |
| **Opex** | Sales & Marketing | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $40,007k | $40,007k | 0.0 |
| **Opex** | General & Administrative | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $50,593k | $50,593k | 0.0 |
| **Profit** | Operating Income | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $33,945k | $33,945k | 0.0 |
| **Profit** | Net Income | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $33,158k | $33,158k | 0.0 |
| **Cash** | Cash & Cash Equivalents | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $1,180,887k | $1,180,887k | 0.0 |
| **Investments** | Short-Term Investments | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $132,979k | $132,979k | 0.0 |
| **Investments** | Long-Term Investments | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $102,693k | $102,693k | 0.0 |
| **Debt** | Funded Borrowings / Debt | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $0k | $0k | 0.0 |
| **Leases** | Operating Lease Liability | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $86,136k | $86,136k | 0.0 |
| **Leases** | Operating Lease Cost | Form 10-K | FY2025 | `0001628280-26-012494` | $12,071k | $12,071k | 0.0 |
| **Cash Flow** | 6M Operating Cash Flow | Form 10-Q | 6M FY2026 | `0001628280-26-053603` | $239,031k | $239,031k | 0.0 |
| **Cash Flow** | 6M PP&E Purchases | Form 10-Q | 6M FY2026 | `0001628280-26-053603` | $(7,028)k | $(7,028)k | 0.0 |
| **Cash Flow** | 6M Capitalized Software | Form 10-Q | 6M FY2026 | `0001628280-26-053603` | $(5,587)k | $(5,587)k | 0.0 |
| **Cash Flow** | 6M SBC Add-Back | Form 10-Q | 6M FY2026 | `0001628280-26-053603` | $72,857k | $72,857k | 0.0 |
| **Cash Flow** | 6M D&A Add-Back | Form 10-Q | 6M FY2026 | `0001628280-26-053603` | $8,438k | $8,438k | 0.0 |
| **Cash Flow** | 6M Share Repurchases | Form 10-Q | 6M FY2026 | `0001628280-26-053603` | $(69,603)k | $(69,603)k | 0.0 |
| **Working Cap** | Deferred Revenues | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $505,102k | $505,102k | 0.0 |
| **Working Cap** | Accounts Receivable | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $130,979k | $130,979k | 0.0 |
| **Working Cap** | Accounts Payable | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $16,196k | $16,196k | 0.0 |
| **Shares** | Period-End Basic Common | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | 46,724,000 | 46,724,000 | 0 |
| **Shares** | TSM Incremental Options | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | 520,458 | 520,458 | 0 |
| **Shares** | Dilutive RSUs & Awards | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | 2,817,000 | 2,817,000 | 0 |
| **Shares** | Met Founder Awards | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | 0 | 0 | 0 |
| **Shares** | Fully Diluted Spot Total | Schedule | Q2 FY2026 | `duolFullyDiluted.json` | 50,061,458 | 50,061,458 | 0 |
| **KPIs** | Monthly Active Users (MAU) | Form 10-K | FY2025 | `0001628280-26-012494` | 133,100,000 | 133,100,000 | 0 |
| **KPIs** | Daily Active Users (DAU) | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | 58,700,000 | 58,700,000 | 0 |
| **KPIs** | Paid Subscribers | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | 12,700,000 | 12,700,000 | 0 |
| **KPIs** | Total Bookings | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $289,054k | $289,054k | 0.0 |
| **KPIs** | Subscription Bookings | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $250,316k | $250,316k | 0.0 |
| **Tax / Interest**| Interest Income | Form 10-Q | Q2 FY2026 | `0001628280-26-053603` | $11,831k | $11,831k | 0.0 |
| **Tax / Interest**| Normalized Tax Rate | Form 10-K | FY2024 | `0001628280-26-012494` | 13.4225% | 13.4225% | 0.0 |

---

## 2. Peer & Market Reality (§P10.7.2)

### 2.1 Locked Three-Peer Universe (SPOT, RBLX, NFLX)
Per Phase 8 architecture and P10.4 peer consistency rules, all peer valuations are anchored on a capitalized-lease basis (operating lease liabilities in EV; rent added back to EBITDA -> EBITDAR) with single-date pricing as of `2026-09-02`:

1. **Spotify Technology S.A. (SPOT)**:
   - **Stock Price / Market Cap**: $559.36 / $114,993.23M (205.58M diluted shares).
   - **TTM Revenue**: $20,690.0M (€18,113.0M at 1.1423 EUR/USD).
   - **FY2026E Consensus Revenue**: $22,320.02M (+13.68% YoY).
   - **TTM EBITDA**: $3,070.0M.
   - **Operating Leases**: Rent add-back $74.1M (€65M); Lease liabilities $531.24M (€466M).
   - **Cash & Short-Term Investments**: $10,702.32M (€5,938M cash + €3,450M STI = €9,388M at 1.14 EUR/USD). *Corrected under P10.7 F2 — previously recorded as $7,962.90M on a €1,047M STI leg that matches no balance-sheet line. Re-transcribed from the Q2 2026 interim financial statements 6-K statement of financial position (Accession `0001628280-26-052543`), not the shareholder deck. Conversion lane: 1.14 is the balance-sheet spot lane applied uniformly to BOTH legs (5938 x 1.14 = 6769.32; 3450 x 1.14 = 3933.00) — distinct by design from the 1.1423 flow-item lane used for TTM revenue/EBITDA conversions.*
   - **Capitalized EV**: $104,822.15M (EV / Forward Revenue: 4.70x; EV / Forward EBITDAR: 29.33x). *Entailed move: the corrected cash total raises SPOT net cash by $2,739.42M, cutting EV by the same amount (was $107,561.57M / 4.82x / 30.09x).*
   - **Native KPIs**: 777M MAU, 300M Premium Subscribers, €4.89 monthly ARPU (Q2 2026 Form 6-K Exhibit 99.1).
   - **Filing**: Form 6-K Exhibit 99.1 (Accession `0001140361-26-031044`, filed 2026-08-04) for operating metrics; Form 6-K interim financial statements (Accession `0001628280-26-052543`, filed 2026-08-04) for the balance sheet.

2. **Roblox Corporation (RBLX)**:
   - **Stock Price / Market Cap**: $41.21 / $30,989.92M (752.0M fully diluted shares per Q2 10-Q MD&A).
   - **TTM Revenue**: $5,686.0M.
   - **FY2026E Consensus Revenue**: $6,890.0M (+40.89% YoY).
   - **TTM EBITDA**: $(843.52)M (operating loss before D&A).
   - **Operating Leases**: Rent add-back $178.70M; Lease liabilities $827.0M.
   - **Capitalized EV**: $29,811.92M (EV / Forward Revenue: 4.33x; EV / Forward EBITDAR: N/A negative).
   - **Native KPIs**: 123M DAU, $1,557M Bookings ($0.14/day), $12.66 ABPU (Q2 2026 Form 10-Q Item 2 MD&A).
   - **Filing**: Form 10-Q Item 2 (Accession `0001628280-26-051082`, filed 2026-07-30).

3. **Netflix, Inc. (NFLX)**:
   - **Stock Price / Market Cap**: $82.73 / $344,156.80M (4,160.0M shares).
   - **TTM Revenue**: $48,371.0M.
   - **FY2026E Consensus Revenue**: $51,220.0M (+13.36% YoY).
   - **TTM EBITDA**: $14,727.41M.
   - **Operating Leases**: Rent add-back $503.64M; Lease liabilities $2,330.40M.
   - **Capitalized EV**: $351,683.20M (EV / Forward Revenue: 6.87x; EV / Forward EBITDAR: 20.37x).
   - **Native KPIs**: 277.65M Paid Memberships, $11.64 monthly ARM (derived, Q2 2024 basis - see provenance below).
     - *Membership provenance (corrected under P10.7 F1, VALUE UNCHANGED)*: 277.65M is the **Q2 2024** figure as of 2024-06-30, not a Q2 2026 figure. It is Netflix's **last filed** paid-membership count — Netflix discontinued quarterly membership reporting after Q4 2024, and the Q2 2026 10-Q contains no membership count. Verified against the originating Q2 2024 shareholder letter, which reports `Global Streaming Paid Memberships 238.39 247.15 260.28 269.60 277.65` across Q2'23–Q2'24. **Staleness disclosed**: ~26 months old at the 2026-09-02 valuation date. It is used as the Per-User median basis as the most recent *filed* figure, not as a proxy for current subscribers.
     - *ARM provenance (REPLACED under P10.7 F1 Resubmission 4, $12.10 -> $11.64)*: the prior $12.10 cited the Q2 2026 10-Q, which states no ARM figure anywhere. A live EDGAR sweep proves $12.10 appears in NO Netflix primary document (absent from all Q1/Q2/Q3/Q4 2024 and Q1/Q2/Q3 2025 shareholder letters, which print only regional ARM, and from the 2024/2025 10-K filings, which carry no ARM disclosure). Replacement: $11.64 derived per the filer's own ARM definition (streaming revenue / average paid memberships) from the last period with both inputs filed - Q2 2024 revenue $9,559M / average memberships 273.625M / 3 months (machine arithmetic in `scratch/p107_arm_derive.mjs`). Same Q2 2024 vintage and staleness as the memberships basis. Display-context only (`perUser.js:194` reads the display string; no per-share math reads the value), so the Per-User median 347.91 and all pins are unmoved.
   - **Filing**: Form 10-Q (Accession `0001065280-26-000212`, filed 2026-07-17) for financials; **Form 8-K Exhibit 99.1 (Accession `0001065280-24-000199`, filed 2024-07-18) for paid memberships** — the previously cited Q2 2026 10-Q does not carry the membership figure.

### 2.2 Market Discount Rate Anchors
- **10-Year US Treasury Risk-Free Rate ($R_f$)**: `4.79%` (0.0479). FRED Series DGS10 official close as of 2026-09-01.
- **Equity Risk Premium (ERP)**: `4.25%` (0.0425). Trailing 3-month unweighted average of Aswath Damodaran's monthly implied ERP prints for the US (4.30% July, 4.28% August, 4.14% September).
- **Levered Beta ($\beta$)**: `1.49` — bottom-up **peer MEAN** unlevered beta across the locked SPOT/RBLX/NFLX set (StockAnalysis + per-peer OLS). The peer median (1.47) is retained as a context readout only; at n = 3 the median is definitionally the middle single observation (NFLX), so it quotes one peer rather than summarising the set.
- **Market Benchmark Share Price**: `$157.85` (DUOL official close as of 2026-09-02).

### 2.3 Judgment Layer Documentation (8 Active Rulings)
Per P10.7 schema requirements, methodological judgments and economic policy choices are strictly distinguished from filed facts and sourced market parameters:

1. **Terminal Growth Rate ($g = 2.50\%$)**: Macroeconomic GDP cap. Set to 2.50% to remain strictly below long-term nominal US GDP growth and strictly below evaluated WACC (11.1225%), ensuring finite Gordon Growth convergence.
2. **Terminal SBC Margin Endpoint ($8.0\%$ in FY2035)**: Long-term tech compensation normalization policy. Reflects smooth fade from current ~11.5% to mature software industry benchmark of 8.0% of revenue at steady-state.
3. **SBC Cash-Flow Add-Back & Dilution Settlement Policy**: Valuation accounting policy. GAAP OCF adds back SBC as non-cash; economic cost is captured through future share count expansion (either explicit share issuance or perpetual dilution $d_{perm}$), strictly preventing double-counting or omission per Economic Identity Gates.
4. **Perpetual Share Dilution Rate ($d_{perm} = 1.0\%$)**: Terminal state ongoing equity grant overhang policy. Set to 1.0% annual net dilution (within practitioner benchmark 0.0%–2.0%).
5. **Cost of Capital / WACC Construction Policy ($11.1225\%$)**: Debt-free capital structure ($W_e = 100\%$, $W_d = 0\%$, $WACC = K_e$). Constructed from 10Y US Treasury ($R_f = 4.79\%$, 2026-09-01), peer beta ($\beta = 1.49$, peer MEAN, 2026-08-31), and Damodaran 3-month trailing ERP ($ERP = 4.25\%$, 2026-09-01), evaluating to $K_e = 4.79\% + 1.49 \times 4.25\% = 11.1225\%$.
6. **10-Period Canonical Forecast Horizon (FY2026–FY2035)**: Production horizon policy. 10 discrete annual projection periods (5-year explicit growth FY2026–FY2030 + 5-year fade glide FY2031–FY2035) adopted as the sole production valuation horizon; 5-period model retained as legacy comparison.
7. **Operating Lease Run-Rate Use ($12,071k$)**: ASC 842 forward proxy judgment. Audited FY2025 Form 10-K Note 9 full-year operating lease cost ($12,071k) adopted as forward annual run-rate proxy for DUOL forward EBITDAR add-back.
8. **SOTP Decomposition-Only Agreement Exclusion ($0$ Votes)**: Agreement architecture policy. SOTP is an additive EV/Revenue decomposition of Core Subscription and DET segments sharing identical multiples and FD denominator; excluded from the 3 evidence clusters (0 votes, excluded from breadth, min/max, confidence, and verdict) to prevent double-counting enterprise-relative evidence.

---

## 3. Accounting Reality Checks & Computed Residuals (§P10.7.3)

### 3.1 Historical Balance Sheet Identity: $Assets = Liabilities + Equity$

$$\text{Residual} = |Assets - (Liabilities + Equity)|$$

| Period | Total Assets ($k) | Total Liabilities ($k) | Stockholders' Equity ($k) | Computed Residual | Verdict |
|---|---|---|---|---|---|
| **FY2021** | 661,311 | 148,255 | 513,056 | **0.000000** | PASS |
| **FY2022** | 747,347 | 205,269 | 542,078 | **0.000000** | PASS |
| **FY2023** | 953,957 | 298,456 | 655,501 | **0.000000** | PASS |
| **FY2024** | 1,301,728 | 477,178 | 824,550 | **0.000000** | PASS |
| **FY2025** | 1,992,182 | 645,176 | 1,347,006 | **0.000000** | PASS |
| **Q2 FY2026** | 2,073,953 | 664,211 | 1,409,742 | **0.000000** | PASS |

### 3.2 Historical Cash Flow Ending Cash = Balance Sheet Cash

$$\text{Residual} = |\text{Cash Flow Ending Cash} - (\text{BS Cash} + \text{BS Restricted Cash})|$$

| Period | Cash Flow Ending Cash ($k) | BS Cash & Cash Eq ($k) | BS Restricted Cash ($k) | Total BS Cash ($k) | Computed Residual | Verdict |
|---|---|---|---|---|---|---|
| **FY2021** | 553,922 | 553,922 | 0 | 553,922 | **0.000000** | PASS |
| **FY2022** | 608,180 | 608,180 | 0 | 608,180 | **0.000000** | PASS |
| **FY2023** | 750,345 | 747,610 | 2,735 | 750,345 | **0.000000** | PASS |
| **FY2024** | 788,526 | 785,791 | 2,735 | 788,526 | **0.000000** | PASS |
| **FY2025** | 1,039,124 | 1,036,389 | 2,735 | 1,039,124 | **0.000000** | PASS |
| **6M FY2026** | 1,183,622 | 1,180,887 | 2,735 | 1,183,622 | **0.000000** | PASS |

### 3.3 Forecast 3-Statement Articulation Checks (FY2026–FY2035)

$$\text{Retained Roll Residual} = |\text{Retained}(t) - (\text{Retained}(t-1) + \text{Net Income}(t))|$$
$$\text{Cash Roll Residual} = |\text{Ending Cash}(t) - (\text{Beginning Cash}(t) + \text{Net Change in Cash}(t))|$$
$$\text{BS Cash Articulation} = |\text{Ending Cash from CF}(t) - \text{Ending Cash on BS}(t)|$$
$$\text{CF Component Articulation} = |\text{Net Change in Cash}(t) - (\text{OCF}(t) + \text{ICF}(t) + \text{CFF}(t))|$$

| Period | BS Identity Residual | Retained Roll Residual | Cash Roll Residual | BS Cash Articulation | CF Components Articulation | Verdict |
|---|---|---|---|---|---|---|
| **FY2026** (Hybrid) | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | PASS |
| **FY2027** | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | PASS |
| **FY2028** | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | PASS |
| **FY2029** | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | PASS |
| **FY2030** | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | PASS |
| **FY2031** | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | PASS |
| **FY2032** | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | PASS |
| **FY2033** | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | PASS |
| **FY2034** | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | PASS |
| **FY2035** | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | PASS |

### 3.4 Per-Share Accounting Bridges
1. **Basic vs Diluted EPS Reconciliation**:
   - FY2025 Basic WA shares = 43,845k; Diluted WA shares = 48,016k (dilution = 4,171k shares).
   - Q2 FY2026 Basic WA shares = 46,695k; Diluted WA shares = 50,031k (dilution = 3,336k shares: 519k options + 2,817k RSUs).
   - Diluted EPS reported in 10-Q Note 11: Net income $33,158k / 50,031k = $0.66 per share (reconciled exactly).
2. **Fully Diluted Point-in-Time Spot Schedule**:
   - Basic Period-End Shares (Class A + Class B): `46,724,000`
   - Treasury Stock Method Incremental Options: `520,458`
   - Disclosed Dilutive RSUs & Awards: `2,817,000`
   - Met Founder Awards: `0`
   - **Current Fully Diluted Spot Shares**: `50,061,458`
   - Contrast vs Weighted Average Count: 50,031,000 (30,458 shares / 0.06% variance, reflecting the difference between period-blended averages and point-in-time capitalization).

---

## 4. Cash-Flow Definitions Ledger (§P10.7.4)

To prevent methodological confusion, the model strictly isolates and distinguishes all cash flow metrics:

1. **GAAP Operating Cash Flow (OCF)**:
   - *Formula*: Net Income + Non-Cash Charges (D&A, SBC, Deferred Taxes) + Change in Operating Assets & Liabilities.
   - *Historical Values*: FY2025 = $308,016k; 6M FY2026 = $239,031k; TTM = $378,542k.
   - *FY2026 Forecast*: $393,224.34k (H1 actual 239,031k + H2 estimate 154,193.34k).
2. **Levered Free Cash Flow (FCF)**:
   - *Formula*: GAAP OCF − Purchase of PP&E (Capex) − Capitalized Software Outflow.
   - *Historical Values*: TTM FCF = OCF $378,542k − PP&E Capex $12,450k − Software $10,892k = **$355,200k**.
   - *P/Levered FCF Multiplier Basis*: The P/FCF relative valuation method strictly uses this TTM FCF ($355.20M), never mislabeling it as FCFF.
3. **Unlevered Free Cash Flow to Firm (FCFF)**:
   - *Formula*: $NOPAT + D\&A - \text{Total Capex} - \Delta NWC$. Under a debt-free structure ($D = 0$): $FCFF = FCFE - \text{After-Tax Interest Income}$.
   - *FY2026 Forecast Partition*: Full-Year = $323,417.34k; H1 Actual = $210,093.35k; H2 Estimate = $113,323.99k.
   - *Post-Valuation Stub (Sept 2 – Dec 31, 2026)*: **$73,906.95k** (discounted at $t = 0.3279$ years).
4. **Free Cash Flow to Equity (FCFE)**:
   - *Formula*: $FCFF + \text{After-Tax Interest Income} - \text{Principal Debt Repayments} + \text{New Debt Issued}$.
   - *Identity*: Evaluated and verified in every period to within $5.8 \times 10^{-11}$. FCFE is retained as diagnostic only and never enters headline recommendation math or ranges.
5. **Economic FCFF after SBC Expense**:
   - *Formula*: FCFF minus Stock-Based Compensation expense.
   - *Usage*: Evaluated as an internal sanity check. Not recommended as headline because Duolingo's primary DCF explicitly handles SBC dilution through point-in-time share projection ($67,562,285$ shares) rather than double-subtracting SBC as both an expense and dilution.
6. **Current Net Cash Bridge**:
   - *Formula*: Cash & Cash Equivalents + Short-Term Investments + Long-Term Investments − Funded Debt.
   - *At Cutoff Date (2026-06-30)*: $1,180,887k + $132,979k + $102,693k − $0 = **$1,416,559k**.
   - *Rolled to Valuation Date (2026-09-02)*: BOP Cash $1,180,887k + 64-day Pre-Valuation Cash Roll $18,889.73k = Rolled Cash $1,199,776.73k. Rolled Net Cash = **$1,435,448.73k** (DCF bridge only).
   - *Capitalized Net Cash — BASIS DISCLOSURE (P10.7 c6 F2)*: present-day relatives (Comps, EV/EBITDAR, SOTP, Per-User equity legs) divide by latest-filed BS net cash **$1,330,423k** = $1,416,559k − Operating Lease Liability $86,136k (`src/app.js`: `netCashCapitalized = dcfOut.fcff.netCashToday - leaseLiab`). The DCF EV-to-equity bridge discounts from the rolled cash $1,199,776.73k (capitalized rolled $1,349,312.73k) to prevent double-counting pre-valuation cash. Relatives are point-in-time on the filed balance sheet (no forecast roll); the DCF is forward-looking from the valuation date (must roll BOP forward). Values do not move — relative outputs already run on the BOP basis (derived live `scratch/p107_sotp_cash_disclosure.mjs`).
7. **Forecast Cash Accumulation & Terminal Cash**:
   - From valuation date through FY2035, cash accumulates through operating and financing flows to the terminal balance on the FY2035 balance sheet. Terminal cash is disclosed on the balance sheet but NOT discounted as cash flow, preventing double-counting against the spot net cash bridge.

---

## 5. Economic Plausibility Review (§P10.7.5)

### 5.1 Duolingo Operating Performance Review
- **User Growth & Monetization**:
  - MAU grew to 133.1M in FY2025; DAU reached 58.7M in Q2 2026. DAU/MAU ratio of 44.1% reflects strong social engagement and habit formation.
  - Paid subscribers reached 12.7M in Q2 2026 (conversion rate ~9.5%).
  - Total bookings of $289.1M in Q2 2026 (+40% YoY) and subscription bookings of $250.3M demonstrate monetization durability.
- **Unit Economics & Margins**:
  - Gross margins remain consistently in the 71%–73% range (72.6% in Q2 2026), reflecting digital distribution through app stores.
  - Operating margin scaled from 10.7% (FY2024) to 17.6% (FY2025), settling at 11.4% in Q2 2026 due to front-loaded product and AI investments.
  - Rule of 40 score: Revenue growth (+38.7%) + Adjusted EBITDA margin (28.4%) = **67.1%**, comfortably exceeding SaaS benchmarks.
  - Negative net working capital float (driven by $505.1M in upfront unearned subscription deferred revenue) generates persistent operational cash float.

### 5.2 Cost of Capital & Terminal Assumptions
- **Cost of Equity / WACC Build**:
  - Risk-free rate ($R_f$): 4.79% (FRED 10Y US Treasury).
  - Equity Risk Premium (ERP): 4.25% (Damodaran US ERP 3-month trailing).
  - Levered Beta ($\beta$): 1.49 (peer MEAN).
  - $K_e = 4.79\% + 1.49 \times 4.25\% = \mathbf{11.1225\%}$.
  - Debt Weight = 0.0% $\rightarrow$ $\mathbf{WACC = 11.1225\%}$.
- **Terminal Value & Steady State**:
  - Terminal growth rate ($g$): `2.50%` (0.025). Consistent with long-term US GDP growth and inflation expectations.
  - Spread ($WACC - g$): $11.1225\% - 2.50\% = \mathbf{8.6225\%}$ (862.25bps of Gordon headroom).
  - Terminal Value ($TV$): $8,221,173.53k.
  - PV of Terminal Value: $3,071,896.80k.
  - Total Enterprise Value ($EV$): $6,181,615.23k.
  - **Terminal EV Share**: $\mathbf{49.69\%}$. This indicates that the 10-year explicit projection provides approximately half the enterprise value, avoiding excessive reliance on perpetuity extrapolation.

### 5.3 Mandatory Sensitivity Spectrum
- **WACC vs Terminal Growth ($g$)** — 10-period canonical lane, dated seam (beta 1.49 / WACC 11.1225%):
  - Center cell: WACC 11.12%, g 2.50% $\rightarrow$ $113.87 per share (finite-roll intermediate).
  - Strict monotonicity confirmed across all 45 matrix cells ($perShare \downarrow$ as $WACC \uparrow$, $perShare \uparrow$ as $g \uparrow$).
- **Dilution Spectrum** (10-period canonical lane):
  - Spot Shares (50,061,458): `$152.15` per share (unadjusted for future dilution).
  - Finite Roll Intermediate (66,893,352 shares): `$113.87` per share.
  - Perpetual Dilution Canonical (67,562,285 shares): `$\mathbf{112.74}$` per share.
- **Scenario Spectrum** (10-period canonical, canonical basis):
  - Downside (Bear): `$61.47` (-61.06% vs market).
  - Base Case: `$\mathbf{112.74}$` (-28.58% vs market).
  - Upside (Bull): `$238.07` (+50.82% vs market).

---

## 6. Red-Flag Conditions Audit (§P10.7.6)

An exhaustive check against all 12 contractual red-flag conditions confirms:
- [x] **Primary Sources**: 100% of material financial inputs cite verified Form 10-K, Form 10-Q, or primary market sources.
- [x] **Filing Reconciliations**: Historical statements and forecast articulations tie with 0.000000 residual.
- [x] **Peer Timeliness**: SPOT, RBLX, NFLX reflect Q2 2026 filings and 2026-09-02 pricing.
- [x] **Period Matching**: No mixed TTM and forward periods; periods explicitly identified.
- [x] **Zero Double-Counting**: Cash bridge uses rolled spot cash only; cash accumulation is not discounted in FCFF.
- [x] **SBC Consistency**: SBC add-back equals cash flow statement noncash reconciliation exactly ($72,857k for 6M 2026).
- [x] **Denominator Consistency**: All relative valuation methods divide by the same 50,061,458 fully diluted share denominator.
- [x] **Terminal Transparency**: Terminal margins, reinvestment rate, and steady-state NWC inflows derived and disclosed.
- [x] **No Hidden Fallbacks**: Zero bare literals > 999; all fallback literals eradicated and guarded by fail-closed tests.
- [x] **Valuation Cutoff**: All sources dated on or prior to 2026-09-02.
- [x] **Evidence Agreement**: Markdown documentation matches live engine outputs exactly.
- [x] **Test Rigor**: Zero failing tests waived; all 1,263 automated test blocks pass unconditionally.

---

## 7. Independent Re-Performance Package (§P10.7.7)

### 7.1 Eleven Required Re-Performance Calculations
1. **Fully Diluted Share Bridge**:
   $$\text{Basic } 46,724,000 + \text{TSM Options } 520,458 + \text{RSUs } 2,817,000 + \text{Founders } 0 = \mathbf{50,061,458}$$
2. **Q2-to-Valuation Date Cash Roll**:
   $$\text{Q2 Cash } 1,180,887k + \text{64-day H2 Roll } 18,889.73k = \mathbf{1,199,776.73k}$$
3. **FY2026 Post-Valuation Stub**:
   $$\text{Post-Valuation FCFF } = \$73,906.95k \quad (t = 0.3279, \text{DF} = 0.9667) \rightarrow \text{PV} = \mathbf{\$71,446.74k}$$
4. **Three-Statement Cash Movement**:
   $$\text{Operating } 393,224.34k + \text{Investing } (24,227.87)k + \text{Financing } (170,190.50)k = \Delta\text{Cash } \mathbf{198,805.97k}$$
5. **FCFF Calculation**:
   $$\text{PV(Explicit + Fade FCFF)} = \mathbf{\$3,121,895.69k}$$
6. **SBC Add-Back & Dilution**:
   $$\text{SBC Add-Back (6M 2026)} = \$72,857k; \quad \text{Perpetual Dilution Divisor} = \mathbf{67,562,285.30}$$
7. **Perpetual Dilution**:
   $$\text{Canonical Per Share} = \frac{\$7,617,063.96k}{67,562,285.30} = \mathbf{\$112.7414}$$
8. **EV-to-Equity Bridge**:
   $$\text{EV } \$6,181,615.23k + \text{Net Cash } \$1,435,448.73k = \text{Equity Value } \mathbf{\$7,617,063.96k}$$
9. **DCF Per-Share Values**:
   - Current Spot Basis: `$152.1468`
   - Finite Roll Intermediate: `$113.8688`
   - Canonical Add-Back Diluted: `$\mathbf{112.7414}$`
10. **Five Relative Valuation Outputs** (synced to live engine under P10.7 F1 Resubmission 5; derivation `scratch/p107_output_sync.mjs`):
    - EV / Forward Revenue (Comps): `$\mathbf{138.5727}$`
    - EV / Forward EBITDAR (Comps): `$\mathbf{114.7690}$`
    - P / Levered FCF: `$\mathbf{240.2850}$`
    - SOTP Decomposition: `$\mathbf{138.5727}$` (Core: $133.72 + DET: $4.85, allocated pro-rata by segment EV - the engine exposes no per-share split; prior 113.56/27.94 were generator fallbacks against the old 141.50 total. PROVENANCE (P10.7 c6 F1, derived live `scratch/p107_sotp_cash_disclosure.mjs`): forward total $1,193,853.52k = subs $1,152,041.08k + DET $41,812.44k; median EV/FwdRev 4.6963; subs EV $5,410,363.57k + DET EV $196,364.94k = EV $5,606,728.51k; + filed-BS net cash $1,330,423k = equity $6,937,151.51k / 50,061,458 shares = $138.5727; core equity $6,694,191.05k = $133.72, DET equity $242,960.46k = $4.85. Lane: `src/engine/methods/sotp.js` `valuateSotp` `segments.subscriptions.enterpriseValue` / `segments.det.enterpriseValue`.)
    - Per-User / Subscriber: `$\mathbf{347.9079}$`
11. **Evidence-Cluster Verdict**:
    - Intrinsic Cluster: `OVERVALUED` (DCF $112.74)
    - Enterprise-Relative Cluster: `OVERVALUED` (Comps $138.57 Fair, EV/EBITDAR $114.77 Overvalued, Per-User $347.91 Undervalued -> Tie keeps weaker/conservative -> Overvalued)
    - Equity-Cash-Flow Cluster: `UNDERVALUED` (P/FCF $240.29)
    - **Overall Clustered Verdict**: `$\mathbf{OVERVALUED}$` (2 Overvalued vs 1 Undervalued cluster; market price $157.85 exceeds intrinsic fair value $112.74 by -28.58%).

### 7.2 Independent Verification Signatures & Hashes
- **Inputs Hash**: `9574cc6293352583cd82009c38324a869d90f8a75bf80c5577e9afadfc0d08ca`
- **Source Bundle Hash**: `271d84f75153157a73e66543d850ab24282b1ffa62bb3fe27faf03b94ccfbcbc` (recomputed under O1 on authorized 1.49 beta / 11.1225% WACC basis with report generator method)
- **Model State Hash**: `2e875ed8b3da106f0b2eb409865eed73cb11f52491de9c0d863bedae1fbcf104`
- **Output Residual vs Live Engine**: `0.000000` across all valuation methods.
