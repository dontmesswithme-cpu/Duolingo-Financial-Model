/**
 * Headless interactive container for Tab 03 (Historicals) test suites.
 *
 * `renderHistoricalsWorkspace` / `renderHistoricals` touch a DOM surface that the
 * app-level `StubElement` in `_dom_stub.js` deliberately does not implement:
 * `innerHTML` assignment with tag parsing, `querySelector(All)` over `#id`,
 * `.class`, `[attr="v"]` and comma groups, `classList` mutation, element removal,
 * and `insertAdjacentHTML`. This helper adds exactly that surface and nothing
 * more, so the suites stay headless and dependency-free.
 *
 * Convention: files prefixed with `_` are helpers, not test files, so the Node
 * test runner does not collect them.
 *
 * NOTE: `tests/redesign.tab3.ratios.test.js` (the approved RP10.2 gate suite)
 * still carries its own private copy of this harness. Consolidating it onto this
 * helper means editing an already-approved gate file, so it is left alone here
 * and flagged for a follow-up ruling rather than changed unilaterally.
 */

import { StubElement } from './_dom_stub.js';

/**
 * @param {object} element
 * @param {string} selector
 * @returns {boolean}
 */
function matchesSelector(element, selector) {
  const sel = selector.trim();
  if (sel.startsWith('#')) return element.id === sel.slice(1);
  if (sel.startsWith('.')) {
    return sel.split('.').filter(Boolean).every((c) => element.classList.contains(c));
  }
  const attr = sel.match(/^\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\]$/);
  if (attr) {
    if (!element.hasAttribute(attr[1])) return false;
    return attr[2] === undefined || element.getAttribute(attr[1]) === attr[2];
  }
  const tag = sel.match(/^([a-zA-Z0-9-]+)/);
  if (tag) return element.tagName === tag[1].toUpperCase();
  return false;
}

/**
 * @param {object} element
 * @param {string} selector
 * @returns {boolean}
 */
function matchesAny(element, selector) {
  return selector.split(',').some((part) => matchesSelector(element, part));
}

/**
 * Builds a container whose `innerHTML` setter parses tags into a flat element
 * list that `querySelector(All)` can then resolve.
 *
 * @returns {object} container with `querySelector`, `querySelectorAll`, `innerHTML`
 */
export function createInteractiveContainer() {
  const elements = [];
  let html = '';

  function makeElement(tag, attrs) {
    const el = new StubElement(attrs);
    el.tagName = tag.toUpperCase();
    el.id = attrs.id || '';
    el.textContent = '';
    el._classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
    el._kids = [];
    el.classList = {
      contains: (c) => el._classes.has(c),
      add: (c) => { el._classes.add(c); },
      remove: (c) => { el._classes.delete(c); },
      toggle: (c, force) => {
        const on = force === undefined ? !el._classes.has(c) : Boolean(force);
        if (on) el._classes.add(c);
        else el._classes.delete(c);
        return on;
      },
    };
    el.focus = () => {};
    el.scrollIntoView = () => {};
    el.remove = () => {
      const i = elements.indexOf(el);
      if (i !== -1) elements.splice(i, 1);
    };
    el.insertAdjacentHTML = (pos, chunk) => {
      if (pos === 'beforeend') el.innerHTML = `${el.innerHTML || ''}${chunk}`;
    };
    el.querySelector = (sel) => el._kids.find((kid) => matchesAny(kid, sel)) || null;
    el.querySelectorAll = (sel) => el._kids.filter((kid) => matchesAny(kid, sel));
    Object.defineProperty(el, 'innerHTML', {
      get() { return el._html || ''; },
      set(val) {
        // Re-assigning a subtree replaces its children; drop the previous ones
        // from the global list first so container-level queries never return a
        // stale element from an earlier render.
        for (const kid of el._kids) {
          const i = elements.indexOf(kid);
          if (i !== -1) elements.splice(i, 1);
        }
        el._kids.length = 0;
        el._html = String(val);
        parseTags(el._html, el._kids);
      },
    });
    return el;
  }

  function parseTags(source, sink) {
    const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>/g;
    let match;
    while ((match = tagRegex.exec(source)) !== null) {
      if (match[1].startsWith('/')) continue;
      const attrs = {};
      const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(match[2])) !== null) {
        attrs[attrMatch[1]] = attrMatch[2] !== undefined ? attrMatch[2] : '';
      }
      const el = makeElement(match[1], attrs);
      sink.push(el);
      // Nested parses (element.innerHTML) must also land in the global list so
      // container-level queries can reach drawer content; the container-level
      // parse passes the global list as its own sink and must not double-push.
      if (sink !== elements) elements.push(el);
    }
  }

  const container = new StubElement();
  Object.defineProperty(container, 'innerHTML', {
    get() { return html; },
    set(val) {
      html = String(val);
      elements.length = 0;
      if (html) parseTags(html, elements);
    },
  });
  container.querySelector = (sel) => elements.find((el) => matchesAny(el, sel)) || null;
  container.querySelectorAll = (sel) => elements.filter((el) => matchesAny(el, sel));

  return container;
}

/**
 * Extracts the SVG trend bars, one entry per period, with the attributes the
 * RP10.3 null/negative gates assert on.
 *
 * @param {string} svg
 * @returns {Array<{ period: string, fill: string, height: number, label: string, labelY: number }>}
 */
export function parseTrendBars(svg) {
  const blocks = [...svg.matchAll(/<g class="trend-bar-item" data-period="([^"]+)">([\s\S]*?)<\/g>/g)];
  return blocks.map((match) => {
    const body = match[2];
    const rect = body.match(/<rect[^>]*height="([^"]+)"[^>]*fill="([^"]+)"/);
    // The value label is the only text in the group carrying monospace font-family;
    // the period caption below the axis deliberately omits it. SVG collapses runs of
    // whitespace, so the captured text is normalised to what a renderer would show.
    const label = body.match(/<text x="[^"]+" y="([^"]+)" text-anchor="middle" font-size="11" font-family="(?:monospace|var\(--font-mono\))"[^>]*>\s*([\s\S]*?)\s*<\/text>/);
    return {
      period: match[1],
      height: rect ? Number(rect[1]) : null,
      fill: rect ? rect[2] : null,
      labelY: label ? Number(label[1]) : null,
      label: label ? label[2].replace(/\s+/g, ' ').trim() : null,
    };
  });
}

/**
 * Reads the y coordinate of the zero grid line (`stroke="#64748b"`), which is the
 * baseline every bar label is positioned against.
 *
 * @param {string} svg
 * @returns {number}
 */
export function parseZeroLineY(svg) {
  const zeroLine = svg.match(/<line[^>]*y1="([^"]+)"[^>]*stroke="#64748b"/);
  return zeroLine ? Number(zeroLine[1]) : NaN;
}

/**
 * Reads the y-axis tick labels in document order.
 *
 * @param {string} svg
 * @returns {Array<string>}
 */
export function parseAxisTicks(svg) {
  return [...svg.matchAll(/<text x="[^"]+" y="[^"]+" text-anchor="end" font-size="11" font-family="(?:monospace|var\(--font-mono\))" fill="#64748b">([^<]*)<\/text>/g)]
    .map((match) => match[1]);
}
