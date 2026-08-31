// OP Watcher — monitors docs/status_op.json for DS signal updates.
// Uses fast non-blocking polling (1s interval) on structured JSON state.
// Wakes immediately when DS increments seq (seq > baselineSeq), writes result, and exits 0.
//
// Configurable timeout via WORKFLOW_WATCHER_TIMEOUT_MS (default: 7200000 = 2 hours).
// On timeout, logs a warning and exits with code 1.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetPath = path.resolve(__dirname, '../docs/status_op.json');
const resultPath = path.resolve(__dirname, '../docs/.op_watch_result.txt');

const TIMEOUT_MS = parseInt(process.env.WORKFLOW_WATCHER_TIMEOUT_MS, 10) || 7_200_000; // 2 hours

function getStatus() {
  if (!fs.existsSync(targetPath)) return null;
  try {
    const raw = fs.readFileSync(targetPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const initial = getStatus();
const baselineSeq = initial ? (typeof initial.seq === 'number' ? initial.seq : 0) : 0;

// Deadlock recovery: exit with error after timeout
const watchdog = setTimeout(() => {
  const hours = (TIMEOUT_MS / 3_600_000).toFixed(1);
  const mins = ((TIMEOUT_MS % 3_600_000) / 60_000).toFixed(0);
  console.error(`⏰ WATCHER TIMEOUT: No signal received in status_op.json after ${hours}h ${mins}m. Exiting.`);
  clearInterval(timer);
  process.exit(1);
}, TIMEOUT_MS);

const timer = setInterval(() => {
  const current = getStatus();
  if (!current) return;

  const currentSeq = typeof current.seq === 'number' ? current.seq : 0;

  if (currentSeq > baselineSeq) {
    clearInterval(timer);
    clearTimeout(watchdog);
    const summary = `[SIGNAL RECEIVED] status_op.json seq: ${currentSeq}, state: ${current.state}, phase: ${current.phase}.${current.subphase}`;
    fs.writeFileSync(resultPath, JSON.stringify(current, null, 2), 'utf8');
    console.log(summary);
    process.exit(0);
  }
}, 1000);
