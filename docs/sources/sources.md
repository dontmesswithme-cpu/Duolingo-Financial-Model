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

### LED-002
- **entity**: Duolingo, Inc.
- **form**: 10-K
- **period**: FY2025
- **filed**: 2026-02-27
- **url**: https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm
- **accessedAt**: 2026-09-01
- **metrics**: revenue_subscription, revenue_advertising, revenue_duolingo_english_test, revenue_in_app_purchases, revenue_other, revenue_total, cost_of_revenue, gross_profit, opex_research_and_development, opex_sales_and_marketing, opex_general_and_administrative, opex_total, operating_income, other_income, other_expense, other_income_net, income_before_interest_and_taxes, interest_income, pretax_income, income_tax, net_income, cash_and_cash_equivalents, short_term_investments, accounts_receivable, deferred_cost_of_revenues, income_tax_receivable, prepaid_expenses_and_other_current_assets, total_current_assets, operating_lease_right_of_use_assets, long_term_investments, intangible_assets_net, property_and_equipment_net, goodwill, restricted_cash, deferred_tax_assets_net, other_assets, total_assets, deferred_revenues, accounts_payable, income_tax_payable, accrued_expenses, total_current_liabilities, long_term_operating_lease_obligation, deferred_tax_liabilities_net, total_liabilities, common_stock, additional_paid_in_capital, retained_earnings_accumulated_deficit, total_stockholders_equity, total_liabilities_and_stockholders_equity, cf_deferred_income_taxes, cf_stock_based_compensation, cf_depreciation_and_amortization, cf_accretion_on_marketable_securities, cf_other_noncash, cf_change_deferred_revenue, cf_change_accounts_receivable, cf_change_deferred_cost_of_revenues, cf_change_prepaid_expenses_and_other_assets, cf_change_accounts_payable, cf_change_accrued_expenses, cf_change_noncurrent_assets_and_liabilities, cash_from_operating_activities, purchases_of_investments, maturities_and_paydowns_of_investments, capitalized_software_and_intangibles, purchase_of_property_and_equipment, proceeds_from_sale_of_capitalized_software, acquisitions_net_of_cash_acquired, payment_of_acquisition_earn_out, cash_from_investing_activities, proceeds_from_stock_options_exercise, taxes_paid_net_share_settlement, cash_from_financing_activities, net_change_in_cash, cash_beginning_of_period, cash_end_of_period, dau, mau, paid_subscribers, subscription_bookings, total_bookings, adjusted_ebitda
- **notes**: FY2025 Form 10-K (accession 0001628280-26-012494). Income-statement
  rows read from the three-year columns (2025 / 2024 / 2023) of the
  `Consolidated Statements of Operations and Comprehensive Income`; revenue
  component rows read from the `Disaggregation of Revenue` note (Subscription and
  Total revenues) and its companion table breaking "Other" into Advertising,
  Duolingo English Test, IAPs and Other. Balance sheet rows read from
  `Consolidated Balance Sheets` (December 31, 2025 and 2024). Cash flow statement
  rows read from `Consolidated Statements of Cash Flows` (FY2025, FY2024, FY2023).
  Key Operating Metrics and Non-GAAP measures read from Item 7 MD&A tables
  (FY2025, FY2024, Q4 FY2025) with verbatim definitions for DAUs, MAUs, Paid
  subscribers, Bookings, and Adjusted EBITDA.
  Anchors FY2025, FY2024, FY2023 across IS, BS, CF, and KPIs.

### LED-003
- **entity**: Duolingo, Inc.
- **form**: 10-K
- **period**: FY2023
- **filed**: 2024-02-29
- **url**: https://www.sec.gov/Archives/edgar/data/1562088/000156208824000050/duol-20231231.htm
- **accessedAt**: 2026-09-01
- **metrics**: revenue_subscription, revenue_advertising, revenue_duolingo_english_test, revenue_in_app_purchases, revenue_other, revenue_total, cost_of_revenue, gross_profit, opex_research_and_development, opex_sales_and_marketing, opex_general_and_administrative, opex_total, operating_income, other_income, other_expense, other_income_net, income_before_interest_and_taxes, interest_income, pretax_income, income_tax, net_income, cash_and_cash_equivalents, accounts_receivable, deferred_cost_of_revenues, prepaid_expenses_and_other_current_assets, total_current_assets, operating_lease_right_of_use_assets, intangible_assets_net, property_and_equipment_net, restricted_cash, deferred_tax_assets_net, other_assets, total_assets, deferred_revenues, accounts_payable, accrued_expenses, total_current_liabilities, long_term_operating_lease_obligation, total_liabilities, common_stock, additional_paid_in_capital, retained_earnings_accumulated_deficit, total_stockholders_equity, total_liabilities_and_stockholders_equity, cf_stock_based_compensation, cf_depreciation_and_amortization, cf_gain_loss_sale_capitalized_software, cf_loss_on_disposal_leasehold_improvements, cf_change_deferred_revenue, cf_change_accounts_receivable, cf_change_deferred_cost_of_revenues, cf_change_prepaid_expenses_and_other_assets, cf_change_accounts_payable, cf_change_accrued_expenses, cf_change_noncurrent_assets_and_liabilities, cash_from_operating_activities, capitalized_software_and_intangibles, purchase_of_property_and_equipment, proceeds_from_sale_of_capitalized_software, acquisitions_net_of_cash_acquired, cash_from_investing_activities, issuance_of_common_stock_ipo, proceeds_from_stock_options_exercise, repurchases_of_stock_options, repurchase_of_common_stock, taxes_paid_net_share_settlement, cash_from_financing_activities, net_change_in_cash, cash_beginning_of_period, cash_end_of_period, dau, mau, paid_subscribers, subscription_bookings, total_bookings, adjusted_ebitda
- **notes**: FY2023 Form 10-K (accession 0001562088-24-000050). Read for the FY2022
  and FY2021 comparative columns, per `docs/phases/phase_1.md` P1.1 — the FY2021
  10-K is superseded because the FY2023 filing restates FY2021 other income and
  other expense onto the same gross-presentation basis as FY2022–FY2023
  (FY2021 other income 318, other expense (288), net 30; the FY2021 10-K as
  originally filed reported "Other income, net of other expenses" of 49, with
  loss before provision for income taxes of (59,958) against (59,977) here).
  Rows are transcribed on the FY2023 10-K basis so all five years share one
  presentation. Income statement: `Consolidated Statements of Operations and
  Comprehensive Income (Loss)`; revenue components: `Disaggregation of Revenue`;
  balance sheets: `Consolidated Balance Sheets` (December 31, 2023 and 2022);
  cash flows: `Consolidated Statements of Cash Flows` (FY2023, FY2022, FY2021);
  Key Operating Metrics and Non-GAAP measures: Item 7 MD&A tables (FY2023, FY2022).

### LED-004
- **entity**: Duolingo, Inc.
- **form**: 10-Q
- **period**: Q3 FY2025
- **filed**: 2025-11-06
- **url**: https://www.sec.gov/Archives/edgar/data/1562088/000162828025049743/duol-20250930.htm
- **accessedAt**: 2026-09-01
- **metrics**: revenue_subscription, revenue_advertising, revenue_duolingo_english_test, revenue_in_app_purchases, revenue_other, revenue_total, cost_of_revenue, gross_profit, opex_research_and_development, opex_sales_and_marketing, opex_general_and_administrative, opex_total, operating_income, other_income_net, income_before_interest_and_taxes, interest_income, pretax_income, income_tax, net_income, cf_deferred_income_taxes, cf_stock_based_compensation, cf_depreciation_and_amortization, cf_accretion_on_marketable_securities, cf_change_deferred_revenue, cf_change_accounts_receivable, cf_change_deferred_cost_of_revenues, cf_change_prepaid_expenses_and_other_assets, cf_change_accounts_payable, cf_change_accrued_expenses, cf_change_noncurrent_assets_and_liabilities, cash_from_operating_activities, purchases_of_investments, maturities_and_paydowns_of_investments, capitalized_software_and_intangibles, purchase_of_property_and_equipment, acquisitions_net_of_cash_acquired, payment_of_acquisition_earn_out, cash_from_investing_activities, proceeds_from_stock_options_exercise, cash_from_financing_activities, net_change_in_cash, cash_beginning_of_period, cash_end_of_period, dau, mau, paid_subscribers, subscription_bookings, total_bookings, adjusted_ebitda
- **notes**: Q3 FY2025 Form 10-Q (accession 0001628280-25-049743). For income statement,
  only the three-month column ("Three Months Ended September 30, 2025") is transcribed
  as a discrete quarter. For cash flow statement, the nine-month YTD column ("Nine Months
  Ended September 30, 2025") is transcribed as `periodType: "ytd"` (9M FY2025) and
  comparative 9M FY2024 as `periodType: "ytd"`. For KPIs, discrete Q3 FY2025 and 9M FY2025
  operating metrics and Non-GAAP measures are transcribed from Part I Item 2 MD&A tables.
  Income statement: `Unaudited Condensed Consolidated Statements of Operations and
  Comprehensive Income`; revenue components: `Disaggregation of Revenue`; cash flows:
  `Unaudited Condensed Consolidated Statements of Cash Flows`; KPIs: `Key Operating Metrics`.

### LED-005
- **entity**: Duolingo, Inc.
- **form**: 10-Q
- **period**: Q1 FY2026
- **filed**: 2026-05-05
- **url**: https://www.sec.gov/Archives/edgar/data/1562088/000162828026029976/duol-20260331.htm
- **accessedAt**: 2026-09-01
- **metrics**: revenue_subscription, revenue_advertising, revenue_duolingo_english_test, revenue_in_app_purchases, revenue_other, revenue_total, cost_of_revenue, gross_profit, opex_research_and_development, opex_sales_and_marketing, opex_general_and_administrative, opex_total, operating_income, other_income_net, income_before_interest_and_taxes, interest_income, pretax_income, income_tax, net_income, cf_deferred_income_taxes, cf_stock_based_compensation, cf_depreciation_and_amortization, cf_accretion_on_marketable_securities, cf_change_deferred_revenue, cf_change_accounts_receivable, cf_change_deferred_cost_of_revenues, cf_change_prepaid_expenses_and_other_assets, cf_change_accounts_payable, cf_change_accrued_expenses, cf_change_noncurrent_assets_and_liabilities, cash_from_operating_activities, purchases_of_investments, maturities_and_paydowns_of_investments, capitalized_software_and_intangibles, purchase_of_property_and_equipment, cash_from_investing_activities, proceeds_from_stock_options_exercise, repurchase_of_common_stock, taxes_paid_net_share_settlement, cash_from_financing_activities, net_change_in_cash, cash_beginning_of_period, cash_end_of_period, dau, paid_subscribers, subscription_bookings, total_bookings, adjusted_ebitda
- **notes**: Q1 FY2026 Form 10-Q (accession 0001628280-26-029976). Single
  three-month column ("Three Months Ended March 31, 2026") transcribed for IS. Cash flow
  statement transcribed as `periodType: "ytd"` for 3M FY2026 and comparative 3M FY2025.
  KPIs transcribed from Part I Item 2 MD&A tables (Q1 FY2026 DAU, Paid subscribers,
  Subscription bookings, Total bookings, Adjusted EBITDA).
  Income statement: `Unaudited Condensed Consolidated Statements of Operations and
  Comprehensive Income`; revenue components: `Disaggregation of Revenue`; cash flows:
  `Unaudited Condensed Consolidated Statements of Cash Flows`; KPIs: `Key Operating Metrics`.

### LED-006
- **entity**: Duolingo, Inc.
- **form**: 10-Q
- **period**: Q2 FY2026
- **filed**: 2026-08-06
- **url**: https://www.sec.gov/Archives/edgar/data/1562088/000162828026053603/duol-20260630.htm
- **accessedAt**: 2026-09-01
- **metrics**: revenue_subscription, revenue_advertising, revenue_duolingo_english_test, revenue_in_app_purchases, revenue_other, revenue_total, cost_of_revenue, gross_profit, opex_research_and_development, opex_sales_and_marketing, opex_general_and_administrative, opex_total, operating_income, other_income_net, income_before_interest_and_taxes, interest_income, pretax_income, income_tax, net_income, cash_and_cash_equivalents, short_term_investments, accounts_receivable, deferred_cost_of_revenues, income_tax_receivable, prepaid_expenses_and_other_current_assets, total_current_assets, operating_lease_right_of_use_assets, long_term_investments, intangible_assets_net, property_and_equipment_net, goodwill, restricted_cash, deferred_tax_assets_net, other_assets, total_assets, deferred_revenues, accounts_payable, income_tax_payable, accrued_expenses, total_current_liabilities, long_term_operating_lease_obligation, deferred_tax_liabilities_net, total_liabilities, common_stock, additional_paid_in_capital, retained_earnings_accumulated_deficit, treasury_stock, total_stockholders_equity, total_liabilities_and_stockholders_equity, cf_deferred_income_taxes, cf_stock_based_compensation, cf_depreciation_and_amortization, cf_accretion_on_marketable_securities, cf_impairment_capitalized_software, cf_change_deferred_revenue, cf_change_accounts_receivable, cf_change_deferred_cost_of_revenues, cf_change_prepaid_expenses_and_other_assets, cf_change_accounts_payable, cf_change_accrued_expenses, cf_change_noncurrent_assets_and_liabilities, cash_from_operating_activities, purchases_of_investments, maturities_and_paydowns_of_investments, capitalized_software_and_intangibles, purchase_of_property_and_equipment, cash_from_investing_activities, proceeds_from_stock_options_exercise, repurchase_of_common_stock, taxes_paid_net_share_settlement, cash_from_financing_activities, net_change_in_cash, cash_beginning_of_period, cash_end_of_period, dau, paid_subscribers, subscription_bookings, total_bookings, adjusted_ebitda
- **notes**: Q2 FY2026 Form 10-Q (accession 0001628280-26-053603) — the latest
  reported quarter as of transcription, so it closes the TTM window. Three-month
  column ("Three Months Ended June 30, 2026") transcribed for IS. Balance sheet as of
  June 30, 2026 transcribed for BS. Cash flow statement ("Six Months Ended June 30, 2026"
  and comparative "Six Months Ended June 30, 2025") transcribed as `periodType: "ytd"`
  for CF (6M FY2026, 6M FY2025). KPIs transcribed from Part I Item 2 MD&A tables
  (Q2 FY2026 DAU, Paid subscribers, Subscription bookings, Total bookings, Adjusted EBITDA).
  Income statement: `Unaudited Condensed Consolidated Statements of Operations and
  Comprehensive Income`; revenue components: `Disaggregation of Revenue`; balance sheets:
  `Unaudited Condensed Consolidated Balance Sheets`; cash flows: `Unaudited Condensed
  Consolidated Statements of Cash Flows`; KPIs: `Key Operating Metrics`.

### LED-007
- **entity**: Duolingo, Inc.
- **form**: 10-K
- **period**: FY2021
- **filed**: 2022-03-04
- **url**: https://www.sec.gov/Archives/edgar/data/1562088/000156208822000039/duol-20211231.htm
- **accessedAt**: 2026-09-01
- **metrics**: cash_and_cash_equivalents, accounts_receivable, deferred_cost_of_revenues, prepaid_expenses_and_other_current_assets, total_current_assets, property_and_equipment_net, capitalized_software_net, operating_lease_right_of_use_assets, other_assets, total_assets, deferred_revenues, accounts_payable, income_tax_payable, accrued_expenses_and_other_current_liabilities, total_current_liabilities, long_term_operating_lease_liability, total_liabilities, common_stock, additional_paid_in_capital, retained_earnings_accumulated_deficit, total_stockholders_equity, total_liabilities_and_stockholders_equity, dau, mau, paid_subscribers, subscription_bookings, total_bookings, adjusted_ebitda
- **notes**: FY2021 Form 10-K (accession 0001562088-22-000039). Read for the FY2021
  balance sheet comparative column (December 31, 2021) of `Consolidated Balance
  Sheets` and the FY2021 Key Operating Metrics & Non-GAAP measures in Item 7 MD&A
  (FY2021 DAUs 9.6M, MAUs 40.5M, Paid subscribers 2.5M, Subscription bookings $224,520K,
  Total bookings $294,247K, Adjusted EBITDA $(1,066)K).

---

> **Current entry count**: 7 (LED-001 index + LED-002…LED-007 figure-bearing).
> P1.1 transcribed `src/data/historical/income.json` against LED-002…LED-006;
> P1.2 transcribed `src/data/historical/balance.json` against LED-002, LED-003,
> LED-006 and LED-007;
> P1.3 transcribed `src/data/historical/cashflow.json` against LED-002, LED-003,
> LED-004, LED-005, LED-006;
> P1.4 transcribed `src/data/historical/kpis.json` against LED-002, LED-003,
> LED-004, LED-005, LED-006, LED-007. Every `source.url` in
> `src/data/historical/*.json` joins to one of these entries.
>
> **Known gap flagged by DS**: the TTM window (Q3 FY2025 → Q2 FY2026) contains
> four quarters, but Q4 FY2025 has no 10-Q three-month column — it is only
> derivable as FY2025 minus 9M YTD. Per the Phase 1 objective ("no derived
> values entered as data") it is deliberately NOT transcribed as raw data; P1.3's
> `ttm.js` derives it as a `computed` value. See the P1.1 sub-phase log.
