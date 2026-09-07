/**
 * Shared GC-measurement helper for deterministic memory harnesses.
 *
 * Under heap pressure a single post-GC heapUsed snapshot is not always
 * deterministic: V8 old-space fragmentation and finalizer-deferred cleanup
 * can cause run-to-run noise for identical code.
 *
 * settleHeap() runs a triple major GC with a microtask yield and returns
 * the MINIMUM of three snapshots  -  true retention appears in every snapshot
 * while transient fragmentation inflates only some, isolating real memory usage
 * and ensuring deterministic test results across environments.
 */
export async function settleHeap() {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    globalThis.gc();
    await new Promise((r) => setTimeout(r, 0));
    globalThis.gc();
    globalThis.gc();
    const used = process.memoryUsage().heapUsed;
    if (used < best) best = used;
  }
  return best;
}
