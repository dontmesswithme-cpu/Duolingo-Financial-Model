/**
 * Minimal DOM stub for headless app tests.
 *
 * `src/app.js` touches the DOM exclusively through the injected `root` and a
 * deliberately small surface: `querySelectorAll`, attribute accessors, and
 * `add`/`removeEventListener`. This stub implements exactly that surface — no
 * jsdom, no browser, zero dependencies — which keeps the whole suite headless
 * and deterministic.
 *
 * Convention: files prefixed with `_` are helpers, not test files, so the Node
 * test runner does not collect them.
 */

/**
 * Parses the attribute selectors used by `src/app.js` (`[attr]` or `[attr="v"]`).
 *
 * @param {StubElement} element
 * @param {string} selector
 * @returns {boolean}
 */
function matchesSelector(element, selector) {
  const parsed = /^\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(selector.trim());
  if (!parsed) {
    throw new Error(`DOM stub does not support selector: ${selector}`);
  }
  const [, name, value] = parsed;
  if (!element.hasAttribute(name)) return false;
  return value === undefined ? true : element.getAttribute(name) === value;
}

/** Stands in for a DOM element. */
export class StubElement {
  /**
   * @param {Record<string, string>} [attributes]
   */
  constructor(attributes = {}) {
    /** @type {Record<string, string>} */
    this.attributes = { ...attributes };
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  getAttribute(name) {
    return name in this.attributes ? this.attributes[name] : null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  hasAttribute(name) {
    return name in this.attributes;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type);
    if (handlers) handlers.delete(handler);
  }

  /**
   * @param {string} type
   * @returns {number} Number of registered handlers for `type`.
   */
  listenerCount(type) {
    const handlers = this.listeners.get(type);
    return handlers ? handlers.size : 0;
  }

  /**
   * Invokes every handler registered for `type`, snapshot order preserved.
   * @param {string} type
   * @returns {void}
   */
  dispatch(type) {
    const handlers = this.listeners.get(type);
    if (!handlers) return;
    for (const handler of [...handlers]) handler({ type, target: this });
  }
}

/**
 * Builds a stub root holding tab controls and panes, mirroring `index.html`.
 *
 * @param {ReadonlyArray<string>} tabKeys
 * @returns {{ root: object, links: StubElement[], panes: StubElement[] }}
 */
export function createTabRoot(tabKeys) {
  const links = tabKeys.map((key) =>
    new StubElement({ 'data-tab-link': '', 'data-tab': key }),
  );
  const panes = tabKeys.map((key) =>
    new StubElement({ 'data-tab-pane': '', 'data-tab': key }),
  );
  const elements = [...links, ...panes];

  const root = {
    querySelectorAll(selector) {
      return elements.filter((element) => matchesSelector(element, selector));
    },
  };

  return { root, links, panes };
}
