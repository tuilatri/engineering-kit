<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **BooK_Collection_Management** (4717 symbols, 12590 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify only expected symbols/flows changed.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/BooK_Collection_Management/context` | Codebase overview, check index freshness |
| `gitnexus://repo/BooK_Collection_Management/clusters` | All functional areas |
| `gitnexus://repo/BooK_Collection_Management/processes` | All execution flows |
| `gitnexus://repo/BooK_Collection_Management/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

---

# Project Source of Truth

- **Read first:** `docs/ai-context/README.md` — index of the entire context documentation.
- **Read `docs/ai-context/BEHAVIORAL_GUIDELINES.md`** — Karpathy principles + skill selection + hierarchical plan (split out from here in P8-1).
- **Read `docs/ai-context/KNOWN_TRAPS.md`** — 6 CI/pytest/Prisma/theme traps + GitNexus rules (split out from here in P8-1).
- **Read `docs/ai-context/UI_UX_RULES.md`** — Shadcn/UI First + component conventions (split out from here in P8-1).
- **`drafts/` is gitignored and NOT a source of truth.** Use only for plan/task tracking.
- **`HOW_TO_RUN.txt` contains real credentials** (gitignored) — read it to check configuration, never quote its values.

---

# Pre-Task Checklist

At the start of every task — **all steps are MANDATORY, in order**:
1. **Re-read AGENTS.md** — refresh rules
2. **Read `docs/ai-context/BEHAVIORAL_GUIDELINES.md`** — Karpathy principles + skill selection
3. **Read `docs/ai-context/KNOWN_TRAPS.md`** — avoid known pitfalls
4. **Check Doc Trigger table below** — read the matching `docs/ai-context/*` file. Declare in first line of reply.
5. **Before EVERY edit** — run `impact({target, direction})` on the target symbol
6. **If task is large (≥3 files, ≥5 changes)** — create a hierarchical plan
7. **Before committing** — run `detect_changes()` to verify scope
8. 🔴 **Tasks must be referenced by immutable IDs** (`P2-9`, `PR #7`) — do NOT use "item N"

---

## Plan & Task Documents

**MANDATORY**: Create `implementation_plan.md` + `task.md` in `drafts/plans/<MMDDYY>_<n>_<status>/`. `drafts/` is gitignored — working memory, not committed unless the user requests it.

## Commit Message Convention

- Prefixes: `feat:`, `fix:`, `refactor:`, `chore:`, `style:`, `docs:`, `test:`, `perf:`
- Scope: `fix(backend):`, `feat(series):`, `feat(ui):`
- Subject ≤ 72 characters
- 🔴 **Subject + body IN ENGLISH.** Vietnamese only in chat with the user.

## Language
- Respond in Vietnamese when chatting with the user
- Code, variable names, and technical documentation remain in English

---

# Standing Rules

1. **`drafts/` is gitignored and NOT a source of truth.** If you need context about the code, read `docs/ai-context/` (tracked) instead of `drafts/`.
2. Read `docs/ai-context/README.md` before adding endpoints, routes, or general refactors. Read `API_MAP.md` before calling/editing an endpoint. Read `FRONTEND_MAP.md` before touching `frontend/src/`. Read `TESTING_GUIDE.md` before writing or running tests.
3. Detailed rules: `.agent/rules/AUTO_AGENT_LOADING.md` + `.agent/rules/GEMINI.md` — read only when the task explicitly needs them.
4. Plan/task docs go under `drafts/plans/<MMDDYY>_<n>_<status>/`.
5. End of every task: report status (success/failure) + propose a Conventional Commits message.
6. **Test gate:** `node scripts/verify.mjs` runs **all 3 apps** (fail-fast). Backend only: `cd backend && .\.venv\Scripts\python.exe -m pytest tests/ -q`. ⚠️ **NEVER** call `pytest` in PATH. Current numbers are in `docs/ai-context/TESTING_GUIDE.md` §1.
7. **Never commit secrets.** `backend/.env`, `.env.*` and `HOW_TO_RUN.txt` are all gitignored. Never quote their values in any reply or commit.
8. **Never commit `storage/`, `storage_test/`, `node_modules/`, `backend/.venv/`.**

---

## Doc Trigger — one condition, two directions

| Task touches | Read **before** editing | Update **when changed** |
|---|---|---|
| any endpoint in `backend/app/api/` | `docs/ai-context/API_MAP.md` | ✔ |
| any service in `backend/app/services/` | `docs/ai-context/ARCHITECTURE.md` §2, §5 | ✔ |
| `backend/app/services/excel_service.py`, `legacy_import_service.py` | `docs/ai-context/PROMPT_TEMPLATES.md` §6 | ✔ |
| `backend/app/services/intake_service.py`, `backend/app/api/intake.py` | `docs/ai-context/PROMPT_TEMPLATES.md` §5 | ✔ |
| `backend/app/services/backup_service.py` | `docs/ai-context/ARCHITECTURE.md` §2 | ✔ |
| `backend/prisma/schema.prisma` | `docs/ai-context/ARCHITECTURE.md` §5, §6 | ✔ |
| `backend/core/security.py`, `core/config.py` | `docs/ai-context/ARCHITECTURE.md` §5, §6 | ✔ |
| any route in `frontend/src/app/` | `docs/ai-context/FRONTEND_MAP.md` §1 | ✔ |
| `frontend/src/components/` (any) | `docs/ai-context/FRONTEND_MAP.md` §2–§5 | ✔ |
| `frontend/src/lib/api.ts` or `lib/intake.ts` | `docs/ai-context/FRONTEND_MAP.md` §4, §8 | ✔ |
| `frontend/src/components/ui/` | `docs/ai-context/FRONTEND_MAP.md` §3 + `UI_UX_RULES.md` | ✔ |
| any file in `mobile/` | `docs/ai-context/ARCHITECTURE.md` §2 | ✔ |
| `backend/tests/` or pytest config | `docs/ai-context/TESTING_GUIDE.md` | ✔ |
| `package.json`, `pyproject.toml`, `requirements.txt` | Quick facts below | ✔ |
| repo structure, adding/removing apps, changing entry point | `docs/ai-context/MODULE_MAP.md` | ✔ |
| `HOW_TO_RUN.txt`, `.env*` | Standing Rules item 7 | ✔ |
| CI/pytest/Prisma/Prisma traps | `docs/ai-context/KNOWN_TRAPS.md` | — |
| Skill selection / Karpathy principles | `docs/ai-context/BEHAVIORAL_GUIDELINES.md` | — |

Conditions are **observable**. Touching one cell makes both directions mandatory.

**Declaration:** the first line of every reply must be `Đã đọc: <file list>`.

**Authority:** docs describe the **existing code**. When docs contradict code, the **code is right, docs are wrong**.

---

## Quick facts

| | |
|---|---|
| Apps | `backend/` FastAPI 16.205 lines · `frontend/` Next.js 37.003 lines · `mobile/` Expo 3.014 lines. **Non-empty lines**, measured with `git ls-files` + `Measure-Object -Line` — convention in `MODULE_MAP.md` |
| Backend entry | `python -m app.main` (binds itself to `0.0.0.0:<PORT>`, default 8000 — read `PORT` in `backend/.env`) or `uvicorn app.main:app` |
| Frontend entry | `npm run dev` → `:3000`. Test: `npm test` (vitest). |
| Mobile entry | `npm run web` → `:8081`, or `npm run tunnel`. **`tunnel` only tunnels Metro, does not open the backend port** |
| **Agent roles** | `.claude/agents/` — 11 role files (fe/be/map-artist/qa + mobile/devops/db/security/test-writer/release/doc-writer). Native frontmatter; profiles ONLY reference `docs/ai-context/`, no content duplication |
| **Verify (all 3 apps)** | **`node scripts/verify.mjs`** (fail-fast, ~4 minutes) · `--fast` skips backend (~23 s). Run from any directory |
| **CI** | `.github/workflows/ci.yml` — 3 jobs **in parallel** (backend / frontend / mobile) on `ubuntu-latest`. Triggers: push `main`+`feat/**`+`fix/**`+`chore/**`, PR → `main`. `concurrency` cancels the old run (private repo: 2.000 minutes/month) |
| Backend verify | `cd backend && .\.venv\Scripts\python.exe -m pytest tests/ -v` → **360 passed**. ⚠️ **NEVER** call `pytest` in PATH — it points to global Python ⇒ 166 ERROR "no datasource" |
| Frontend verify | `cd frontend && npm test && npm run lint && npm run build` |
| Mobile verify | `cd mobile && npm test && npx tsc --noEmit` |
| DB | PostgreSQL, **Dual DB**: `Book_Collection_Management` + `Book_Collection_Management_Test` |
| Schema | 7 models + 8 FK indexes (15/10, P3-35). No enums, no `migrations/` — `prisma db push` |
| Snapshot | GZIP of all 5 tables on every write, retention 30, restore transaction 5 minutes |
| Quota | `STORAGE_QUOTA_MB` 10240 + `STORAGE_MIN_FREE_MB` 1024. Exceeded → HTTP **507** |
| Images | 3 files per image: `raw/` original · `web/` WebP ≤1400px · `web/thumbnails/` 300×420 |
| Auth | 1 admin, Argon2id, HttpOnly cookie `book_session_token`, MASTER_KEY ≥32 chars blocks boot |
| WebSocket | `ws://<lan-ip>:<PORT>/api/intake/ws/{session_id}` — port taken from `API_PORT` (**P3-9**; previously hard-coded 8000). Client has **reconnect + PONG watchdog** (**P3-14**, `frontend/src/lib/intakeWs.ts`) |
| Rate limit | login/pair 5/minute · upload 30/minute · media upload 30/minute. In-memory, lost on restart |
| Test DB guard | `conftest.py` asserts `"Test" in DATABASE_URL` before importing the app. Do not weaken it |
| Re-index | `node .gitnexus/run.cjs analyze` |
