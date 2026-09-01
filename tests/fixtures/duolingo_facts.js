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

// Node built-ins. This module is test-only and never imported by `src/`, so a
// filesystem read here cannot reach the browser bundle. The P4.1 market anchors
// at the bottom of this file are DERIVED from `assumptions.json` at module load
// per the `GROWTH_FIXTURE` rule — a hand-typed market value is prohibited, and
// deriving requires reading the driver defaults.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

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

/**
 * Anchors for supporting schedules contract (P2.1): working capital components
 * and balance sheet rows required for schedule calculations and ratio tie-outs.
 *
 * @type {ReadonlyArray<{metric: string, period: string, value: number, units: string, source: object}>}
 */
export const SCHEDULE_KNOWN_FIGURES = Object.freeze([
  {
    metric: 'accounts_receivable',
    period: 'FY2025',
    value: 162_827,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'deferred_cost_of_revenues',
    period: 'FY2025',
    value: 102_663,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'prepaid_expenses_and_other_current_assets',
    period: 'FY2025',
    value: 16_582,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'income_tax_receivable',
    period: 'FY2025',
    value: 14_067,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
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
    metric: 'accounts_payable',
    period: 'FY2025',
    value: 7_998,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'accrued_expenses_and_other_current_liabilities',
    period: 'FY2025',
    value: 45_688,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'income_tax_payable',
    period: 'FY2025',
    value: 1_257,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'deferred_revenues',
    period: 'Q2 FY2026',
    value: 505_102,
    units: 'thousands_usd',
    source: {
      filing: '10-Q',
      period: 'As of June 30, 2026',
      statement: 'Unaudited Condensed Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026053603/duol-20260630.htm',
    },
  },
  {
    metric: 'revenue_total',
    period: 'Q3 FY2025',
    value: 271_713,
    units: 'thousands_usd',
    source: {
      filing: '10-Q',
      period: 'Three months ended September 30, 2025',
      statement: 'Notes to Consolidated Financial Statements — Disaggregation of Revenue',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828025049743/duol-20250930.htm',
    },
  },
  {
    metric: 'revenue_total',
    period: '9M FY2025',
    value: 754_721,
    units: 'thousands_usd',
    source: {
      filing: '10-Q',
      period: 'Nine months ended September 30, 2025',
      statement: 'Notes to Consolidated Financial Statements — Disaggregation of Revenue',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828025049743/duol-20250930.htm',
    },
  },
  {
    metric: 'revenue_total',
    period: 'Q1 FY2026',
    value: 291_967,
    units: 'thousands_usd',
    source: {
      filing: '10-Q',
      period: 'Three months ended March 31, 2026',
      statement: 'Notes to Consolidated Financial Statements — Disaggregation of Revenue',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026033482/duol-20260331.htm',
    },
  },
  {
    metric: 'revenue_total',
    period: 'Q2 FY2026',
    value: 298_454,
    units: 'thousands_usd',
    source: {
      filing: '10-Q',
      period: 'Three months ended June 30, 2026',
      statement: 'Notes to Consolidated Financial Statements — Disaggregation of Revenue',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026053603/duol-20260630.htm',
    },
  },
  // ── PP&E and Intangibles Anchors (P2.2) ──────────────────────────────
  {
    metric: 'ppe_gross',
    period: 'FY2025',
    value: 57_868,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Notes to Consolidated Financial Statements — Property and Equipment, Net',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'ppe_accumulated_depreciation',
    period: 'FY2025',
    value: -21_571,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Notes to Consolidated Financial Statements — Property and Equipment, Net',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'property_and_equipment_net',
    period: 'FY2025',
    value: 36_297,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'purchase_of_property_and_equipment',
    period: 'FY2025',
    value: -18_096,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Statements of Cash Flows',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'cf_depreciation_and_amortization',
    period: 'FY2025',
    value: 14_391,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Statements of Cash Flows',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'intangibles_gross',
    period: 'FY2025',
    value: 54_411,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Notes to Consolidated Financial Statements — Intangible Assets, Net',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'intangibles_accumulated_amortization',
    period: 'FY2025',
    value: -26_102,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Notes to Consolidated Financial Statements — Intangible Assets, Net',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'intangible_assets_net',
    period: 'FY2025',
    value: 28_309,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'capitalized_software_and_intangibles',
    period: 'FY2025',
    value: -9_303,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Statements of Cash Flows',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'cf_stock_based_compensation',
    period: 'FY2025',
    value: 137_437,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Statements of Cash Flows',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'operating_lease_right_of_use_assets',
    period: 'FY2025',
    value: 80_380,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
  {
    metric: 'long_term_operating_lease_obligation',
    period: 'FY2025',
    value: 93_779,
    units: 'thousands_usd',
    source: {
      filing: '10-K',
      period: 'Fiscal Year 2025',
      statement: 'Consolidated Balance Sheets',
      url: 'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
    },
  },
]);

function scheduleAnchor(metric, period) {
  const anchor = SCHEDULE_KNOWN_FIGURES.find((f) => f.metric === metric && f.period === period);
  if (!anchor) throw new Error(`Missing schedule anchor for ${metric} @ ${period}`);
  return anchor;
}

/**
 * Derived TTM revenue at Q2 FY2026:
 * Q3 FY2025 (discrete) + Q4 FY2025 (FY2025 - 9M FY2025) + Q1 FY2026 (discrete) + Q2 FY2026 (discrete)
 */
const ttmRevenueAnchorQ2 =
  scheduleAnchor('revenue_total', 'Q3 FY2025').value +
  (revenueAnchor('FY2025').value - scheduleAnchor('revenue_total', '9M FY2025').value) +
  scheduleAnchor('revenue_total', 'Q1 FY2026').value +
  scheduleAnchor('revenue_total', 'Q2 FY2026').value;

/**
 * Derived schedule fixtures (P2.1, P2.2, P2.3):
 * Working capital, PP&E, Intangibles, Debt, and SBC fixtures computed from cited anchors.
 */
export const SCHEDULE_FIXTURES = Object.freeze({
  fy2025_dso: Object.freeze({
    metric: 'dso',
    period: 'FY2025',
    value: (scheduleAnchor('accounts_receivable', 'FY2025').value / revenueAnchor('FY2025').value) * 365,
    units: 'days',
    source: scheduleAnchor('accounts_receivable', 'FY2025').source,
  }),
  fy2025_deferred_revenue_pct: Object.freeze({
    metric: 'deferred_revenue_pct_revenue',
    period: 'FY2025',
    value: scheduleAnchor('deferred_revenues', 'FY2025').value / revenueAnchor('FY2025').value,
    units: 'ratio',
    source: scheduleAnchor('deferred_revenues', 'FY2025').source,
  }),
  fy2025_nwc: Object.freeze({
    metric: 'net_working_capital',
    period: 'FY2025',
    value:
      (scheduleAnchor('accounts_receivable', 'FY2025').value +
        scheduleAnchor('deferred_cost_of_revenues', 'FY2025').value +
        scheduleAnchor('prepaid_expenses_and_other_current_assets', 'FY2025').value +
        scheduleAnchor('income_tax_receivable', 'FY2025').value) -
      (scheduleAnchor('deferred_revenues', 'FY2025').value +
        scheduleAnchor('accounts_payable', 'FY2025').value +
        scheduleAnchor('accrued_expenses_and_other_current_liabilities', 'FY2025').value +
        scheduleAnchor('income_tax_payable', 'FY2025').value),
    units: 'thousands_usd',
    source: scheduleAnchor('deferred_revenues', 'FY2025').source,
  }),
  q2_fy2026_deferred_revenue_pct: Object.freeze({
    metric: 'deferred_revenue_pct_revenue',
    period: 'Q2 FY2026',
    value: scheduleAnchor('deferred_revenues', 'Q2 FY2026').value / ttmRevenueAnchorQ2,
    units: 'ratio',
    source: scheduleAnchor('deferred_revenues', 'Q2 FY2026').source,
  }),
  fy2025_ppe_gross: Object.freeze({
    metric: 'ppe_gross',
    period: 'FY2025',
    value: scheduleAnchor('ppe_gross', 'FY2025').value,
    units: 'thousands_usd',
    source: scheduleAnchor('ppe_gross', 'FY2025').source,
  }),
  fy2025_ppe_accum_dep: Object.freeze({
    metric: 'ppe_accumulated_depreciation',
    period: 'FY2025',
    value: scheduleAnchor('ppe_accumulated_depreciation', 'FY2025').value,
    units: 'thousands_usd',
    source: scheduleAnchor('ppe_accumulated_depreciation', 'FY2025').source,
  }),
  fy2025_ppe_net: Object.freeze({
    metric: 'property_and_equipment_net',
    period: 'FY2025',
    value: scheduleAnchor('property_and_equipment_net', 'FY2025').value,
    units: 'thousands_usd',
    source: scheduleAnchor('property_and_equipment_net', 'FY2025').source,
  }),
  fy2025_capex_ppe_pct: Object.freeze({
    metric: 'capex_ppe_pct_revenue',
    period: 'FY2025',
    value: Math.abs(scheduleAnchor('purchase_of_property_and_equipment', 'FY2025').value) / revenueAnchor('FY2025').value,
    units: 'ratio',
    source: scheduleAnchor('purchase_of_property_and_equipment', 'FY2025').source,
  }),
  fy2025_intangibles_gross: Object.freeze({
    metric: 'intangibles_gross',
    period: 'FY2025',
    value: scheduleAnchor('intangibles_gross', 'FY2025').value,
    units: 'thousands_usd',
    source: scheduleAnchor('intangibles_gross', 'FY2025').source,
  }),
  fy2025_intangibles_accum_amort: Object.freeze({
    metric: 'intangibles_accumulated_amortization',
    period: 'FY2025',
    value: scheduleAnchor('intangibles_accumulated_amortization', 'FY2025').value,
    units: 'thousands_usd',
    source: scheduleAnchor('intangibles_accumulated_amortization', 'FY2025').source,
  }),
  fy2025_intangibles_net: Object.freeze({
    metric: 'intangible_assets_net',
    period: 'FY2025',
    value: scheduleAnchor('intangible_assets_net', 'FY2025').value,
    units: 'thousands_usd',
    source: scheduleAnchor('intangible_assets_net', 'FY2025').source,
  }),
  fy2025_capitalized_software_pct: Object.freeze({
    metric: 'capitalized_software_pct_revenue',
    period: 'FY2025',
    value: Math.abs(scheduleAnchor('capitalized_software_and_intangibles', 'FY2025').value) / revenueAnchor('FY2025').value,
    units: 'ratio',
    source: scheduleAnchor('capitalized_software_and_intangibles', 'FY2025').source,
  }),
  fy2025_sbc_expense: Object.freeze({
    metric: 'cf_stock_based_compensation',
    period: 'FY2025',
    value: scheduleAnchor('cf_stock_based_compensation', 'FY2025').value,
    units: 'thousands_usd',
    source: scheduleAnchor('cf_stock_based_compensation', 'FY2025').source,
  }),
  fy2025_sbc_pct_revenue: Object.freeze({
    metric: 'sbc_pct_of_revenue',
    period: 'FY2025',
    value: scheduleAnchor('cf_stock_based_compensation', 'FY2025').value / revenueAnchor('FY2025').value,
    units: 'ratio',
    source: scheduleAnchor('cf_stock_based_compensation', 'FY2025').source,
  }),
  fy2025_lease_rou_asset: Object.freeze({
    metric: 'operating_lease_right_of_use_assets',
    period: 'FY2025',
    value: scheduleAnchor('operating_lease_right_of_use_assets', 'FY2025').value,
    units: 'thousands_usd',
    source: scheduleAnchor('operating_lease_right_of_use_assets', 'FY2025').source,
  }),
  fy2025_lease_liability: Object.freeze({
    metric: 'long_term_operating_lease_obligation',
    period: 'FY2025',
    value: scheduleAnchor('long_term_operating_lease_obligation', 'FY2025').value,
    units: 'thousands_usd',
    source: scheduleAnchor('long_term_operating_lease_obligation', 'FY2025').source,
  }),
});

/* ────────────────────────────────────────────────────────────────────────────
 * P3.1 — Forecast anchors (Driver-Based Forecast Core).
 *
 * Same two rules as the rest of this module:
 *  1. `FORECAST_KNOWN_FIGURES` holds only *filed* figures, each with the source
 *     it was transcribed from. A test asserts the corpus matches them, so a
 *     drift cannot pass the suite.
 *  2. Everything downstream in `FORECAST_FIXTURES` is *derived* from those
 *     cited anchors at module load — never hand-typed (the `GROWTH_FIXTURE`
 *     pattern). No forecast output value is ever typed into a fixture: the
 *     `deriveExpectedForecast()` helper below recomputes the cascade from the
 *     anchors and the driver values it is given, independently of
 *     `src/engine/forecast.js`.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Filing URLs cited by the forecast anchor set.
 * @type {Readonly<Record<string, string>>}
 */
const FORECAST_SOURCE_URLS = Object.freeze({
  fy2025_10k:
    'https://www.sec.gov/Archives/edgar/data/1562088/000162828026012494/duol-20251231.htm',
  q3_fy2025_10q:
    'https://www.sec.gov/Archives/edgar/data/1562088/000162828025049743/duol-20250930.htm',
  q1_fy2026_10q:
    'https://www.sec.gov/Archives/edgar/data/1562088/000162828026029976/duol-20260331.htm',
  q2_fy2026_10q:
    'https://www.sec.gov/Archives/edgar/data/1562088/000162828026053603/duol-20260630.htm',
});

/**
 * Statement names as they appear in the filings.
 * @type {Readonly<Record<string, string>>}
 */
const FORECAST_STATEMENTS = Object.freeze({
  disaggregation: 'Notes to Consolidated Financial Statements — Disaggregation of Revenue',
  operations: 'Consolidated Statements of Operations and Comprehensive Income',
  quarterlyOperations: 'Unaudited Condensed Consolidated Statements of Operations and Comprehensive Income',
  keyMetrics: "Management's Discussion and Analysis of Financial Condition and Results of Operations - Key Operating Metrics",
  balanceSheet: 'Consolidated Balance Sheets',
});

/**
 * @param {string} filing
 * @param {string} period
 * @param {string} statement
 * @param {string} url
 * @returns {object}
 */
function forecastSource(filing, period, statement, url) {
  return Object.freeze({ filing, period, statement, url });
}

const SRC_FY25 = (statement, period = 'Fiscal Year 2025') =>
  forecastSource('10-K', period, statement, FORECAST_SOURCE_URLS.fy2025_10k);
const SRC_Q3_25 = (statement, period) =>
  forecastSource('10-Q', period, statement, FORECAST_SOURCE_URLS.q3_fy2025_10q);
const SRC_Q1_26 = (statement, period) =>
  forecastSource('10-Q', period, statement, FORECAST_SOURCE_URLS.q1_fy2026_10q);
const SRC_Q2_26 = (statement, period) =>
  forecastSource('10-Q', period, statement, FORECAST_SOURCE_URLS.q2_fy2026_10q);

/**
 * Cited anchors behind the P3.1 revenue cascade, cost structure, hybrid FY2026
 * halves, tax rate, and interest-income rate.
 *
 * @type {ReadonlyArray<{metric: string, period: string, value: number, units: string, source: object}>}
 */
export const FORECAST_KNOWN_FIGURES = Object.freeze([
  // ── Paid subscribers (KPI, filed) ────────────────────────────────────────
  {
    metric: 'paid_subscribers',
    period: 'FY2024',
    value: 9_500_000,
    units: 'count',
    source: SRC_FY25(FORECAST_STATEMENTS.keyMetrics, 'Fiscal Year 2024'),
  },
  {
    metric: 'paid_subscribers',
    period: 'FY2025',
    value: 12_200_000,
    units: 'count',
    source: SRC_FY25(FORECAST_STATEMENTS.keyMetrics),
  },
  {
    metric: 'paid_subscribers',
    period: 'Q2 FY2026',
    value: 12_700_000,
    units: 'count',
    source: SRC_Q2_26(FORECAST_STATEMENTS.keyMetrics, 'Three Months Ended June 30, 2026'),
  },

  // ── FY2025 revenue bases (disaggregation note) ───────────────────────────
  {
    metric: 'revenue_subscription',
    period: 'FY2025',
    value: 873_442,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.disaggregation),
  },
  {
    metric: 'revenue_advertising',
    period: 'FY2025',
    value: 79_725,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.disaggregation),
  },
  {
    metric: 'revenue_duolingo_english_test',
    period: 'FY2025',
    value: 42_006,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.disaggregation),
  },
  {
    metric: 'revenue_in_app_purchases',
    period: 'FY2025',
    value: 40_479,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.disaggregation),
  },
  {
    metric: 'revenue_other',
    period: 'FY2025',
    value: 1_937,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.disaggregation),
  },

  // ── FY2025 cost structure ────────────────────────────────────────────────
  {
    metric: 'cost_of_revenue',
    period: 'FY2025',
    value: 288_132,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.operations),
  },
  {
    metric: 'opex_research_and_development',
    period: 'FY2025',
    value: 306_323,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.operations),
  },
  {
    metric: 'opex_sales_and_marketing',
    period: 'FY2025',
    value: 125_677,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.operations),
  },
  {
    metric: 'opex_general_and_administrative',
    period: 'FY2025',
    value: 181_887,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.operations),
  },
  {
    metric: 'other_income_net',
    period: 'FY2025',
    value: 1_609,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.operations),
  },
  {
    metric: 'interest_income',
    period: 'FY2025',
    value: 45_231,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.operations),
  },

  // ── Tax-rate anchors (FY2024 = last undistorted year; FY2025 = distorted) ─
  {
    metric: 'pretax_income',
    period: 'FY2024',
    value: 102_306,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.operations, 'Fiscal Year 2024'),
  },
  {
    metric: 'income_tax',
    period: 'FY2024',
    value: 13_732,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.operations, 'Fiscal Year 2024'),
  },
  {
    metric: 'pretax_income',
    period: 'FY2025',
    value: 182_410,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.operations),
  },
  {
    metric: 'income_tax',
    period: 'FY2025',
    value: -231_655,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.operations),
  },

  // ── Interest-bearing balance anchors ─────────────────────────────────────
  {
    metric: 'cash_and_cash_equivalents',
    period: 'FY2024',
    value: 785_791,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.balanceSheet, 'Fiscal Year 2024'),
  },
  {
    metric: 'short_term_investments',
    period: 'FY2024',
    value: 91_854,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.balanceSheet, 'Fiscal Year 2024'),
  },
  {
    metric: 'long_term_investments',
    period: 'FY2024',
    value: 98_292,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.balanceSheet, 'Fiscal Year 2024'),
  },
  {
    metric: 'cash_and_cash_equivalents',
    period: 'FY2025',
    value: 1_036_389,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.balanceSheet),
  },
  {
    metric: 'short_term_investments',
    period: 'FY2025',
    value: 104_078,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.balanceSheet),
  },
  {
    metric: 'long_term_investments',
    period: 'FY2025',
    value: 135_098,
    units: 'thousands_usd',
    source: SRC_FY25(FORECAST_STATEMENTS.balanceSheet),
  },

  // ── H1 FY2025 comparison base: 9M YTD rows (cited as filed) ──────────────
  {
    metric: 'revenue_subscription',
    period: '9M FY2025',
    value: 631_156,
    units: 'thousands_usd',
    source: SRC_Q3_25(FORECAST_STATEMENTS.disaggregation, 'Nine months ended September 30, 2025'),
  },
  {
    metric: 'revenue_advertising',
    period: '9M FY2025',
    value: 59_504,
    units: 'thousands_usd',
    source: SRC_Q3_25(FORECAST_STATEMENTS.disaggregation, 'Nine months ended September 30, 2025'),
  },
  {
    metric: 'revenue_duolingo_english_test',
    period: '9M FY2025',
    value: 31_723,
    units: 'thousands_usd',
    source: SRC_Q3_25(FORECAST_STATEMENTS.disaggregation, 'Nine months ended September 30, 2025'),
  },
  {
    metric: 'revenue_in_app_purchases',
    period: '9M FY2025',
    value: 30_928,
    units: 'thousands_usd',
    source: SRC_Q3_25(FORECAST_STATEMENTS.disaggregation, 'Nine months ended September 30, 2025'),
  },
  {
    metric: 'revenue_other',
    period: '9M FY2025',
    value: 1_410,
    units: 'thousands_usd',
    source: SRC_Q3_25(FORECAST_STATEMENTS.disaggregation, 'Nine months ended September 30, 2025'),
  },

  // ── H1 FY2025 comparison base: Q3 discrete tail (cited as filed) ─────────
  {
    metric: 'revenue_subscription',
    period: 'Q3 FY2025',
    value: 229_491,
    units: 'thousands_usd',
    source: SRC_Q3_25(FORECAST_STATEMENTS.disaggregation, 'Three months ended September 30, 2025'),
  },
  {
    metric: 'revenue_advertising',
    period: 'Q3 FY2025',
    value: 21_019,
    units: 'thousands_usd',
    source: SRC_Q3_25(FORECAST_STATEMENTS.disaggregation, 'Three months ended September 30, 2025'),
  },
  {
    metric: 'revenue_duolingo_english_test',
    period: 'Q3 FY2025',
    value: 9_649,
    units: 'thousands_usd',
    source: SRC_Q3_25(FORECAST_STATEMENTS.disaggregation, 'Three months ended September 30, 2025'),
  },
  {
    metric: 'revenue_in_app_purchases',
    period: 'Q3 FY2025',
    value: 11_096,
    units: 'thousands_usd',
    source: SRC_Q3_25(FORECAST_STATEMENTS.disaggregation, 'Three months ended September 30, 2025'),
  },
  {
    metric: 'revenue_other',
    period: 'Q3 FY2025',
    value: 458,
    units: 'thousands_usd',
    source: SRC_Q3_25(FORECAST_STATEMENTS.disaggregation, 'Three months ended September 30, 2025'),
  },

  // ── H1 FY2026 actuals: discrete Q1 FY2026 quarters (cited as filed) ──────
  {
    metric: 'revenue_subscription',
    period: 'Q1 FY2026',
    value: 250_908,
    units: 'thousands_usd',
    source: SRC_Q1_26(FORECAST_STATEMENTS.disaggregation, 'Three months ended March 31, 2026'),
  },
  {
    metric: 'revenue_advertising',
    period: 'Q1 FY2026',
    value: 20_614,
    units: 'thousands_usd',
    source: SRC_Q1_26(FORECAST_STATEMENTS.disaggregation, 'Three months ended March 31, 2026'),
  },
  {
    metric: 'revenue_duolingo_english_test',
    period: 'Q1 FY2026',
    value: 11_317,
    units: 'thousands_usd',
    source: SRC_Q1_26(FORECAST_STATEMENTS.disaggregation, 'Three months ended March 31, 2026'),
  },
  {
    metric: 'revenue_in_app_purchases',
    period: 'Q1 FY2026',
    value: 8_446,
    units: 'thousands_usd',
    source: SRC_Q1_26(FORECAST_STATEMENTS.disaggregation, 'Three months ended March 31, 2026'),
  },
  {
    metric: 'revenue_other',
    period: 'Q1 FY2026',
    value: 682,
    units: 'thousands_usd',
    source: SRC_Q1_26(FORECAST_STATEMENTS.disaggregation, 'Three months ended March 31, 2026'),
  },
  {
    metric: 'cost_of_revenue',
    period: 'Q1 FY2026',
    value: 78_871,
    units: 'thousands_usd',
    source: SRC_Q1_26(FORECAST_STATEMENTS.quarterlyOperations, 'Three months ended March 31, 2026'),
  },
  {
    metric: 'opex_research_and_development',
    period: 'Q1 FY2026',
    value: 82_974,
    units: 'thousands_usd',
    source: SRC_Q1_26(FORECAST_STATEMENTS.quarterlyOperations, 'Three months ended March 31, 2026'),
  },
  {
    metric: 'opex_sales_and_marketing',
    period: 'Q1 FY2026',
    value: 39_249,
    units: 'thousands_usd',
    source: SRC_Q1_26(FORECAST_STATEMENTS.quarterlyOperations, 'Three months ended March 31, 2026'),
  },
  {
    metric: 'opex_general_and_administrative',
    period: 'Q1 FY2026',
    value: 46_346,
    units: 'thousands_usd',
    source: SRC_Q1_26(FORECAST_STATEMENTS.quarterlyOperations, 'Three months ended March 31, 2026'),
  },
  {
    metric: 'gross_profit',
    period: 'Q1 FY2026',
    value: 213_096,
    units: 'thousands_usd',
    source: SRC_Q1_26(FORECAST_STATEMENTS.quarterlyOperations, 'Three months ended March 31, 2026'),
  },
  {
    metric: 'operating_income',
    period: 'Q1 FY2026',
    value: 44_527,
    units: 'thousands_usd',
    source: SRC_Q1_26(FORECAST_STATEMENTS.quarterlyOperations, 'Three months ended March 31, 2026'),
  },
  {
    metric: 'opex_total',
    period: 'Q1 FY2026',
    value: 168_569,
    units: 'thousands_usd',
    source: SRC_Q1_26(FORECAST_STATEMENTS.quarterlyOperations, 'Three months ended March 31, 2026'),
  },

  // ── H1 FY2026 actuals: discrete Q2 FY2026 quarters (cited as filed) ──────
  {
    metric: 'revenue_subscription',
    period: 'Q2 FY2026',
    value: 258_035,
    units: 'thousands_usd',
    source: SRC_Q2_26(FORECAST_STATEMENTS.disaggregation, 'Three Months Ended June 30, 2026'),
  },
  {
    metric: 'revenue_advertising',
    period: 'Q2 FY2026',
    value: 21_052,
    units: 'thousands_usd',
    source: SRC_Q2_26(FORECAST_STATEMENTS.disaggregation, 'Three Months Ended June 30, 2026'),
  },
  {
    metric: 'revenue_duolingo_english_test',
    period: 'Q2 FY2026',
    value: 10_109,
    units: 'thousands_usd',
    source: SRC_Q2_26(FORECAST_STATEMENTS.disaggregation, 'Three Months Ended June 30, 2026'),
  },
  {
    metric: 'revenue_in_app_purchases',
    period: 'Q2 FY2026',
    value: 8_002,
    units: 'thousands_usd',
    source: SRC_Q2_26(FORECAST_STATEMENTS.disaggregation, 'Three Months Ended June 30, 2026'),
  },
  {
    metric: 'revenue_other',
    period: 'Q2 FY2026',
    value: 1_256,
    units: 'thousands_usd',
    source: SRC_Q2_26(FORECAST_STATEMENTS.disaggregation, 'Three Months Ended June 30, 2026'),
  },
  {
    metric: 'cost_of_revenue',
    period: 'Q2 FY2026',
    value: 81_714,
    units: 'thousands_usd',
    source: SRC_Q2_26(FORECAST_STATEMENTS.quarterlyOperations, 'Three Months Ended June 30, 2026'),
  },
  {
    metric: 'opex_research_and_development',
    period: 'Q2 FY2026',
    value: 92_195,
    units: 'thousands_usd',
    source: SRC_Q2_26(FORECAST_STATEMENTS.quarterlyOperations, 'Three Months Ended June 30, 2026'),
  },
  {
    metric: 'opex_sales_and_marketing',
    period: 'Q2 FY2026',
    value: 40_007,
    units: 'thousands_usd',
    source: SRC_Q2_26(FORECAST_STATEMENTS.quarterlyOperations, 'Three Months Ended June 30, 2026'),
  },
  {
    metric: 'opex_general_and_administrative',
    period: 'Q2 FY2026',
    value: 50_593,
    units: 'thousands_usd',
    source: SRC_Q2_26(FORECAST_STATEMENTS.quarterlyOperations, 'Three Months Ended June 30, 2026'),
  },
  {
    metric: 'gross_profit',
    period: 'Q2 FY2026',
    value: 216_740,
    units: 'thousands_usd',
    source: SRC_Q2_26(FORECAST_STATEMENTS.quarterlyOperations, 'Three Months Ended June 30, 2026'),
  },
  {
    metric: 'operating_income',
    period: 'Q2 FY2026',
    value: 33_945,
    units: 'thousands_usd',
    source: SRC_Q2_26(FORECAST_STATEMENTS.quarterlyOperations, 'Three Months Ended June 30, 2026'),
  },
  {
    metric: 'opex_total',
    period: 'Q2 FY2026',
    value: 182_795,
    units: 'thousands_usd',
    source: SRC_Q2_26(FORECAST_STATEMENTS.quarterlyOperations, 'Three Months Ended June 30, 2026'),
  },
]);

/**
 * @param {string} metric
 * @param {string} period
 * @returns {{metric: string, period: string, value: number, units: string, source: object}}
 */
function forecastAnchor(metric, period) {
  const anchor = FORECAST_KNOWN_FIGURES.find((f) => f.metric === metric && f.period === period);
  if (!anchor) throw new Error(`Missing forecast anchor for ${metric} @ ${period}`);
  return anchor;
}

/** @param {string} period @returns {number} */
function forecastValue(metric, period) {
  return forecastAnchor(metric, period).value;
}

/** Scale of the corpus `thousands_usd` unit — dollars per stored unit. */
const THOUSANDS_PER_UNIT = 1000;

/** Number of half-year segments in a fiscal year. */
const HALVES = 2;

/**
 * H1 FY2025 = 9M FY2025 YTD − Q3 FY2025 discrete quarter. Both rows are cited
 * as filed; the difference is a derived (computed) half-year, never typed.
 *
 * @param {string} metric
 * @returns {number}
 */
function h1Fy2025(metric) {
  return forecastValue(metric, '9M FY2025') - forecastValue(metric, 'Q3 FY2025');
}

/**
 * H1 FY2026 = Q1 FY2026 + Q2 FY2026 discrete quarters, both cited as filed.
 *
 * @param {string} metric
 * @returns {number}
 */
function h1Fy2026(metric) {
  return forecastValue(metric, 'Q1 FY2026') + forecastValue(metric, 'Q2 FY2026');
}

/**
 * Forecast fixtures derived at module load from the cited anchors above.
 *
 * @type {Readonly<Record<string, object>>}
 */
export const FORECAST_FIXTURES = Object.freeze({
  /** Paid-subscriber cascade anchors. */
  subscribers: Object.freeze({
    fy2024: forecastValue('paid_subscribers', 'FY2024'),
    fy2025: forecastValue('paid_subscribers', 'FY2025'),
    q2Fy2026: forecastValue('paid_subscribers', 'Q2 FY2026'),
    averageFy2025:
      (forecastValue('paid_subscribers', 'FY2024') + forecastValue('paid_subscribers', 'FY2025')) / HALVES,
    fy2025Growth:
      forecastValue('paid_subscribers', 'FY2025') / forecastValue('paid_subscribers', 'FY2024') - 1,
    h1Fy2026AnnualizedGrowth:
      (forecastValue('paid_subscribers', 'Q2 FY2026') / forecastValue('paid_subscribers', 'FY2025')) ** HALVES - 1,
  }),

  /** FY2025 subscription ARPU, derived from the cited revenue and subs anchors. */
  arpuFy2025:
    (forecastValue('revenue_subscription', 'FY2025') * THOUSANDS_PER_UNIT) /
    ((forecastValue('paid_subscribers', 'FY2024') + forecastValue('paid_subscribers', 'FY2025')) / HALVES),

  /** Per-segment cited bases and the like-for-like H1 comparison. */
  segments: Object.freeze({
    subscription: Object.freeze({
      fy2025Base: forecastValue('revenue_subscription', 'FY2025'),
      h1Fy2025: h1Fy2025('revenue_subscription'),
      h1Fy2026: h1Fy2026('revenue_subscription'),
      h1LikeForLikeGrowth: h1Fy2026('revenue_subscription') / h1Fy2025('revenue_subscription') - 1,
    }),
    advertising: Object.freeze({
      fy2025Base: forecastValue('revenue_advertising', 'FY2025'),
      h1Fy2025: h1Fy2025('revenue_advertising'),
      h1Fy2026: h1Fy2026('revenue_advertising'),
      h1LikeForLikeGrowth: h1Fy2026('revenue_advertising') / h1Fy2025('revenue_advertising') - 1,
    }),
    duolingo_english_test: Object.freeze({
      fy2025Base: forecastValue('revenue_duolingo_english_test', 'FY2025'),
      h1Fy2025: h1Fy2025('revenue_duolingo_english_test'),
      h1Fy2026: h1Fy2026('revenue_duolingo_english_test'),
      h1LikeForLikeGrowth:
        h1Fy2026('revenue_duolingo_english_test') / h1Fy2025('revenue_duolingo_english_test') - 1,
    }),
    in_app_purchases: Object.freeze({
      fy2025Base: forecastValue('revenue_in_app_purchases', 'FY2025'),
      h1Fy2025: h1Fy2025('revenue_in_app_purchases'),
      h1Fy2026: h1Fy2026('revenue_in_app_purchases'),
      h1LikeForLikeGrowth:
        h1Fy2026('revenue_in_app_purchases') / h1Fy2025('revenue_in_app_purchases') - 1,
    }),
    other: Object.freeze({
      fy2025Base: forecastValue('revenue_other', 'FY2025'),
      h1Fy2025: h1Fy2025('revenue_other'),
      h1Fy2026: h1Fy2026('revenue_other'),
      h1LikeForLikeGrowth: h1Fy2026('revenue_other') / h1Fy2025('revenue_other') - 1,
    }),
  }),

  /** H1 FY2026 actuals (cited quarters summed) for every hybrid FY2026 line. */
  h1Fy2026Actuals: Object.freeze({
    revenue_total: scheduleAnchor('revenue_total', 'Q1 FY2026').value + scheduleAnchor('revenue_total', 'Q2 FY2026').value,
    revenue_subscription: h1Fy2026('revenue_subscription'),
    revenue_advertising: h1Fy2026('revenue_advertising'),
    revenue_duolingo_english_test: h1Fy2026('revenue_duolingo_english_test'),
    revenue_in_app_purchases: h1Fy2026('revenue_in_app_purchases'),
    revenue_other: h1Fy2026('revenue_other'),
    cost_of_revenue: h1Fy2026('cost_of_revenue'),
    opex_research_and_development: h1Fy2026('opex_research_and_development'),
    opex_sales_and_marketing: h1Fy2026('opex_sales_and_marketing'),
    opex_general_and_administrative: h1Fy2026('opex_general_and_administrative'),
    opex_total: h1Fy2026('opex_total'),
    gross_profit: h1Fy2026('gross_profit'),
    operating_income: h1Fy2026('operating_income'),
  }),

  /** H1 FY2025 comparison base (9M YTD − Q3 discrete). */
  h1Fy2025Total: scheduleAnchor('revenue_total', '9M FY2025').value - scheduleAnchor('revenue_total', 'Q3 FY2025').value,

  /** FY2025 cost ratios — the basis the contract anchors the cost drivers on. */
  costRatiosFy2025: Object.freeze({
    cost_of_revenue: forecastValue('cost_of_revenue', 'FY2025') / revenueAnchor('FY2025').value,
    research_and_development: forecastValue('opex_research_and_development', 'FY2025') / revenueAnchor('FY2025').value,
    sales_and_marketing: forecastValue('opex_sales_and_marketing', 'FY2025') / revenueAnchor('FY2025').value,
    general_and_administrative:
      forecastValue('opex_general_and_administrative', 'FY2025') / revenueAnchor('FY2025').value,
    other_income_net: forecastValue('other_income_net', 'FY2025') / revenueAnchor('FY2025').value,
  }),

  /** H1 FY2026 observed cost ratios — carried as context, not as the default. */
  costRatiosH1Fy2026: Object.freeze({
    cost_of_revenue: h1Fy2026('cost_of_revenue') / (scheduleAnchor('revenue_total', 'Q1 FY2026').value + scheduleAnchor('revenue_total', 'Q2 FY2026').value),
    research_and_development:
      h1Fy2026('opex_research_and_development') /
      (scheduleAnchor('revenue_total', 'Q1 FY2026').value + scheduleAnchor('revenue_total', 'Q2 FY2026').value),
    sales_and_marketing:
      h1Fy2026('opex_sales_and_marketing') /
      (scheduleAnchor('revenue_total', 'Q1 FY2026').value + scheduleAnchor('revenue_total', 'Q2 FY2026').value),
    general_and_administrative:
      h1Fy2026('opex_general_and_administrative') /
      (scheduleAnchor('revenue_total', 'Q1 FY2026').value + scheduleAnchor('revenue_total', 'Q2 FY2026').value),
  }),

  /** Tax anchors: FY2024 undistorted vs FY2025 distorted (valuation-allowance). */
  tax: Object.freeze({
    fy2024EffectiveRate: forecastValue('income_tax', 'FY2024') / forecastValue('pretax_income', 'FY2024'),
    // A one-time valuation-allowance release — the contract prohibits anchoring
    // the tax driver to it. Carried here as the distortion evidence only.
    fy2025EffectiveRate: forecastValue('income_tax', 'FY2025') / forecastValue('pretax_income', 'FY2025'),
  }),

  /** Interest-income rate anchors driving the P3.2 IS↔BS linkage. */
  interest: Object.freeze({
    fy2025InterestIncome: forecastValue('interest_income', 'FY2025'),
    investedCashFy2024:
      forecastValue('cash_and_cash_equivalents', 'FY2024') +
      forecastValue('short_term_investments', 'FY2024') +
      forecastValue('long_term_investments', 'FY2024'),
    investedCashFy2025:
      forecastValue('cash_and_cash_equivalents', 'FY2025') +
      forecastValue('short_term_investments', 'FY2025') +
      forecastValue('long_term_investments', 'FY2025'),
  }),
});

/**
 * Independent recomputation of the P3.1 forecast cascade.
 *
 * This is the anti-tautology device for the forecast suite: it re-derives every
 * projected line straight from the cited anchors above plus the driver values
 * it is handed, using explicit closed-form arithmetic written independently of
 * `src/engine/forecast.js`. Tests compare engine output against it, so a change
 * in either the anchors or a driver default breaks the suite, and an error in
 * the engine cannot hide behind an identity that is true by construction.
 *
 * @param {object} args
 * @param {Record<string, number>} args.drivers Resolved driver values by name.
 * @param {number} [args.horizon] Number of forecast years (default 5).
 * @param {number} [args.baseYear] First forecast fiscal year (default 2026).
 * @returns {Readonly<Record<string, object>>} Expected values per `FY<year>`.
 */
export function deriveExpectedForecast({ drivers, horizon = 5, baseYear = 2026 }) {
  const g = drivers.paid_subscriber_growth;
  const arpu = drivers.subscription_arpu;

  const opening = FORECAST_FIXTURES.subscribers.fy2025;
  const midYear = FORECAST_FIXTURES.subscribers.q2Fy2026;
  const h1Average = (opening + midYear) / HALVES;
  const halfYearGrowth = (1 + g) ** (1 / HALVES);

  const out = {};
  let priorEnd = opening;

  for (let i = 0; i < horizon; i += 1) {
    const period = `FY${baseYear + i}`;
    const isHybrid = i === 0;

    // Subscriber path.
    let beginning;
    let end;
    let average;
    if (isHybrid) {
      beginning = opening;
      end = midYear * halfYearGrowth;
      average = (h1Average + (midYear + end) / HALVES) / HALVES;
    } else {
      beginning = priorEnd;
      end = beginning * (1 + g);
      average = (beginning + end) / HALVES;
    }
    priorEnd = end;

    // Revenue segments.
    let subscription, advertising, det, iap, other;
    if (isHybrid) {
      const modeledMid = opening * halfYearGrowth;
      const modeledH1Avg = (opening + modeledMid) / HALVES;
      const subH1DriverEst = (modeledH1Avg * arpu / THOUSANDS_PER_UNIT) / HALVES;
      const subFullYearEst = (average * arpu) / THOUSANDS_PER_UNIT;
      const subH2Est = subFullYearEst - subH1DriverEst;
      subscription = FORECAST_FIXTURES.h1Fy2026Actuals.revenue_subscription + subH2Est;

      const adsFull = FORECAST_FIXTURES.segments.advertising.fy2025Base * (1 + drivers.advertising_revenue_growth);
      const adsH2 = adsFull / HALVES;
      advertising = FORECAST_FIXTURES.h1Fy2026Actuals.revenue_advertising + adsH2;

      const detFull = FORECAST_FIXTURES.segments.duolingo_english_test.fy2025Base * (1 + drivers.det_revenue_growth);
      const detH2 = detFull / HALVES;
      det = FORECAST_FIXTURES.h1Fy2026Actuals.revenue_duolingo_english_test + detH2;

      const iapFull = FORECAST_FIXTURES.segments.in_app_purchases.fy2025Base * (1 + drivers.iap_revenue_growth);
      const iapH2 = iapFull / HALVES;
      iap = FORECAST_FIXTURES.h1Fy2026Actuals.revenue_in_app_purchases + iapH2;

      const otherFull = FORECAST_FIXTURES.segments.other.fy2025Base * (1 + drivers.other_revenue_growth);
      const otherH2 = otherFull / HALVES;
      other = FORECAST_FIXTURES.h1Fy2026Actuals.revenue_other + otherH2;
    } else {
      subscription = (average * arpu) / THOUSANDS_PER_UNIT;
      advertising =
        FORECAST_FIXTURES.segments.advertising.fy2025Base *
        (1 + drivers.advertising_revenue_growth) ** (i + 1);
      det =
        FORECAST_FIXTURES.segments.duolingo_english_test.fy2025Base *
        (1 + drivers.det_revenue_growth) ** (i + 1);
      iap =
        FORECAST_FIXTURES.segments.in_app_purchases.fy2025Base *
        (1 + drivers.iap_revenue_growth) ** (i + 1);
      other =
        FORECAST_FIXTURES.segments.other.fy2025Base * (1 + drivers.other_revenue_growth) ** (i + 1);
    }

    const totalRevenue = subscription + advertising + det + iap + other;

    // Cost structure.
    let costOfRevenue, rd, sm, ga, opexTotal, grossProfit, operatingIncome;
    if (isHybrid) {
      const h2TotalRevenue = totalRevenue - FORECAST_FIXTURES.h1Fy2026Actuals.revenue_total;
      const corH2 = h2TotalRevenue * drivers.cost_of_revenue_pct_revenue;
      costOfRevenue = FORECAST_FIXTURES.h1Fy2026Actuals.cost_of_revenue + corH2;

      const rdH2 = h2TotalRevenue * drivers.rd_pct_revenue;
      rd = FORECAST_FIXTURES.h1Fy2026Actuals.opex_research_and_development + rdH2;

      const smH2 = h2TotalRevenue * drivers.sm_pct_revenue;
      sm = FORECAST_FIXTURES.h1Fy2026Actuals.opex_sales_and_marketing + smH2;

      const gaH2 = h2TotalRevenue * drivers.ga_pct_revenue;
      ga = FORECAST_FIXTURES.h1Fy2026Actuals.opex_general_and_administrative + gaH2;

      opexTotal = rd + sm + ga;
      grossProfit = totalRevenue - costOfRevenue;
      operatingIncome = grossProfit - opexTotal;
    } else {
      costOfRevenue = totalRevenue * drivers.cost_of_revenue_pct_revenue;
      rd = totalRevenue * drivers.rd_pct_revenue;
      sm = totalRevenue * drivers.sm_pct_revenue;
      ga = totalRevenue * drivers.ga_pct_revenue;
      opexTotal = rd + sm + ga;
      grossProfit = totalRevenue - costOfRevenue;
      operatingIncome = grossProfit - opexTotal;
    }

    out[period] = Object.freeze({
      period,
      subscribers: Object.freeze({ beginning, end, average }),
      revenue: Object.freeze({
        segments: Object.freeze({ subscription, advertising, duolingo_english_test: det, in_app_purchases: iap, other }),
        total: totalRevenue,
      }),
      costs: Object.freeze({
        cost_of_revenue: costOfRevenue,
        research_and_development: rd,
        sales_and_marketing: sm,
        general_and_administrative: ga,
        opex_total: opexTotal,
      }),
      gross_profit: grossProfit,
      operating_income: operatingIncome,
      h1Actuals: isHybrid ? FORECAST_FIXTURES.h1Fy2026Actuals : null,
    });
  }

  return Object.freeze(out);
}

/**
 * Cited figures for 3-statement anchors and baseline balances.
 */
export const THREE_STATEMENT_KNOWN_FIGURES = Object.freeze({
  bopQ2Fy2026: Object.freeze({
    cash_and_cash_equivalents: 1_180_887,
    restricted_cash: 2_735,
    short_term_investments: 132_979,
    long_term_investments: 102_693,
    operating_lease_right_of_use_assets: 74_830,
    property_and_equipment_net: 42_619,
    intangible_assets_net: 27_598,
    goodwill: 35_335,
    deferred_tax_assets_net: 206_039,
    other_assets: 10_990,
    deferred_revenues: 505_102,
    accounts_payable: 16_196,
    income_tax_payable: 1_106,
    accrued_expenses_and_other_current_liabilities: 55_429,
    long_term_operating_lease_liability: 86_136,
    deferred_tax_liabilities_net: 242,
    common_stock: 5,
    additional_paid_in_capital: 1_046_326,
    retained_earnings_accumulated_deficit: 364_836,
    treasury_stock: -1_425,
    total_assets: 2_073_953,
    total_liabilities: 664_211,
    total_stockholders_equity: 1_409_742,
  }),
  h1Fy2026CashFlow: Object.freeze({
    net_income: 76_618,
    cash_from_operating_activities: 239_031,
    purchase_of_property_and_equipment: -7_028,
    capitalized_software_and_intangibles: -5_587,
    cash_from_investing_activities: -8_469,
    proceeds_from_stock_options_exercise: 2_338,
    repurchase_of_common_stock: -69_603,
    taxes_paid_net_share_settlement: -18_799,
    cash_from_financing_activities: -86_064,
    net_change_in_cash: 144_498,
    cash_beginning_of_period: 1_039_124,
    cash_end_of_period: 1_183_622,
  }),
});

/**
 * Independent closed-form recomputation of the 3-statement linkage for testing.
 *
 * @param {object} expectedForecast Output from deriveExpectedForecast
 * @param {object} drivers Named driver values
 * @param {object} schedules Output from schedules.build
 * @returns {object} ExpectedThreeStatementOutput
 */
export function deriveExpectedThreeStatement(expectedForecast, drivers, schedules) {
  const periods = Object.keys(expectedForecast);
  const out = {};

  const bop = THREE_STATEMENT_KNOWN_FIGURES.bopQ2Fy2026;
  const bopInvested = bop.cash_and_cash_equivalents + bop.short_term_investments + bop.long_term_investments;
  const otherInvestments = bop.short_term_investments + bop.long_term_investments;

  let priorCash = bop.cash_and_cash_equivalents;
  let priorApic = bop.additional_paid_in_capital;
  let priorRetained = bop.retained_earnings_accumulated_deficit;
  let priorNwc = schedules.workingCapital.byPeriod['Q2 FY2026'].net_working_capital.value;
  let priorPpe = bop.property_and_equipment_net;
  let priorIntg = bop.intangible_assets_net;

  for (let i = 0; i < periods.length; i += 1) {
    const period = periods[i];
    const isHybrid = i === 0;
    const fc = expectedForecast[period];
    const rev = fc.revenue.total;
    const opInc = fc.operating_income;

    const dsoDays = drivers.dso_days ?? 57.28;
    const dpoDays = drivers.dpo_days ?? 10.13;
    const defRevPct = drivers.deferred_revenue_pct_revenue ?? 0.4782;
    const defCorPct = drivers.deferred_cost_pct_revenue ?? 0.0989;
    const prepaidsPct = drivers.prepaid_expenses_pct_revenue ?? 0.016;
    const taxRecPct = drivers.income_tax_receivable_pct_revenue ?? 0.0136;
    const accruedPct = drivers.accrued_expenses_pct_revenue ?? 0.044;
    const taxPayPct = drivers.income_tax_payable_pct_revenue ?? 0.0012;

    const ar = rev * (dsoDays / 365);
    const defCor = rev * defCorPct;
    const prepaids = rev * prepaidsPct;
    const taxRec = rev * taxRecPct;
    const wcAssets = ar + defCor + prepaids + taxRec;

    const defRev = rev * defRevPct;
    const ap = fc.costs.cost_of_revenue * (dpoDays / 365);
    const accrued = rev * accruedPct;
    const taxPay = rev * taxPayPct;
    const wcLiabilities = defRev + ap + accrued + taxPay;

    const nwc = wcAssets - wcLiabilities;
    const deltaNwc = nwc - priorNwc;

    const capexPpeAnnual = rev * (drivers.capex_ppe_pct_revenue ?? 0.0174);
    const ppeDeprecAnnual = rev * (drivers.depreciation_pct_revenue ?? 0.005);
    const capexIntgAnnual = rev * (drivers.capitalized_software_pct_revenue ?? 0.009);
    const intgAmortAnnual = rev * (drivers.amortization_pct_revenue ?? 0.0089);
    const sbcAnnual = rev * (drivers.sbc_target_pct_of_revenue ?? drivers.sbc_pct_revenue ?? 0.1325);

    const capexPpe = isHybrid ? capexPpeAnnual / 2 : capexPpeAnnual;
    const ppeDeprec = isHybrid ? ppeDeprecAnnual / 2 : ppeDeprecAnnual;
    const capexIntg = isHybrid ? capexIntgAnnual / 2 : capexIntgAnnual;
    const intgAmort = isHybrid ? intgAmortAnnual / 2 : intgAmortAnnual;
    const sbc = isHybrid ? sbcAnnual / 2 : sbcAnnual;

    const dAndA = ppeDeprec + intgAmort;
    const totalCapex = capexPpe + capexIntg;

    const endingPpe = (isHybrid ? bop.property_and_equipment_net : priorPpe) + capexPpe - ppeDeprec;
    const endingIntg = (isHybrid ? bop.intangible_assets_net : priorIntg) + capexIntg - intgAmort;

    const optProceeds = isHybrid ? (drivers.option_proceeds ?? 0) / 2 : (drivers.option_proceeds ?? 0);
    const taxSettle = isHybrid ? (drivers.net_share_settlement_taxes ?? 0) / 2 : (drivers.net_share_settlement_taxes ?? 0);
    const buybacks = isHybrid ? (drivers.share_repurchases ?? 0) / 2 : (drivers.share_repurchases ?? 0);
    const cff = optProceeds - taxSettle - buybacks;

    const taxRate = drivers.effective_tax_rate ?? 0.134225;
    const intRate = drivers.interest_income_rate ?? 0.040179;
    const otherPct = drivers.other_income_net_pct_revenue ?? -0.001;

    const effIntRate = isHybrid ? intRate / 2 : intRate;
    const otherIncH2 = isHybrid
      ? (rev - FORECAST_FIXTURES.h1Fy2026Actuals.revenue_total) * otherPct
      : rev * otherPct;
    const preIntOpInc = isHybrid ? fc.operating_income - (FORECAST_FIXTURES.h1Fy2026Actuals.gross_profit - (FORECAST_FIXTURES.h1Fy2026Actuals.opex_research_and_development + FORECAST_FIXTURES.h1Fy2026Actuals.opex_sales_and_marketing + FORECAST_FIXTURES.h1Fy2026Actuals.opex_general_and_administrative)) : opInc;

    const preIntNet = (preIntOpInc + otherIncH2) * (1 - taxRate);
    const preIntOcf = preIntNet + dAndA + sbc - deltaNwc;
    const preIntIcf = -totalCapex;
    const preIntCashChange = preIntOcf + preIntIcf + cff;
    const preIntEndingCash = priorCash + preIntCashChange;
    const preIntAvgInvested = (priorCash + otherInvestments + preIntEndingCash + otherInvestments) / 2;

    const intIncomeH2 = (effIntRate * preIntAvgInvested) / (1 - (effIntRate * (1 - taxRate)) / 2);

    let netIncome, ocf;
    if (isHybrid) {
      const h2Pretax = preIntOpInc + otherIncH2 + intIncomeH2;
      const h2Tax = h2Pretax * taxRate;
      const h2Net = h2Pretax - h2Tax;
      netIncome = 76_618 + h2Net;
      ocf = 239_031 + (h2Net + dAndA + sbc - deltaNwc);
    } else {
      const pretax = opInc + otherIncH2 + intIncomeH2;
      const tax = pretax * taxRate;
      netIncome = pretax - tax;
      ocf = netIncome + dAndA + sbc - deltaNwc;
    }

    const icf = isHybrid ? -8_469 + (-totalCapex) : -totalCapex;
    const fcf = ocf + icf;
    const netCashChange = (isHybrid ? 144_498 : 0) + (isHybrid ? (ocf - 239_031 + (-totalCapex) + cff) : (ocf + icf + cff));
    const endingCash = isHybrid ? bop.cash_and_cash_equivalents + (ocf - 239_031 + (-totalCapex) + cff) : priorCash + netCashChange;

    const totalCurrentAssets = endingCash + bop.short_term_investments + ar + defCor + prepaids + taxRec;
    const totalNonCurrentAssets =
      bop.operating_lease_right_of_use_assets +
      bop.long_term_investments +
      endingPpe +
      endingIntg +
      bop.goodwill +
      bop.restricted_cash +
      bop.deferred_tax_assets_net +
      bop.other_assets;
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

    const totalCurrentLiabilities = defRev + ap + accrued + taxPay;
    const totalNonCurrentLiabilities = bop.long_term_operating_lease_liability + bop.deferred_tax_liabilities_net;
    const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;

    const apic = priorApic + sbc + optProceeds - taxSettle - buybacks;
    const retained = priorRetained + (isHybrid ? netIncome - 76_618 : netIncome);
    const totalEquity = bop.common_stock + apic + retained + bop.treasury_stock;

    out[period] = Object.freeze({
      period,
      netIncome,
      ocf,
      icf,
      fcf,
      cff,
      endingCash,
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanceCheck: Object.freeze({
        assets: totalAssets,
        liabilities: totalLiabilities,
        equity: totalEquity,
        difference: totalAssets - (totalLiabilities + totalEquity),
        ok: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1e-6,
      }),
    });

    priorCash = endingCash;
    priorApic = apic;
    priorRetained = retained;
    priorNwc = nwc;
    priorPpe = endingPpe;
  priorIntg = endingIntg;
}

  return Object.freeze(out);
}

/* ────────────────────────────────────────────────────────────────────────────
 * P4.1 — WACC market anchors (GROWTH_FIXTURE derived-anchor pattern)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Every value below is COMPUTED at module load from the market driver defaults
 * in `src/data/assumptions.json`. Hand-typed market values are prohibited by
 * the rule `GROWTH_FIXTURE` established, so these anchors cannot drift from the
 * assumption set and cannot silently disagree with the corpus.
 *
 * The WACC is derived through the GENERAL weighted formula —
 * `(E/V)·Re + (D/V)·Rd·(1−t)` — with an explicit zero debt balance, not by
 * copying the cost of equity. That way the fixture itself proves the
 * debt-free collapse rather than assuming it.
 */

/**
 * The market driver defaults, read once at module load.
 * @type {ReadonlyArray<object>}
 */
const ASSUMPTION_ROWS = JSON.parse(
  fs.readFileSync(
    fileURLToPath(new URL('../../src/data/assumptions.json', import.meta.url)),
    'utf8',
  ),
);

/**
 * @param {string} name Driver name.
 * @returns {object} The driver record.
 */
function marketDriver(name) {
  const row = ASSUMPTION_ROWS.find((r) => r && r.name === name);
  if (!row) {
    throw new Error(`duolingo_facts: market driver "${name}" is missing from assumptions.json`);
  }
  return row;
}

/**
 * The five market-sourced drivers plus the terminal growth judgment, each with
 * the provenance the MKT regime requires.
 *
 * @type {Readonly<Record<string, object>>}
 */
export const MARKET_KNOWN_FIGURES = Object.freeze(
  ['risk_free_rate', 'beta', 'equity_risk_premium', 'terminal_growth_rate', 'market_share_price', 'shares_outstanding'].reduce((acc, name) => {
    const driver = marketDriver(name);
    acc[name] = Object.freeze({
      name: driver.name,
      label: driver.label,
      group: driver.group,
      value: driver.value,
      units: driver.units,
      marking: driver.marking,
      asOf: driver.asOf ?? null,
      provider: driver.source?.provider ?? null,
      url: driver.source?.url ?? null,
      notes: driver.notes,
    });
    return acc;
  }, {}),
);

const RF_ANCHOR = MARKET_KNOWN_FIGURES.risk_free_rate.value;
const BETA_ANCHOR = MARKET_KNOWN_FIGURES.beta.value;
const ERP_ANCHOR = MARKET_KNOWN_FIGURES.equity_risk_premium.value;
const PRICE_ANCHOR = MARKET_KNOWN_FIGURES.market_share_price.value;
const SHARES_ANCHOR = MARKET_KNOWN_FIGURES.shares_outstanding.value;
const TERMINAL_G_ANCHOR = MARKET_KNOWN_FIGURES.terminal_growth_rate.value;

/** CAPM cost of equity — derived, never typed. */
const COST_OF_EQUITY_ANCHOR = RF_ANCHOR + BETA_ANCHOR * ERP_ANCHOR;

/** Equity market value E — derived, never typed. */
const MARKET_CAP_ANCHOR = PRICE_ANCHOR * SHARES_ANCHOR;

/** Funded debt balance D — zero, per the P2.3 debt-free proof. */
const DEBT_BALANCE_ANCHOR = 0;

/** Total capital V = E + D. */
const TOTAL_CAPITAL_ANCHOR = MARKET_CAP_ANCHOR + DEBT_BALANCE_ANCHOR;

/**
 * P4.1 WACC anchors, derived at module load through the general weighted
 * formula with an explicit zero debt balance.
 *
 * @type {Readonly<Record<string, unknown>>}
 */
export const WACC_FIXTURE = Object.freeze({
  method: 'CAPM — Re = rf + beta × ERP; WACC = (E/V)·Re + (D/V)·Rd·(1−t)',
  riskFreeRate: RF_ANCHOR,
  beta: BETA_ANCHOR,
  equityRiskPremium: ERP_ANCHOR,
  costOfEquity: COST_OF_EQUITY_ANCHOR,
  sharePrice: PRICE_ANCHOR,
  sharesOutstanding: SHARES_ANCHOR,
  marketCap: MARKET_CAP_ANCHOR,
  debtBalance: DEBT_BALANCE_ANCHOR,
  totalCapital: TOTAL_CAPITAL_ANCHOR,
  equityWeight: MARKET_CAP_ANCHOR / TOTAL_CAPITAL_ANCHOR,
  debtWeight: DEBT_BALANCE_ANCHOR / TOTAL_CAPITAL_ANCHOR,
  wacc:
    (MARKET_CAP_ANCHOR / TOTAL_CAPITAL_ANCHOR) * COST_OF_EQUITY_ANCHOR +
    (DEBT_BALANCE_ANCHOR / TOTAL_CAPITAL_ANCHOR) * 0,
  terminalGrowthRate: TERMINAL_G_ANCHOR,
  debtFree: DEBT_BALANCE_ANCHOR === 0,
  derivedFrom: 'market driver defaults in src/data/assumptions.json (computed at module load)',
});

/* ────────────────────────────────────────────────────────────────────────────
 * P4.2 — DCF valuation anchors (GROWTH_FIXTURE derived-anchor pattern)
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * Closed-form helper to compute discount factor for a given period index t and WACC.
 *
 * @param {number} t 1-based year index (e.g. FY2026 = 1)
 * @param {number} [wacc] WACC rate
 * @returns {number}
 */
export function deriveDiscountFactor(t, wacc = WACC_FIXTURE.wacc) {
  return 1 / Math.pow(1 + wacc, t);
}

/**
 * Independent closed-form recomputation of the DCF valuation schedule and bridge.
 *
 * @param {object} threeStatement Output from threeStatement.project or deriveExpectedThreeStatement
 * @param {number|object} wacc WACC rate or WaccBuild
 * @param {object} assumptions AssumptionSet or driver map
 * @param {number} [horizon=5]
 * @returns {object}
 */
export function deriveExpectedDcf(threeStatement, wacc, assumptions, horizon = 5) {
  const waccRate =
    typeof wacc === 'number'
      ? wacc
      : (wacc?.wacc?.value ?? wacc?.wacc ?? (typeof wacc?.value === 'number' ? wacc.value : WACC_FIXTURE.wacc));

  const getDriver = (name) => {
    if (assumptions && typeof assumptions.get === 'function') {
      return assumptions.get(name)?.value;
    }
    if (assumptions && typeof assumptions === 'object') {
      return assumptions[name];
    }
    return undefined;
  };

  const g = getDriver('terminal_growth_rate') ?? TERMINAL_G_ANCHOR;
  const shares = getDriver('shares_outstanding') ?? SHARES_ANCHOR;
  const price = getDriver('market_share_price') ?? PRICE_ANCHOR;

  const availablePeriods =
    threeStatement.periods ||
    threeStatement.cashFlow?.periods ||
    Object.keys(threeStatement.cashFlow?.byPeriod || threeStatement);

  const periods = availablePeriods.slice(0, horizon);
  const schedule = [];
  let pvExplicit = 0;

  for (let i = 0; i < periods.length; i += 1) {
    const period = periods[i];
    const t = i + 1;
    const fcf =
      threeStatement.cashFlow?.byPeriod?.[period]?.free_cash_flow?.value ??
      threeStatement[period]?.fcf;
    const df = 1 / Math.pow(1 + waccRate, t);
    const pv = fcf * df;
    pvExplicit += pv;
    schedule.push(
      Object.freeze({
        period,
        t,
        fcf,
        discountFactor: df,
        presentValue: pv,
      }),
    );
  }

  const finalItem = schedule[schedule.length - 1];
  const fcf_T = finalItem.fcf;
  const terminalFcf = fcf_T * (1 + g);
  const terminalValue = terminalFcf / (waccRate - g);
  const df_T = finalItem.discountFactor;
  const pvTerminal = terminalValue * df_T;
  const enterpriseValue = pvExplicit + pvTerminal;

  const terminalPeriod = periods[periods.length - 1];
  const finalBs = threeStatement.balanceSheet?.byPeriod?.[terminalPeriod];
  const cash =
    finalBs?.current_assets?.cash_and_cash_equivalents?.value ??
    threeStatement[terminalPeriod]?.endingCash ??
    threeStatement[terminalPeriod]?.cash;
  const sti =
    finalBs?.current_assets?.short_term_investments?.value ??
    THREE_STATEMENT_KNOWN_FIGURES.bopQ2Fy2026.short_term_investments;
  const lti =
    finalBs?.non_current_assets?.long_term_investments?.value ??
    THREE_STATEMENT_KNOWN_FIGURES.bopQ2Fy2026.long_term_investments;
  const debt = 0;
  const netCash = cash + sti + lti - debt;
  const equityValue = enterpriseValue + netCash;
  const perShare = (equityValue * 1000) / shares;

  return Object.freeze({
    wacc: waccRate,
    terminalGrowthRate: g,
    horizon,
    periods: Object.freeze(periods.slice()),
    schedule: Object.freeze(schedule),
    pvExplicit,
    terminalValue,
    pvTerminal,
    enterpriseValue,
    ev: enterpriseValue,
    netCash,
    equityValue,
    perShare,
    sharesOutstanding: shares,
    marketSharePrice: price,
    bridge: Object.freeze({
      cash,
      shortTermInvestments: sti,
      longTermInvestments: lti,
      netCash,
      debt,
    }),
    derivedFrom: 'market driver defaults + P3 forecast anchors (computed at module load)',
  });
}

/** Discount factor anchors for FY2026 (t=1) and FY2030 (t=5). */
export const DISCOUNT_FACTOR_FY2026 = 1 / (1 + WACC_FIXTURE.wacc);
export const DISCOUNT_FACTOR_FY2030 = 1 / Math.pow(1 + WACC_FIXTURE.wacc, 5);

/**
 * P4.2 DCF Valuation Known Figures & Anchors.
 */
export const DCF_KNOWN_FIGURES = Object.freeze({
  discountFactorFy2026: DISCOUNT_FACTOR_FY2026,
  discountFactorFy2030: DISCOUNT_FACTOR_FY2030,
  terminalGrowthRate: TERMINAL_G_ANCHOR,
  sharesOutstanding: SHARES_ANCHOR,
  marketSharePrice: PRICE_ANCHOR,
  stiHeldConstant: THREE_STATEMENT_KNOWN_FIGURES.bopQ2Fy2026.short_term_investments,
  ltiHeldConstant: THREE_STATEMENT_KNOWN_FIGURES.bopQ2Fy2026.long_term_investments,
  debtBalance: 0,
});

/* ────────────────────────────────────────────────────────────────────────────
 * P4.3 — Recommendation & Valuation Range Anchors
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * Mechanical recommendation evaluator for fixtures (anti-tautology).
 *
 * @param {number} dcfPerShare
 * @param {number} [marketPrice]
 * @returns {object}
 */
export function deriveExpectedRecommendation(dcfPerShare, marketPrice = PRICE_ANCHOR) {
  const upsidePct = (dcfPerShare - marketPrice) / marketPrice;
  let label = 'fair';
  if (upsidePct >= 0.15) {
    label = 'undervalued';
  } else if (upsidePct <= -0.15) {
    label = 'overvalued';
  }
  return Object.freeze({
    dcfPerShare,
    marketPrice,
    upsidePct,
    label,
  });
}

/**
 * P4.3 Recommendation Known Figures & Anchors.
 */
export const RECOMMENDATION_KNOWN_FIGURES = Object.freeze({
  undervaluedThreshold: 0.15,
  overvaluedThreshold: -0.15,
  vocabulary: Object.freeze(['undervalued', 'fair', 'overvalued']),
});







