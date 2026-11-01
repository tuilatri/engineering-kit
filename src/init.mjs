#!/usr/bin/env node
/**
 * init.mjs — engineering-kit CLI.
 *
 * Copies template/ into the target project, generates a starter kit.config.json,
 * replaces core placeholders and prints next steps.
 *
 * Usage:
 *   engineering-kit init <target-dir> [--name <project>] [--lang vi|en] [--yes]
 *
 * Zero dependencies — Node >= 18 stdlib only. Windows-safe.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const templateDir = resolve(packageRoot, 'template');

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
  --help, -h         Show this help

Exit codes: 0 ok · 1 usage/environment error
`;

const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

// ---------- arg parsing ----------
const argv = process.argv.slice(2);
const flags = { name: null, lang: 'vi', yes: false, help: false, noSkills: false };
const positional = [];

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') flags.help = true;
  else if (a === '--yes') flags.yes = true;
  else if (a === '--no-skills') flags.noSkills = true;
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
if (existsSync(target) && existsSync(join(target, 'AGENTS.md'))) {
  die(`Target "${target}" already has AGENTS.md — aborting to avoid overwrite.`);
}

// ---------- copy ----------
mkdirSync(target, { recursive: true });
cpSync(templateDir, target, { recursive: true });
for (const f of ['kit.config.example.json', 'kit.config.schema.json']) {
  cpSync(join(packageRoot, f), join(target, f));
}

// ---------- npm-shipped gitignore ----------
// npm strips files named ".gitignore" from packages, so the template carries it
// as "gitignore" (no dot) and init renames it at the target.
const plainGitignore = join(target, 'gitignore');
if (existsSync(plainGitignore)) renameSync(plainGitignore, join(target, '.gitignore'));

// ---------- optional skill layer ----------
// Bundled by default ("foundation from the start"); --no-skills strips it.
// SKILL-SOURCES.md always ships — it documents provenance + how to add skills.
if (flags.noSkills) {
  rmSync(join(target, '.claude', 'skills'), { recursive: true, force: true });
  rmSync(join(target, '.claude', 'skills-disabled'), { recursive: true, force: true });
}

// ---------- starter kit.config.json ----------
const starterConfig = {
  project: { name: projectName, chatLanguage: flags.lang },
  apps: [],
  docPaths: { aiContext: 'docs/ai-context', agents: 'AGENTS.md', agentsConfig: 'docs/agents' },
  skillPaths: flags.noSkills ? [] : ['.claude/skills'],
  claims: [],
  gates: [],
};
writeFileSync(join(target, 'kit.config.json'), `${JSON.stringify(starterConfig, null, 2)}\n`);

// ---------- placeholder replacement ----------
const replaceInTree = (dir) => {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, f.name);
    if (f.isDirectory()) replaceInTree(full);
    else {
      const content = readFileSync(full, 'utf8');
      const replaced = content
        .split('{{PROJECT_NAME}}').join(projectName)
        .split('{{CHAT_LANGUAGE}}').join(chatLanguageLabel);
      if (replaced !== content) writeFileSync(full, replaced);
    }
  }
};
replaceInTree(target);

// ---------- leftover check ({{...}} markers are intentional fill-ins in role
// cards, e.g. {{VERIFY_FE}} — only core placeholders must be fully replaced) ----------
const leftover = [];
const checkLeftover = (dir) => {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, f.name);
    if (f.isDirectory()) checkLeftover(full);
    else {
      const content = readFileSync(full, 'utf8');
      if (content.includes('{{PROJECT_NAME}}') || content.includes('{{CHAT_LANGUAGE}}')) {
        leftover.push(full);
      }
    }
  }
};
checkLeftover(target);
if (leftover.length > 0) {
  console.warn(`⚠ Core placeholders left unreplaced in: ${leftover.join(', ')}`);
}

// ---------- next steps ----------
console.log(`
✅ Engineering kit copied into: ${target}
   Project: ${projectName} · agent chat language: ${chatLanguageLabel}

Next steps (required — see SEED-NOTE.md):
  1. Fill kit.config.json: apps + gates + claims (schema: kit.config.schema.json,
     full example: kit.config.example.json)
  2. node scripts/verify.mjs --list  → shows your gates; run without flags to verify
  3. Measure real numbers (test/line counts) → docs/ai-context/TESTING_GUIDE.md §1
     + AGENTS.md Quick Facts + the MODULE_MAP/FRONTEND_MAP tables
  4. Read every docs/ai-context file — replace content that does not match your domain
  5. Fill the per-role markers in .claude/agents/*.md ({{VERIFY_BE}}, {{VERIFY_FE}}…
     — see that folder's README); {{PROJECT_NAME}}/{{CHAT_LANGUAGE}} are already replaced
  6. Skills are bundled in .claude/skills/ (pool: skills-disabled/) — review the triage
     per your stack and record every source in SKILL-SOURCES.md${flags.noSkills ? ' (skipped this init: --no-skills — add skills later, manifest is ready)' : ''}
  7. git init (if not yet) + first commit
`);
