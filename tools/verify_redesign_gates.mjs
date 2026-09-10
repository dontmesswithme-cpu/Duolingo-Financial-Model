// Redesign Gate Scanner (RP9.1) — automated standing-gate verification.
//
// Rules:
//   no-inline-style       Zero inline `style=` attributes in index.html markup
//                         (outside <style> blocks) and src/ui/*.js (outside
//                         comments, mirroring the in-suite gate).
//   no-orphan-numbers     Zero bare numeric literals > 999 outside comments in
//                         src/ui/*.js (same regex + exemptions as the in-suite
//                         UI literal gate).
//   helvetica-inheritance Helvetica stack token present, applied at the body
//                         root, and every font-family usage resolving to an
//                         approved stack (sans/mono tokens, Helvetica/Arial/
//                         sans-serif/monospace families, inherit).
//
// Usage: node tools/verify_redesign_gates.mjs [--json]
// Exit code 0 when clean, 1 on violations.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const UI_DIR = path.join(ROOT, 'src', 'ui');
const INDEX_PATH = path.join(ROOT, 'index.html');

/** Bare >999 literals exempted by the standing UI gate (viewport/epoch pins).
 * Filing-date years 2025/2026 in cited prose/asOf fallbacks ride along
 * (Warning #2 disposition, EP.4): reviewed calendar years, not figures. */
const EXEMPT_NUMBERS = new Set([1000, 1280, 1900, 2000, 2025, 2026]);

/** Approved font-family resolutions (tokens + stacks + generic families). */
const APPROVED_FONTS = [
  'var(--font-sans)',
  'var(--font-mono)',
  'var(--font-family-mono',
  'Helvetica',
  'Arial, sans-serif',
  'sans-serif',
  'monospace',
  'Menlo',
  'Monaco',
  'Consolas',
  'SFMono',
  'Liberation Mono',
  'inherit',
];

/**
 * Strips block comments, tracking multi-line state across lines.
 *
 * @param {Array<string>} lines Source lines
 * @returns {Array<{ text: string, line: number }>} Code lines with 1-based numbers
 */
function stripComments(lines) {
  const out = [];
  let inBlock = false;
  lines.forEach((raw, idx) => {
    let code = raw;
    if (inBlock) {
      const endIdx = code.indexOf('*/');
      if (endIdx !== -1) {
        inBlock = false;
        code = code.substring(endIdx + 2);
      } else {
        return;
      }
    }
    for (;;) {
      const startIdx = code.indexOf('/*');
      if (startIdx === -1) break;
      const endIdx = code.indexOf('*/', startIdx + 2);
      if (endIdx !== -1) {
        code = code.substring(0, startIdx) + ' ' + code.substring(endIdx + 2);
      } else {
        code = code.substring(0, startIdx);
        inBlock = true;
        break;
      }
    }
    const lineCommentIdx = code.indexOf('//');
    if (lineCommentIdx !== -1) {
      code = code.substring(0, lineCommentIdx);
    }
    out.push({ text: code, line: idx + 1 });
  });
  return out;
}

/**
 * Splits index.html into style-block and markup line streams.
 *
 * @param {string} content Raw index.html
 * @returns {{ markup: Array<{ text: string, line: number }>, css: string }}
 */
function splitIndexHtml(content) {
  const lines = content.split('\n');
  const markup = [];
  const cssParts = [];
  let inStyle = false;
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    if (!inStyle && /<style[^>]*>/i.test(raw)) {
      inStyle = true;
      const after = raw.replace(/<style[^>]*>/i, '');
      if (/<\/style>/i.test(after)) {
        inStyle = false;
        cssParts.push(after.replace(/<\/style>/i, ''));
      } else if (after.trim().length > 0) {
        cssParts.push(after);
      }
      markup.push({ text: raw.replace(/<style[^>]*>.*$/i, ''), line: lineNo });
      return;
    }
    if (inStyle) {
      if (/<\/style>/i.test(raw)) {
        inStyle = false;
        cssParts.push(raw.replace(/<\/style>.*/i, ''));
        markup.push({ text: raw.replace(/^.*<\/style>/i, ''), line: lineNo });
      } else {
        cssParts.push(raw);
      }
      return;
    }
    markup.push({ text: raw, line: lineNo });
  });
  return { markup, css: cssParts.join('\n') };
}

function scanNoInlineStyle(violations) {
  const uiFiles = fs.readdirSync(UI_DIR).filter((f) => f.endsWith('.js'));
  for (const file of uiFiles) {
    const content = fs.readFileSync(path.join(UI_DIR, file), 'utf8');
    const codeLines = stripComments(content.split('\n'));
    for (const { text, line } of codeLines) {
      const match = /(^|[\s"'`({;])style\s*=/im.exec(text);
      if (match) {
        violations.push({
          rule: 'no-inline-style',
          file: `src/ui/${file}`,
          line,
          detail: `inline style= attribute: "${text.trim().slice(0, 100)}"`,
        });
      }
    }
  }

  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const { markup } = splitIndexHtml(html);
  for (const { text, line } of markup) {
    const match = /(^|[\s"'`({;])style\s*=/im.exec(text);
    if (match) {
      violations.push({
        rule: 'no-inline-style',
        file: 'index.html',
        line,
        detail: `inline style= attribute: "${text.trim().slice(0, 100)}"`,
      });
    }
  }
}

function scanNoOrphanNumbers(violations) {
  const numberRegex = /(?<![A-Za-z0-9_$.])([1-9]\d{3,}(?:\.\d+)?)(?![A-Za-z0-9_$])/g;
  const uiFiles = fs.readdirSync(UI_DIR).filter((f) => f.endsWith('.js'));
  for (const file of uiFiles) {
    const content = fs.readFileSync(path.join(UI_DIR, file), 'utf8');
    const codeLines = stripComments(content.split('\n'));
    for (const { text, line } of codeLines) {
      let match;
      numberRegex.lastIndex = 0;
      while ((match = numberRegex.exec(text)) !== null) {
        const num = Number(match[1]);
        if (EXEMPT_NUMBERS.has(num)) continue;
        violations.push({
          rule: 'no-orphan-numbers',
          file: `src/ui/${file}`,
          line,
          detail: `bare numeric literal ${match[1]}: "${text.trim().slice(0, 100)}"`,
        });
      }
    }
  }
}

function scanHelveticaInheritance(violations) {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const { css } = splitIndexHtml(html);

  const tokenMatch = /--font-sans\s*:\s*([^;]+);/.exec(css);
  if (!tokenMatch || !tokenMatch[1].includes('Helvetica')) {
    violations.push({
      rule: 'helvetica-inheritance',
      file: 'index.html',
      line: 0,
      detail: '--font-sans token missing or not Helvetica-based',
    });
    return;
  }
  if (!/body\s*\{[^}]*font-family\s*:\s*var\(--font-sans\)[^}]*\}/s.test(css)) {
    violations.push({
      rule: 'helvetica-inheritance',
      file: 'index.html',
      line: 0,
      detail: 'body root does not inherit var(--font-sans)',
    });
  }

  const fontDeclRe = /font-family\s*:\s*([^;}]+)[;}]/g;
  let decl;
  while ((decl = fontDeclRe.exec(css)) !== null) {
    const value = decl[1].trim();
    const approved = APPROVED_FONTS.some((token) => value.includes(token));
    if (!approved) {
      const upto = css.slice(0, decl.index);
      const line = upto.split('\n').length;
      violations.push({
        rule: 'helvetica-inheritance',
        file: 'index.html',
        line,
        detail: `unapproved font-family stack: "${value.slice(0, 100)}"`,
      });
    }
  }

  const uiFiles = fs.readdirSync(UI_DIR).filter((f) => f.endsWith('.js'));
  for (const file of uiFiles) {
    const content = fs.readFileSync(path.join(UI_DIR, file), 'utf8');
    const codeLines = stripComments(content.split('\n'));
    for (const { text, line } of codeLines) {
      const attrRe = /font-family\s*=\s*"([^"]*)"/g;
      let attr;
      while ((attr = attrRe.exec(text)) !== null) {
        const value = attr[1].trim();
        const approved = APPROVED_FONTS.some((token) => value.includes(token));
        if (!approved) {
          violations.push({
            rule: 'helvetica-inheritance',
            file: `src/ui/${file}`,
            line,
            detail: `unapproved font-family attribute: "${value.slice(0, 100)}"`,
          });
        }
      }
    }
  }
}

/**
 * Runs the full standing-gate scan.
 *
 * @returns {{ passed: boolean, violations: Array<{ rule: string, file: string, line: number, detail: string }> }}
 */
export function runGateScan() {
  const violations = [];
  scanNoInlineStyle(violations);
  scanNoOrphanNumbers(violations);
  scanHelveticaInheritance(violations);
  return { passed: violations.length === 0, violations };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const result = runGateScan();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.passed) {
    console.log('GATE SCAN: PASS — 0 violations (no-inline-style, no-orphan-numbers, helvetica-inheritance).');
  } else {
    console.log(`GATE SCAN: FAIL — ${result.violations.length} violation(s):`);
    for (const v of result.violations) {
      console.log(`  [${v.rule}] ${v.file}:${v.line} — ${v.detail}`);
    }
  }
  process.exit(result.passed ? 0 : 1);
}
