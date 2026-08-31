// archive_phase.mjs — Archives inboxes and signal states for a completed phase,
// commits + tags in git, and optionally pings a Director webhook.
//
// Usage: node tools/archive_phase.mjs phase_0
//
// Environment Variables:
//   WORKFLOW_AUTO_GIT          — Enable git commit + tag on Gate Pass (default: "true")
//   WORKFLOW_GIT_TAG_PREFIX    — Git tag prefix (default: "v1.0", produces "v1.0-P0", "v1.0-P1", ...)
//   WORKFLOW_WEBHOOK_URL       — Discord/Slack webhook URL for Gate Pass alerts (unset = disabled)
//   WORKFLOW_PROJECT_NAME      — Project name for webhook messages (default: "Workflow")

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const phaseInput = process.argv[2];
if (!phaseInput) {
  console.error('Error: Please specify the phase name to archive (e.g. node tools/archive_phase.mjs phase_0)');
  process.exit(1);
}

// Normalize phase name & tag label
const phaseMatch = phaseInput.match(/phase_?(\d+)/i) || phaseInput.match(/p(\d+)/i);
const phaseNum = phaseMatch ? parseInt(phaseMatch[1], 10) : 0;
const phaseName = `phase_${phaseNum}`;
const phaseLabel = `P${phaseNum}`;
const nextPhaseLabel = `P${phaseNum + 1}`;

// ─── 1. Archive Inboxes & Signals ─────────────────────────────────────

const archiveDir = path.join(rootDir, 'docs', 'logs', 'inboxes', phaseName);
fs.mkdirSync(archiveDir, { recursive: true });

const inboxDs = path.join(rootDir, 'docs', 'inbox_ds.md');
const inboxOp = path.join(rootDir, 'docs', 'inbox_op.md');
const statusDs = path.join(rootDir, 'docs', 'status_ds.json');
const statusOp = path.join(rootDir, 'docs', 'status_op.json');

// Archive Markdown Inboxes
if (fs.existsSync(inboxDs)) {
  fs.copyFileSync(inboxDs, path.join(archiveDir, 'inbox_ds.md'));
  fs.writeFileSync(
    inboxDs,
    `# Worker Inbox (DS Inbox)\n\n> **Channel**: Reviewer (`OP`) ➔ Worker (`DS`)\n>\n> **Rule**: OP appends review verdicts and milestone gate passes here. Every message MUST end with `[END_OF_MESSAGE]`.\n\n---\n`,
    'utf8'
  );
}

if (fs.existsSync(inboxOp)) {
  fs.copyFileSync(inboxOp, path.join(archiveDir, 'inbox_op.md'));
  fs.writeFileSync(
    inboxOp,
    `# Reviewer Inbox (OP Inbox)\n\n> **Channel**: Worker (`DS`) ➔ Reviewer (`OP`)\n>\n> **Rule**: DS appends sub-phase submissions and resubmissions here. Every message MUST end with `[END_OF_MESSAGE]`.\n\n---\n`,
    'utf8'
  );
}

// Archive & Reset JSON State Signals (Atomic reset: seq: 0)
if (fs.existsSync(statusOp)) {
  fs.copyFileSync(statusOp, path.join(archiveDir, 'status_op.json'));
}
if (fs.existsSync(statusDs)) {
  fs.copyFileSync(statusDs, path.join(archiveDir, 'status_ds.json'));
}

const now = new Date().toISOString();
fs.writeFileSync(
  statusOp,
  JSON.stringify({ protocol: '1.0', seq: 0, state: 'idle', phase: nextPhaseLabel, subphase: `${nextPhaseLabel}.1`, updated_at: now }, null, 2) + '\n',
  'utf8'
);

fs.writeFileSync(
  statusDs,
  JSON.stringify({ protocol: '1.0', seq: 0, state: 'worker_active', phase: nextPhaseLabel, subphase: `${nextPhaseLabel}.1`, updated_at: now }, null, 2) + '\n',
  'utf8'
);

console.log(`Phase "${phaseName}" inboxes and signals archived to ${archiveDir} and reset for ${nextPhaseLabel}.`);

// ─── 2. Git Auto-Commit & Tag ─────────────────────────────────────────

const autoGit = (process.env.WORKFLOW_AUTO_GIT || 'true').toLowerCase() !== 'false';
const tagPrefix = process.env.WORKFLOW_GIT_TAG_PREFIX || 'v1.0';
const tagName = `${tagPrefix}-${phaseLabel}`;

if (autoGit) {
  const gitDir = path.join(rootDir, '.git');
  if (fs.existsSync(gitDir)) {
    try {
      execSync('git add .', { cwd: rootDir, stdio: 'pipe' });
      execSync(`git commit -m "GATE PASS: ${phaseLabel} — Phase archived and verified"`, {
        cwd: rootDir,
        stdio: 'pipe',
      });
      execSync(`git tag ${tagName}`, { cwd: rootDir, stdio: 'pipe' });
      console.log(`Git committed and tagged as "${tagName}".`);
    } catch (err) {
      const errMsg = err.stderr ? err.stderr.toString() : err.message;
      if (errMsg.includes('nothing to commit')) {
        try {
          execSync(`git tag ${tagName}`, { cwd: rootDir, stdio: 'pipe' });
          console.log(`No new changes to commit. Tagged as "${tagName}".`);
        } catch (tagErr) {
          console.warn(`⚠️ Git tag failed: ${tagErr.message}`);
        }
      } else {
        console.warn(`⚠️ Git auto-commit failed: ${errMsg}`);
      }
    }
  } else {
    console.warn('⚠️ Git repository not initialized (.git not found). Skipping auto-commit.');
  }
}

// ─── 3. Director Webhook Notification ──────────────────────────────────

const webhookUrl = process.env.WORKFLOW_WEBHOOK_URL;
const projectName = process.env.WORKFLOW_PROJECT_NAME || 'Workflow';

if (webhookUrl) {
  const message = `✅ GATE PASS: ${phaseLabel} — ${projectName} phase archived${autoGit ? ` and tagged as \`${tagName}\`` : ''}.`;

  try {
    const payload = JSON.stringify({ content: message, text: message });
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    if (response.ok) {
      console.log('Director webhook notification sent successfully.');
    } else {
      console.warn(`⚠️ Webhook responded with status ${response.status}: ${response.statusText}`);
    }
  } catch (err) {
    console.warn(`⚠️ Webhook notification failed: ${err.message}`);
  }
}
