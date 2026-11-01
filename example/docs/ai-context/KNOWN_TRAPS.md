# Known Operational Traps — Pitfalls already encountered, do not repeat them

> Split from AGENTS.md (P8-1) — read when touching CI/pytest/Prisma/theme/database/commits.
> Referenced by the AGENTS.md Doc Trigger table.

---

## 1. Prisma CLI finds `python` via `PATH`

**Trap:** the `prisma` CLI runs the `python` generator — if the venv is not in `PATH`, the Prisma client lands in the global Python's user-site ⇒ app import fails with "You defined no datasource".

**Consequence if forgotten:** 166 ERRORs that look like a broken repo.

**Rule:** Always use `.\.venv\Scripts\python.exe -m pytest` — do NOT call `pytest` from PATH.

---

## 2. `backend/.env.test` is NOT tracked (gitignore: `backend/.env.*`)

**Trap:** CI needs `.env.test` to run tests — the file is not in git ⇒ CI must **create it itself** from `backend/.env.example` (which IS tracked).

**Consequence if forgotten:** the CI backend job fails due to missing env.

**Rule:** the CI workflow generates `.env.test` from `.env.example` itself — check that `.github/workflows/ci.yml` has this step.

---

## 3. `conftest.py` uses `load_dotenv(..., override=True)`

**Trap:** the `.env.test` file **wins** over CI env vars — if CI injects an env var but `.env.test` also has it ⇒ `.env.test` wins.

**Consequence if forgotten:** CI runs tests against the wrong DB.

**Rule:** read `backend/tests/conftest.py` to understand env precedence order.

---

## 4. ~~`npm ci` in `mobile/` fails with ERESOLVE~~ ⇒ **FIXED 22/10**

**Old trap:** `lucide-react-native` 0.475 declares peer `react <=18` but mobile uses React 19 ⇒ ERESOLVE.

**Fixed:** bumped `lucide-react-native` 0.475 → 0.511 (now declares peer `react <=19`) ⇒ `npm ci` is clean, no `--legacy-peer-deps` needed.

**Rule:** do NOT re-add `--legacy-peer-deps` — if a new ERESOLVE appears, fix the dependency instead of adding the flag.

---

## 5. Standalone builds (APK) of `mobile/` must enable cleartext HTTP

**Trap:** Android 9+ blocks cleartext HTTP — the app calls an internal backend via `http://<IP-LAN>:8000` ⇒ without `android:usesCleartextTraffic` declared ⇒ React Native reports **"Network request failed"**.

**Consequence if forgotten:** you blame the app / a firewall / the network.

**Fixed:** local config plugin `mobile/plugins/withCleartextTraffic.js` (uses `expo/config-plugins`).

**Re-verify:** `cd mobile && npx expo prebuild --clean -p android --no-install` then read `android/app/src/main/AndroidManifest.xml`.

⚠️ Prebuild **changes the** `android`/`ios` scripts in `package.json` ⇒ **revert** afterwards.

---

## 6. `storage_test/` must NOT be deleted between test runs

**Trap:** images accumulate across runs — `test_orphan_images.py` asserts on specific stems rather than global state.

**Consequence if forgotten:** adding a fixture that wipes it ⇒ tests break.

**Rule:** do NOT add a fixture that deletes `storage_test/`.

---

## GitNexus — Code Intelligence

### Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify only expected symbols/flows changed.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping.
- When you need full context on a specific symbol — callers, callees, execution flows — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings.

### Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

### Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/BooK_Collection_Management/context` | Codebase overview, check index freshness |
| `gitnexus://repo/BooK_Collection_Management/clusters` | All functional areas |
| `gitnexus://repo/BooK_Collection_Management/processes` | All execution flows |
| `gitnexus://repo/BooK_Collection_Management/process/{name}` | Step-by-step execution trace |

### CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

> **Index stale?** Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).
