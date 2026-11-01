#!/usr/bin/env node
/**
 * lifecycle.mjs — end-to-end lifecycle test for engineering-kit.
 *
 * Steps:
 *  1. init --yes into a temp dir → expected file tree
 *  2. JSON.parse: kit.config.example.json + kit.config.schema.json (package) + kit.config.json (target)
 *  3. verify.mjs --list with 0 gates → exit 0 + warning
 *  4. verify.mjs with pass/fail gates → exit 0 / exit 3 (exit-code propagation) + --fast tag filtering
 *  5. doc-truth.mjs right/wrong claims → exit 0 / exit 1 (+ exists: kind)
 *  6. init ×2 → deterministic byte-identical output
 *  7. No leftover {{PROJECT_NAME}} / {{CHAT_LANGUAGE}} in target
 *  8. npm pack --dry-run → tarball has required files, excludes example/ + drafts/
 *  9. skills-integrity: bundled corpus complete, scrubbed, count == SKILL-SOURCES.md;
 *     --no-skills strips it and empties skillPaths
 *
 * Zero dependencies. Run: npm test  (or: node test/lifecycle.mjs)
 * Exit 0 = all pass, 1 = any failure. Temp dirs are always cleaned up.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const INIT = join(ROOT, 'src', 'init.mjs');

// ---------- tiny harness ----------
let failed = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '✓' : '✖'} ${name}${cond || !detail ? '' : ` — ${detail}`}`);
  if (!cond) failed++;
};
const section = (n, title) => console.log(`\n${'═'.repeat(64)}\n[${n}] ${title}\n${'═'.repeat(64)}`);

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const walk = (dir, base = dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else out.push(relative(base, full).split('\\').join('/'));
  }
  return out;
};

const npm = (...args) => spawnSync('npm', args, { cwd: ROOT, shell: process.platform === 'win32', encoding: 'utf8' });
const node = (script, args, cwd) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });

// ---------- temp workspace ----------
const work = mkdtempSync(join(tmpdir(), 'ek-lifecycle-'));
const targetA = join(work, 'demo-a');
const targetB = join(work, 'demo-b');
let exitCode = 1; // set by the summary; cleanup in finally runs regardless

try {
  // ── 1. init + file tree ────────────────────────────────────────────────
  section(1, 'init --yes --name demo --lang vi → file tree');
  const r1 = node(INIT, [targetA, '--yes', '--name', 'demo', '--lang', 'vi'], ROOT);
  ok('init exits 0', r1.status === 0, `status=${r1.status}\n${r1.stderr}`);
  ok('init prints project name', r1.stdout.includes('demo'));
  const expected = [
    'AGENTS.md', 'GLOSSARY.md', '.gitignore', '.engineering-kit', 'SKILL-SOURCES.md', 'kit.config.json', 'kit.config.example.json', 'kit.config.schema.json',
    '.claude/skills/README.md', '.claude/skills/clean-code/SKILL.md', '.claude/skills/pixijs/SKILL.md',
    '.claude/skills/impeccable/SKILL.md', '.claude/skills-disabled/README.md', '.claude/skills-disabled/triage/SKILL.md',
    'scripts/verify.mjs', 'scripts/doc-truth.mjs',
    'docs/agents/issue-tracker-local.md', 'docs/agents/triage-labels.md',
    'docs/ai-context/API_MAP.md', 'docs/ai-context/ARCHITECTURE.md', 'docs/ai-context/BEHAVIORAL_GUIDELINES.md',
    'docs/ai-context/FRONTEND_MAP.md', 'docs/ai-context/KNOWN_TRAPS.md', 'docs/ai-context/MODULE_MAP.md',
    'docs/ai-context/PROMPT_TEMPLATES.md', 'docs/ai-context/README.md', 'docs/ai-context/TESTING_GUIDE.md',
    'docs/ai-context/UI_UX_RULES.md',
    '.claude/agents/README.md', '.claude/agents/be-engineer.md', '.claude/agents/fe-engineer.md',
    '.claude/agents/qa-reviewer.md', '.claude/skills/README.md', '.claude/skills-disabled/README.md',
    '.agent/rules/README.md', '.opencode/skills/README.md',
  ];
  const tree = walk(targetA);
  for (const f of expected) ok(`has ${f}`, tree.includes(f));
  ok('AGENTS.md has project name', readFileSync(join(targetA, 'AGENTS.md'), 'utf8').includes('# AGENTS.md — demo'));
  ok('AGENTS.md has chat language', readFileSync(join(targetA, 'AGENTS.md'), 'utf8').includes('Vietnamese'));
  const marker = readFileSync(join(targetA, '.engineering-kit'), 'utf8');
  const pkgVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  ok('.engineering-kit marker stamped with kit version', marker.includes(`v${pkgVersion}`));

  // init refuses to overwrite an existing project
  const r1b = node(INIT, [targetA, '--yes'], ROOT);
  ok('init overwrite guard → exit 1', r1b.status === 1, `status=${r1b.status}`);
  ok('overwrite guard message', (r1b.stderr + r1b.stdout).includes('already has AGENTS.md'));

  // ── 2. JSON validity ───────────────────────────────────────────────────
  section(2, 'JSON validity (example + schema + starter config)');
  for (const f of ['kit.config.example.json', 'kit.config.schema.json']) {
    let valid = false; let err = '';
    try { JSON.parse(readFileSync(join(ROOT, f), 'utf8')); valid = true; } catch (e) { err = e.message; }
    ok(`${f} (package) is valid JSON`, valid, err);
  }
  let starterValid = false; let starterErr = ''; let starter = null;
  try { starter = JSON.parse(readFileSync(join(targetA, 'kit.config.json'), 'utf8')); starterValid = true; } catch (e) { starterErr = e.message; }
  ok('kit.config.json (target) is valid JSON', starterValid, starterErr);
  ok('starter has skillPaths [".claude/skills"]', starterValid && JSON.stringify(starter.skillPaths) === '[".claude/skills"]');

  // ── 3. verify --list with 0 gates ──────────────────────────────────────
  section(3, 'verify.mjs --list with 0 gates → exit 0 + warning');
  const r3 = node(join(targetA, 'scripts', 'verify.mjs'), ['--list'], targetA);
  ok('--list exits 0', r3.status === 0, `status=${r3.status}\n${r3.stderr}`);
  ok('--list warns about 0 gates', (r3.stdout + r3.stderr).includes('no gates'));

  // ── 4. verify gates: pass / fail exit-code / --fast ────────────────────
  section(4, 'verify.mjs with gates → exit 0 / exit 3 / --fast');
  const cfgPath = join(targetA, 'kit.config.json');
  const writeGates = (gates) => {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    cfg.gates = gates;
    writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
  };
  writeGates([{ id: 'always-pass', cmd: 'node', args: ['-e', 'process.exit(0)'] }]);
  const r4a = node(join(targetA, 'scripts', 'verify.mjs'), [], targetA);
  ok('single passing gate → exit 0', r4a.status === 0, `status=${r4a.status}\n${r4a.stderr}`);
  ok('PASS line printed', r4a.stdout.includes('always-pass') && r4a.stdout.includes('PASS'));

  writeGates([
    { id: 'gate-pass', cmd: 'node', args: ['-e', 'process.exit(0)'] },
    { id: 'gate-fail', cmd: 'node', args: ['-e', 'process.exit(3)'] },
    { id: 'gate-never', cmd: 'node', args: ['-e', 'process.exit(1)'] },
  ]);
  const r4b = node(join(targetA, 'scripts', 'verify.mjs'), [], targetA);
  ok('fail-fast propagates exit code 3', r4b.status === 3, `status=${r4b.status}`);
  ok('gate-never never ran (fail-fast)', !r4b.stdout.includes('gate-never') || r4b.stdout.indexOf('gate-never') > r4b.stdout.indexOf('FAIL'));

  writeGates([
    { id: 'slow-fail', cmd: 'node', args: ['-e', 'process.exit(2)'], tags: ['slow'] },
    { id: 'quick-pass', cmd: 'node', args: ['-e', 'process.exit(0)'] },
  ]);
  const r4c = node(join(targetA, 'scripts', 'verify.mjs'), ['--fast'], targetA);
  ok('--fast excludes tag "slow" → exit 0', r4c.status === 0, `status=${r4c.status}\n${r4c.stderr}`);
  ok('--fast skipped slow-fail', !r4c.stdout.includes('slow-fail'));

  // preflight: a gate whose requires path is missing blocks the whole run
  writeGates([{ id: 'needs-venv', cmd: 'node', args: ['-e', 'process.exit(0)'], requires: ['missing-dir-xyz'] }]);
  const r4d = node(join(targetA, 'scripts', 'verify.mjs'), [], targetA);
  ok('preflight missing requires → exit 1', r4d.status === 1, `status=${r4d.status}`);
  ok('preflight names the missing path', r4d.stdout.includes('missing-dir-xyz'));
  ok('preflight ran no gates', !r4d.stdout.includes('PASS'));

  // --only with an unknown id → "no match" warning (not the "no gates yet" one)
  writeGates([{ id: 'real-gate', cmd: 'node', args: ['-e', 'process.exit(0)'] }]);
  const r4e = node(join(targetA, 'scripts', 'verify.mjs'), ['--only', 'no-such-id'], targetA);
  ok('--only unknown id → exit 0', r4e.status === 0, `status=${r4e.status}`);
  ok('--only unknown id → "No gates match" message', (r4e.stdout + r4e.stderr).includes('No gates match'));

  // ── 5. doc-truth: claims right / wrong / exists ────────────────────────
  section(5, 'doc-truth.mjs right/wrong claims → exit 0 / exit 1');
  // real git repo (doc-truth lists files via git) + sample facts
  spawnSync('git', ['init', '-q'], { cwd: targetA, shell: process.platform === 'win32' });
  mkdirSync(join(targetA, 'src'), { recursive: true });
  writeFileSync(join(targetA, 'src', 'app.py'), Array.from({ length: 12 }, (_, i) => `line ${i}\n`).join(''));
  mkdirSync(join(targetA, 'docs', 'sample'), { recursive: true });
  writeFileSync(join(targetA, 'docs', 'sample', 'facts.md'), '## backend — FastAPI · 12 lines\n');
  const writeClaims = (claims) => {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    cfg.claims = claims;
    writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
  };
  const docTruth = (args = []) => node(join(targetA, 'scripts', 'doc-truth.mjs'), args, targetA);

  writeGates([]); // doc-truth does not need gates
  writeClaims([
    { doc: 'docs/sample/facts.md', re: '^## backend — .* · ([\\d.]+) lines', kind: 'lines:src' },
    { doc: 'docs/sample/facts.md', re: '^## backend', kind: 'exists:src/app.py' },
  ]);
  const r5a = docTruth();
  ok('truthful claims → exit 0', r5a.status === 0, `status=${r5a.status}\n${r5a.stdout}\n${r5a.stderr}`);
  ok('both claims actually PASS (no hidden drift)', /TOTAL: 2 claims PASS · 0 WARNING · 0 FAIL/.test(r5a.stdout), r5a.stdout);

  writeClaims([{ doc: 'docs/sample/facts.md', re: '^## backend — .* · ([\\d.]+) lines', kind: 'lines:src' }]);
  writeFileSync(join(targetA, 'docs', 'sample', 'facts.md'), '## backend — FastAPI · 99 lines\n');
  const r5b = docTruth();
  ok('wrong number → exit 1', r5b.status === 1, `status=${r5b.status}`);
  ok('FAIL line shows docs says 99 / actual 12', r5b.stdout.includes('99') && r5b.stdout.includes('12'));

  writeClaims([{ doc: 'docs/sample/facts.md', re: '^NO-SUCH-HEADING .* · ([\\d.]+)', kind: 'lines:src' }]);
  const r5c = docTruth();
  ok('regex drift → warning, still exit 0', r5c.status === 0 && /drift|WARNING|⚠/.test(r5c.stdout + r5c.stderr), `status=${r5c.status}\n${r5c.stdout}\n${r5c.stderr}`);

  writeClaims([{ doc: 'docs/sample/facts.md', re: '^## backend', kind: 'exists:src/missing.py' }]);
  const r5d = docTruth();
  ok('exists-claim on missing file → exit 1', r5d.status === 1, `status=${r5d.status}`);

  // ── 6. determinism: two FRESH inits byte-identical ─────────────────────
  section(6, 'deterministic init ×2 (both fresh)');
  const targetC = join(work, 'demo-c');
  const r6b = node(INIT, [targetB, '--yes', '--name', 'demo', '--lang', 'vi'], ROOT);
  ok('second init exits 0', r6b.status === 0, `status=${r6b.status}\n${r6b.stderr}`);
  const r6c = node(INIT, [targetC, '--yes', '--name', 'demo', '--lang', 'vi'], ROOT);
  ok('third init exits 0', r6c.status === 0, `status=${r6c.status}\n${r6c.stderr}`);
  // NOTE: targetA was mutated by sections 4–5 (fixture files, edited config) —
  // determinism compares two untouched inits (targetB vs targetC).
  const treeB = walk(targetB).filter((f) => !f.startsWith('.git/'));
  const treeC = walk(targetC).filter((f) => !f.startsWith('.git/'));
  ok('same file list', JSON.stringify(treeB) === JSON.stringify(treeC));
  let contentDiff = '';
  for (const f of treeB) {
    if (sha256(join(targetB, f)) !== sha256(join(targetC, f))) contentDiff = `${contentDiff} ${f}`;
  }
  ok('byte-identical contents', contentDiff === '', contentDiff);

  // ── 7. no leftover core placeholders ───────────────────────────────────
  section(7, 'no leftover {{PROJECT_NAME}} / {{CHAT_LANGUAGE}}');
  const leftover = [];
  for (const f of walk(targetB)) {
    const c = readFileSync(join(targetB, f), 'utf8');
    if (c.includes('{{PROJECT_NAME}}') || c.includes('{{CHAT_LANGUAGE}}')) leftover.push(f);
  }
  ok('0 leftover core placeholders', leftover.length === 0, leftover.join(', '));

  // ── 8. npm pack: contents correct, no example/ + drafts/ ───────────────
  section(8, 'npm pack --dry-run → tarball contents');
  const r8 = npm('pack', '--dry-run', '--json');
  ok('npm pack exits 0', r8.status === 0, r8.stderr);
  let files = [];
  let packSize = 0;
  try {
    const parsed = JSON.parse(r8.stdout);
    const entry = Array.isArray(parsed) ? parsed[0] : parsed;
    files = (entry.files ?? []).map((f) => f.path);
    packSize = entry.size ?? 0;
  } catch { /* handled below */ }
  ok('tarball lists files', files.length > 0, `parsed ${files.length} files`);
  for (const f of ['package.json', 'src/init.mjs', 'template/AGENTS.md', 'template/scripts/verify.mjs',
    'template/scripts/doc-truth.mjs', 'kit.config.example.json', 'kit.config.schema.json', 'README.md', 'SEED-NOTE.md',
    'template/gitignore']) {
    ok(`tarball has ${f}`, files.includes(f));
  }
  // npm strips ".gitignore" from packages — that is why the template ships "gitignore"
  // and init renames it at the target (asserted in section 1).
  ok('tarball excludes template/.gitignore (npm behavior)', !files.includes('template/.gitignore'));
  ok('tarball excludes example/', !files.some((f) => f.startsWith('example/')));
  ok('tarball excludes drafts/', !files.some((f) => f.startsWith('drafts/')));
  ok('tarball excludes docs/plans', !files.some((f) => f.startsWith('docs/plans')));
  for (const f of ['template/SKILL-SOURCES.md', 'template/.claude/skills/clean-code/SKILL.md',
    'template/.claude/skills/pixijs/SKILL.md']) {
    ok(`tarball has ${f}`, files.includes(f));
  }
  if (packSize > 0) {
    console.log(`  (tarball size: ${(packSize / 1024 / 1024).toFixed(1)} MB)`);
  }

  // ── 9. skills-integrity: bundled corpus complete + scrubbed + manifest sync ─
  section(9, 'skills-integrity + --no-skills opt-out');
  const skillsRoot = join(targetA, '.claude', 'skills');
  const poolRoot = join(targetA, '.claude', 'skills-disabled');
  const skillDirs = readdirSync(skillsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const poolDirs = readdirSync(poolRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  ok('95 active skill dirs (matches SKILL-SOURCES.md)', skillDirs.length === 95, `got ${skillDirs.length}`);
  ok('13 pool dirs (matches SKILL-SOURCES.md)', poolDirs.length === 13, `got ${poolDirs.length}`);
  const manifest = readFileSync(join(ROOT, 'SKILL-SOURCES.md'), 'utf8'); // root = manifest with real numbers; target ships the MEASURE template
  ok('manifest (root) declares Active total: 95', manifest.includes('Active total: **95 skill dirs**'));
  ok('manifest (root) declares pool: 13', manifest.includes('pool: **13 dirs**'));
  ok('manifest (target) is the MEASURE template', readFileSync(join(targetA, 'SKILL-SOURCES.md'), 'utf8').includes('MEASURE'));
  const missingSkillMd = skillDirs.filter((d) => !existsSync(join(skillsRoot, d, 'SKILL.md')));
  ok('every active dir has SKILL.md', missingSkillMd.length === 0, missingSkillMd.join(', '));
  ok('no gitnexus vendored', !skillDirs.includes('gitnexus'));
  ok('tdd dedupe: tdd-workflow not active', !skillDirs.includes('tdd-workflow'));
  ok('tdd dedupe: test-driven-development not active', !skillDirs.includes('test-driven-development'));
  ok('tdd dedupe: both live in the pool', poolDirs.includes('tdd-workflow') && poolDirs.includes('test-driven-development'));
  // scrub gates — ALL file types; allowlists are documented in SKILL-SOURCES.md
  const readRel = (root, f) => readFileSync(join(root, f), 'utf8');
  const collect = (pred) => [skillsRoot, poolRoot].flatMap((root) => walk(root)
    .filter((f) => pred(f, readRel(root, f)))
    .map((f) => `${basename(root)}/${f}`));
  const badTilde = collect((f, c) => f.endsWith('.md') && c.includes('~/'))
    .filter((f) => !f.startsWith('skills/git-guardrails-claude-code/'));
  ok('no ~/ global-path claims in skill docs (allowlist: git-guardrails runtime paths)', badTilde.length === 0, badTilde.join(', '));
  const badAgent = collect((f, c) => /\.agent[/\\]/.test(c));
  ok('no .agent/ legacy refs (all file types)', badAgent.length === 0, badAgent.join(', '));
  const badKitPath = collect((f, c) => /template[/\\]\.claude[/\\]skills/.test(c));
  ok('no kit-repo-relative template/ paths (must be .claude/skills)', badKitPath.length === 0, badKitPath.join(', '));
  const dataAllow = ['ui-ux-pro-max/data/products.csv', 'ui-ux-pro-max/data/ui-reasoning.csv'];
  const badNames = collect((f, c) => !dataAllow.some((a) => f.startsWith(a))
    && /api-designer|CREATION-LOG|threejs-mastery|cozy|couch|book_|BooK_/i.test(c));
  ok('no dangling refs / seed names (allowlist: 2 third-party CSV data rows)', badNames.length === 0, badNames.join(', '));
  const junk = collect((f) => /__pycache__|\.pyc$|\.DS_Store|Thumbs\.db/i.test(f));
  ok('no junk files in the corpus', junk.length === 0, junk.join(', '));

  // --no-skills: corpus stripped, manifest still ships, starter skillPaths empty
  const targetD = join(work, 'demo-d');
  const r9 = node(INIT, [targetD, '--yes', '--name', 'demo', '--lang', 'vi', '--no-skills'], ROOT);
  ok('init --no-skills exits 0', r9.status === 0, `status=${r9.status}\n${r9.stderr}`);
  ok('--no-skills: no .claude/skills dir', !existsSync(join(targetD, '.claude', 'skills')));
  ok('--no-skills: no .claude/skills-disabled dir', !existsSync(join(targetD, '.claude', 'skills-disabled')));
  ok('--no-skills: SKILL-SOURCES.md still ships', existsSync(join(targetD, 'SKILL-SOURCES.md')));
  const cfgD = JSON.parse(readFileSync(join(targetD, 'kit.config.json'), 'utf8'));
  ok('--no-skills: starter skillPaths = []', JSON.stringify(cfgD.skillPaths) === '[]');

  // ── summary ────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(64)}`);
  if (failed === 0) console.log('✅ LIFECYCLE: ALL CHECKS PASS');
  else console.log(`✖ LIFECYCLE: ${failed} check FAIL`);
  console.log('═'.repeat(64));
  exitCode = failed === 0 ? 0 : 1;
} finally {
  // Windows can hold read-only handles on .git objects briefly — retry.
  rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
process.exit(exitCode);
