/**
 * Known-figure fixtures — the anchors no transcription may drift from.
 *
 * Every entry is a **cited** figure, transcribed verbatim from the filing named
 * in its `source`. The dataset in `src/data/historical/*.json` is asserted
 * against this file, so a forged or mistyped number cannot pass the suite.
 *
 * Two rules shape this module (both from `docs/conventions.md`, Financial Data
 * Integrity):
 *  1. Only *filed* figures live in `KNOWN_FIGURES`. No derived metric is ever
 *     hand-typed — see `GROWTH_FIXTURE` below.
 *  2. `source` mirrors the record citation so a fixture can be re-verified
 *     against the filing without leaving this file.
 *
 * @module tests/fixtures/duolingo_facts
 */

/**
 * Anchors mandated by the P1.1 Artifact Contract: FY2025 and FY2023 total
 * revenue and net income, plus the full FY2025 revenue-by-segment breakdown.
 *
 * @type {ReadonlyArray<{metric: string, period: string, value: number, units: string, source: object}>}
 */
export const KNOWN_FIGURES = Object.freeze([
  // ── FY2025 — Duolingo, Inc. FY2025 Form 10-K ──────────────────────────
  {
    metric: 'revenue_total',
    period: 'FY2025',
    value: 1_037_589,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Notes to Consolidated Financial Statements — Disaggregation of Revenue',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'net_income',
    period: 'FY2025',
    value: 414_065,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Statements of Operations and Comprehensive Income',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'revenue_subscription',
    period: 'FY2025',
    value: 873_442,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Notes to Consolidated Financial Statements — Disaggregation of Revenue',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'revenue_advertising',
    period: 'FY2025',
    value: 79_725,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Notes to Consolidated Financial Statements — Disaggregation of Revenue',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'revenue_duolingo_english_test',
    period: 'FY2025',
    value: 42_006,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Notes to Consolidated Financial Statements — Disaggregation of Revenue',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'revenue_in_app_purchases',
    period: 'FY2025',
    value: 40_479,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Notes to Consolidated Financial Statements — Disaggregation of Revenue',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'revenue_other',
    period: 'FY2025',
    value: 1_937,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Notes to Consolidated Financial Statements — Disaggregation of Revenue',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },

  // ── FY2024 — the base leg of the YoY growth check ─────────────────────
  {
    metric: 'revenue_total',
    period: 'FY2024',
    value: 748_024,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2024',
      statement: 'Notes to Consolidated Financial Statements — Disaggregation of Revenue',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },

  // ── FY2023 — Duolingo, Inc. FY2025 Form 10-K (three-year columns) ─────
  {
    metric: 'revenue_total',
    period: 'FY2023',
    value: 531_109,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2023',
      statement: 'Notes to Consolidated Financial Statements — Disaggregation of Revenue',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'net_income',
    period: 'FY2023',
    value: 16_067,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2023',
      statement: 'Consolidated Statements of Operations and Comprehensive Income',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
]);

/**
 * Anchors for balance-sheet contract (P1.2): FY2025 total assets/equity, FY2023 total
 * assets, plus additional balance fixtures for regression coverage.
 * Kept separate from `KNOWN_FIGURES` so the P1.1 income-only test suite stays green
 * without metric filtering — each suite asserts its own fixture set.
 *
 * @type {ReadonlyArray<{metric: string, period: string, value: number, units: string, source: object}>}
 */
export const BALANCE_KNOWN_FIGURES = Object.freeze([
  {
    metric: 'total_assets',
    period: 'FY2025',
    value: 1_992_182,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'total_stockholders_equity',
    period: 'FY2025',
    value: 1_347_006,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'total_assets',
    period: 'FY2023',
    value: 953_957,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2023',
      statement: 'Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000156208824000050/duol-20231231.htm',
    },
  },
  {
    metric: 'total_assets',
    period: 'FY2024',
    value: 1_301_728,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2024',
      statement: 'Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'deferred_revenues',
    period: 'FY2025',
    value: 496_205,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'total_assets',
    period: 'Q2 FY2026',
    value: 2_073_953,
    units: 'thousands_usd',
    source: {
      filing: '10-Q',
      period: 'As of June 30, 2026',
      statement: 'Unaudited Condensed Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026053603/duol-20260630.htm',
    },
  },
]);

/**
 * Anchors for cash-flow contract (P1.3): FY2025 operating/investing/financing CF,
 * FY2023 operating CF, 9M FY2025 operating CF, and 6M FY2026 operating CF.
 *
 * @type {ReadonlyArray<{metric: string, period: string, value: number, units: string, source: object}>}
 */
export const CASHFLOW_KNOWN_FIGURES = Object.freeze([
  {
    metric: 'cash_from_operating_activities',
    period: 'FY2025',
    value: 387_823,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Statements of Cash Flows',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'cash_from_investing_activities',
    period: 'FY2025',
    value: -107_678,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Statements of Cash Flows',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'cash_from_financing_activities',
    period: 'FY2025',
    value: -29_547,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Statements of Cash Flows',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'net_change_in_cash',
    period: 'FY2025',
    value: 250_598,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Statements of Cash Flows',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'cash_from_operating_activities',
    period: 'FY2023',
    value: 153_614,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2023',
      statement: 'Consolidated Statements of Cash Flows',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'cash_from_operating_activities',
    period: '9M FY2025',
    value: 280_545,
    units: 'thousands_usd',
    source: {
      filing: '10-Q',
      period: 'Nine months ended September 30, 2025',
      statement: 'Unaudited Condensed Consolidated Statements of Cash Flows',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828025049743/duol-20250930.htm',
    },
  },
  {
    metric: 'cash_from_operating_activities',
    period: '6M FY2026',
    value: 239_031,
    units: 'thousands_usd',
    source: {
      filing: '10-Q',
      period: 'Six months ended June 30, 2026',
      statement: 'Unaudited Condensed Consolidated Statements of Cash Flows',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026053603/duol-20260630.htm',
    },
  },
]);

/**
 * Anchors for KPI contract (P1.4): DAU, Paid Subscribers, Bookings, Adjusted EBITDA.
 *
 * @type {ReadonlyArray<{metric: string, period: string, value: number, units: string, source: object}>}
 */
export const KPI_KNOWN_FIGURES = Object.freeze([
  {
    metric: 'total_bookings',
    period: 'FY2025',
    value: 1_158_425,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: "Management's Discussion and Analysis of Financial Condition and Results of Operations - Key Operating Metrics",
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'subscription_bookings',
    period: 'FY2025',
    value: 996_268,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: "Management's Discussion and Analysis of Financial Condition and Results of Operations - Key Operating Metrics",
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'adjusted_ebitda',
    period: 'FY2025',
    value: 305_878,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: "Management's Discussion and Analysis of Financial Condition and Results of Operations - Non-GAAP Financial Measures",
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'dau',
    period: 'FY2025',
    value: 52_700_000,
    units: 'count',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: "Management's Discussion and Analysis of Financial Condition and Results of Operations - Key Operating Metrics",
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'paid_subscribers',
    period: 'FY2025',
    value: 12_200_000,
    units: 'count',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: "Management's Discussion and Analysis of Financial Condition and Results of Operations - Key Operating Metrics",
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'dau',
    period: 'Q2 FY2026',
    value: 58_700_000,
    units: 'count',
    source: {
      filing: '10-Q',
      period: 'Three Months Ended June 30, 2026',
      statement: "Management's Discussion and Analysis of Financial Condition and Results of Operations - Key Operating Metrics",
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026053603/duol-20260630.htm',
    },
  },
  {
    metric: 'paid_subscribers',
    period: 'Q2 FY2026',
    value: 12_700_000,
    units: 'count',
    source: {
      filing: '10-Q',
      period: 'Three Months Ended June 30, 2026',
      statement: "Management's Discussion and Analysis of Financial Condition and Results of Operations - Key Operating Metrics",
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026053603/duol-20260630.htm',
    },
  },
  {
    metric: 'total_bookings',
    period: 'Q2 FY2026',
    value: 289_054,
    units: 'thousands_usd',
    source: {
      filing: '10-Q',
      period: 'Three Months Ended June 30, 2026',
      statement: "Management's Discussion and Analysis of Financial Condition and Results of Operations - Key Operating Metrics",
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026053603/duol-20260630.htm',
    },
  },
  {
    metric: 'adjusted_ebitda',
    period: 'Q2 FY2026',
    value: 77_315,
    units: 'thousands_usd',
    source: {
      filing: '10-Q',
      period: 'Three Months Ended June 30, 2026',
      statement: "Management's Discussion and Analysis of Financial Condition and Results of Operations - Non-GAAP Financial Measures",
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026053603/duol-20260630.htm',
    },
  },
]);

/**
 * Verbatim KPI definitions per specific cited filing document for exact string comparison.
 */
export const KPI_PER_DOC_DEFINITIONS = Object.freeze({
  'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm': Object.freeze({
    dau: 'Daily active users (DAUs). DAUs are defined as unique users who engage with our Duolingo App or the learning section of our website each calendar day. DAUs are reported for a measurement period by taking the average of the DAUs for each day in that measurement period. The measurement period for DAUs is the three months ended December 31, 2025 and the same period in the prior year where applicable, and the analysis of results is based on those periods. DAUs are a measure of the consistent engagement of our global user community on Duolingo.',
    mau: 'Monthly active users (MAUs). MAUs are defined as unique users who engage with our Duolingo App or the learning section of our website each month. MAUs are reported for a measurement period by taking the average of the MAUs for each calendar month in that measurement period. The measurement period for MAUs is the three months ended December 31, 2025 and the same period in the prior year where applicable, and the analysis of results is based on those periods. MAUs are a measure of the size of our global active user community on Duolingo.',
    paid_subscribers: 'Paid Subscribers. Paid subscribers are defined as users who pay for access to any Duolingo subscription offering and had an active subscription as of the end of the measurement period. Each unique user account is treated as a single paid subscriber regardless of whether such user purchases multiple subscriptions, and the count of paid subscribers does not include users who are currently on a free trial or who are non-paying members of a family plan.',
    bookings: 'Subscription Bookings and Total Bookings. Subscription bookings represent the amounts we receive from a purchase of any Duolingo subscription offering. Total bookings include subscription bookings, income from advertising networks for advertisements served to our users, purchases of the Duolingo English Test, and in-app purchases of virtual goods ("IAPs"). We believe bookings provide an indication of trends in our operating results, including cash flows, that are not necessarily reflected in our revenues because we recognize subscription revenues ratably over the lifetime of a subscription, the majority of which are twelve months in duration.',
    adjusted_ebitda: 'Adjusted EBITDA. Adjusted EBITDA is defined as net income excluding interest income, income taxes, depreciation and amortization, stock-based compensation expenses related to equity awards, transaction costs related to acquisitions, acquisition earn-out costs and impairment of capitalized software. Beginning in the third quarter of 2025, we updated our definition of Adjusted EBITDA to include integration costs related to acquisitions. We did not incur integration costs in periods prior to 2025. Adjusted EBITDA is used by management to evaluate the financial performance of our business and we present Adjusted EBITDA because we believe it is helpful in highlighting trends in our operating results and that it is frequently used by analysts, investors and other interested parties to evaluate companies in our industry.',
  }),
  'https://www.sec.gov/Archives/edgar/data/1562088/000156208824000050/duol-20231231.htm': Object.freeze({
    dau: 'Daily active users (DAUs). DAUs are defined as unique users who engage with our Duolingo App or the learning section of our website each calendar day. DAUs are reported for a measurement period by taking the average of the DAUs for each day in that measurement period. The measurement period for DAUs is the three months ended December 31, 2023 and the same period in the prior year where applicable, and the analysis of results is based on those periods. DAUs are a measure of the consistent engagement of our global user community on Duolingo.',
    mau: 'Monthly active users (MAUs). MAUs are defined as unique users who engage with our Duolingo App or the learning section of our website each month. MAUs are reported for a measurement period by taking the average of the MAUs for each calendar month in that measurement period. The measurement period for MAUs is the three months ended December 31, 2023 and the same period in the prior year where applicable, and the analysis of results is based on those periods. MAUs are a measure of the size of our global active user community on Duolingo.',
    paid_subscribers: 'Paid Subscribers. Paid subscribers are defined as users who pay for access to any Duolingo subscription offering and had an active subscription as of the end of the measurement period. Each unique user account is treated as a single paid subscriber regardless of whether such user purchases multiple subscriptions, and the count of paid subscribers does not include users who are currently on a free trial or who are non-paying members of a family plan.',
    bookings: 'Subscription Bookings and Total Bookings. Subscription bookings represent the amounts we receive from a purchase of any Duolingo subscription offering. Total bookings include subscription bookings, income from advertising networks for advertisements served to our users, purchases of the Duolingo English Test, and in-app purchases of virtual goods. We believe bookings provide an indication of trends in our operating results, including cash flows, that are not necessarily reflected in our revenues because we recognize subscription revenues ratably over the lifetime of a subscription, which is generally from one to twelve months.',
    adjusted_ebitda: 'Adjusted EBITDA. Adjusted EBITDA is defined as net income (loss) excluding interest income, income taxes, depreciation and amortization, stock-based compensation expenses related to equity awards, IPO and public company costs, transaction costs related to an acquisition, acquisition earn-out costs, gain on sale of capitalized software and loss on disposal of leasehold improvements. Adjusted EBITDA is used by management to evaluate the financial performance of our business and we present Adjusted EBITDA because we believe it is helpful in highlighting trends in our operating results and that it is frequently used by analysts, investors and other interested parties to evaluate companies in our industry.',
  }),
  'https://www.sec.gov/Archives/edgar/data/1562088/000156208822000039/duol-20211231.htm': Object.freeze({
    dau: 'Daily active users (DAUs). DAUs are defined as unique Duolingo users who engage with our mobile language learning application or the language learning section of our website each calendar day. DAUs are reported for a measurement period by taking the average of the DAUs for each day in that measurement period. DAUs are a measure of the consistent engagement of our global user community on Duolingo.',
    mau: 'Monthly active users (MAUs). MAUs are defined as unique Duolingo users who engage with our mobile language learning application or the language learning section of our website each month. MAUs are reported for a measurement period by taking the average of the MAUs for each calendar month in that measurement period. MAUs are a measure of the size of our global active user community on Duolingo.',
    paid_subscribers: 'Paid Subscribers. Paid subscribers are defined as users who pay for access to Duolingo Plus, including subscribers who pay for a family plan, and had an active subscription as of the end of the measurement period. Each unique user account is treated as a single paid subscriber regardless of whether such user purchases multiple subscriptions, and the count of paid subscribers does not include users who are currently on a free trial or who are non-paying members of a family plan.',
    bookings: 'Subscription Bookings and Total Bookings. Subscription bookings represent the amounts we receive from purchases of a subscription to Duolingo Plus. Total bookings represent the amounts we receive from purchases of a subscription to Duolingo Plus, a registration for a Duolingo English Test, an in-app purchase for a virtual good and from advertising networks for advertisements served to our users. We believe bookings provide an indication of trends in our operating results, including cash flows, that are not necessarily reflected in our revenues because we recognize subscription revenues ratably over the lifetime of a subscription, which is generally from one to twelve months.',
    adjusted_ebitda: 'Adjusted EBITDA. Adjusted EBITDA is defined as net loss excluding interest (income) expense, net, income tax provision, depreciation and amortization, Initial Public Offering ("IPO") and public company readiness costs, stock-based compensation expenses related to equity awards, tender offer-related costs and other expenses. Adjusted EBITDA is used by management to evaluate the financial performance of our business and we present Adjusted EBITDA because we believe it is helpful in highlighting trends in our operating results and that it is frequently used by analysts, investors and other interested parties to evaluate companies in our industry.',
  }),
  'https://www.sec.gov/Archives/edgar/data/1562088/000162828025049743/duol-20250930.htm': Object.freeze({
    dau: 'Daily active users (DAUs). DAUs are defined as unique users who engage with our Duolingo App or the learning section of our website each calendar day. DAUs are reported for a measurement period by taking the average of the DAUs for each day in that measurement period. The measurement period for DAUs is the three months ended September 30, 2025 and the same period in the prior year where applicable, and the analysis of results is based on those periods. DAUs are a measure of the consistent engagement of our global user community on Duolingo.',
    mau: 'Monthly active users (MAUs). MAUs are defined as unique users who engage with our Duolingo App or the learning section of our website each month. MAUs are reported for a measurement period by taking the average of the MAUs for each calendar month in that measurement period. The measurement period for MAUs is the three months ended September 30, 2025 and the same period in the prior year where applicable, and the analysis of results is based on those periods. MAUs are a measure of the size of our global active user community on Duolingo.',
    paid_subscribers: 'Paid Subscribers. Paid subscribers are defined as users who pay for access to any Duolingo subscription offering and had an active subscription as of the end of the measurement period. Each unique user account is treated as a single paid subscriber regardless of whether such user purchases multiple subscriptions, and the count of paid subscribers does not include users who are currently on a free trial or who are non-paying members of a family plan.',
    bookings: 'Subscription Bookings and Total Bookings. Subscription bookings represent the amounts we receive from a purchase of any Duolingo subscription offering. Total bookings include subscription bookings, income from advertising networks for advertisements served to our users, purchases of the Duolingo English Test, and in-app purchases of virtual goods. We believe bookings provide an indication of trends in our operating results, including cash flows, that are not necessarily reflected in our revenues because we recognize subscription revenues ratably over the lifetime of a subscription, the majority of which are twelve months in duration.',
    adjusted_ebitda: 'Adjusted EBITDA. Adjusted EBITDA is defined as net income excluding interest income, income taxes, depreciation and amortization, stock-based compensation expenses related to equity awards, transaction costs related to acquisitions and acquisition earn-out costs. Beginning in Q3 2025, we expanded our Adjusted EBITDA definition to include integration costs related to acquisitions. Adjusted EBITDA is used by management to evaluate the financial performance of our business and we present Adjusted EBITDA because we believe it is helpful in highlighting trends in our operating results and that it is frequently used by analysts, investors and other interested parties to evaluate companies in our industry. The following table presents a reconciliation of our net income, the most directly comparable financial measure presented in accordance with GAAP, to Adjusted EBITDA.',
  }),
  'https://www.sec.gov/Archives/edgar/data/1562088/000162828026029976/duol-20260331.htm': Object.freeze({
    dau: 'Daily active users (DAUs). DAUs are defined as unique users who engage with our Duolingo App or the learning section of our website each calendar day. DAUs are reported for a measurement period by taking the average of the DAUs for each day in that measurement period. The measurement period for DAUs is the three months ended March 31, 2026 and the same period in the prior year where applicable, and the analysis of results is based on those periods. DAUs are a measure of the consistent engagement of our global user community on Duolingo.',
    paid_subscribers: 'Paid Subscribers. Paid subscribers are defined as users who pay for access to any Duolingo subscription offering and had an active subscription as of the end of the measurement period. Each unique user account is treated as a single paid subscriber regardless of whether such user purchases multiple subscriptions, and the count of paid subscribers does not include users who are currently on a free trial or who are non-paying members of a family plan.',
    bookings: 'Subscription Bookings and Total Bookings. Subscription bookings represent the amounts we receive from a purchase of any Duolingo subscription offering. Total bookings include subscription bookings, income from advertising networks for advertisements served to our users, purchases of the Duolingo English Test, and in-app purchases of virtual goods ("IAPs"). We believe bookings provide an indication of trends in our operating results, including cash flows, that are not necessarily reflected in our revenues because we recognize subscription revenues ratably over the lifetime of a subscription, the majority of which are twelve months in duration.',
    adjusted_ebitda: 'Adjusted EBITDA. Adjusted EBITDA is defined as net income excluding interest income, income taxes, depreciation and amortization, stock-based compensation expenses related to equity awards, including employer payroll taxes related to equity transactions, and acquisition earn-out costs. Adjusted EBITDA is used by management to evaluate the financial performance of our business and we present Adjusted EBITDA because we believe it is helpful in highlighting trends in our operating results and that it is frequently used by analysts, investors and other interested parties to evaluate companies in our industry. The following table presents a reconciliation of our net income, the most directly comparable financial measure presented in accordance with GAAP, to Adjusted EBITDA.',
  }),
  'https://www.sec.gov/Archives/edgar/data/1562088/000162828026053603/duol-20260630.htm': Object.freeze({
    dau: 'Daily active users (DAUs). DAUs are defined as unique users who engage with our Duolingo App or the learning section of our website each calendar day. DAUs are reported for a measurement period by taking the average of the DAUs for each day in that measurement period. The measurement period for DAUs is the three months ended June 30, 2026 and the same period in the prior year where applicable, and the analysis of results is based on those periods. DAUs are a measure of the consistent engagement of our global user community on Duolingo.',
    paid_subscribers: 'Paid Subscribers. Paid subscribers are defined as users who pay for access to any Duolingo subscription offering and had an active subscription as of the end of the measurement period. Each unique user account is treated as a single paid subscriber regardless of whether such user purchases multiple subscriptions, and the count of paid subscribers does not include users who are currently on a free trial or who are non-paying members of a family plan.',
    bookings: 'Subscription Bookings and Total Bookings. Subscription bookings represent the amounts we receive from a purchase of any Duolingo subscription offering. Total bookings include subscription bookings, income from advertising networks for advertisements served to our users, purchases of the Duolingo English Test, and in-app purchases of virtual goods ("IAPs"). We believe bookings provide an indication of trends in our operating results, including cash flows, that are not necessarily reflected in our revenues because we recognize subscription revenues ratably over the lifetime of a subscription, the majority of which are twelve months in duration.',
    adjusted_ebitda: 'Adjusted EBITDA. Adjusted EBITDA is defined as net income excluding interest income, income taxes, depreciation and amortization, stock-based compensation expenses related to equity awards, including employer payroll taxes related to equity transactions, acquisition transaction and integration costs, acquisition earn-out costs, and impairment of capitalized software. Adjusted EBITDA is used by management to evaluate the financial performance of our business and we present Adjusted EBITDA because we believe it is helpful in highlighting trends in our operating results and that it is frequently used by analysts, investors and other interested parties to evaluate companies in our industry. The following table presents a reconciliation of our net income, the most directly comparable financial measure presented in accordance with GAAP, to Adjusted EBITDA.',
  }),
});

export const KPI_DEFINITIONS_FIXTURE = KPI_PER_DOC_DEFINITIONS['https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm'];

/**
 * Combined set for global audits — income + balance anchors (P1.2 compatibility).
 *
 * @type {ReadonlyArray<{metric: string, period: string, value: number, units: string, source: object}>}
 */
export const ALL_KNOWN_FIGURES = Object.freeze([
  ...KNOWN_FIGURES,
  ...BALANCE_KNOWN_FIGURES,
]);

/**
 * Full corpus anchor set (income + balance + cashflow + kpis).
 *
 * @type {ReadonlyArray<{metric: string, period: string, value: number, units: string, source: object}>}
 */
export const ALL_DATA_FIXTURES = Object.freeze([
  ...KNOWN_FIGURES,
  ...BALANCE_KNOWN_FIGURES,
  ...CASHFLOW_KNOWN_FIGURES,
  ...KPI_KNOWN_FIGURES,
]);

/**
 * YoY revenue growth FY2024 → FY2025.
 *
 * Growth is a *derived* metric, so it is computed from the two cited revenue
 * anchors above rather than hand-typed — `docs/conventions.md` reserves
 * `computed` values for the engine and forbids entering them as data. The
 * fixture therefore pins the relationship between two filed figures: if either
 * revenue anchor in the dataset drifts, this check breaks.
 *
 * @type {{metric: string, period: string, fromPeriod: string, toPeriod: string, value: number, units: string, source: object}}
 */
/**
 * @param {string} period
 * @returns {{metric: string, period: string, value: number, units: string, source: object}}
 */
function revenueAnchor(period) {
  const anchor = KNOWN_FIGURES.find((f) => f.metric === 'revenue_total' && f.period === period);
  if (!anchor) throw new Error(`Missing revenue_total anchor for ${period}`);
  return anchor;
}

export const GROWTH_FIXTURE = Object.freeze({
  metric: 'revenue_yoy_growth',
  period: 'FY2025',
  fromPeriod: 'FY2024',
  toPeriod: 'FY2025',
  fromValue: revenueAnchor('FY2024').value,
  toValue: revenueAnchor('FY2025').value,
  value: revenueAnchor('FY2025').value / revenueAnchor('FY2024').value - 1,
  units: 'ratio',
  source: revenueAnchor('FY2024').source,
});
