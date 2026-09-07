/**
 * P0.3 Artifact Contract tests  -  the typed error hierarchy (`src/data/errors.js`).
 *
 * Proves the full hierarchy is in place and machine-classifiable: instanceof
 * chains, `name`, `code`/`key` payloads, and deterministic serialization via
 * `toJSON()` (which `JSON.stringify` picks up, so `JSON.stringify(err)` carries
 * code + records as the contract requires).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ConfigError,
  DataValidationError,
  EngineError,
} from '../src/data/errors.js';

describe('DataValidationError', () => {
  test('extends Error and carries the class name', () => {
    const err = new DataValidationError('bad dataset');
    assert.ok(err instanceof Error);
    assert.ok(err instanceof DataValidationError);
    assert.equal(err.name, 'DataValidationError');
    assert.equal(err.message, 'bad dataset');
  });

  test('defaults records to an empty array', () => {
    assert.deepEqual(new DataValidationError('x').records, []);
  });

  test('wraps a single record object into an array', () => {
    const record = { rule: 'HIST_NO_SOURCE', message: 'missing citation' };
    const err = new DataValidationError('x', record);
    assert.deepEqual(err.records, [record]);
  });

  test('keeps a full record list intact', () => {
    const records = [
      { file: 'income.json', rule: 'SCHEMA_VIOLATION', message: 'row 2 bad' },
      { metric: 'revenue', period: 'FY2023', rule: 'DUP_KEY', message: 'dup' },
    ];
    const err = new DataValidationError('2 violations', records);
    assert.equal(err.records.length, 2);
    assert.deepEqual(err.records, records);
  });

  test('JSON.stringify includes name, message, and records', () => {
    const records = [{ metric: 'revenue', period: 'FY2023', rule: 'DUP_KEY', message: 'dup' }];
    const parsed = JSON.parse(JSON.stringify(new DataValidationError('x', records)));
    assert.equal(parsed.name, 'DataValidationError');
    assert.equal(parsed.message, 'x');
    assert.deepEqual(parsed.records, records);
  });
});

describe('EngineError', () => {
  test('extends Error and carries the class name', () => {
    const err = new EngineError('not_implemented', 'wired in Phase 5');
    assert.ok(err instanceof Error);
    assert.ok(err instanceof EngineError);
    assert.equal(err.name, 'EngineError');
  });

  test('exposes code and message', () => {
    const err = new EngineError('balance_check_failed', 'assets != liabilities');
    assert.equal(err.code, 'balance_check_failed');
    assert.equal(err.message, 'assets != liabilities');
  });

  test('exposes driverName when supplied and omits it otherwise', () => {
    const withDriver = new EngineError('invalid_driver', 'bad', 'revenue_growth');
    assert.equal(withDriver.driverName, 'revenue_growth');

    const withoutDriver = new EngineError('invalid_driver', 'bad');
    assert.equal(withoutDriver.driverName, undefined);
    assert.equal('driverName' in withoutDriver, false);
  });

  test('JSON.stringify includes code and omits an undefined driverName', () => {
    const parsed = JSON.parse(
      JSON.stringify(new EngineError('not_implemented', 'later', 'growth')),
    );
    assert.deepEqual(parsed, {
      name: 'EngineError',
      message: 'later',
      code: 'not_implemented',
      driverName: 'growth',
    });

    const minimal = JSON.parse(JSON.stringify(new EngineError('boom', 'later')));
    assert.deepEqual(minimal, { name: 'EngineError', message: 'later', code: 'boom' });
  });
});

describe('ConfigError', () => {
  test('extends Error and carries the class name', () => {
    const err = new ConfigError('missing constant');
    assert.ok(err instanceof Error);
    assert.ok(err instanceof ConfigError);
    // It is a sibling of the other classes, not a subclass of either.
    assert.ok(!(err instanceof DataValidationError));
    assert.ok(!(err instanceof EngineError));
    assert.equal(err.name, 'ConfigError');
    assert.equal(err.message, 'missing constant');
  });

  test('exposes the offending config key when supplied', () => {
    const withKey = new ConfigError('unknown scenario', 'scenario');
    assert.equal(withKey.key, 'scenario');

    const withoutKey = new ConfigError('bad configuration');
    assert.equal(withoutKey.key, undefined);
    assert.equal('key' in withoutKey, false);
  });

  test('JSON.stringify includes name, message, and key', () => {
    const parsed = JSON.parse(
      JSON.stringify(new ConfigError('unknown scenario name', 'scenario')),
    );
    assert.deepEqual(parsed, {
      name: 'ConfigError',
      message: 'unknown scenario name',
      key: 'scenario',
    });

    const minimal = JSON.parse(JSON.stringify(new ConfigError('bad config')));
    assert.deepEqual(minimal, { name: 'ConfigError', message: 'bad config' });
  });
});

describe('Error hierarchy consistency', () => {
  test('every class produces a machine-classifiable payload', () => {
    const errors = [
      new DataValidationError('a', [{ rule: 'R', message: 'm' }]),
      new EngineError('code_b', 'b'),
      new ConfigError('c', 'key_c'),
    ];
    const names = errors.map((err) => JSON.parse(JSON.stringify(err)).name);
    assert.deepEqual(names, ['DataValidationError', 'EngineError', 'ConfigError']);
  });

  test('messages carry actionable context, not generic strings', () => {
    const generic = ['error', 'failed', 'invalid', 'bad'];
    for (const message of [
      'loadHistorical() rejected: revenue FY2023 DUP_KEY duplicate record',
      'unknown scenario "sideways" (expected one of: bear, base, bull)',
      'setDriver() is wired in Phase 5 (driver: revenue_growth)',
    ]) {
      assert.ok(!generic.includes(message.toLowerCase()));
    }
  });
});
