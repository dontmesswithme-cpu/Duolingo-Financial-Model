/**
 * P10.6 — GitHub Pages artifact builder and allowlist gate.
 *
 * The Pages upload previously used `path: '.'`, which published the entire
 * repository: `.git`, `.env`, `tests/`, `tools/`, `docs/logs/` and all
 * source-control metadata. The contract requires "a minimal allowlisted static
 * artifact" and that neither deployment contains `.git`, `.env`, tests, tools,
 * logs, or source-control metadata.
 *
 * This script copies ONLY the static surface the page needs into `_pages/`, and
 * `--check` fails closed if any forbidden path is present in the built artifact.
 *
 * Allowlist derived from what index.html actually references:
 *   - `./src/app.js`, `./src/data/loader.js`, `./src/data/ledger.js` (ES modules)
 *   - `vendor/tabulator/tabulator.min.css`
 *   - `assets/branding/*`, `assets/icons/ui/*`
 * `src/` is included wholesale because the module graph is resolved at runtime by
 * the browser; it is source that the page genuinely executes, not tooling.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, '_pages');

/** Top-level entries copied into the artifact. */
const ALLOWLIST = ['index.html', 'src', 'vendor', 'assets'];

/**
 * Paths that must never appear in the artifact. Checked by prefix against the
 * artifact-relative path, so `tests/x` and `docs/logs/y` are both caught.
 */
const FORBIDDEN = [
  '.git',
  '.github',
  '.env',
  '.env.local',
  'node_modules',
  'tests',
  'tools',
  'docs',
  'scratch',
  'api',
  'package.json',
  'package-lock.json',
  'vercel.json',
  '.opencode',
];

const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
};

const build = () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const entry of ALLOWLIST) {
    const src = path.join(ROOT, entry);
    if (!fs.existsSync(src)) {
      console.log(`MISS allowlisted entry: ${entry}`);
      process.exit(1);
    }
    const dest = path.join(OUT, entry);
    if (fs.statSync(src).isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
};

const walk = (dir, base = '') => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
};

const check = () => {
  if (!fs.existsSync(OUT)) {
    console.log('FAIL: _pages/ not built. Run without --check first.');
    process.exit(1);
  }
  const files = walk(OUT);
  const violations = [];
  for (const f of files) {
    const top = f.split('/')[0];
    for (const bad of FORBIDDEN) {
      if (top === bad || f === bad || f.startsWith(`${bad}/`)) {
        violations.push(f);
        break;
      }
    }
  }
  // The artifact must still be a working page.
  if (!files.includes('index.html')) violations.push('index.html (missing)');
  if (!files.some((f) => f.startsWith('src/'))) violations.push('src/ (missing)');

  console.log(`artifact files: ${files.length}`);
  console.log(`forbidden entries found: ${violations.length}`);
  if (violations.length) {
    for (const v of violations.slice(0, 20)) console.log(`  VIOLATION ${v}`);
    console.log('FAIL: artifact allowlist violated');
    process.exit(1);
  }
  console.log('PASS: artifact contains only the allowlisted static surface');
};

if (process.argv.includes('--check')) check();
else {
  build();
  const n = walk(OUT).length;
  console.log(`built _pages/ with ${n} files from allowlist: ${ALLOWLIST.join(', ')}`);
}
