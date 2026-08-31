/**
 * App controller — Phase 0.1 scaffold.
 *
 * Provides the dependency-injected application factory that every later phase
 * hangs off. P0.1 delivers the constructor, `state()`, and `dispose()` with
 * complete listener cleanup. Driver recalculation, scenario switching, and
 * render wiring are deferred to Phase 5 — but their **signatures are frozen
 * now**, so later phases fill in behaviour without changing the call surface.
 *
 * Purity contract: this module never reads the wall-clock directly. The current
 * time is injected as `now`, which keeps every consumer deterministic and
 * headless-testable (see `docs/conventions.md` §Purity & Testability).
 *
 * @module src/app
 */

import { EngineError } from './data/errors.js';

/**
 * Attribute marking a tab navigation control.
 * @type {string}
 */
const TAB_LINK_SELECTOR = '[data-tab-link]';

/**
 * Attribute marking a tab content pane.
 * @type {string}
 */
const TAB_PANE_SELECTOR = '[data-tab-pane]';

/**
 * Attribute carrying a tab's stable key.
 * @type {string}
 */
const TAB_KEY_ATTRIBUTE = 'data-tab';

/**
 * Attribute toggled to mark the active tab control/pane.
 * @type {string}
 */
const ACTIVE_ATTRIBUTE = 'data-active';

/**
 * Event bound to tab controls.
 * @type {string}
 */
const TAB_EVENT = 'click';

/**
 * Scenario applied until the scenario pipeline is wired in Phase 5.
 * @type {string}
 */
const DEFAULT_SCENARIO = 'base';

/**
 * Recursively freezes a value so no consumer can mutate model state through a
 * returned snapshot. Already-frozen values are returned unchanged, which keeps
 * repeated calls cheap and makes the function safe on shared subtrees.
 *
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

/**
 * Normalizes a selector query into an array. NodeLists, arrays, and stubs are
 * all accepted; a missing/unsupported `querySelectorAll` degrades to an empty
 * list so the app can still be constructed in a DOM-free test harness.
 *
 * @param {unknown} root
 * @param {string} selector
 * @returns {Array<object>}
 */
function queryAll(root, selector) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  const found = root.querySelectorAll(selector);
  return found == null ? [] : Array.from(found);
}

/**
 * Marks an element active or inactive using attributes only. Attribute-based
 * state (rather than `classList` or property assignment) keeps the DOM surface
 * small enough for a plain-object stub to satisfy in headless tests.
 *
 * @param {object} element
 * @param {boolean} isActive
 * @param {boolean} [exposeToAria] Also mirror state onto `aria-selected`.
 * @returns {void}
 */
function markActive(element, isActive, exposeToAria = false) {
  if (isActive) {
    element.setAttribute(ACTIVE_ATTRIBUTE, 'true');
  } else {
    element.removeAttribute(ACTIVE_ATTRIBUTE);
  }
  if (exposeToAria) {
    element.setAttribute('aria-selected', isActive ? 'true' : 'false');
  }
}

/**
 * @typedef {object} AppState
 * @property {unknown} assumptions Driver/input set (wired in Phase 5).
 * @property {string} scenario Active scenario name (`bear` | `base` | `bull`).
 * @property {unknown} schedules Supporting schedule set (wired in Phase 3).
 * @property {unknown} threeStatement Linked projection output (wired in Phase 3).
 * @property {unknown} dcf Valuation output (wired in Phase 4).
 * @property {unknown} recommendation Mechanical recommendation (wired in Phase 4).
 * @property {boolean} dirty True when inputs changed since the last recalc.
 */

/**
 * @typedef {object} App
 * @property {(name: string, value: number) => void} setDriver
 * @property {(name: string) => void} setScenario
 * @property {() => Readonly<AppState>} state
 * @property {() => void} dispose
 */

/**
 * @typedef {object} AppDependencies
 * @property {object} data Data-layer module (loader/audit/schema).
 * @property {object} engine Calculation-engine module namespace.
 * @property {object} root DOM root element (or a stub in headless tests).
 * @property {() => number|string|Date} now Injected clock.
 */

/**
 * Creates the application controller.
 *
 * @param {AppDependencies} dependencies
 * @returns {App}
 * @throws {EngineError} `invalid_dependency` when a required dependency is missing,
 *   or `not_implemented` from `setDriver` / `setScenario` until Phase 5.
 */
export function createApp({ data, engine, root, now } = {}) {
  for (const name of ['data', 'engine', 'root', 'now']) {
    const value = { data, engine, root, now }[name];
    if (value === null || value === undefined) {
      throw new EngineError(
        'invalid_dependency',
        `createApp requires an injected \`${name}\` dependency.`,
        name,
      );
    }
  }

  const links = queryAll(root, TAB_LINK_SELECTOR);
  const panes = queryAll(root, TAB_PANE_SELECTOR);

  // `now` is deliberately not consumed in P0.1. It stays bound in this closure
  // as the injected clock that Phase 5's recalculation pipeline will call —
  // the module itself must never reach for a wall-clock source directly.

  /**
   * Live model state. Mutated only through the frozen `state()` snapshot path
   * once the engine pipeline is wired.
   * @type {AppState}
   */
  const model = {
    assumptions: null,
    scenario: DEFAULT_SCENARIO,
    schedules: null,
    threeStatement: null,
    dcf: null,
    recommendation: null,
    dirty: false,
  };

  /**
   * Every listener registered during initialization, so `dispose()` can undo
   * exactly what was opened (symmetrical lifecycle).
   * @type {Array<{ target: object, type: string, handler: () => void }>}
   */
  const listeners = [];

  let disposed = false;

  /**
   * Activates the tab matching `key` across both controls and panes.
   * @param {string} key
   * @returns {void}
   */
  function activateTab(key) {
    for (const link of links) {
      markActive(link, link.getAttribute(TAB_KEY_ATTRIBUTE) === key, true);
    }
    for (const pane of panes) {
      markActive(pane, pane.getAttribute(TAB_KEY_ATTRIBUTE) === key);
    }
  }

  for (const link of links) {
    /** @type {() => void} */
    const handler = () => {
      activateTab(link.getAttribute(TAB_KEY_ATTRIBUTE));
    };
    if (typeof link.addEventListener === 'function') {
      link.addEventListener(TAB_EVENT, handler);
    }
    listeners.push({ target: link, type: TAB_EVENT, handler });
  }

  if (links.length > 0) {
    activateTab(links[0].getAttribute(TAB_KEY_ATTRIBUTE));
  }

  return {
    /**
     * Sets a driver value and triggers synchronous recalculation.
     * Not implemented until Phase 5; the signature is frozen now.
     *
     * @param {string} name
     * @param {number} value
     * @returns {void}
     * @throws {EngineError} Always in P0.1, with code `not_implemented`.
     */
    setDriver(name, value) {
      throw new EngineError(
        'not_implemented',
        'setDriver() is wired in Phase 5 alongside the driver recalculation pipeline.',
        name,
      );
    },

    /**
     * Switches the active scenario and triggers recalculation.
     * Not implemented until Phase 5; the signature is frozen now.
     *
     * @param {string} name
     * @returns {void}
     * @throws {EngineError} Always in P0.1, with code `not_implemented`.
     */
    setScenario(name) {
      throw new EngineError(
        'not_implemented',
        'setScenario() is wired in Phase 5 alongside the scenario pipeline.',
        name,
      );
    },

    /**
     * Returns a deeply frozen snapshot of the current model state.
     *
     * @returns {Readonly<AppState>}
     */
    state() {
      return deepFreeze({ ...model });
    },

    /**
     * Releases every resource acquired during initialization. Idempotent:
     * repeated calls are no-ops so teardown paths can stay simple.
     *
     * @returns {void}
     */
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { target, type, handler } of listeners) {
        if (target && typeof target.removeEventListener === 'function') {
          target.removeEventListener(type, handler);
        }
      }
      listeners.length = 0;
    },
  };
}
