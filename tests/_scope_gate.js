/**
 * Shared freeze-gate scope helper (EP-FIX1, finding F1).
 *
 * A freeze check built on bare `git diff` is blind to untracked files, so a
 * new engine module (e.g. `invariants.js`, `shares.js`) passes the gate right
 * up until it is committed. Every baseline comparison here unions the tracked
 * diff with `git ls-files --others`, so staging state cannot change the
 * verdict. `src/engine/methods/` stays excluded: the P8 method directory is
 * gated by its own suites, as in the pre-existing per-file filters.
 *
 * Fail-closed by construction: an unresolvable baseline tag, a git failure,
 * or a malformed tag throws instead of degrading to an empty change set
 * (a silent pass). Assertions live OUTSIDE any `try` at the call sites.
 *
 * Non-collected helper: the `_` prefix keeps the Node test runner from
 * collecting this file (convention per `tests/_ledger.js`).
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Economy Phase engine set: the only modules allowed to differ from
 * pre-EP baselines (Director un-park order 2026-09-10). New modules are
 * covered from birth because the helper also scans untracked files.
 * @type {ReadonlyArray<string>}
 */
export const EP_AUTHORIZED_ENGINE = Object.freeze([
  'src/engine/dcf.js',
  'src/engine/recommend.js',
  'src/engine/invariants.js',
  'src/engine/shares.js',
]);

/**
 * Redesign Phase 10 engine set: the Economy Phase set plus the one new module
 * RP10 introduces (`src/engine/ratios.js`, the historical ratio engine). The
 * addition is deliberately a single named path rather than a widened pattern, so
 * the gate still reports any other engine drift, tracked or untracked.
 *
 * Authorized by the RP10 artifact contract (`docs/phases/redesign_phase_10.md`
 * §3 Task RP10.1 deliverable files).
 * @type {ReadonlyArray<string>}
 */
export const RP10_AUTHORIZED_ENGINE = Object.freeze([
  ...EP_AUTHORIZED_ENGINE,
  'src/engine/ratios.js',
]);

/**
 * Phase 9 (FP) engine set: the RP10 engine set plus the 4 engine modules modified
 * for the Three-Stage Fade Horizon Extension (`src/engine/forecast.js`,
 * `src/engine/schedules.js`, `src/engine/threeStatement.js`, and `src/engine/scenarios.js`).
 *
 * Authorized by the Phase 9 artifact contract (`docs/phases/phase_9.md`
 * §3 Task FP.1 Deliverables).
 * @type {ReadonlyArray<string>}
 */
export const FP_AUTHORIZED_ENGINE = Object.freeze([
  ...RP10_AUTHORIZED_ENGINE,
  'src/engine/forecast.js',
  'src/engine/schedules.js',
  'src/engine/threeStatement.js',
  'src/engine/scenarios.js',
]);

/**
 * Phase 10 (P10) engine set: the FP engine set plus the modules P10.2 and P10.3
 * are contracted to touch — the live-price lifecycle (`src/engine/market.js`)
 * and the new canonical benchmark engine (`src/engine/benchmark.js`).
 *
 * Authorized by the Phase 10 artifact contract, §P10.2 and §P10.3 "Files"
 * (which name `src/engine/market.js` and `New src/engine/benchmark.js`).
 * The addition is two named paths, not a widened pattern, so the gate still
 * reports any other engine drift, tracked or untracked.
 * @type {ReadonlyArray<string>}
 */
export const P10_AUTHORIZED_ENGINE = Object.freeze([
  ...FP_AUTHORIZED_ENGINE,
  'src/engine/market.js',
  'src/engine/benchmark.js',
]);

/**
 * P10.4 engine set: the P10 engine set plus the point-in-time fully diluted
 * share schedule builder (`src/engine/fullyDiluted.js`), which the P10.4
 * artifact contract owns ("this sub-phase OWNS the FD schedule build P10.2
 * deferred"). `src/engine/methods/` is excluded from this gate entirely and is
 * gated by its own suites, so the six relative/aggregate method modules P10.4
 * rewrites need no entry here.
 *
 * Authorized by the Phase 10 artifact contract, §P10.4 "Common Share
 * Denominator". The addition is one named path, not a widened pattern, so the
 * gate still reports any other engine drift, tracked or untracked.
 * @type {ReadonlyArray<string>}
 */
export const P104_AUTHORIZED_ENGINE = Object.freeze([
  ...P10_AUTHORIZED_ENGINE,
  'src/engine/fullyDiluted.js',
]);

/** Baseline tags must be plain ref names (no shell metacharacters). */
const TAG_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Runs one git plumbing command, converting any failure into a loud error.
 *
 * @param {string} args Argument string (tag already validated).
 * @returns {string} Raw stdout.
 * @throws {Error} When git is unavailable or the command fails.
 */
function runGit(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8' });
  } catch (err) {
    const detail = err && err.message ? String(err.message).split('\n')[0] : String(err);
    throw new Error(`scope gate: git failed (${args}): ${detail}`);
  }
}

/**
 * Normalizes raw git path output to sorted repo-relative forward-slash paths.
 *
 * @param {string} raw Raw stdout.
 * @returns {Array<string>}
 */
function normalizePaths(raw) {
  return raw
    .trim()
    .split('\n')
    .map((s) => s.trim().replace(/\\/g, '/'))
    .filter(Boolean)
    .sort();
}

/**
 * Lists tracked engine files differing from a baseline tag.
 *
 * @param {string} baselineTag Frozen baseline tag (e.g. `v1.0-P6R3-base`).
 * @returns {Array<string>} Sorted repo-relative paths.
 * @throws {Error} When the baseline tag is missing or malformed (fail-closed).
 */
export function trackedChangedEngineFiles(baselineTag) {
  if (typeof baselineTag !== 'string' || !TAG_PATTERN.test(baselineTag)) {
    throw new Error(
      `scope gate: baseline tag must be a plain ref name (received ${JSON.stringify(baselineTag)}).`,
    );
  }
  try {
    runGit(`rev-parse --verify ${baselineTag}`);
  } catch {
    throw new Error(
      `scope gate: baseline tag "${baselineTag}" is not resolvable; refusing silent pass.`,
    );
  }
  return normalizePaths(runGit(`diff --name-only ${baselineTag} -- src/engine/`));
}

/**
 * Lists untracked engine files (`git diff` cannot see these).
 *
 * @returns {Array<string>} Sorted repo-relative paths (empty when clean).
 * @throws {Error} When git fails (fail-closed).
 */
export function untrackedEngineFiles() {
  return normalizePaths(runGit('ls-files --others --exclude-standard -- src/engine/'));
}

/**
 * Returns engine files that changed (tracked diff UNION untracked files)
 * without authorization. `src/engine/methods/` is excluded (P8 directory,
 * gated by its own suites).
 *
 * @param {string} baselineTag Frozen baseline tag.
 * @param {Array<string>} authorizedFiles Repo-relative paths allowed to differ.
 * @returns {Array<string>} Unauthorized paths (empty means the gate holds).
 * @throws {Error} On unresolvable baseline or git failure (fail-closed).
 */
export function unauthorizedEngineFiles(baselineTag, authorizedFiles) {
  const allowed = new Set(Array.isArray(authorizedFiles) ? authorizedFiles : []);
  const seen = new Set([...trackedChangedEngineFiles(baselineTag), ...untrackedEngineFiles()]);
  const offenders = [];
  for (const file of seen) {
    if (file.startsWith('src/engine/methods/')) {
      continue;
    }
    if (!allowed.has(file)) {
      offenders.push(file);
    }
  }
  return offenders.sort();
}
