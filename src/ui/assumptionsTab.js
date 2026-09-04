/**
 * Assumptions & Valuation Drivers Tab View (Phase 5.3).
 *
 * Renders interactive driver controls:
 *  - Scenario selector (Bear, Base, Bull)
 *  - Categorized driver groups (Revenue, Margins, WACC, Terminal)
 *  - Universal blue cell-input styling (.cell-input / #0052cc) on all input controls
 *  - Synchronized number inputs and range sliders bounded by [min, max]
 *  - Visible MKT badges with asOf dates, provider attribution, and SEC/FRED source links
 *  - Pure and headless-testable via dependency-injected container
 *  - Zero inline style attributes (CSS classes only)
 *  - Disclosed deviation: driver control panel layout sanctioned per Director ruling rather than Tabulator(grid)
 *
 * @module src/ui/assumptionsTab
 */

import { EngineError } from '../data/errors.js';
import { SCENARIO_NAMES } from '../data/constants.js';
import {
  estSuffix,
  mktBadge,
  formatDriverDisplay,
  parseDriverInput,
  humanizeUnits,
  formatDisplayText,
  SCENARIO_DISPLAY_NAMES,
} from './format.js';

export { SCENARIO_DISPLAY_NAMES };

/**
 * Human-friendly group labels.
 * @type {Record<string, string>}
 */
const GROUP_LABELS = Object.freeze({
  revenue: 'Revenue Growth & Volume Drivers',
  operating_costs: 'Operating Expense & Margin Drivers',
  margins: 'Target Margin & Efficiency Curves',
  wacc: 'Cost of Capital & Market Inputs (CAPM)',
  terminal: 'Terminal Growth & Valuation Assumptions',
});

/**
 * Renders the Assumptions / Drivers tab inside the target container.
 *
 * @param {object} options
 * @param {HTMLElement|object} options.container Target DOM element or stub
 * @param {object} options.assumptions AssumptionSet
 * @param {(name: string, value: number) => void} [options.onDriverChange]
 * @param {(scenario: string) => void} [options.onScenarioChange]
 * @returns {{ update: (assumptions: object) => void, dispose: () => void, tabulator?: Tabulator }}
 */
export function renderAssumptions({ container, assumptions, onDriverChange, onScenarioChange } = {}) {
  if (!container) {
    throw new EngineError('invalid_dependency', 'renderAssumptions requires a container element.', 'container');
  }

  const listeners = [];
  let disposed = false;
  let currentAssumptions = assumptions;

  function render() {
    if (!currentAssumptions || !currentAssumptions.drivers) return;

    const activeScenario = currentAssumptions.scenario || 'base';

    const scenarioHtml = `
      <div class="scenario-picker-card">
        <div class="scenario-picker-title">Active Model Scenario</div>
        <div class="scenario-btn-group" role="group" aria-label="Scenario Selector">
          ${SCENARIO_NAMES.map((sc) => `
            <button type="button" class="scenario-btn ${sc === activeScenario ? 'active' : ''}" data-scenario="${sc}">
              ${(SCENARIO_DISPLAY_NAMES[sc] || sc).toUpperCase()}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    const groups = currentAssumptions.byGroup || {};
    const groupHtml = Object.keys(groups).map((groupKey) => {
      const groupDrivers = groups[groupKey] || [];
      const groupTitle = GROUP_LABELS[groupKey] || groupKey.toUpperCase();

      const driversRows = groupDrivers.map((driver) => {
        const isMkt = driver.marking === 'MKT';
        const badgeMarkup = isMkt
          ? (driver.source?.url
              ? `<a class="mkt-source-link" href=${driver.source?.url} target="_blank" rel="noopener noreferrer">${mktBadge({ asOf: driver.asOf, provider: driver.source?.provider })}</a>`
              : mktBadge({ asOf: driver.asOf, provider: driver.source?.provider }))
          : estSuffix('', 'EST');

        const minVal = typeof driver.min === 'number' ? driver.min : 0;
        const maxVal = typeof driver.max === 'number' ? driver.max : 1;
        const stepVal = typeof driver.step === 'number' ? driver.step : 0.01;

        return `
          <div class="driver-row" data-driver-name="${driver.name}">
            <div class="driver-info">
              <div class="driver-label-row">
                <span class="driver-label">${driver.label || driver.name}</span>
                ${badgeMarkup}
              </div>
              <div class="driver-notes">${formatDisplayText(driver.notes || '')}</div>
            </div>

            <div class="driver-slider-cell">
              <input type="range" class="cell-input driver-slider" data-driver-slider="${driver.name}"
                     min="${minVal}" max="${maxVal}" step="${stepVal}" value="${driver.value}" />
            </div>

            <div class="driver-input-cell">
              <input type="text" inputmode="decimal" class="cell-input driver-number-input" data-driver-input="${driver.name}"
                     value="${formatDriverDisplay(driver.value, driver.units)}" />
              <span class="driver-units">${humanizeUnits(driver.units)}</span>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="driver-group-card">
          <div class="driver-group-header">
            ${groupTitle}
          </div>
          <div class="driver-rows-container">
            ${driversRows}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="assumptions-view-wrapper">
        ${scenarioHtml}
        ${groupHtml}
      </div>
    `;

    // Bind event handlers
    const scenarioButtons = container.querySelectorAll ? container.querySelectorAll('[data-scenario]') : [];
    for (const btn of Array.from(scenarioButtons || [])) {
      const clickHandler = () => {
        const sc = btn.getAttribute ? btn.getAttribute('data-scenario') : null;
        if (sc && typeof onScenarioChange === 'function') {
          onScenarioChange(sc);
        }
      };
      if (typeof btn.addEventListener === 'function') {
        btn.addEventListener('click', clickHandler);
      }
      listeners.push({ target: btn, type: 'click', handler: clickHandler });
    }

    const numberInputs = container.querySelectorAll ? container.querySelectorAll('[data-driver-input]') : [];
    for (const numInput of Array.from(numberInputs || [])) {
      const driverName = numInput.getAttribute ? numInput.getAttribute('data-driver-input') : null;
      const changeHandler = () => {
        const driver = currentAssumptions?.get ? currentAssumptions.get(driverName) : (currentAssumptions?.drivers || []).find((d) => d.name === driverName);
        if (driverName && driver) {
          const parsedVal = parseDriverInput(numInput.value, driver);
          if (Number.isFinite(parsedVal)) {
            const matchingSlider = container.querySelector ? container.querySelector(`[data-driver-slider="${driverName}"]`) : null;
            if (matchingSlider) matchingSlider.value = String(parsedVal);
            numInput.value = formatDriverDisplay(parsedVal, driver.units);
            if (typeof onDriverChange === 'function') {
              onDriverChange(driverName, parsedVal);
            }
          }
        }
      };
      if (typeof numInput.addEventListener === 'function') {
        numInput.addEventListener('change', changeHandler);
      }
      listeners.push({ target: numInput, type: 'change', handler: changeHandler });
    }

    const sliders = container.querySelectorAll ? container.querySelectorAll('[data-driver-slider]') : [];
    for (const slider of Array.from(sliders || [])) {
      const driverName = slider.getAttribute ? slider.getAttribute('data-driver-slider') : null;
      const inputHandler = () => {
        const val = Number(slider.value);
        if (Number.isFinite(val) && driverName) {
          const matchingNum = container.querySelector ? container.querySelector(`[data-driver-input="${driverName}"]`) : null;
          if (matchingNum) {
            const driver = currentAssumptions?.get ? currentAssumptions.get(driverName) : (currentAssumptions?.drivers || []).find((d) => d.name === driverName);
            matchingNum.value = formatDriverDisplay(val, driver?.units);
          }
          if (typeof onDriverChange === 'function') {
            onDriverChange(driverName, val);
          }
        }
      };
      if (typeof slider.addEventListener === 'function') {
        slider.addEventListener('input', inputHandler);
        slider.addEventListener('change', inputHandler);
      }
      listeners.push({ target: slider, type: 'input', handler: inputHandler });
      listeners.push({ target: slider, type: 'change', handler: inputHandler });
    }
  }

  render();

  return {
    update(newAssumptions) {
      currentAssumptions = newAssumptions;
      if (currentAssumptions && currentAssumptions.drivers) {
        for (const d of currentAssumptions.drivers) {
          const numInput = container.querySelector ? container.querySelector(`[data-driver-input="${d.name}"]`) : null;
          if (numInput) numInput.value = formatDriverDisplay(d.value, d.units);
          const slider = container.querySelector ? container.querySelector(`[data-driver-slider="${d.name}"]`) : null;
          if (slider) slider.value = String(d.value);
        }

        const scenarioBtns = container.querySelectorAll ? container.querySelectorAll('[data-scenario]') : [];
        const activeScenario = currentAssumptions.scenario || 'base';
        for (const btn of Array.from(scenarioBtns || [])) {
          const sc = btn.getAttribute ? btn.getAttribute('data-scenario') : null;
          const isActive = sc === activeScenario;
          if (isActive) {
            btn.classList?.add('active');
          } else {
            btn.classList?.remove('active');
          }
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { target, type, handler } of listeners) {
        if (target && typeof target.removeEventListener === 'function') {
          target.removeEventListener(type, handler);
        }
      }
      listeners.length = 0;
      if (container && typeof container.innerHTML === 'string') {
        container.innerHTML = '';
      }
    },
  };
}

export default renderAssumptions;
