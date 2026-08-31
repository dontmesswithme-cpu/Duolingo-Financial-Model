import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settleHeap } from './_gc.js';

/**
 * Universal Memory & Resource Allocation Churn Test Template
 * Requires `node --expose-gc` (run via `npm test`)
 */
const gcAvailable = typeof globalThis.gc === 'function';

async function measureChurn(iterations, warmupIterations, fn) {
  for (let i = 0; i < warmupIterations; i++) fn(i);
  const before = await settleHeap();
  for (let i = 0; i < iterations; i++) fn(i);
  const after = process.memoryUsage().heapUsed;
  await settleHeap();
  return after - before;
}

(gcAvailable ? test : test.skip)('Core operations do not produce excessive heap churn', async () => {
  const ITERATIONS = 10_000;
  const WARMUP = 500;
  const BUDGET_BYTES = 2 * 1024 * 1024; // 2 MB budget for 10k ops

  let sink = 0;
  const churn = await measureChurn(ITERATIONS, WARMUP, (i) => {
    sink += (i * 2) & 0xff;
  });

  console.info(`    [gc] ${ITERATIONS} cycles churned ${(churn / 1024).toFixed(1)} KB`);
  assert.ok(churn < BUDGET_BYTES, `Excessive heap allocation detected: ${(churn / 1024).toFixed(1)} KB`);
  assert.ok(sink > 0);
});
