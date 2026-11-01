# AI Context — index

This is the **first entry point** for every task (see `AGENTS.md` → "Project Source of
Truth"). The files below describe the **existing code**, not proposed designs.
Each file is independent — only read the file matching the task.

| File | Content | Read when |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 3 layers, request flow, 3-app matrix, feature divergence, dead code, quota/secrets, indexing | Adding an endpoint, refactoring general code, or needing to understand where a request goes |
| [MODULE_MAP.md](MODULE_MAP.md) | Per-app inventory: files, line counts, entry points, dependencies | Needing to know what the repo contains and which file is where |
| [API_MAP.md](API_MAP.md) | Every endpoint + real request/response signatures, auth, rate limits, which endpoints nobody calls | Calling or editing an endpoint |
| [FRONTEND_MAP.md](FRONTEND_MAP.md) | 7 routes, SWR layers, intake state machine, 11 `ui/` primitives, dead deps, CSS traps | Touching `frontend/src/` |
| [TESTING_GUIDE.md](TESTING_GUIDE.md) | Which tests are real, which apps have **no** tests, Test-DB guard, verification gate | Writing or running tests |
| [PROMPT_TEMPLATES.md](PROMPT_TEMPLATES.md) | Ready-to-paste prompts for recurring tasks | Needing a sample prompt for a common task |

Original agent contract: [`AGENTS.md`](../../AGENTS.md). The mandatory read-before-edit
rules per file type are in the **Doc Trigger** table of `AGENTS.md`.

## Source of truth

These docs describe the **existing code**. Figures are taken from GitNexus after P1-8 (16/10),
on the working tree: **131 files · 2024 symbols · 5006 relationships ·
172 execution flows**.
When docs contradict code → **the code is right, docs are wrong**. Refresh them with:

```bash
node .gitnexus/run.cjs analyze --force
```

> Use `--force`. Incremental cannot rebuild the FTS index when `.gitnexusignore` was just
> added or changed, and will fail with
> `FTS index 'file_fts' is inconsistent`.

`drafts/` is local notes and **is gitignored** — not a source of truth for
questions about code. See `AGENTS.md` Standing Rules item 1.

## One-paragraph summary

`BooK_Collection_Management` is a personal book and accessory collection management
system, single-user, made of three separate apps running in parallel: FastAPI + Prisma
Python Client + PostgreSQL in `backend/`, Next.js 16 App Router in `frontend/`,
and an Expo app in `mobile/` that photographs book covers and pushes them straight to
the computer over WebSocket. There is no real multi-user auth — one admin account, an HttpOnly JWT
cookie, and a 32-character "Master-Key" that blocks backend startup. Domain-specific
traits: **`total_volumes` is not stored in the DB** — all volume statistics (had/missing)
are computed dynamically from the `books` table; and **every write operation produces a
GZIP snapshot of all 5 business tables** (`users` and `databasebackuplog` are not
included in the snapshot). Images are stored in duplicate: `storage/raw/` keeps the original,
`storage/web/` keeps the 1400px WebP, `storage/web/thumbnails/` keeps the 300×420 version.
