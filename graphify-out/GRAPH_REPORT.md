# Graph Report - Duolingo FM  (2026-09-30)

## Corpus Check
- Large corpus: 517 files · ~2,136,036 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 848 nodes · 2068 edges · 44 communities
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 107 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Valuation & Sensitivity Tabs
- Audit Flags & Data Schema
- Schedule Builders (Debt/SBC/PPE)
- App Bootstrap & Market Data
- Historicals Tab Rendering
- Forecast Horizon & Fiscal Calendar
- Assumptions Tab UI
- Phase 10 Baseline Manifest
- Global Constants & Paths
- Schedules Tab UI
- Projections Tab & KPIs
- Comps & EV Multiples
- Accounting Invariant Checks
- Package Manifest & Playwright
- Financial Ratios Engine
- Recommendation & WACC
- Citation Pin Regeneration
- Scenarios & Data Provenance
- Charts (Revenue/FCF/Trend)
- Fully Diluted Share Schedule
- DCF Discounting
- Local Dev Server
- Redesign Font Gate
- Audit Center & Operating KPIs
- Revenue Donut Chart
- Phase Archive Script
- Visual Inspection Scripts
- Pages Artifact Builder
- Multi-Method Verdict Aggregation
- Historicals Workspace & CSV
- OpenCode MCP Config
- JS Verification Script
- DS Inbox Watcher
- OP Inbox Watcher
- Price API Proxy
- Phase 6R2 Capture
- Phase 5 Capture
- Phase 6R3 Capture
- Phase 8 Capture
- Pages Static Server
- FCFF DCF Valuation
- Peer Corpus Validation
- Tab Navigation
- Vercel Deploy Config

## God Nodes (most connected - your core abstractions)
1. `EngineError` - 136 edges
2. `extractRows()` - 52 edges
3. `percent()` - 40 edges
4. `usd()` - 39 edges
5. `createApp()` - 34 edges
6. `estSuffix()` - 26 edges
7. `renderValuation()` - 26 edges
8. `renderSummary()` - 25 edges
9. `valuate()` - 20 edges
10. `renderHistoricals()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `createServer()` --calls--> `handler()`  [EXTRACTED]
  tools/local_server.mjs → api/price.js
- `buildLiveBundle()` --calls--> `loadHistorical()`  [EXTRACTED]
  tools/regen_pins.mjs → src/data/loader.js
- `buildLiveBundle()` --calls--> `loadAssumptions()`  [EXTRACTED]
  tools/regen_pins.mjs → src/data/loader.js
- `buildLiveBundle()` --calls--> `extractRows()`  [EXTRACTED]
  tools/regen_pins.mjs → src/data/schema.js
- `buildLiveBundle()` --calls--> `valuate()`  [EXTRACTED]
  tools/regen_pins.mjs → src/engine/dcf.js

## Import Cycles
- None detected.

## Communities (44 total, 0 thin omitted)

### Community 0 - "Valuation & Sensitivity Tabs"
Cohesion: 0.07
Nodes (68): RECOMMENDATION_THRESHOLDS, src_data_historical_peers_beta, src_data_historical_prices, deepFreeze(), extractReturnPair(), regress(), canonicalDcfPerShare(), describeStageStructure() (+60 more)

### Community 1 - "Audit Flags & Data Schema"
Cohesion: 0.05
Nodes (51): asLabel(), AUDIT_FLAGS, AUDIT_RULES, auditDataset(), entry(), FLAG_EST_ROW, isRecord(), isSourceObject() (+43 more)

### Community 2 - "Schedule Builders (Debt/SBC/PPE)"
Cohesion: 0.11
Nodes (42): extractRows(), BALANCE_PERIODS, build(), buildDebt(), buildIntangibleAmortization(), buildPpeRollForward(), buildSbc(), buildWorkingCapital() (+34 more)

### Community 3 - "App Bootstrap & Market Data"
Cohesion: 0.09
Nodes (37): bootApp(), clampDriverValue(), computeSensitivityAxes(), createApp(), applyDriverOverrides(), clearBenchmarkOverride(), fetchPrice(), recalculate() (+29 more)

### Community 4 - "Historicals Tab Rendering"
Cohesion: 0.08
Nodes (37): AUDIT_FILINGS, formatRatioById(), formatRatioChange(), formatRatioValue(), formatTabularNumber(), ALL_PERIOD_COLUMNS, ANNUAL_PERIODS, buildAnalysisDividerRow() (+29 more)

### Community 5 - "Forecast Horizon & Fiscal Calendar"
Cohesion: 0.09
Nodes (32): EFFECTIVE_VALUATION_DATE, FORECAST_BASE_YEAR, FORECAST_HORIZON_DEFAULT, FORECAST_PERIOD_PREFIX, FORECAST_STAGES, FY2026_END_DATE, HALVES_PER_YEAR, PRE_VALUATION_STUB_FRACTION (+24 more)

### Community 6 - "Assumptions Tab UI"
Cohesion: 0.11
Nodes (26): CATEGORY_GROUPS, CATEGORY_PILLS, clamp(), getDriverVal(), HISTORICAL_DATA, renderAssumptions(), applyCategoryFilter(), applyModeSwitch() (+18 more)

### Community 7 - "Phase 10 Baseline Manifest"
Cohesion: 0.06
Nodes (30): canonical, condition, expiry, owner, reason, created_at, director_signoff, authority (+22 more)

### Community 8 - "Global Constants & Paths"
Cohesion: 0.08
Nodes (24): CANONICAL_HORIZON, DATA_DIR, DRIVER_GROUPS, EST_BADGE_LABEL, FADE_STAGE_LENGTH, FADE_START_INDEX, FISCAL_CALENDAR_NOTES, FORECAST_ANCHOR_PERIODS (+16 more)

### Community 9 - "Schedules Tab UI"
Cohesion: 0.15
Nodes (23): formatAccounting(), ALL_PERIODS, ALL_SCHEDULE_PERIODS, buildScheduleColumns(), FADE_PERIODS, FORECAST_PERIODS, HISTORICAL_PERIODS, renderGateCards() (+15 more)

### Community 10 - "Projections Tab & KPIs"
Cohesion: 0.14
Nodes (21): createMarginChart(), ALL_PERIODS, computeProjectionKpis(), createHistoricalLookup(), FADE_PERIODS, FORECAST_PERIODS, HISTORICAL_PERIODS, readProjectionValue() (+13 more)

### Community 11 - "Comps & EV Multiples"
Cohesion: 0.20
Nodes (15): computeMultiMethodValuation(), EngineError, assertDenominatorNotWeightedAverage(), weightedAverageDiagnosticsOf(), computeStats(), valuateComps(), computeStats(), valuateEvMultiples() (+7 more)

### Community 12 - "Accounting Invariant Checks"
Cohesion: 0.17
Nodes (21): ADD_BACK_LINE_TO_REGISTRY_KEY, checkForecastArticulation(), checkNetCashBridge(), checkPinSync(), checkSettlementRegistry(), compareIdentity(), CURRENT_ASSET_LINES, CURRENT_LIABILITY_LINES (+13 more)

### Community 13 - "Package Manifest & Playwright"
Cohesion: 0.10
Nodes (19): description, devDependencies, playwright, @playwright/test, engines, node, name, private (+11 more)

### Community 14 - "Financial Ratios Engine"
Cohesion: 0.14
Nodes (19): DAYS_IN_YEAR, ANNUAL_ONLY_RATIOS, BALANCE_METRICS, buildIndex(), buildResolver(), CATALOGUE, computeHistoricalRatios(), DEFS_BY_ID (+11 more)

### Community 15 - "Recommendation & WACC"
Cohesion: 0.22
Nodes (18): MARKING_VALUES, buildLabelStability(), buildSbcSensitivity(), buildSensitivityGrid(), deepFreeze(), evaluate(), requireDriverValue(), requireFiniteBandNumber() (+10 more)

### Community 16 - "Citation Pin Regeneration"
Cohesion: 0.15
Nodes (16): ref_node_crypto, tests_ledger, tests_ledger_readledgerurls, applyPinMap(), hashSources(), listStampSources(), normalizeForHash(), PIN_MAP (+8 more)

### Community 17 - "Scenarios & Data Provenance"
Cohesion: 0.15
Nodes (14): deepFreeze(), LEASE_INPUTS, peersDataset, DEFAULT_SCENARIO, SCENARIO_NAMES, src_data_historical_duolleaseinputs, src_data_historical_peers, REQUIRED_CITATION (+6 more)

### Community 18 - "Charts (Revenue/FCF/Trend)"
Cohesion: 0.16
Nodes (18): RATIO_DEFS, update(), createRevenueFcfChart(), createTrendBarChart(), bindBarClicks(), describeMetric(), renderSvg(), update() (+10 more)

### Community 19 - "Fully Diluted Share Schedule"
Cohesion: 0.20
Nodes (16): src_data_historical_duolfullydiluted, resolveSharesSchedule(), buildFullyDilutedSchedule(), deepFreeze(), isMeasurementDate(), readProvenance(), requireCount(), REQUIRED_COMPONENTS (+8 more)

### Community 20 - "DCF Discounting"
Cohesion: 0.23
Nodes (15): calculateDiscountExponent(), FORECAST_HORIZON_MIN, H2_DAYS_TOTAL, PRE_VALUATION_STUB_DAYS, deepFreeze(), intervalOverlapDays(), normalizeHorizon(), requireDriverValue() (+7 more)

### Community 21 - "Local Dev Server"
Cohesion: 0.17
Nodes (13): ALLOWED_EXTENSIONS, ALLOWED_PATH_PREFIXES, createServer(), DEFAULT_HOST, DEFAULT_PORT, defaultRoot, findOwningPid(), LAN_HOST (+5 more)

### Community 22 - "Redesign Font Gate"
Cohesion: 0.23
Nodes (13): ref_node_url, APPROVED_FONTS, __dirname, EXEMPT_NUMBERS, INDEX_PATH, ROOT, runGateScan(), scanHelveticaInheritance() (+5 more)

### Community 23 - "Audit Center & Operating KPIs"
Cohesion: 0.29
Nodes (13): escapeText(), safeUrl(), buildAuditCenterMarkup(), buildOperatingKpisMarkup(), computeOperatingKpis(), renderHistoricals(), buildStatementData(), closeDrawer() (+5 more)

### Community 24 - "Revenue Donut Chart"
Cohesion: 0.35
Nodes (12): computeExactPercentages(), createRevenueDonutChart(), findLegendEntry(), handleContainerClick(), handleContainerKeydown(), isDimmed(), isolateSegment(), legendNameOf() (+4 more)

### Community 25 - "Phase Archive Script"
Cohesion: 0.18
Nodes (10): ref_child_process, ref_url, archiveDir, __dirname, inboxDs, inboxOp, now, rootDir (+2 more)

### Community 26 - "Visual Inspection Scripts"
Cohesion: 0.24
Nodes (7): ref_fs, ref_path, captureRoute(), OUT_DIR, run(), fs, path

### Community 27 - "Pages Artifact Builder"
Cohesion: 0.24
Nodes (9): ref_node_path, ALLOWLIST, build(), check(), copyDir(), FORBIDDEN, OUT, ROOT (+1 more)

### Community 28 - "Multi-Method Verdict Aggregation"
Cohesion: 0.27
Nodes (8): aggregateVerdicts(), buildAgreementSummary(), collapseCluster(), deepFreeze(), EVIDENCE_CLUSTERS, NON_VOTING_METHODS, verdict, VERDICT_ORDER

### Community 29 - "Historicals Workspace & CSV"
Cohesion: 0.40
Nodes (10): buildWorkspaceMarkup(), pivotRowsByMetric(), renderHistoricalsWorkspace(), bindControls(), exportCsv(), getStatementRows(), render(), setPeriodMode() (+2 more)

### Community 30 - "OpenCode MCP Config"
Cohesion: 0.22
Nodes (8): FIRECRAWL_API_KEY, command, enabled, environment, type, mcp, firecrawl, $schema

### Community 31 - "JS Verification Script"
Cohesion: 0.22
Nodes (8): ref_node_child_process, all, manifest, manifestFiles, manifestPath, ROOT, walked, walkJs()

### Community 32 - "DS Inbox Watcher"
Cohesion: 0.28
Nodes (8): __dirname, getStatus(), hasSignal(), initial, resultPath, targetPath, timer, watchdog

### Community 33 - "OP Inbox Watcher"
Cohesion: 0.28
Nodes (8): __dirname, getStatus(), hasSignal(), initial, resultPath, targetPath, timer, watchdog

### Community 34 - "Price API Proxy"
Cohesion: 0.36
Nodes (7): ALLOWED_ORIGINS, applyCors(), config, handler(), parseUpstreamDate(), rateBuckets, rateLimited()

### Community 35 - "Phase 6R2 Capture"
Cohesion: 0.29
Nodes (7): ref_http, captureAll(), createStaticServer(), MIME_TYPES, OUT_DIR, TABS, VIEWPORTS

### Community 36 - "Phase 5 Capture"
Cohesion: 0.29
Nodes (7): playwright, captureAll(), createStaticServer(), MIME_TYPES, OUT_DIR, TABS, VIEWPORTS

### Community 37 - "Phase 6R3 Capture"
Cohesion: 0.29
Nodes (7): captureAll(), createStaticServer(), MIME_TYPES, OUT_DIR_ROOT, OUT_DIR_V1, TABS, VIEWPORTS

### Community 38 - "Phase 8 Capture"
Cohesion: 0.29
Nodes (7): captureAll(), createStaticServer(), MIME_TYPES, OUT_DIR_P8_0, OUT_DIR_ROOT, TABS, VIEWPORTS

### Community 39 - "Pages Static Server"
Cohesion: 0.29
Nodes (6): ref_node_fs, ref_node_http, PORT, ROOT, server, TYPES

### Community 40 - "FCFF DCF Valuation"
Cohesion: 0.52
Nodes (4): buildDcfOutputs(), requirePositive(), deepFreeze(), valuateFcffDcf()

### Community 41 - "Peer Corpus Validation"
Cohesion: 0.38
Nodes (6): assertCitation(), ESTIMATE_CITATION_FIELDS, FILED_CITATION_FIELDS, isIsoDate(), MATERIAL_PEER_FIELDS, validatePeersCorpus()

### Community 42 - "Tab Navigation"
Cohesion: 0.48
Nodes (6): createTabs(), activate(), markActive(), markPane(), getElementKey(), TAB_KEYS

### Community 43 - "Vercel Deploy Config"
Cohesion: 0.50
Nodes (3): cleanUrls, headers, $schema

## Knowledge Gaps
- **233 isolated node(s):** `config`, `ALLOWED_ORIGINS`, `rateBuckets`, `canonical`, `created_at` (+228 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 275 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `EngineError` connect `Comps & EV Multiples` to `Valuation & Sensitivity Tabs`, `Audit Flags & Data Schema`, `Schedule Builders (Debt/SBC/PPE)`, `App Bootstrap & Market Data`, `Historicals Tab Rendering`, `Forecast Horizon & Fiscal Calendar`, `Assumptions Tab UI`, `Schedules Tab UI`, `Projections Tab & KPIs`, `Accounting Invariant Checks`, `Financial Ratios Engine`, `Recommendation & WACC`, `Scenarios & Data Provenance`, `Fully Diluted Share Schedule`, `DCF Discounting`, `Audit Center & Operating KPIs`, `Multi-Method Verdict Aggregation`, `Historicals Workspace & CSV`, `FCFF DCF Valuation`, `Peer Corpus Validation`, `Tab Navigation`?**
  _High betweenness centrality (0.206) - this node is a cross-community bridge._
- **Why does `extractRows()` connect `Schedule Builders (Debt/SBC/PPE)` to `Valuation & Sensitivity Tabs`, `Audit Flags & Data Schema`, `Historicals Tab Rendering`, `Forecast Horizon & Fiscal Calendar`, `Projections Tab & KPIs`, `Financial Ratios Engine`, `Recommendation & WACC`, `Citation Pin Regeneration`, `Charts (Revenue/FCF/Trend)`, `Fully Diluted Share Schedule`, `Audit Center & Operating KPIs`, `Revenue Donut Chart`, `Historicals Workspace & CSV`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `renderSchedules()` connect `Schedules Tab UI` to `Comps & EV Multiples`, `Scenarios & Data Provenance`, `App Bootstrap & Market Data`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `createApp()` (e.g. with `buildLabelStability()` and `buildSensitivityGrid()`) actually correct?**
  _`createApp()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `config`, `ALLOWED_ORIGINS`, `rateBuckets` to the rest of the system?**
  _233 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Valuation & Sensitivity Tabs` be split into smaller, more focused modules?**
  _Cohesion score 0.0735930735930736 - nodes in this community are weakly interconnected._
- **Should `Audit Flags & Data Schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05323653962492438 - nodes in this community are weakly interconnected._