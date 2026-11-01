#!/usr/bin/env node
/**
 * verify.mjs — run every gate of the repo with one command (config-driven).
 *
 * Gates are NOT hardcoded: they live in kit.config.json (array "gates");
 * full field reference: kit.config.schema.json. Flags:
 *   --list            print the gate table (id, cwd, tags) and exit 0
 *   --fast            skip gates tagged "slow"
 *   --only <id>       run a single gate
 *   --skip <id>       skip a gate (repeatable)
 *   --help | -h       this help
 *
 * Exit codes: 0 all pass · failed gate's own exit code · 1 config/env error ·
 * 130 SIGINT (the running child receives the signal and is killed).
 *
 * House rules inherited from the seed repo:
 *  1. Every relative path (gate.cwd, gate.requires) resolves against the
 *     directory CONTAINING kit.config.json, not process.cwd() — the script
 *     works from any subdirectory, git hooks and CI included.
 *  2. Serial + fail-fast, never parallel: tests/builds write the same
 *     artifacts (.next/, caches, test DBs) and eat each other's CPU.
 *  3. Windows: a cmd ending in .cmd/.bat (npm, npx, ...) spawns with
 *     shell:true; anything else spawns with shell:false so paths with
 *     spaces are never shell-mangled.
 *  4. Preflight (gate.requires) runs BEFORE any gate: a missing venv or
 *     node_modules aborts with exit 1 instead of a confusing half-run.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CONFIG_NAME = 'kit.config.json';
const IS_WIN = process.platform === 'win32';

// ---------------------------------------------------------------- helpers

const useColor = (process.stdout.isTTY || process.stderr.isTTY) && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c('1', s), green = (s) => c('32', s), red = (s) => c('31', s);
const yellow = (s) => c('33', s), dim = (s) => c('2', s);
const sec = (v) => `${Math.round(v)}s`;

// Ctrl+C: forward the signal to the running child and exit 130 — never leave
// an orphan dev server / pytest running behind the prompt.
let currentChild = null;
let interrupted = false;
process.on('SIGINT', () => {
  interrupted = true;
  try { currentChild?.kill('SIGINT'); } catch { /* ignore */ }
});

function runGate(gate, root) {
  return new Promise((resolve) => {
    const ext = path.extname(gate.cmd).toLowerCase();
    // Windows: extension-less commands (npm, npx, python, node, git — bare or
    // scoped like scripts/x.cmd) and .cmd/.bat wrappers must run through
    // cmd.exe, which resolves PATHEXT (npm -> npm.cmd); anything with a concrete
    // extension (.exe, .py, ...) spawns directly so paths with spaces are never
    // shell-mangled.
    const useShell = IS_WIN && (ext === '' || ext === '.cmd' || ext === '.bat');
    // cmd.exe cannot resolve forward slashes in the command token ("scripts/x.cmd"
    // -> "'scripts' is not recognized"): normalize to backslashes when shelling.
    const command = useShell && IS_WIN ? gate.cmd.replace(/\//g, '\\') : gate.cmd;
    // With shell:true Node joins args unquoted — quote anything containing
    // whitespace ourselves. Gates are trusted repo config (same trust level as
    // npm scripts), so this is about correct quoting, not sanitization.
    const quoteArg = (a) => (/\s|^$/.test(a) ? `"${a}"` : a);
    const child = spawn(
      useShell ? [command, ...gate.args.map(quoteArg)].join(' ') : command,
      useShell ? [] : gate.args,
      {
        cwd: path.resolve(root, gate.cwd),
        shell: useShell,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', ...gate.env },
      },
    );
    currentChild = child;
    const collect = (d) => process.stdout.write(d);
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', () => { currentChild = null; resolve({ code: 127 }); }); // cmd not found
    child.on('close', (code) => {
      currentChild = null;
      resolve({ code: interrupted ? 130 : (code ?? 1) });
    });
  });
}

// ---------------------------------------------------------------- config

// Walk UP from process.cwd() until kit.config.json shows up (or the disk root).
function findConfigPath() {
  let dir = process.cwd();
  for (;;) {
    const candidate = path.join(dir, CONFIG_NAME);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Accept a minimal config; throw on structurally broken gates. The schema
// documents the strict shape — this is just a friendly runtime check.
function normalizeGates(config) {
  const raw = Array.isArray(config.gates) ? config.gates : [];
  return raw.map((g, i) => {
    if (!g || typeof g !== 'object') throw new Error(`gates[${i}] must be an object`);
    if (typeof g.id !== 'string' || !g.id) throw new Error(`gates[${i}].id must be a non-empty string`);
    if (typeof g.cmd !== 'string' || !g.cmd) throw new Error(`gates[${i}].cmd must be a non-empty string`);
    return {
      id: g.id,
      cmd: g.cmd,
      args: Array.isArray(g.args) ? g.args.map(String) : [],
      cwd: typeof g.cwd === 'string' && g.cwd ? g.cwd : '.',
      tags: Array.isArray(g.tags) ? g.tags.map(String) : [],
      requires: Array.isArray(g.requires) ? g.requires.map(String) : [],
      env: g.env && typeof g.env === 'object' && !Array.isArray(g.env) ? { ...g.env } : {},
      optional: g.optional === true,
    };
  });
}

function filterGates(gates, flags) {
  let out = gates;
  if (flags.fast) out = out.filter((g) => !g.tags.includes('slow'));
  if (flags.only) out = out.filter((g) => g.id === flags.only);
  if (flags.skip.length) out = out.filter((g) => !flags.skip.includes(g.id));
  return out;
}

// ---------------------------------------------------------------- output

function printGateTable(gates, configPath) {
  console.log();
  console.log(bold('═'.repeat(64)));
  console.log(bold(`  VERIFY — ${gates.length} gates (kit.config.json)`));
  console.log(dim(`  ${configPath}`));
  console.log(bold('═'.repeat(64)));
  console.log(dim('  #   ID                       CWD           TAGS'));
  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    console.log(`  ${String(i + 1).padEnd(4)}${g.id.padEnd(25)}${g.cwd.padEnd(14)}${dim(g.tags.join(',') || '-')}`);
  }
  console.log();
}

function printHelp() {
  console.log(`
${bold('verify.mjs')} — run every gate declared in kit.config.json (serial, fail-fast).

${bold('Usage:')}
  node scripts/verify.mjs              Run all gates (stop at the first failure)
  node scripts/verify.mjs --list       Print the gate table (id · cwd · tags) and exit
  node scripts/verify.mjs --fast       Skip gates tagged "slow"
  node scripts/verify.mjs --only <id>  Run only gate <id>
  node scripts/verify.mjs --skip <id>  Skip gate <id> (repeatable: --skip a --skip b)
  node scripts/verify.mjs --help       This help

${bold('Where gates are declared:')}
  kit.config.json — the "gates" array. Field reference: kit.config.schema.json.
  The script walks up from the current directory to find kit.config.json; every
  relative path (cwd, requires) resolves against the directory holding the config.

${bold('Exit codes:')}
  0       all gates pass (a failed "optional": true gate does not change it)
  other   exit code of the first failed gate
  1       config / env error (config not found, invalid JSON, preflight missing paths)
  130     Ctrl+C (SIGINT) — the running gate receives the signal and is killed
`);
}

// ---------------------------------------------------------------- main

async function main() {
  const argv = process.argv.slice(2);
  const flags = { help: false, fast: false, list: false, only: null, skip: [] };
  const badFlag = (msg) => {
    console.error(red(`✖ verify.mjs: ${msg}`));
    console.error('  See valid flags: node scripts/verify.mjs --help');
    return 1;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--fast') flags.fast = true;
    else if (a === '--list') flags.list = true;
    else if (a === '--only' || a === '--skip') {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) return badFlag(`flag ${a} needs a value <id>`);
      if (a === '--only') flags.only = v;
      else flags.skip.push(v);
      i += 1;
    } else return badFlag(`unrecognized flag: "${a}"`);
  }
  if (flags.help) { printHelp(); return 0; }

  // ---- config discovery (walk up from cwd)
  const configPath = findConfigPath();
  if (!configPath) {
    console.error(red('✖ kit.config.json not found (walked up from the current directory to the disk root).'));
    console.error(`
Create ${bold('kit.config.json')} at the repo root, minimal:

  {
    "project": { "name": "ten-du-an", "chatLanguage": "vi" },
    "apps": [],
    "claims": [],
    "gates": [
      { "id": "smoke", "cmd": "node", "args": ["-e", "process.exit(0)"], "cwd": "." }
    ]
  }

Full schema (every field documented): ${bold('kit.config.schema.json')}`);
    return 1;
  }
  const root = path.dirname(configPath);

  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error(red(`✖ kit.config.json is not valid JSON: ${e.message}`));
    console.error(`  ${configPath}`);
    return 1;
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    console.error(red('✖ kit.config.json must be a JSON object (not an array/scalar).'));
    return 1;
  }
  let allGates;
  try {
    allGates = normalizeGates(config);
  } catch (e) {
    console.error(red(`✖ kit.config.json — malformed "gates" array: ${e.message}`));
    console.error('  See schema: kit.config.schema.json');
    return 1;
  }

  const gates = filterGates(allGates, flags);

  // ---- 0 gates after filtering -> warning + exit 0 (safe-by-default: a fresh
  //      install with an unfilled config must never fail)
  if (gates.length === 0) {
    if (allGates.length > 0 && (flags.fast || flags.only || flags.skip.length)) {
      console.log(yellow('⚠ No gates match the active filters (--fast / --only / --skip).'));
    } else {
      console.log(yellow('⚠ kit.config.json has no gates yet — fill the "gates" array (see kit.config.schema.json)'));
    }
    return 0;
  }
  if (flags.list) { printGateTable(gates, configPath); return 0; }

  const project = config.project && typeof config.project.name === 'string' ? config.project.name : path.basename(root);
  console.log();
  console.log(bold('═'.repeat(64)));
  console.log(bold(`  VERIFY — ${project}`));
  console.log(`  ${gates.length} gates · ${dim(configPath)}${flags.fast ? dim('  (--fast: skipping tag "slow")') : ''}`);
  console.log(bold('═'.repeat(64)));
  console.log();

  // ---- preflight: ALL requires of ALL gates to run, before running any
  const missing = [];
  for (const g of gates) for (const req of g.requires) {
    if (!existsSync(path.resolve(root, req))) missing.push({ id: g.id, req });
  }
  if (missing.length) {
    console.log(red(bold('  ✖ PREFLIGHT — missing paths required by gates:')));
    for (const m of missing) console.log(`    ${yellow('•')} ${m.req} ${dim(`(gate: ${m.id})`)}`);
    console.log();
    console.log(dim('  Hint: create the missing paths (venv, node_modules, build artifacts) and re-run.'));
    console.log(red('  No gate was run. Exit 1.'));
    console.log();
    return 1;
  }

  // ---- run serially, fail-fast
  const results = [];
  let optionalWarns = 0;
  const t0 = Date.now();
  for (let i = 0; i < gates.length; i++) {
    if (interrupted) break;
    const g = gates[i];
    console.log(dim(`  [${i + 1}/${gates.length}] ${g.id} (~${g.cwd})`));
    const started = Date.now();
    const r = await runGate(g, root);
    results.push({ id: g.id, code: r.code });
    const took = sec((Date.now() - started) / 1000);

    if (r.code === 0) {
      console.log(`${green('  ✓ PASS')} ${g.id} ${dim(`(${took})`)}`);
    } else if (g.optional) {
      // Optional gate: warn and continue — it never changes the exit code.
      optionalWarns += 1;
      console.log(`${yellow('  ⚠ WARN')} ${g.id} ${dim(`(optional, exit ${r.code})`)}`);
    } else {
      const passed = results.filter((x) => x.code === 0).length;
      console.log(`${red('  ✖ FAIL')} ${g.id} ${dim(`(exit ${r.code})`)}`);
      console.log();
      console.log(bold('─'.repeat(64)));
      console.log(red(`  TOTAL: ${passed}/${gates.length} PASS · ${sec((Date.now() - t0) / 1000)} · STOPPED at "${g.id}"`));
      console.log(bold('─'.repeat(64)));
      console.log();
      return r.code;
    }
    console.log();
  }

  const passed = results.filter((x) => x.code === 0).length;
  console.log(bold('─'.repeat(64)));
  if (interrupted) {
    console.log(yellow(`  TOTAL: ${passed}/${gates.length} PASS · ${sec((Date.now() - t0) / 1000)} · STOPPED at Ctrl+C`));
    console.log(bold('─'.repeat(64)));
    console.log();
    return 130;
  }
  const totalLine = `  TOTAL: ${passed}/${gates.length} PASS · ${sec((Date.now() - t0) / 1000)}${optionalWarns ? ` · ${optionalWarns} optional WARN` : ''}`;
  console.log(optionalWarns ? yellow(bold(totalLine)) : green(bold(totalLine)));
  console.log(bold('─'.repeat(64)));
  console.log();
  return 0;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(red(`verify.mjs unexpected error: ${e && e.message ? e.message : e}`));
  process.exit(1);
});
