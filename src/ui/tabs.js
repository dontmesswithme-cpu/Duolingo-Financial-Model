/**
 * Tab shell navigation & routing module.
 *
 * Manages tab switching, ARIA attributes, keyboard navigation,
 * and URL hash synchronization.
 *
 * Pure and headless-testable via dependency-injected DOM root.
 *
 * @module src/ui/tabs
 */

import { EngineError } from '../data/errors.js';

export const TAB_KEYS = Object.freeze([
  'cover',
  'assumptions',
  'historicals',
  'schedules',
  'projections',
  'valuation',
  'summary',
  'sensitivity',
]);

const TAB_LINK_SELECTOR = '[data-tab-link]';
const TAB_PANE_SELECTOR = '[data-tab-pane]';
const ACTIVE_ATTRIBUTE = 'data-active';

function getElementKey(el) {
  if (!el || typeof el.getAttribute !== 'function') return null;
  return el.getAttribute('data-tab') || el.getAttribute('data-tab-link') || el.getAttribute('data-tab-pane') || null;
}

export function createTabs({ root, tabs = TAB_KEYS, onTabChange } = {}) {
  if (!root) {
    throw new EngineError('invalid_dependency', 'createTabs requires a root DOM element.', 'root');
  }

  const links = Array.from(root.querySelectorAll ? (root.querySelectorAll(TAB_LINK_SELECTOR) || []) : []);
  const panes = Array.from(root.querySelectorAll ? (root.querySelectorAll(TAB_PANE_SELECTOR) || []) : []);

  let activeTabKey = tabs[0] || 'cover';
  const listeners = [];
  let disposed = false;

  function markActive(element, isActive, exposeToAria = false) {
    if (!element || typeof element.setAttribute !== 'function') return;
    if (isActive) {
      element.setAttribute(ACTIVE_ATTRIBUTE, 'true');
    } else {
      if (typeof element.removeAttribute === 'function') {
        element.removeAttribute(ACTIVE_ATTRIBUTE);
      }
    }
    if (exposeToAria) {
      element.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
  }

  function markPane(pane, isActive) {
    if (!pane || typeof pane.setAttribute !== 'function') return;
    if (isActive) {
      pane.setAttribute(ACTIVE_ATTRIBUTE, 'true');
      if (typeof pane.removeAttribute === 'function') {
        pane.removeAttribute('hidden');
      }
    } else {
      if (typeof pane.removeAttribute === 'function') {
        pane.removeAttribute(ACTIVE_ATTRIBUTE);
      }
      pane.setAttribute('hidden', '');
    }
  }

  function activate(key) {
    if (!tabs.includes(key)) return;
    activeTabKey = key;

    for (const link of links) {
      const match = getElementKey(link) === key;
      markActive(link, match, true);
    }
    for (const pane of panes) {
      const match = getElementKey(pane) === key;
      markPane(pane, match);
    }

    if (typeof onTabChange === 'function') {
      onTabChange(key);
    }
  }

  // Bind click on each tab button
  for (const link of links) {
    const clickHandler = () => {
      const key = getElementKey(link);
      if (key) activate(key);
    };
    if (typeof link.addEventListener === 'function') {
      link.addEventListener('click', clickHandler);
    }
    listeners.push({ target: link, type: 'click', handler: clickHandler });
  }

  // Handle click on jump links anywhere under root (e.g. data-jump-tab="assumptions")
  const jumpHandler = (event) => {
    if (!event || !event.target) return;
    const target = event.target;
    let jumpEl = typeof target.closest === 'function' ? target.closest('[data-jump-tab]') : null;
    if (!jumpEl) {
      let cur = target;
      while (cur) {
        if (cur.getAttribute && cur.getAttribute('data-jump-tab')) {
          jumpEl = cur;
          break;
        }
        cur = cur.parentElement || cur.parentNode || null;
      }
    }
    if (jumpEl && typeof jumpEl.getAttribute === 'function') {
      const targetKey = jumpEl.getAttribute('data-jump-tab');
      if (targetKey && tabs.includes(targetKey)) {
        if (typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        activate(targetKey);
      }
    }
  };

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('click', jumpHandler);
    listeners.push({ target: root, type: 'click', handler: jumpHandler });
  }

  // Keyboard navigation on tablist / links: ArrowLeft, ArrowRight, Home, End
  const keyHandler = (event) => {
    if (!event || !event.key) return;

    // Guard: Ignore events originating inside a grid (.tabulator), form input, or other interactive elements
    if (event.target && typeof event.target.closest === 'function') {
      if (event.target.closest('.tabulator, input, textarea, select, button:not([data-tab-link]):not([data-tab])')) {
        return;
      }
    }

    const currentIndex = tabs.indexOf(activeTabKey);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    const nextKey = tabs[nextIndex];
    if (nextKey) {
      activate(nextKey);
      const nextLink = links.find((l) => getElementKey(l) === nextKey);
      if (nextLink && typeof nextLink.focus === 'function') {
        nextLink.focus();
      }
    }
  };

  if (typeof root.addEventListener === 'function') {
    root.addEventListener('keydown', keyHandler);
    listeners.push({ target: root, type: 'keydown', handler: keyHandler });
  }

  // Initial activation
  if (links.length > 0) {
    const initialKey = getElementKey(links[0]) || tabs[0];
    activate(initialKey);
  }

  return {
    show(key) {
      activate(key);
    },
    active() {
      return activeTabKey;
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
      links.length = 0;
      panes.length = 0;
    },
  };
}
