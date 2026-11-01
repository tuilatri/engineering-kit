#!/usr/bin/env node
/**
 * verify.mjs — chạy toàn bộ gate của repo bằng 1 lệnh.
 *
 * Usage:
 *   node scripts/verify.mjs           # đủ 12 gate (~4 phút)
 *   node scripts/verify.mjs --fast    # bỏ backend tests (~30 s)
 *   node scripts/verify.mjs --help
 *
 * ⚠️ CÁC BẪY ĐÃ MẮC — ĐỪNG BỎ, ĐỪNG "TỐI ƯU":
 *  1. PHẢI dùng python trong venv (`-m pytest`), KHÔNG gọi `pytest` trong PATH.
 *     `pytest` trong PATH trỏ Python toàn cục => Prisma "no datasource" =>
 *     166 ERROR trông như repo hỏng. Đã mắc 2 lần trong P3-1.
 *  2. cwd của gate backend phải là `backend/` để `config.py` nạp `.env.test`
 *     (conftest set ENVIRONMENT=testing TRƯỚC khi import app).
 *  3. KHÔNG xoá `storage_test/` — ảnh tích luỹ giữa các lần chạy test;
 *     `test_orphan_images.py` assert theo stem cụ thể.
 *  4. KHÔNG chạy song song — `next build` ghi `.next/`, pytest ăn CPU.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
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

function fmtDuration(sec) {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} phút ${r}s` : `${m} phút`;
}

function findVenvPython() {
  const rel = IS_WIN
    ? path.join('backend', '.venv', 'Scripts', 'python.exe')
    : path.join('backend', '.venv', 'bin', 'python');
  const p = path.join(ROOT, rel);
  return existsSync(p) ? p : null;
}

// Child hien tai, de Ctrl+C bi kill thay vi de process con chay mo coi.
let currentChild = null;
let interrupted = false;

process.on('SIGINT', () => {
  interrupted = true;
  if (currentChild) {
    try {
      currentChild.kill('SIGINT');
    } catch {
      /* ignore */
    }
  }
});

function run(cmd, args, cwd, useShell = true) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      // npm/npx tren Windows la .cmd => can shell. Python thi KHONG can shell —
      // va khong dung shell giup duong dan co khoang trang (VD "C:\\My Projects\\")
      // khong bi shell parse sai.
      shell: useShell,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    currentChild = child;
    let captured = '';
    const collect = (d) => {
      captured += d.toString();
      process.stdout.write(d);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', () => resolve({ code: 127, captured }));
    child.on('close', (code) => {
      currentChild = null;
      resolve({ code: interrupted ? 130 : (code ?? 1), captured });
    });
  });
}

// ---------------------------------------------------------------- config

const PY = findVenvPython();

const GATES = [
  // Gate doc-truth đặt ĐẦU: nhanh (~5 s) và bắt lỗi "số liệu trong docs sai"
  // — loại lỗi đã xảy ra 6 lần trong 1 phiên (21/10) mà không gate nào bắt.
  { name: 'docs: truth', cwd: '.', cmd: 'node', args: ['scripts/doc-truth.mjs'], est: 6 },
  // Gate mobile-url: mobile KHÔNG có framework test ⇒ verify bằng script biên dịch
  // 1 file TS bằng typescript có sẵn rồi assert bảng case (P3-10).
  { name: 'mobile: url', cwd: 'mobile', cmd: 'node', args: ['../scripts/verify-mobile-url.mjs'], est: 10 },
  // Gate port: chan hoi quy khi gom `port 8000` ve 1 config (P3-9) — literal
  // `8000` chi duoc nam trong 3 file config, con lai la FAIL.
  { name: 'port: no hardcode', cwd: '.', cmd: 'node', args: ['scripts/verify-no-hardcoded-port.mjs'], est: 4 },
  // Gate intake-ws: WebSocket client cua luong intake (P3-14) — verify bang script
  // (bo sung cho vitest: can fake WebSocket + dong ho ao, nen khong flaky).
  { name: 'intake: ws', cwd: 'frontend', cmd: 'node', args: ['../scripts/verify-intake-ws.mjs'], est: 10 },
  // Gate orphan-reorder: logic keo-tha danh sach vat pham le (P3-18) — verify bang
  // script (bo sung cho vitest): bien dich 1 file TS + assert bang case + kiem tra
  // trang orphan-items/page.tsx that su goi 2 endpoint reorder.
  { name: 'orphan: reorder', cwd: 'frontend', cmd: 'node', args: ['../scripts/verify-orphan-reorder.mjs'], est: 10 },
  { name: 'frontend: test', cwd: 'frontend', cmd: 'npm', args: ['test'], est: 5 },
  { name: 'mobile: test', cwd: 'mobile', cmd: 'npm', args: ['test'], est: 5 },
  { name: 'frontend: lint', cwd: 'frontend', cmd: 'npm', args: ['run', 'lint'], est: 8 },
  { name: 'frontend: type-check', cwd: 'frontend', cmd: 'npx', args: ['tsc', '--noEmit'], est: 3 },
  { name: 'mobile: type-check', cwd: 'mobile', cmd: 'npx', args: ['tsc', '--noEmit'], est: 4 },
  { name: 'frontend: build', cwd: 'frontend', cmd: 'npm', args: ['run', 'build'], est: 8 },
  {
    name: 'backend: tests',
    cwd: 'backend',
    cmd: PY,
    args: ['-m', 'pytest', 'tests/', '-q'],
    est: 190,
    backend: true,
    useShell: false, // python.exe khong can shell (xem ghi chu trong run())
  },
];

// ---------------------------------------------------------------- preflight

function preflight() {
  const problems = [];
  if (!PY) {
    problems.push({
      what: 'Thieu Python trong backend/.venv',
      fix: [
        'python -m venv backend/.venv',
        IS_WIN
          ? 'backend\\.venv\\Scripts\\pip install -r backend\\requirements.txt'
          : 'backend/.venv/bin/pip install -r backend/requirements.txt',
      ],
    });
  }
  for (const app of ['frontend', 'mobile']) {
    if (!existsSync(path.join(ROOT, app, 'node_modules'))) {
      problems.push({ what: `Thieu ${app}/node_modules`, fix: [`cd ${app} && npm ci`] });
    }
  }
  return problems;
}

// ---------------------------------------------------------------- main

function printHelp() {
  console.log(`
${bold('verify.mjs')} — chay toan bo gate cua repo bang 1 lenh.

${bold('Usage:')}
  node scripts/verify.mjs            Day du 12 gate (uoc luong ~4 phut)
  node scripts/verify.mjs --fast     Bo gate backend tests (~30 s)
  node scripts/verify.mjs --help     Hien tro nay

${bold('Gate (fail-fast, nhanh -> cham):')}
  1. docs: truth          node scripts/doc-truth.mjs   (so lieu trong docs vs thuc te)
  2. mobile: url          node scripts/verify-mobile-url.mjs (chuan hoa URL cua mobile)
  3. port: no hardcode    node scripts/verify-no-hardcoded-port.mjs (port chi o file config)
  4. intake: ws           node scripts/verify-intake-ws.mjs (WebSocket client cua intake)
  5. orphan: reorder      node scripts/verify-orphan-reorder.mjs (keo-tha vat pham le)
  6. frontend: test       npm test (vitest, 45 case)
  7. mobile: test         npm test (vitest, 44 case)
  8. frontend: lint       npm run lint
  9. frontend: type-check npx tsc --noEmit
 10. mobile: type-check   npx tsc --noEmit
 11. frontend: build      npm run build
 12. backend: tests       <venv>/python -m pytest tests/ -q

${bold('Luu y:')}
  - Exit code 0 = tat ca pass; = exit code cua gate fail; 1 = loi moi truong.
  - KHONG xoa backend/storage_test/ (anh tich luy giua cac lan chay test).
  - E2E luong intake chay RIENG: node scripts/verify-intake-e2e.mjs (can 3 server).
`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return 0;
  }
  const known = new Set(['--fast', '--help', '-h']);
  const unknown = argv.filter((a) => !known.has(a));
  if (unknown.length) {
    console.error(red(`Tham so la: ${unknown.join(', ')}`));
    printHelp();
    return 1;
  }
  const fast = argv.includes('--fast');

  const gates = fast ? GATES.filter((g) => !g.backend) : GATES;
  const totalEst = gates.reduce((s, g) => s + g.est, 0);

  console.log();
  console.log(bold('═'.repeat(64)));
  console.log(bold('  VERIFY — Book Collection Management'));
  console.log(`  ${gates.length} gate · uoc luong ~${fmtDuration(totalEst)}${fast ? dim('  (--fast: bo backend tests)') : ''}`);
  console.log(bold('═'.repeat(64)));
  console.log();

  const problems = preflight();
  if (problems.length) {
    console.log(red(bold('  ✖ MOI TRUONG THIEU:')));
    for (const p of problems) {
      console.log(`    ${yellow('•')} ${p.what}`);
      for (const f of p.fix) console.log(dim(`        $ ${f}`));
    }
    console.log();
    console.log(red('  Khong chay gate nao. Exit 1.'));
    console.log();
    return 1;
  }

  const results = [];
  const t0 = Date.now();

  for (let i = 0; i < gates.length; i++) {
    const g = gates[i];
    console.log(dim(`  [${i + 1}/${gates.length}] ${g.name.padEnd(24)} (~${g.est}s)`));
    const started = Date.now();
    const r = await run(g.cmd, g.args, path.join(ROOT, g.cwd), g.useShell ?? true);
    const took = (Date.now() - started) / 1000;
    const ok = r.code === 0;
    results.push({ name: g.name, code: r.code, took });

    if (ok) {
      console.log(green(`  ✓ PASS`) + `  ${g.name.padEnd(24)} ${fmtDuration(took)}`);
      if (g.backend) {
        const m = r.captured.match(/(\d+) passed/);
        if (m) console.log(dim(`        ${m[1]} test passed`));
      }
    } else {
      console.log(red(`  ✖ FAIL`) + `  ${g.name.padEnd(24)} ${fmtDuration(took)}  (exit ${r.code})`);
    }
    console.log();

    if (!ok) {
      const total = (Date.now() - t0) / 1000;
      const passed = results.filter((x) => x.code === 0).length;
      console.log(bold('─'.repeat(64)));
      console.log(
        red(`  TONG: ${passed}/${results.length} PASS · ${fmtDuration(total)} · DUNG tai "${g.name}"`)
      );
      console.log(bold('─'.repeat(64)));
      console.log();
      return r.code;
    }
  }

  const total = (Date.now() - t0) / 1000;
  console.log(bold('─'.repeat(64)));
  console.log(green(bold(`  TONG: ${results.length}/${results.length} PASS · ${fmtDuration(total)}`)));
  console.log(bold('─'.repeat(64)));
  console.log();
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(red(`verify.mjs loi khong mong doi: ${e && e.message ? e.message : e}`));
    process.exit(1);
  });
