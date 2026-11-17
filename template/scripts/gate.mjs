#!/usr/bin/env node
/**
 * Cross-platform gate dispatcher — adjust the backend path below for your repo.
 *   node gate.mjs node <script> [args…]  -> run a Node script from repo root
 *   node gate.mjs python <args…>         -> run pytest via the backend venv
 * Windows uses .venv/Scripts/python.exe, POSIX uses .venv/bin/python.
 * Pair it with npm scripts in the root package.json:
 *   "gate:node": "node scripts/gate.mjs node",
 *   "gate:python": "node scripts/gate.mjs python -m pytest -q"
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [kind, ...args] = process.argv.slice(2);

let cmd;
let cwd = root;
if (kind === 'node') {
  cmd = process.execPath;                       // no PATH resolution needed
} else if (kind === 'python') {
  const backend = path.join(root, 'backend');   // <-- change to your app path
  const venv = process.platform === 'win32'
    ? path.join(backend, '.venv/Scripts/python.exe')
    : path.join(backend, '.venv/bin/python');
  cmd = existsSync(venv) ? venv : (process.platform === 'win32' ? 'python' : 'python3');
  cwd = backend;
} else {
  console.error(`Unknown gate kind: ${kind}`);
  process.exit(1);
}

const child = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false });
process.exit(child.status ?? 1);
