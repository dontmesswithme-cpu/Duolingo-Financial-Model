/**
 * P10.8 — JS syntax verification (read-only).
 *
 * Runs `node --check` over every JS file in the repo's JS surfaces with NO
 * hand-expanded file lists: test files come from `tests/manifest.json`
 * (the pinned manifest), and product/tool files come from directory walks
 * (`src/`, `tools/`, `api/`, `tests/browser/`). Any syntax failure exits
 * non-zero with the failing path. Never writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walkJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip vendored third-party trees and build output: they are not
      // authored sources (vendor integrity is covered by its own gate).
      if (entry.name === 'node_modules') continue;
      out.push(...walkJs(full));
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs'))) {
      out.push(full);
    }
  }
  return out;
}

const manifestPath = path.join(ROOT, 'tests', 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`VERIFY_JS FAILED: manifest not found at tests/manifest.json`);
  process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const manifestFiles = (manifest.files || []).map((f) => path.join(ROOT, f));

const walked = [];
for (const dir of ['src', 'tools', 'api', 'tests/browser']) {
  const full = path.join(ROOT, dir);
  if (fs.existsSync(full)) walked.push(...walkJs(full));
}

const all = [...new Set([...manifestFiles, ...walked])].sort();
let failures = 0;
for (const file of all) {
  if (!fs.existsSync(file)) {
    console.error(`VERIFY_JS MISSING: ${path.relative(ROOT, file)}`);
    failures += 1;
    continue;
  }
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch {
    console.error(`VERIFY_JS SYNTAX FAIL: ${path.relative(ROOT, file)}`);
    failures += 1;
  }
}
if (failures > 0) {
  console.error(`VERIFY_JS FAILED: ${failures} file(s) failed syntax check (${all.length} checked).`);
  process.exit(1);
}
console.log(`VERIFY_JS PASS: ${all.length} file(s) syntax-checked, 0 failures.`);
