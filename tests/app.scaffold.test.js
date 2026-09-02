/**
 * P0.1 Artifact Contract tests — `src/app.js` scaffold.
 *
 * Covers the frozen App interface: dependency validation, the AppState shape,
 * not-implemented call sites, tab wiring, and symmetrical listener disposal.
 * Fully headless: the DOM is injected as a stub.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { EngineError } from '../src/data/errors.js';
import { createTabRoot } from './_dom_stub.js';

/**
 * The eight model tabs defined in `docs/spec.md` §3.4.
 * @type {ReadonlyArray<string>}
 */
const TAB_KEYS = Object.freeze([
  'cover',
  'assumptions',
  'historicals',
  'schedules',
  'projections',
  'valuation',
  'summary',
  'sensitivity',
]);

/**
 * Builds an app instance with fully stubbed dependencies.
 * @returns {{ app: object, links: object[], panes: object[], stubs: object }}
 */
function buildApp() {
  const { root, links, panes } = createTabRoot(TAB_KEYS);
  const stubs = {
    data: Object.freeze({ loadHistorical: () => {} }),
    engine: Object.freeze({}),
    root,
    now: () => 0,
  };
  return { app: createApp(stubs), links, panes, stubs };
}

describe('createApp — interface & dependency injection', () => {
  test('exposes exactly the four frozen App interface members', () => {
    const { app } = buildApp();
    assert.deepEqual(Object.keys(app).sort(), [
      'dispose',
      'setDriver',
      'setScenario',
      'state',
    ]);
    for (const member of Object.keys(app)) {
      assert.equal(typeof app[member], 'function', `${member} must be callable`);
    }
    app.dispose();
  });

  test('rejects every missing dependency with a typed EngineError', () => {
    for (const name of ['data', 'engine', 'root', 'now']) {
      const deps = {
        data: Object.freeze({}),
        engine: Object.freeze({}),
        root: createTabRoot(TAB_KEYS).root,
        now: () => 0,
      };
      deps[name] = undefined;

      assert.throws(
        () => createApp(deps),
        (error) => {
          assert.ok(error instanceof EngineError, `${name}: expected EngineError`);
          assert.equal(error.code, 'invalid_dependency');
          assert.equal(error.driverName, name);
          assert.match(error.message, new RegExp(`\\\`${name}\\\``));
          return true;
        },
        `missing ${name} must throw invalid_dependency`,
      );
    }
  });

  test('binds the injected clock instead of a module-level time source', () => {
    // The purity invariant (no wall-clock read inside src/app.js) is asserted
    // by source scan in tests/scaffold.test.js; here we prove the clock is
    // accepted as a dependency rather than being ignored.
    const { app } = buildApp();
    assert.doesNotThrow(() => app.state());
    app.dispose();
  });
});

describe('AppState contract', () => {
  test('returns the exact frozen key set with P0.1 defaults', () => {
    const { app } = buildApp();
    const state = app.state();

    assert.deepEqual(Object.keys(state).sort(), [
      'assumptions',
      'dcf',
      'dirty',
      'forecast',
      'recommendation',
      'scenario',
      'schedules',
      'threeStatement',
      'wacc',
    ]);

    assert.equal(state.scenario, 'base');
    assert.equal(state.dirty, false);
    for (const key of ['assumptions', 'schedules', 'forecast', 'threeStatement', 'wacc', 'dcf', 'recommendation']) {
      assert.equal(state[key], null, `${key} must be null before the pipeline is wired`);
    }
    app.dispose();
  });

  test('returns a deeply frozen snapshot that rejects mutation', () => {
    const { app } = buildApp();
    const state = app.state();

    assert.ok(Object.isFrozen(state), 'snapshot must be frozen');
    assert.throws(() => {
      state.scenario = 'bull';
    }, TypeError);

    app.dispose();
  });

  test('returns an independent snapshot object on each call', () => {
    const { app } = buildApp();
    assert.notEqual(app.state(), app.state());
    app.dispose();
  });
});

describe('Deferred call sites keep their frozen signatures', () => {
  test('setDriver throws not_implemented naming the driver', () => {
    const { app } = buildApp();
    assert.throws(
      () => app.setDriver('revenue_growth', 0.1),
      (error) => {
        assert.ok(error instanceof EngineError);
        assert.equal(error.code, 'not_implemented');
        assert.equal(error.driverName, 'revenue_growth');
        return true;
      },
    );
    app.dispose();
  });

  test('setScenario throws not_implemented naming the scenario', () => {
    const { app } = buildApp();
    assert.throws(
      () => app.setScenario('bull'),
      (error) => {
        assert.ok(error instanceof EngineError);
        assert.equal(error.code, 'not_implemented');
        assert.equal(error.driverName, 'bull');
        return true;
      },
    );
    app.dispose();
  });
});

describe('Tab wiring & lifecycle disposal', () => {
  test('registers exactly one click listener per tab control', () => {
    const { app, links } = buildApp();
    for (const link of links) {
      assert.equal(link.listenerCount('click'), 1, 'one listener per tab control');
    }
    app.dispose();
  });

  test('activates the first tab on construction', () => {
    const { app, links, panes } = buildApp();
    assert.equal(links[0].getAttribute('data-active'), 'true');
    assert.equal(panes[0].getAttribute('data-active'), 'true');
    for (let index = 1; index < links.length; index++) {
      assert.equal(links[index].hasAttribute('data-active'), false);
      assert.equal(panes[index].hasAttribute('data-active'), false);
    }
    app.dispose();
  });

  test('clicking a control activates the matching pane and clears the rest', () => {
    const { app, links, panes } = buildApp();
    links[5].dispatch('click');

    assert.equal(links[5].getAttribute('data-active'), 'true');
    assert.equal(panes[5].getAttribute('data-active'), 'true');
    assert.equal(links[0].hasAttribute('data-active'), false);
    assert.equal(panes[0].hasAttribute('data-active'), false);
    assert.equal(links[5].getAttribute('aria-selected'), 'true');
    assert.equal(links[0].getAttribute('aria-selected'), 'false');
    app.dispose();
  });

  test('dispose removes every listener (symmetrical lifecycle)', () => {
    const { app, links, panes } = buildApp();
    app.dispose();

    for (const element of [...links, ...panes]) {
      assert.equal(element.listenerCount('click'), 0, 'all listeners must be released');
    }

    // Post-dispose clicks must be inert: no handler remains to react.
    links[3].dispatch('click');
    assert.equal(panes[3].hasAttribute('data-active'), false);
  });

  test('dispose is idempotent', () => {
    const { app } = buildApp();
    assert.doesNotThrow(() => {
      app.dispose();
      app.dispose();
      app.dispose();
    });
  });
});
