#!/usr/bin/env node
/**
 * doc-truth.mjs — compare the numbers written in docs with the REAL repo state.
 *
 * Config-driven: claims live in kit.config.json (array "claims", each item
 * { doc, re, kind }) — full field reference: kit.config.schema.json.
 *
 * Why it exists: in one seed-repo session, hand-written doc numbers drifted
 * 6 times (161 vs 183 tests · 1.594 vs 15.461 files · 433 vs 449 lines ...).
 * Nothing checked them; this gate is that check. It only verifies what is
 * 100% derivable from the repo (non-empty line counts, file existence) —
 * never prose, to avoid false positives.
 *
 * ⚠️ THE 3 HARD-WON MEASURING LESSONS (do NOT "optimize" them away):
 *  (a) Count NON-EMPTY lines: split on /\r?\n/ (CRLF-safe) and count lines
 *      !== ''. NEVER trim() a line — a spaces-only line is NON-empty and
 *      must be counted (same convention as `Get-Content | Measure-Object
 *      -Line`). Using trim() once skewed a count by ~15%.
 *  (b) File list = `git ls-files --cached --others --exclude-standard` =
 *      tracked + untracked-not-ignored = exactly the files about to be
 *      committed. Plain `git ls-files` (cached only) skips new files, so the
 *      gate PASSes mid-coding and FAILs right after commit (bit once).
 *  (c) Numbers in docs use the DOT as thousands separator: "5.670" = 5670,
 *      NOT 5.67. docNum() strips every dot before comparing.
 *
 * One line per claim (✓ PASS / ⚠ WARN / ✖ FAIL) + a summary. A claim whose
 * regex no longer matches is a WARNING (claim drift), not a failure.
 * Exit 0 = no FAIL · exit 1 = at least one FAIL.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const CONFIG_NAME = 'kit.config.json';

// ---------------------------------------------------------------- helpers

const useColor = (process.stdout.isTTY || process.stderr.isTTY) && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c('1', s), green = (s) => c('32', s), red = (s) => c('31', s);
const yellow = (s) => c('33', s), dim = (s) => c('2', s);

/** Lesson (c): "5.670" = 5670 — dots are thousands separators, strip them. */
function docNum(s) {
  return Number(String(s).replace(/\./g, ''));
}

/** Print a number back in the docs convention: 5670 -> "5.670". */
const fmtNum = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Lesson (a): non-empty line count, CRLF-safe, NO trim(). */
function countLines(text) {
  let n = 0;
  for (const l of text.split(/\r?\n/)) if (l !== '') n += 1;
  return n;
}

/** Lesson (b): tracked + untracked (not ignored) files, relative to root.
 *  `-z` keeps git from quoting non-ASCII paths. No git / not a repo -> []. */
function gitList(root, rel) {
  const args = ['ls-files', '-z', '--cached', '--others', '--exclude-standard'];
  if (rel) args.push('--', rel);
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) return [];
  return r.stdout.split('\0').filter((l) => l !== '');
}

/** Truth for kind "lines:<rel>": a single file -> its own count; a directory
 *  -> the sum over every git-listed file under it. Files git lists but the
 *  disk lacks (staged deletions, races) are skipped silently — never crash. */
function truthLines(root, rel) {
  const abs = path.join(root, rel);
  if (existsSync(abs) && statSync(abs).isFile()) return countLines(readFileSync(abs, 'utf8'));
  let total = 0;
  for (const f of gitList(root, rel)) {
    const fAbs = path.join(root, f);
    if (!existsSync(fAbs) || !statSync(fAbs).isFile()) continue;
    total += countLines(readFileSync(fAbs, 'utf8'));
  }
  return total;
}

/** Verify one claim. Returns { status: 'pass'|'warn'|'fail', text }. */
function checkClaim(root, claim) {
  const doc = typeof claim.doc === 'string' ? claim.doc : '';
  const reSrc = typeof claim.re === 'string' ? claim.re : '';
  const kind = typeof claim.kind === 'string' ? claim.kind : '';
  if (!doc || !reSrc || !kind) {
    return { status: 'warn', text: `malformed claim (doc/re/kind must all be strings): ${JSON.stringify(claim)}` };
  }
  const docAbs = path.join(root, doc);
  if (!existsSync(docAbs)) return { status: 'warn', text: `cannot read docs file: ${doc} · kind: ${kind}` };

  let re;
  try {
    re = new RegExp(reSrc, 'm');
  } catch (e) {
    return { status: 'warn', text: `regex does not compile: "${reSrc}" — ${e.message}` };
  }

  // Line-by-line so a FAIL can cite <doc>:<lineNo>; the first match wins.
  const lines = readFileSync(docAbs, 'utf8').split(/\r?\n/);
  let hit = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) { hit = { m, lineNo: i + 1 }; break; }
  }
  if (!hit) {
    return { status: 'warn', text: `claim drift (regex no longer matches) — check ${doc} or edit the claim in kit.config.json · kind: ${kind}` };
  }

  if (kind.startsWith('exists:')) {
    const target = kind.slice('exists:'.length).trim();
    if (!target) return { status: 'warn', text: `kind "exists:" has an empty target path — fix the claim in kit.config.json` };
    if (existsSync(path.join(root, target))) return { status: 'pass', text: `exists:${target} ← ${doc}:${hit.lineNo}` };
    return { status: 'fail', text: `✖ ${doc}:${hit.lineNo} · docs says: exists · actual: DOES NOT EXIST · kind: ${kind} · hint: re-measure (TESTING_GUIDE §1) then fix docs or claim` };
  }

  if (kind.startsWith('lines:')) {
    const target = kind.slice('lines:'.length).trim();
    if (!target) return { status: 'warn', text: `kind "lines:" has an empty target path — fix the claim in kit.config.json` };
    if (hit.m[1] === undefined) {
      return { status: 'warn', text: `claim "${kind}" matched but has no capture group 1 (the number to compare) — fix the regex in kit.config.json` };
    }
    const real = truthLines(root, target);
    if (docNum(hit.m[1]) === real) return { status: 'pass', text: `${fmtNum(real)} lines · ${target} ← ${doc}:${hit.lineNo}` };
    return { status: 'fail', text: `✖ ${doc}:${hit.lineNo} · docs says: ${fmtNum(docNum(hit.m[1]))} · actual: ${fmtNum(real)} · kind: ${kind} · hint: re-measure (TESTING_GUIDE §1) then fix docs or claim` };
  }

  return { status: 'warn', text: `unknown kind: "${kind}" (supported: lines:<path>, exists:<path>)` };
}

// ---------------------------------------------------------------- config

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

// ---------------------------------------------------------------- main

function main() {
  const configPath = findConfigPath();
  if (!configPath) {
    console.error(red('✖ kit.config.json not found (walked up from the current directory to the disk root).'));
    console.error(`
Create ${bold('kit.config.json')} at the repo root with a "claims" array, e.g.:

  {
    "project": { "name": "ten-du-an", "chatLanguage": "vi" },
    "claims": [
      { "doc": "docs/METRICS.md", "re": "^src: ([\\\\d.]+) lines", "kind": "lines:src" }
    ],
    "gates": []
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

  const claims = Array.isArray(config.claims) ? config.claims : [];

  console.log();
  console.log(bold('═'.repeat(64)));
  console.log(bold('  DOC-TRUTH — do the numbers in docs match reality?'));
  console.log(dim(`  ${configPath}`));
  console.log(bold('═'.repeat(64)));
  console.log();

  // Safe-by-default: empty claims = no-op, exit 0 (a fresh install must pass).
  if (claims.length === 0) {
    console.log(yellow('⚠ kit.config.json has no claims yet — doc-truth is a no-op'));
    console.log();
    console.log(bold('─'.repeat(64)));
    console.log(yellow('  TOTAL: 0 claims PASS · 1 WARNING · 0 FAIL'));
    console.log(bold('─'.repeat(64)));
    console.log();
    return 0;
  }

  let pass = 0, warns = 0, fails = 0;
  for (const claim of claims) {
    const r = checkClaim(root, claim ?? {});
    if (r.status === 'pass') { pass += 1; console.log(`${green('  ✓ PASS')} ${r.text}`); }
    else if (r.status === 'warn') { warns += 1; console.log(`${yellow('  ⚠ WARN')} ${r.text}`); }
    else { fails += 1; console.log(`  ${red(r.text)}`); }
  }

  console.log();
  console.log(bold('─'.repeat(64)));
  const summary = `  TOTAL: ${pass} claims PASS · ${warns} WARNING · ${fails} FAIL`;
  console.log(fails ? red(summary) : warns ? yellow(summary) : green(bold(summary)));
  console.log(bold('─'.repeat(64)));
  console.log();
  return fails ? 1 : 0;
}

process.exit(main());
