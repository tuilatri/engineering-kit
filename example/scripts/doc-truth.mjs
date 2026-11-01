#!/usr/bin/env node
/**
 * doc-truth.mjs — so số liệu ghi trong docs với THỰC TẾ.
 *
 * Vì sao tồn tại: trong 1 phiên làm việc, số liệu trong docs sai lệch 6 lần
 * (161 vs 183 test · 1.594 vs 15.461 file · 433 vs 449 dòng · ...). Nguyên nhân
 * là số viết TAY, không có gì kiểm. Gate này đóng vai trò đó.
 *
 * Nguyên tắc:
 *   - KHÔNG hardcode số liệu — script tự tính "sự thật" rồi so.
 *   - CHỈ kiểm cái suy ra được 100% (số dòng / số file / số test). Không kiểm
 *     mô tả chữ ⇒ tránh false positive.
 *   - Sai ⇒ in ra `file:line` + giá trị doc + giá trị thật ⇒ sửa 1 dòng là xong.
 *
 * Usage:
 *   node scripts/doc-truth.mjs
 *
 * ⚠️ Quy ước đo dòng (giống hệt `MODULE_MAP.md`):
 *   "dòng không rỗng" — `Get-Content <file> | Measure-Object -Line`.
 *   PowerShell đếm dòng RỗNG là 0, dòng CHỈ KHOẢNG TRẮNG vẫn là 1.
 *   ⇒ bộ đếm ở đây dùng `l !== ''` (KHÔNG dùng trim() — sẽ lệch!).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_WIN = process.platform === 'win32';

// ---------------------------------------------------------------- helpers

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c('1', s);
const green = (s) => c('32', s);
const red = (s) => c('31', s);
const yellow = (s) => c('33', s);
const dim = (s) => c('2', s);
const cyan = (s) => c('36', s);

const problems = [];
const warnings = [];

function fail(where, expected, actual, hint) {
  problems.push({ where, expected, actual, hint });
}

function warn(where, note) {
  warnings.push({ where, note });
}

function read(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

/** Số dòng "không rỗng" — đúng quy ước `Get-Content | Measure-Object -Line`.
 *
 * ⚠️ PHẢI bỏ '\r' TRƯỚC khi đếm: file trong repo dùng CRLF ⇒ một dòng "rỗng"
 * đọc ra là "\r" (không phải "") ⇒ nếu không bỏ, dòng rỗng cũng bị tính ⇒
 * lệch ~15% (đã mắc lỗi này 1 lần).
 * ⚠️ KHÔNG dùng trim(): dòng CHỈ CÓ KHOẢNG TRẮNG phải được tính (PowerShell
 * đếm nó là 1 dòng).
 */
function countLines(text) {
  const raw = text.split('\n');
  // File thường kết thúc bằng newline => phần tử cuối là rỗng, KHÔNG tính.
  if (raw.length && raw[raw.length - 1] === '') raw.pop();
  let n = 0;
  for (let l of raw) {
    if (l.endsWith('\r')) l = l.slice(0, -1);
    if (l !== '') n += 1;
  }
  return n;
}

function gitLines(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) return [];
  return r.stdout.split('\n').filter((l) => l !== '');
}

// ⚠️ PHẢI gồm cả file CHƯA tracked (untracked, không bị ignore) — vì đó là file
// **sắp được commit**. Nếu chỉ dùng `git ls-files` thì file mới bị bỏ qua ⇒ gate
// PASS lúc đang code nhưng FAIL ngay sau khi commit (đã mắc lỗi này 1 lần 21/10).
// `--others --exclude-standard` = untracked, bỏ qua file trong .gitignore.
const FILES = new Set(gitLines(['ls-files', '--cached', '--others', '--exclude-standard']));
const lsIn = (dir) => gitLines(['ls-files', '--cached', '--others', '--exclude-standard', dir]);

// ---------------------------------------------------------------- truth

const lineCache = new Map();
function linesOf(rel) {
  if (!lineCache.has(rel)) {
    const abs = path.join(ROOT, rel);
    lineCache.set(rel, existsSync(abs) ? countLines(readFileSync(abs, 'utf8')) : null);
  }
  return lineCache.get(rel);
}

const dirs = {
  'backend/app': lsIn('backend/app'),
  'backend/tests': lsIn('backend/tests'),
  'frontend/src': lsIn('frontend/src'),
  backend: lsIn('backend'),
  mobile: lsIn('mobile'),
};
// mobile/ chỉ tính file SOURCE (.ts/.tsx) — quy ước của repo (không tính
// package.json / app.json / tsconfig.json / package-lock.json).
dirs.mobile = lsIn('mobile').filter((f) => /\.tsx?$/.test(f));

function sumLines(files) {
  let t = 0;
  for (const f of files) t += linesOf(f) ?? 0;
  return t;
}

const truth = {
  'lines:backend/app': sumLines(dirs['backend/app']),
  'lines:backend/tests': sumLines(dirs['backend/tests']),
  'lines:frontend/src': sumLines(dirs['frontend/src']),
  'lines:backend': sumLines(dirs.backend),
  'lines:mobile': sumLines(dirs.mobile),
  'files:backend/tests': dirs['backend/tests'].length,
  'files:frontend/src': dirs['frontend/src'].length,
  'files:mobile': dirs.mobile.length,
  'files:ui': lsIn('frontend/src/components/ui').length,
};

// ---------------------------------------------------------------- test counts

function findVenvPython() {
  const rel = IS_WIN
    ? path.join('backend', '.venv', 'Scripts', 'python.exe')
    : path.join('backend', '.venv', 'bin', 'python');
  const p = path.join(ROOT, rel);
  return existsSync(p) ? p : null;
}

let testItems = null;
let testFuncs = null;
{
  const PY = findVenvPython();
  if (!PY) {
    warn('test counts', 'khong co backend/.venv => bo qua so test (CI co venv)');
  } else {
    const r = spawnSync(PY, ['-m', 'pytest', 'tests/', '--collect-only', '-q'], {
      cwd: path.join(ROOT, 'backend'),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const m = out.match(/(\d+) tests? collected/);
    if (m) testItems = Number(m[1]);
    else warn('test counts', `khong doc duoc so item tu pytest: ${out.trim().slice(-160)}`);

    // So HAM: dem SO DONG chua "def test_" trong backend/tests/*.py
    // (giong `Select-String 'def test_'` — kiem theo DONG, khong theo so lan xuat hien).
    let n = 0;
    for (const f of lsIn('backend/tests')) {
      if (!f.endsWith('.py')) continue;
      n += read(f).split('\n').filter((l) => l.includes('def test_')).length;
    }
    testFuncs = n;
  }
}
if (testItems !== null) truth['test:items'] = testItems;
if (testFuncs !== null) truth['test:funcs'] = testFuncs;

// ---------------------------------------------------------------- A1: per-file lines trong MODULE_MAP

const ROOT_PREFIXES = ['backend', 'frontend', 'mobile'];

function sectionBases(heading, parentBase) {
  // Token trong backtick: `backend/app/api/` hoac `app/`
  const tokens = [...heading.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const out = [];
  for (const t of tokens) {
    const clean = t.replace(/\/$/, '');
    if (!clean || clean.includes(' ')) continue;
    if (ROOT_PREFIXES.includes(clean.split('/')[0])) out.push(clean);
    else if (parentBase) out.push(`${parentBase}/${clean}`);
  }
  return out;
}

function headingBase(heading) {
  // "## backend/app — FastAPI · 5.670 dong" -> "backend/app"
  const head = heading.replace(/^#+\s*/, '').split('—')[0].trim();
  if (ROOT_PREFIXES.includes(head.split('/')[0])) return head;
  const m = head.match(/^([A-Za-z0-9_.\-/]+)\//);
  if (m && ROOT_PREFIXES.includes(m[1])) return m[1];
  return null;
}

function checkPerFileLines() {
  const doc = 'docs/ai-context/MODULE_MAP.md';
  const text = read(doc);
  const lines = text.split('\n');

  let bases = [];
  let base = null;
  let checked = 0;
  let skipped = 0;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^##\s/.test(ln)) {
      base = headingBase(ln);
      bases = base ? [base] : [];
      continue;
    }
    if (/^###\s/.test(ln)) {
      const derived = sectionBases(ln, base);
      bases = [...derived, ...(base ? [base] : [])];
      continue;
    }
    const m = ln.match(/^\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|/);
    if (!m) continue;
    const p = m[1];
    const claimed = Number(m[2]);
    if (p.includes('*') || p.includes('/') === false && !bases.length) {
      // van thu viec duoi base hien tai
    }
    // Thu candidate: absolute neu bat dau bang root, else base + '/' + p
    const cands = [];
    if (ROOT_PREFIXES.includes(p.split('/')[0])) cands.push(p);
    for (const b of bases) cands.push(`${b}/${p}`);
    for (const rp of ROOT_PREFIXES) cands.push(`${rp}/${p}`);

    const hit = cands.find((c2) => FILES.has(c2) && linesOf(c2) !== null);
    if (!hit) {
      skipped += 1;
      continue;
    }
    const real = linesOf(hit);
    checked += 1;
    if (real !== claimed) {
      fail(`${doc}:${i + 1}`, claimed, real, `\`${p}\` -> ${hit}`);
    }
  }
  return { checked, skipped };
}

// ---------------------------------------------------------------- claims khai bao

const CLAIMS = [
  // --- tong so dong
  { doc: 'docs/ai-context/MODULE_MAP.md', re: /^## backend\/app — FastAPI · ([\d.]+) lines$/m, kind: 'lines:backend/app' },
  { doc: 'docs/ai-context/MODULE_MAP.md', re: /^\| `tests\/` \| ([\d.]+) \|/m, kind: 'lines:backend/tests' },
  { doc: 'docs/ai-context/MODULE_MAP.md', re: /^## frontend\/src — Next\.js 16 App Router · ([\d.]+) lines/m, kind: 'lines:frontend/src' },
  { doc: 'docs/ai-context/MODULE_MAP.md', re: /^## mobile — Expo SDK 54 · ([\d.]+) lines$/m, kind: 'lines:mobile' },
  { doc: 'AGENTS.md', re: /`backend\/` FastAPI ([\d.]+) lines/, kind: 'lines:backend' },
  { doc: 'AGENTS.md', re: /`frontend\/` Next\.js ([\d.]+) lines/, kind: 'lines:frontend/src' },
  { doc: 'AGENTS.md', re: /`mobile\/` Expo ([\d.]+) lines/, kind: 'lines:mobile' },
  // --- so file
  { doc: 'docs/ai-context/MODULE_MAP.md', re: /^\| `tests\/` \| [\d.]+ \| (\d+) files,/m, kind: 'files:backend/tests' },
  { doc: 'docs/ai-context/MODULE_MAP.md', re: /^## frontend\/src — Next\.js 16 App Router · [\d.]+ lines · (\d+) files$/m, kind: 'files:frontend/src' },
  { doc: 'docs/ai-context/MODULE_MAP.md', re: /^\| `components\/ui\/\*` \| (\d+) files · [\d.]+ lines/m, kind: 'files:ui' },
  // --- so test
  { doc: 'docs/ai-context/TESTING_GUIDE.md', re: /^## 1\. Backend — (\d+) test item/m, kind: 'test:items' },
  { doc: 'docs/ai-context/TESTING_GUIDE.md', re: /^\| \*\*(\d+)\*\* \| \*\*functions\*\*/m, kind: 'test:funcs' },
  { doc: 'docs/ai-context/TESTING_GUIDE.md', re: /^\| \*\*(\d+)\*\* \| \*\*collected pytest items\*\*/m, kind: 'test:items' },
  { doc: 'docs/ai-context/TESTING_GUIDE.md', re: /^\| `backend\/` \| pytest \| ✔ \| (\d+) items \((\d+) functions\) \|/m, kind: 'test:items+funcs' },
  { doc: 'AGENTS.md', re: /pytest tests\/ -v` → \*\*(\d+) passed\*\*/, kind: 'test:items' },
  { doc: 'docs/ai-context/MODULE_MAP.md', re: /^\| `tests\/` \| [\d.]+ \| \d+ files, (\d+) items \/ (\d+) functions/m, kind: 'test:items+funcs' },
  { doc: 'docs/ai-context/ARCHITECTURE.md', re: /✅ \*\*(\d+) items\*\*/, kind: 'test:items' },
  { doc: '.opencode/skills/book-collection-conventions/SKILL.md', re: /\| `backend\/` \| `pytest tests\/ -v` \| \*\*(\d+) passed\*\*/, kind: 'test:items' },
  { doc: '.opencode/skills/book-collection-conventions/SKILL.md', re: /Con số (\d+) = (\d+) hàm \+ 5 bản sao/, kind: 'test:items+funcs' },
  // --- file phai ton tai
  { doc: 'docs/ai-context/MODULE_MAP.md', re: /^\| `placeholder-book\.svg` \|/m, kind: 'exists:frontend/public/placeholder-book.svg' },
  // --- FRONTEND_MAP
  { doc: 'docs/ai-context/FRONTEND_MAP.md', re: /^## 2\. `MobileIntakeDialog\.tsx` \(([\d.]+) lines\)/m, kind: 'lines:frontend/src/components/intake/MobileIntakeDialog.tsx' },
];

/**
 * Parse số trong docs. Repo dùng **dấu chấm làm dấu phân tách nghìn**:
 * "5.670" = 5670 dòng, "1.074" = 1074 dòng (KHÔNG phải 5,67 / 1,074).
 * ⇒ Bỏ hết dấu chấm trước khi Number() — nếu không, "5.670" thành 5.67 (đã mắc).
 */
function docNum(s) {
  return Number(String(s).replace(/\./g, ''));
}

function checkFrontendMapRoutes() {
  // FRONTEND_MAP §1: | Route | File | Lines | SWR key | Ghi chu |
  // File duoc resolve tu base `frontend/src/`.
  const doc = 'docs/ai-context/FRONTEND_MAP.md';
  const lines = read(doc).split('\n');
  let checked = 0;
  let skipped = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\|\s*`\/[^`]*`\s*\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|/);
    if (!m) continue;
    const p = `frontend/src/${m[1]}`;
    const claimed = Number(m[2]);
    if (!FILES.has(p) || linesOf(p) === null) {
      skipped += 1;
      continue;
    }
    const real = linesOf(p);
    checked += 1;
    if (real !== claimed) {
      fail(`${doc}:${i + 1}`, claimed, real, `\`${m[1]}\``);
    }
  }
  return { checked, skipped };
}

function checkClaims() {
  for (const claim of CLAIMS) {
    const [kind, ...rest] = claim.kind.split(':');
    if (kind === 'exists') {
      const p = rest.join(':');
      const m = read(claim.doc).match(claim.re);
      if (!m) {
        warn(`${claim.doc}`, `claim "exists:${p}" khong con khop docs`);
      } else if (!existsSync(path.join(ROOT, p))) {
        fail(`${claim.doc}`, p, 'KHONG TON TAI', 'file doc nho da bi xoa');
      }
      continue;
    }

    const m = read(claim.doc).match(claim.re);
    if (!m) {
      warn(`${claim.doc}`, `claim "${claim.kind}" khong con khop docs (cau hinh claim can cap nhat)`);
      continue;
    }
    if (kind === 'test:items+funcs') {
      const realItems = truth['test:items'];
      const realFuncs = truth['test:funcs'];
      if (realItems === undefined || realFuncs === undefined) continue;
      if (docNum(m[1]) !== realItems) fail(`${claim.doc}`, docNum(m[1]), realItems, 'so item pytest');
      if (docNum(m[2]) !== realFuncs) fail(`${claim.doc} (ham)`, docNum(m[2]), realFuncs, 'so ham def test_');
      continue;
    }
    const real = truth[claim.kind] ?? (() => {
      // `lines:<đường dẫn file>` — số dòng của MỘT file cụ thể.
      if (claim.kind.startsWith('lines:') && claim.kind.includes('/')) {
        return linesOf(claim.kind.slice('lines:'.length));
      }
      return undefined;
    })();
    if (real === undefined || real === null) continue;
    if (docNum(m[1]) !== real) {
      fail(`${claim.doc}`, docNum(m[1]), real, claim.kind);
    }
  }
}

// ---------------------------------------------------------------- main

function main() {
  console.log();
  console.log(bold('═'.repeat(64)));
  console.log(bold('  DOC-TRUTH — so lieu trong docs co khop thuc te khong?'));
  console.log(bold('═'.repeat(64)));
  console.log();

  const perFile = checkPerFileLines();
  const feRoutes = checkFrontendMapRoutes();
  checkClaims();

  console.log(dim(`  so dong per-file (MODULE_MAP): ${perFile.checked} kiem, ${perFile.skipped} bo qua`));
  console.log(dim(`  so dong route (FRONTEND_MAP §1): ${feRoutes.checked} kiem, ${feRoutes.skipped} bo qua`));
  console.log(dim(`  so test: ${testItems ?? '?'} item / ${testFuncs ?? '?'} ham`));
  console.log();

  if (warnings.length) {
    console.log(yellow(bold(`  ⚠ ${warnings.length} canh bao (khong fail):`)));
    for (const w of warnings) console.log(`    ${yellow('•')} ${w.where}: ${dim(w.note)}`);
    console.log();
  }

  if (problems.length) {
    console.log(red(bold(`  ✖ ${problems.length} SAI — docs khong khop thuc te:`)));
    for (const p of problems) {
      console.log(`    ${red('•')} ${bold(p.where)}`);
      console.log(`        docs ghi: ${bold(String(p.expected))}   thuc te: ${green(String(p.actual))}   ${dim(p.hint)}`);
    }
    console.log();
    console.log(red(bold('  FAIL — sua cac dong tren roi chay lai.')));
    console.log();
    return 1;
  }

  console.log(green(bold('  ✓ PASS — moi so lieu trong docs deu khop thuc te.')));
  console.log();
  return 0;
}

process.exit(main());
