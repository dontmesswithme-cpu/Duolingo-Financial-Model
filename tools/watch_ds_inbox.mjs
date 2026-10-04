// DS Watcher  -  monitors docs/status_ds.json for OP signal updates.
// Uses fast non-blocking polling (1s interval) on structured JSON state.
// Wakes immediately when OP increments seq (seq > baselineSeq) or emits verdict.
// Supports explicit baseline via CLI argument (e.g. node tools/watch_ds_inbox.mjs 4).
//
// Configurable timeout via WORKFLOW_WATCHER_TIMEOUT_MS (default: 7200000 = 2 hours).
// On timeout, logs a warning and exits with code 1.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetPath = path.resolve(__dirname, '../docs/status_ds.json');
const resultPath = path.resolve(__dirname, '../docs/.ds_watch_result.txt');

const TIMEOUT_MS = parseInt(process.env.WORKFLOW_WATCHER_TIMEOUT_MS, 10) || 7_200_000; // 2 hours

function getStatus() {
  if (!fs.existsSync(targetPath)) return null;
  try {
    let raw = fs.readFileSync(targetPath, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) {
      raw = raw.slice(1);
    }
    return JSON.parse(raw.trim());
  } catch {
    return null;
  }
}

// Support explicit baseline via CLI argument: node tools/watch_ds_inbox.mjs [baselineSeq]
const argBaseline = process.argv[2] !== undefined ? parseInt(process.argv[2], 10) : null;
const initial = getStatus();
const baselineSeq = argBaseline !== null
  ? argBaseline
  : (initial && typeof initial.seq === 'number' ? initial.seq : 0);

function hasSignal(status) {
  if (!status) return false;
  const currentSeq = typeof status.seq === 'number' ? status.seq : 0;
  return currentSeq > baselineSeq;
}

// Immediate wake check: If unhandled signal or new seq already present, wake instantly
if (initial && hasSignal(initial)) {
  const currentSeq = typeof initial.seq === 'number' ? initial.seq : 0;
  const summary = `[SIGNAL RECEIVED IMMEDIATELY] status_ds.json seq: ${currentSeq}, state: ${initial.state}, phase: ${initial.phase}.${initial.subphase}`;
  fs.writeFileSync(resultPath, JSON.stringify(initial, null, 2), 'utf8');
  console.log(summary);
  process.exit(0);
}

// Deadlock recovery: exit with error after timeout
const watchdog = setTimeout(() => {
  const hours = (TIMEOUT_MS / 3_600_000).toFixed(1);
  const mins = ((TIMEOUT_MS % 3_600_000) / 60_000).toFixed(0);
  console.error(`⏰ WATCHER TIMEOUT: No signal received in status_ds.json after ${hours}h ${mins}m. Exiting.`);
  clearInterval(timer);
  process.exit(1);
}, TIMEOUT_MS);

const timer = setInterval(() => {
  const current = getStatus();
  if (current && hasSignal(current)) {
    clearInterval(timer);
    clearTimeout(watchdog);
    const currentSeq = typeof current.seq === 'number' ? current.seq : 0;
    const summary = `[SIGNAL RECEIVED] status_ds.json seq: ${currentSeq}, state: ${current.state}, phase: ${current.phase}.${current.subphase}`;
    fs.writeFileSync(resultPath, JSON.stringify(current, null, 2), 'utf8');
    console.log(summary);
    process.exit(0);
  }
}, 1000);
