#!/usr/bin/env node
/**
 * init.mjs — engineering-kit CLI.
 *
 * Copies template/ into the target project, generates a starter kit.config.json,
 * replaces core placeholders and prints next steps.
 *
 * Usage:
 *   engineering-kit init <target-dir> [--name <project>] [--lang vi|en] [--yes]
 *   engineering-kit init <existing-dir> --adopt [--dry-run]
 *
 * Zero dependencies — Node >= 18 stdlib only. Windows-safe.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const templateDir = resolve(packageRoot, 'template');
const kitVersion = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;

const USAGE = `
engineering-kit init — scaffolds AI-agent conventions into a new project

Usage:
  engineering-kit init <target-dir> [options]

Options:
  --name <project>   Project name (default: target dir basename)
  --lang <vi|en>     Agent chat language written into AGENTS.md (default: vi)
  --no-skills        Skip the bundled skill corpus (.claude/skills + pool);
                     SKILL-SOURCES.md still ships so you can add skills later
  --yes              Non-interactive: accept defaults, no questions
  --adopt            Install into an existing project: add missing files only,
                     never overwrite project-owned files or filled docs
  --dry-run          With --adopt: print the add/skip/merge plan, write nothing
  --help, -h         Show this help

Exit codes: 0 ok · 1 usage/environment error
`;

const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

// ---------- arg parsing ----------
const argv = process.argv.slice(2);
const flags = { name: null, lang: 'vi', yes: false, help: false, noSkills: false, adopt: false, dryRun: false };
const positional = [];

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') flags.help = true;
  else if (a === '--yes') flags.yes = true;
  else if (a === '--no-skills') flags.noSkills = true;
  else if (a === '--adopt') flags.adopt = true;
  else if (a === '--dry-run') flags.dryRun = true;
  else if (a === '--lang') {
    const v = argv[++i];
    if (!v || !['vi', 'en'].includes(v)) die(`Error: --lang accepts "vi" or "en" only (got: ${v ?? '(missing value)'})`);
    flags.lang = v;
  } else if (a === '--name') {
    const v = argv[++i];
    if (!v) die('Error: --name requires a value');
    flags.name = v;
  } else if (a.startsWith('-')) {
    die(`Error: unsupported flag "${a}"\n${USAGE}`);
  } else positional.push(a);
}

// `npx engineering-kit init <dir>` — "init" is the documented subcommand; accept
// it (and also work without it: `engineering-kit <dir>`).
if (positional[0] === 'init') positional.shift();

if (flags.help) {
  console.log(USAGE);
  process.exit(0);
}
if (positional.length !== 1) {
  die(`Error: exactly one <target-dir> is required\n${USAGE}`);
}
if (flags.dryRun && !flags.adopt) {
  die('Error: --dry-run is only valid together with --adopt');
}

const target = resolve(positional[0]);

// ---------- interactive answers ----------
const chatLanguageLabel = flags.lang === 'en' ? 'English' : 'Vietnamese';

let projectName = flags.name;
if (!projectName && !flags.yes) {
  if (!process.stdin.isTTY) {
    die('Error: stdin is not a TTY — use --yes --name <name> --lang <vi|en> for non-interactive runs');
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`Project name (Enter = "${basename(target)}"): `)).trim();
  rl.close();
  projectName = answer || basename(target);
}
if (!projectName) projectName = basename(target);

// ---------- guards ----------
if (existsSync(target) && statSync(target).isFile()) {
  die(`Target "${target}" is an existing file — provide a directory name.`);
}
const existingAgents = existsSync(join(target, 'AGENTS.md'));
if (existingAgents && !flags.adopt) {
  die(`Target "${target}" already has AGENTS.md — aborting to avoid overwrite.`);
}

// ---------- helpers ----------
const walkFiles = (dir, base = dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walkFiles(full, base, out);
    else out.push(relative(base, full).split('\\').join('/'));
  }
  return out;
};

const replaceText = (content) => content
  .split('{{PROJECT_NAME}}').join(projectName)
  .split('{{CHAT_LANGUAGE}}').join(chatLanguageLabel)
  .split('{{KIT_VERSION}}').join(kitVersion);

const replaceInFiles = (files) => {
  for (const full of files) {
    const content = readFileSync(full, 'utf8');
    const replaced = replaceText(content);
    if (replaced !== content) writeFileSync(full, replaced);
  }
};

const starterConfig = {
  project: { name: projectName, chatLanguage: flags.lang },
  apps: [],
  docPaths: { aiContext: 'docs/ai-context', agents: 'AGENTS.md', agentsConfig: 'docs/agents' },
  skillPaths: flags.noSkills ? [] : ['.claude/skills'],
  claims: [],
  gates: [],
};

// ---------- path A: default fresh init (unchanged behavior) ----------
if (!flags.adopt) {
  mkdirSync(target, { recursive: true });
  cpSync(templateDir, target, { recursive: true });
  for (const f of ['kit.config.example.json', 'kit.config.schema.json']) {
    cpSync(join(packageRoot, f), join(target, f));
  }
  const plainGitignore = join(target, 'gitignore');
  if (existsSync(plainGitignore)) renameSync(plainGitignore, join(target, '.gitignore'));
  if (flags.noSkills) {
    rmSync(join(target, '.claude', 'skills'), { recursive: true, force: true });
    rmSync(join(target, '.claude', 'skills-disabled'), { recursive: true, force: true });
  }
  writeFileSync(join(target, 'kit.config.json'), `${JSON.stringify(starterConfig, null, 2)}\n`);

  const replaceInTree = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, f.name);
      if (f.isDirectory()) replaceInTree(full);
      else {
        const content = readFileSync(full, 'utf8');
        const replaced = replaceText(content);
        if (replaced !== content) writeFileSync(full, replaced);
      }
    }
  };
  replaceInTree(target);

  const leftover = [];
  const checkLeftover = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, f.name);
      if (f.isDirectory()) checkLeftover(full);
      else {
        const content = readFileSync(full, 'utf8');
        if (content.includes('{{PROJECT_NAME}}') || content.includes('{{CHAT_LANGUAGE}}')
          || content.includes('{{KIT_VERSION}}')) leftover.push(full);
      }
    }
  };
  checkLeftover(target);
  if (leftover.length > 0) console.warn(`⚠ Core placeholders left unreplaced in: ${leftover.join(', ')}`);
  printDone('copied', 0, 0, 0);
  process.exit(0);
}

// ---------- path B: --adopt (add missing, never overwrite) ----------
const added = [];
const skipped = [];
const destOf = (rel) => join(target, rel === 'gitignore' ? '.gitignore' : rel);
for (const rel of walkFiles(templateDir)) {
  if (existsSync(destOf(rel))) skipped.push(rel);
  else added.push(rel);
}
for (const f of ['kit.config.example.json', 'kit.config.schema.json']) {
  if (!existsSync(join(target, f))) added.push(f);
  else skipped.push(f);
}
if (!existsSync(join(target, 'kit.config.json'))) added.push('kit.config.json');
else skipped.push('kit.config.json');

const adoptMark = /<!-- engineering-kit adopt:v[\d.]+ START -->/;
const existingAgentsText = existingAgents ? readFileSync(join(target, 'AGENTS.md'), 'utf8') : '';
const mergeAgents = existingAgents && !adoptMark.test(existingAgentsText);

if (flags.dryRun) {
  console.log(`DRY RUN — ${target}\n  add: ${added.length ? added.join(', ') : '(none)'}`);
  console.log(`  skip (project-owned): ${skipped.length ? skipped.join(', ') : '(none)'}`);
  console.log(`  merge AGENTS.md with adopt block: ${mergeAgents}`);
  process.exit(0);
}

mkdirSync(target, { recursive: true });
const addedAbs = [];
for (const rel of added) {
  if (rel === 'kit.config.json') {
    const dest = join(target, rel);
    writeFileSync(dest, `${JSON.stringify(starterConfig, null, 2)}\n`);
    addedAbs.push(dest);
    continue;
  }
  const src = rel.startsWith('kit.config.') ? join(packageRoot, rel) : join(templateDir, rel);
  const dest = destOf(rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, readFileSync(src));
  addedAbs.push(dest);
}
// Template ships "gitignore" (npm strips dotfiles); only rename when we added it.
const plainGitignore = join(target, 'gitignore');
if (existsSync(plainGitignore)) renameSync(plainGitignore, join(target, '.gitignore'));

if (mergeAgents) {
  const dest = join(target, 'AGENTS.md');
  const block = `\n<!-- engineering-kit adopt:v${kitVersion} START -->\n`
    + `<!-- Injected by --adopt. Your existing content above is untouched. -->\n`
    + `## Workflow Contract (kit v${kitVersion})\n`
    + `1. Non-trivial work → plan in drafts/plans/<MMDDYY>_<n>_<status>/, then STOP for approval.\n`
    + `2. Execute exactly the approved plan; verify with real gates; fix until green.\n`
    + `3. Stop when green. Commit/push only with the owner's explicit word in that turn.\n`
    + `<!-- engineering-kit adopt:v${kitVersion} END -->\n`;
  writeFileSync(dest, `${readFileSync(dest, 'utf8').replace(/\s*$/, '')}\n${block}`);
}

if (flags.noSkills) {
  // Only strip directories this adopt run added — never user-owned skills.
  for (const dir of ['.claude/skills', '.claude/skills-disabled']) {
    if (added.includes(dir)) rmSync(join(target, dir), { recursive: true, force: true });
  }
}

replaceInFiles(addedAbs);
const drift = addedAbs.filter((f) => {
  const c = readFileSync(f, 'utf8');
  return c.includes('{{PROJECT_NAME}}') || c.includes('{{CHAT_LANGUAGE}}') || c.includes('{{KIT_VERSION}}');
});
if (drift.length > 0) console.warn(`⚠ Core placeholders left unreplaced in: ${drift.join(', ')}`);
printDone('adopted', added.length, skipped.length, mergeAgents ? 1 : 0);

// ---------- next steps ----------
function printDone(mode, addedCount, skippedCount, mergedCount) {
  console.log(`
✅ Engineering kit ${mode} into: ${target}
   Project: ${projectName} · agent chat language: ${chatLanguageLabel} · kit v${kitVersion}
   ${mode === 'adopted' ? `Added: ${addedCount} · skipped (project-owned): ${skippedCount} · AGENTS.md blocks merged: ${mergedCount}` : 'layers installed: prompt contract · context docs · loop · agentic roles · skills · workflow'}

Next steps (required — see SEED-NOTE.md):
  1. Fill kit.config.json: apps + gates + claims (schema: kit.config.schema.json)
  2. node scripts/verify.mjs --list → shows your gates; run without flags to verify
  3. Measure real numbers → docs/ai-context/TESTING_GUIDE.md §1 + AGENTS.md Quick Facts
  4. Read every docs/ai-context file — replace content that does not match your domain
  5. Fill the per-role markers in .claude/agents/*.md (see that folder's README)
  6. Skills: review triage per your stack; record sources in SKILL-SOURCES.md${flags.noSkills ? ' (--no-skills: add skills later)' : ''}
  7. git init (if not yet) + first commit
`);
}
