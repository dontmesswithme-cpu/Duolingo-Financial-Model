/**
 * P2.2 Artifact Contract tests  -  PP&E Roll-Forward + Intangible Amortization Schedule.
 *
 * Covers:
 *  - Schedules scaffold: schedules.build(historical, assumptions) populated with
 *    workingCapital, ppe, and intangibleAmortization.
 *  - PP&E roll-forward: buildPpeRollForward() covering all 6 balance dates,
 *    gross line decomposition, net tie-outs to property_and_equipment_net,
 *    honest FY2021 BOP handling, exact cash-flow additions matching (including
 *    6M FY2026 span mapping for Q2 FY2026), documented D&A split basis in derivedFrom,
 *    roll-forward closing arithmetic with specific verified plugs and bounds,
 *    anti-retyping gate, SCHEDULE_FIXTURES tie-outs.
 *  - Intangible amortization: buildIntangibleAmortization() covering all 6 balance dates,
 *    gross line decomposition, net tie-outs to intangible_assets_net / capitalized_software_net,
 *    honest FY2021 BOP handling, exact cash-flow software additions matching (including
 *    6M FY2026 span mapping for Q2 FY2026), acquired intangibles additions decomposition,
 *    6M impairment wiring, cited amortization expense reading (zero engine hardcodes),
 *    exact roll-forward closing (FY2025 plug = 0, Q2 FY2026 plug = 0), anti-retyping gate.
 *  - Pure projection functions: projectPpeRollForward() and projectIntangibleAmortization(),
 *    fail-closed driver enforcement, deterministic output.
 *  - Engine purity & anti-literal regression gate (zero numeric literals > 999 in engine).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadHistorical, loadAssumptions } from '../src/data/loader.js';
import { extractRows } from '../src/data/schema.js';
import { EngineError } from '../src/data/errors.js';
import { readLedgerUrls } from './_ledger.js';
import { SCHEDULE_FIXTURES } from './fixtures/duolingo_facts.js';
import schedules, {
  build,
  buildPpeRollForward,
  projectPpeRollForward,
  buildIntangibleAmortization,
  projectIntangibleAmortization,
  resolveCfPeriod,
  BALANCE_PERIODS,
  PPE_METRIC_KEYS,
  INTANGIBLE_METRIC_KEYS,
} from '../src/engine/schedules.js';

const DATA_DIR = fileURLToPath(new URL('../src/data/historical/', import.meta.url));
const ASSUMPTIONS_PATH = fileURLToPath(new URL('../src/data/assumptions.json', import.meta.url));
const readText = (location) => fs.promises.readFile(location, 'utf8');
const LEDGER = readLedgerUrls();

async function getHistorical() {
  return loadHistorical({
    dir: DATA_DIR,
    readText,
    requireLedger: true,
    ledger: LEDGER,
  });
}

async function getAssumptions() {
  return loadAssumptions({
    location: ASSUMPTIONS_PATH,
    readText,
  });
}

describe('P2  -  Schedules Engine: schedules.build()', () => {
  test('schedules.build returns complete ScheduleSet with all five families populated', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();

    const scheduleSet = build(historical, assumptions);
    assert.ok(scheduleSet);
    assert.ok(scheduleSet.workingCapital, 'workingCapital family must be populated');
    assert.ok(scheduleSet.ppe, 'ppe family must be populated');
    assert.ok(scheduleSet.intangibleAmortization, 'intangibleAmortization family must be populated');
    assert.ok(scheduleSet.debt, 'debt family must be populated');
    assert.ok(scheduleSet.sbc, 'sbc family must be populated');
    assert.ok(Object.isFrozen(scheduleSet));
  });
});

describe('P2.2  -  PP&E Roll-Forward Schedule: buildPpeRollForward()', () => {
  test('covers all 6 balance sheet dates in chronological order', async () => {
    const historical = await getHistorical();
    const ppe = buildPpeRollForward(historical);

    assert.deepEqual(ppe.periods, BALANCE_PERIODS);
    assert.deepEqual(ppe.periods, [
      'FY2021',
      'FY2022',
      'FY2023',
      'FY2024',
      'FY2025',
      'Q2 FY2026',
    ]);
  });

  test('gross line decomposition equals gross PP&E per period', async () => {
    const historical = await getHistorical();
    const ppe = buildPpeRollForward(historical);

    for (const period of BALANCE_PERIODS) {
      const p = ppe.byPeriod[period];
      const leasehold = p.breakdown.leasehold_improvements.value;
      const ffe = p.breakdown.furniture_fixtures_and_equipment.value;
      const gross = p.breakdown.gross_ppe.value;
      assert.equal(
        leasehold + ffe,
        gross,
        `${period}: leasehold (${leasehold}) + ffe (${ffe}) must equal gross PP&E (${gross})`,
      );
    }
  });

  test('gross PP&E plus accumulated depreciation equals net PP&E exactly per period', async () => {
    const historical = await getHistorical();
    const ppe = buildPpeRollForward(historical);

    for (const period of BALANCE_PERIODS) {
      const p = ppe.byPeriod[period];
      const gross = p.breakdown.gross_ppe.value;
      const accDep = p.breakdown.accumulated_depreciation.value;
      const net = p.breakdown.net_ppe.value;
      assert.ok(accDep <= 0, `${period}: accumulated depreciation must be non-positive, got ${accDep}`);
      assert.equal(
        gross + accDep,
        net,
        `${period}: gross (${gross}) + accDep (${accDep}) must equal net PP&E (${net})`,
      );
      assert.equal(p.ending_balance.value, net);
    }
  });

  test('honest FY2021 beginning balance: BOP is null and roll-forward closing begins FY2022', async () => {
    const historical = await getHistorical();
    const ppe = buildPpeRollForward(historical);
    const fy21 = ppe.byPeriod['FY2021'];

    assert.equal(fy21.beginning_balance.value, null);
    assert.equal(fy21.isRollForwardClosed, false);
    assert.equal(fy21.disposals_and_other.value, null);
    assert.equal(fy21.ending_balance.value, 8211);
  });

  test('additions match cash flow statement Capex across all periods (incl. 6M FY2026 mapping)', async () => {
    const historical = await getHistorical();
    const ppe = buildPpeRollForward(historical);
    const cfRows = extractRows(historical.cashflow);

    const expectedCapex = {
      FY2021: 3586,
      FY2022: 5562,
      FY2023: 3191,
      FY2024: 12116,
      FY2025: 18096,
      'Q2 FY2026': 7028, // mapped to 6M FY2026 cash flow row
    };

    for (const [period, expected] of Object.entries(expectedCapex)) {
      const cfPeriod = resolveCfPeriod(period);
      const cfRow = cfRows.find(
        (r) => r.metric === 'purchase_of_property_and_equipment' && r.period === cfPeriod,
      );
      assert.ok(cfRow, `CF row for ${period} (cfPeriod ${cfPeriod}) must exist`);
      assert.equal(Math.abs(cfRow.value), expected);
      assert.equal(ppe.byPeriod[period].additions.value, expected);
    }
  });

  test('depreciation derives from CF D&A minus Note 5 Amortization with split basis in derivedFrom', async () => {
    const historical = await getHistorical();
    const ppe = buildPpeRollForward(historical);

    const expectedDep = {
      FY2021: 2726 - 693,   // 2033
      FY2022: 4870 - 1752,  // 3118
      FY2023: 7095 - 2995,  // 4100
      FY2024: 10854 - 5889, // 4965
      FY2025: 14391 - 9196, // 5195
      'Q2 FY2026': 8438 - 5720, // 2718 (6M FY2026 D&A 8438 - 6M Amort 5720)
    };

    for (const [period, expected] of Object.entries(expectedDep)) {
      const item = ppe.byPeriod[period];
      assert.equal(item.depreciation.value, expected, `${period} depreciation mismatch`);

      const splitEntry = item.derivedFrom.find(
        (d) => d && typeof d === 'object' && d.calculation === 'ppe_depreciation_split',
      );
      assert.ok(splitEntry, `${period} must carry ppe_depreciation_split documentation in derivedFrom`);
      assert.equal(splitEntry.depreciation, expected);
    }
  });

  test('roll-forward closes for FY2022-Q2 FY2026 with verified plugs', async () => {
    const historical = await getHistorical();
    const ppe = buildPpeRollForward(historical);

    const expectedPlugs = {
      FY2022: 2314,
      FY2023: -268,
      FY2024: 0,
      FY2025: 4453,
      'Q2 FY2026': 2012, // Q2 plug is genuine small residual, not 9000
    };

    for (const period of ['FY2022', 'FY2023', 'FY2024', 'FY2025', 'Q2 FY2026']) {
      const p = ppe.byPeriod[period];
      const bop = p.beginning_balance.value;
      const additions = p.additions.value;
      const dep = p.depreciation.value;
      const disposals = p.disposals_and_other.value;
      const eop = p.ending_balance.value;

      assert.equal(bop + additions - dep + disposals, eop);
      assert.equal(disposals, expectedPlugs[period], `${period} plug mismatch`);
      assert.ok(
        Math.abs(disposals) < additions,
        `anti-silent-fallback: plug (${disposals}) must not exceed additions (${additions}) for ${period}`,
      );
    }
  });

  test('FY2025 PP&E anchors tie out exactly to SCHEDULE_FIXTURES', async () => {
    const historical = await getHistorical();
    const ppe = buildPpeRollForward(historical);
    const fy25 = ppe.byPeriod['FY2025'];

    assert.equal(fy25.breakdown.net_ppe.value, SCHEDULE_FIXTURES.fy2025_ppe_net.value);
    assert.equal(fy25.breakdown.gross_ppe.value, SCHEDULE_FIXTURES.fy2025_ppe_gross.value);
    assert.equal(fy25.breakdown.accumulated_depreciation.value, SCHEDULE_FIXTURES.fy2025_ppe_accum_dep.value);
    assert.equal(fy25.metrics.capex_pct_of_revenue.value, SCHEDULE_FIXTURES.fy2025_capex_ppe_pct.value);
  });

  test('anti-retyping gate: mutating corpus row in-memory changes schedule output by construction', async () => {
    const historical = await getHistorical();
    const original = buildPpeRollForward(historical);
    const origLeasehold = original.byPeriod['FY2025'].breakdown.leasehold_improvements.value;

    const balanceRows = extractRows(historical.balance);
    const row = balanceRows.find(
      (r) => r.metric === 'ppe_leasehold_improvements' && r.period === 'FY2025',
    );
    assert.ok(row, 'must find FY2025 ppe_leasehold_improvements');
    const mutatedValue = row.value + 5000;
    row.value = mutatedValue;

    const mutatedSchedule = buildPpeRollForward(historical);
    const newLeasehold = mutatedSchedule.byPeriod['FY2025'].breakdown.leasehold_improvements.value;

    assert.equal(
      newLeasehold,
      origLeasehold + 5000,
      'modifying corpus row must reflect dynamically in schedule output without hardcoding',
    );

    // restore
    row.value = origLeasehold;
  });

  test('buildPpeRollForward fails closed with EngineError when revenue denominator is unresolvable', async () => {
    const historical = await getHistorical();
    const incomeRows = extractRows(historical.income);
    const revenueRow = incomeRows.find(
      (r) => r.metric === 'revenue_total' && r.period === 'FY2025',
    );
    assert.ok(revenueRow);
    const originalRev = revenueRow.value;
    revenueRow.value = 0;

    assert.throws(
      () => buildPpeRollForward(historical),
      (err) => {
        assert.ok(err instanceof EngineError);
        assert.equal(err.code, 'ppe_annual_denominator_unresolved');
        return true;
      },
    );

    revenueRow.value = originalRev;
  });
});

describe('P2.2  -  Intangibles & Amortization Schedule: buildIntangibleAmortization()', () => {
  test('covers all 6 balance sheet dates in chronological order', async () => {
    const historical = await getHistorical();
    const intSchedule = buildIntangibleAmortization(historical);

    assert.deepEqual(intSchedule.periods, BALANCE_PERIODS);
  });

  test('gross line decomposition equals gross intangibles per period', async () => {
    const historical = await getHistorical();
    const intSchedule = buildIntangibleAmortization(historical);

    for (const period of BALANCE_PERIODS) {
      const p = intSchedule.byPeriod[period];
      const capSoft = p.breakdown.capitalized_software.value;
      const acquired = p.breakdown.acquired_intangibles.value;
      const other = p.breakdown.other_intangibles.value;
      const gross = p.breakdown.gross_intangibles.value;

      assert.equal(
        capSoft + acquired + other,
        gross,
        `${period}: capSoft (${capSoft}) + acquired (${acquired}) + other (${other}) must equal gross intangibles (${gross})`,
      );
    }
  });

  test('gross intangibles plus accumulated amortization equals net intangibles exactly per period', async () => {
    const historical = await getHistorical();
    const intSchedule = buildIntangibleAmortization(historical);

    for (const period of BALANCE_PERIODS) {
      const p = intSchedule.byPeriod[period];
      const gross = p.breakdown.gross_intangibles.value;
      const accAmort = p.breakdown.accumulated_amortization.value;
      const net = p.breakdown.net_intangibles.value;

      assert.ok(accAmort <= 0, `${period}: accumulated amortization must be non-positive, got ${accAmort}`);
      assert.equal(
        gross + accAmort,
        net,
        `${period}: gross (${gross}) + accAmort (${accAmort}) must equal net intangibles (${net})`,
      );
      assert.equal(p.ending_balance.value, net);
    }
  });

  test('honest FY2021 beginning balance: BOP is null and roll-forward closing begins FY2022', async () => {
    const historical = await getHistorical();
    const intSchedule = buildIntangibleAmortization(historical);
    const fy21 = intSchedule.byPeriod['FY2021'];

    assert.equal(fy21.beginning_balance.value, null);
    assert.equal(fy21.isRollForwardClosed, false);
    assert.equal(fy21.impairments_and_other.value, null);
    assert.equal(fy21.ending_balance.value, 4566);
  });

  test('software additions match cash flow statement across all periods (incl. 6M FY2026 mapping)', async () => {
    const historical = await getHistorical();
    const intSchedule = buildIntangibleAmortization(historical);
    const cfRows = extractRows(historical.cashflow);

    const expectedSoftware = {
      FY2021: 2620,
      FY2022: 4562,
      FY2023: 10493,
      FY2024: 9024,
      FY2025: 9303,
      'Q2 FY2026': 5587, // mapped to 6M FY2026 CF row
    };

    for (const [period, expected] of Object.entries(expectedSoftware)) {
      const cfPeriod = resolveCfPeriod(period);
      const cfRow = cfRows.find(
        (r) => r.metric === 'capitalized_software_and_intangibles' && r.period === cfPeriod,
      );
      assert.ok(cfRow, `CF row for ${period} (cfPeriod ${cfPeriod}) must exist`);
      assert.equal(Math.abs(cfRow.value), expected);
      assert.equal(intSchedule.byPeriod[period].software_additions.value, expected);
    }
  });

  test('acquired intangibles additions decompose Aster (+8303) and Gunwoo (+1007) acquisitions', async () => {
    const historical = await getHistorical();
    const intSchedule = buildIntangibleAmortization(historical);

    assert.equal(intSchedule.byPeriod['FY2024'].acquired_additions.value, 1007);
    assert.equal(intSchedule.byPeriod['FY2025'].acquired_additions.value, 8303);
    assert.equal(intSchedule.byPeriod['Q2 FY2026'].acquired_additions.value, 0);
  });

  test('amortization expense reads from cited corpus rows (zero engine hardcodes)', async () => {
    const historical = await getHistorical();
    const intSchedule = buildIntangibleAmortization(historical);

    const expectedAmort = {
      FY2021: 693,
      FY2022: 1752,
      FY2023: 2995,
      FY2024: 5889,
      FY2025: 9196,
      'Q2 FY2026': 5720, // 6M FY2026 Note 5 disclosure
    };

    for (const [period, expected] of Object.entries(expectedAmort)) {
      const item = intSchedule.byPeriod[period];
      assert.equal(item.amortization.value, expected, `${period} amortization mismatch`);
    }
  });

  test('impairment is wired from 6M FY2026 cash flow statement (578)', async () => {
    const historical = await getHistorical();
    const intSchedule = buildIntangibleAmortization(historical);

    assert.equal(intSchedule.byPeriod['Q2 FY2026'].impairment.value, 578);
  });

  test('roll-forward closes with verified plugs across all periods (FY2025 and Q2 FY2026 exactly 0)', async () => {
    const historical = await getHistorical();
    const intSchedule = buildIntangibleAmortization(historical);

    const expectedPlugs = {
      FY2022: 1121,
      FY2023: 0,
      FY2024: -238,
      FY2025: 0,
      'Q2 FY2026': 0,
    };

    for (const period of ['FY2022', 'FY2023', 'FY2024', 'FY2025', 'Q2 FY2026']) {
      const p = intSchedule.byPeriod[period];
      const bop = p.beginning_balance.value;
      const softAdd = p.software_additions.value;
      const acqAdd = p.acquired_additions.value;
      const amort = p.amortization.value;
      const impair = p.impairment.value;
      const plug = p.impairments_and_other.value;
      const eop = p.ending_balance.value;

      assert.equal(
        bop + softAdd + acqAdd - amort - impair + plug,
        eop,
        `${period}: roll-forward equation must balance exactly`,
      );

      assert.equal(plug, expectedPlugs[period], `${period} intangibles plug mismatch`);
      assert.ok(
        Math.abs(plug) < softAdd,
        `anti-silent-fallback: intangibles plug (${plug}) must not exceed software additions (${softAdd}) for ${period}`,
      );
    }

    // Exact zero plugs on scrutinized periods
    assert.equal(intSchedule.byPeriod['FY2025'].impairments_and_other.value, 0, 'FY2025 plug must be exactly 0');
    assert.equal(intSchedule.byPeriod['Q2 FY2026'].impairments_and_other.value, 0, 'Q2 FY2026 plug must be exactly 0');
  });


  test('FY2025 Intangibles anchors tie out exactly to SCHEDULE_FIXTURES', async () => {
    const historical = await getHistorical();
    const intSchedule = buildIntangibleAmortization(historical);
    const fy25 = intSchedule.byPeriod['FY2025'];

    assert.equal(fy25.breakdown.net_intangibles.value, SCHEDULE_FIXTURES.fy2025_intangibles_net.value);
    assert.equal(fy25.breakdown.gross_intangibles.value, SCHEDULE_FIXTURES.fy2025_intangibles_gross.value);
    assert.equal(fy25.breakdown.accumulated_amortization.value, SCHEDULE_FIXTURES.fy2025_intangibles_accum_amort.value);
    assert.equal(fy25.metrics.capitalized_software_pct_of_revenue.value, SCHEDULE_FIXTURES.fy2025_capitalized_software_pct.value);
  });

  test('anti-retyping gate: mutating corpus row in-memory changes schedule output by construction', async () => {
    const historical = await getHistorical();
    const original = buildIntangibleAmortization(historical);
    const origSoftware = original.byPeriod['FY2025'].breakdown.capitalized_software.value;

    const balanceRows = extractRows(historical.balance);
    const row = balanceRows.find(
      (r) => r.metric === 'intangibles_capitalized_software' && r.period === 'FY2025',
    );

    assert.ok(row, 'must find FY2025 intangibles_capitalized_software');
    const mutatedValue = row.value + 8000;
    row.value = mutatedValue;

    const mutatedSchedule = buildIntangibleAmortization(historical);
    const newSoftware = mutatedSchedule.byPeriod['FY2025'].breakdown.capitalized_software.value;

    assert.equal(
      newSoftware,
      origSoftware + 8000,
      'modifying corpus row must reflect dynamically in schedule output without hardcoding',
    );

    // restore
    row.value = origSoftware;
  });
});

describe('P2.2  -  PP&E & Intangibles Projections: pure projection functions', () => {
  test('projectPpeRollForward applies drivers deterministically over forecast revenues', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const ppe = buildPpeRollForward(historical);

    const forecastInputs = [
      { period: 'FY2026', revenue: 1_250_000 },
      { period: 'FY2027', revenue: 1_500_000 },
    ];

    const proj = projectPpeRollForward(ppe, assumptions, forecastInputs);
    assert.ok(proj);
    assert.deepEqual(proj.periods, ['FY2026', 'FY2027']);

    const fy26 = proj.byPeriod['FY2026'];
    const fy27 = proj.byPeriod['FY2027'];

    const capexPct = assumptions.getValue('capex_ppe_pct_revenue');
    const depPct = assumptions.getValue('depreciation_pct_revenue');

    assert.equal(fy26.beginning_balance.value, ppe.byPeriod['FY2025'].ending_balance.value);
    assert.equal(fy26.additions.value, 1_250_000 * capexPct);
    assert.equal(fy26.depreciation.value, 1_250_000 * depPct);
    assert.equal(
      fy26.ending_balance.value,
      fy26.beginning_balance.value + fy26.additions.value - fy26.depreciation.value,
    );

    assert.equal(fy27.beginning_balance.value, fy26.ending_balance.value);
    assert.equal(fy27.additions.value, 1_500_000 * capexPct);
    assert.equal(fy27.depreciation.value, 1_500_000 * depPct);
    assert.equal(
      fy27.ending_balance.value,
      fy27.beginning_balance.value + fy27.additions.value - fy27.depreciation.value,
    );
  });

  test('projectIntangibleAmortization applies drivers deterministically over forecast revenues', async () => {
    const historical = await getHistorical();
    const assumptions = await getAssumptions();
    const intSchedule = buildIntangibleAmortization(historical);

    const forecastInputs = [
      { period: 'FY2026', revenue: 1_250_000 },
      { period: 'FY2027', revenue: 1_500_000 },
    ];

    const proj = projectIntangibleAmortization(intSchedule, assumptions, forecastInputs);
    assert.ok(proj);
    assert.deepEqual(proj.periods, ['FY2026', 'FY2027']);

    const fy26 = proj.byPeriod['FY2026'];
    const fy27 = proj.byPeriod['FY2027'];

    const softPct = assumptions.getValue('capitalized_software_pct_revenue');
    const amortPct = assumptions.getValue('amortization_pct_revenue');

    assert.equal(fy26.beginning_balance.value, intSchedule.byPeriod['FY2025'].ending_balance.value);
    assert.equal(fy26.software_additions.value, 1_250_000 * softPct);
    assert.equal(fy26.amortization.value, 1_250_000 * amortPct);
    assert.equal(
      fy26.ending_balance.value,
      fy26.beginning_balance.value + fy26.additions.value - fy26.amortization.value,
    );

    assert.equal(fy27.beginning_balance.value, fy26.ending_balance.value);
    assert.equal(fy27.software_additions.value, 1_500_000 * softPct);
    assert.equal(fy27.amortization.value, 1_500_000 * amortPct);
    assert.equal(
      fy27.ending_balance.value,
      fy27.beginning_balance.value + fy27.additions.value - fy27.amortization.value,
    );
  });

  test('projection functions fail closed with EngineError when required drivers are missing', async () => {
    const historical = await getHistorical();
    const ppe = buildPpeRollForward(historical);
    const intSchedule = buildIntangibleAmortization(historical);

    assert.throws(
      () => projectPpeRollForward(ppe, {}, [{ period: 'FY2026', revenue: 1_000_000 }]),
      (err) => {
        assert.ok(err instanceof EngineError);
        assert.equal(err.code, 'missing_driver');
        return true;
      },
    );

    assert.throws(
      () => projectIntangibleAmortization(intSchedule, {}, [{ period: 'FY2026', revenue: 1_000_000 }]),
      (err) => {
        assert.ok(err instanceof EngineError);
        assert.equal(err.code, 'missing_driver');
        return true;
      },
    );
  });
});

describe('P2.2  -  Engine purity & anti-literal regression gate: src/engine/schedules.js', () => {
  test('src/engine/schedules.js contains zero forbidden side-effecting APIs', () => {
    const code = fs.readFileSync(fileURLToPath(new URL('../src/engine/schedules.js', import.meta.url)), 'utf8');

    assert.doesNotMatch(code, /\bwindow\b/);
    assert.doesNotMatch(code, /\bdocument\b/);
    assert.doesNotMatch(code, /\bfetch\s*\(/);
    assert.doesNotMatch(code, /\bDate\.now\s*\(/);
    assert.doesNotMatch(code, /\bMath\.random\s*\(/);
    assert.doesNotMatch(code, /\bsetTimeout\s*\(/);
    assert.doesNotMatch(code, /\bsetInterval\s*\(/);
  });

  test('src/engine/schedules.js contains zero bare numeric literals > 999 outside comments', () => {
    const code = fs.readFileSync(fileURLToPath(new URL('../src/engine/schedules.js', import.meta.url)), 'utf8');
    // Strip block and line comments
    const stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    const largeNumbers = [...stripped.matchAll(/\b\d{4,}\b/g)].map((m) => m[0]);
    assert.deepEqual(
      largeNumbers,
      [],
      `schedules.js must contain zero bare numeric literals > 999 outside comments, found: ${largeNumbers.join(', ')}`,
    );
  });
});
