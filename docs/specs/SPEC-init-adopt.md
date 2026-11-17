# SPEC — Adopt engineering-kit into an existing project

## Problem
`init` currently dies when the target already has `AGENTS.md` (guard at src/init.mjs:101). A solo developer with a half-finished project — often with a hand-written `AGENTS.md` — has no supported path to install the kit's process layer without either overwriting their file or manually diffing a temp init.

## Goal
Add an **explicit opt-in** `--adopt` mode (plus `--dry-run`) that installs only what is missing, preserves everything the project already owns, and is safe to run twice. The default path must stay byte-identical.

## Behavior / acceptance cases
1. Existing `AGENTS.md` → keep it; append a kit block delimited by `<!-- engineering-kit adopt:v<N> START/END -->`, only if the block is absent. No section overwrite.
2. Existing scaffold from kit 0.2/0.3 → upgrade only known generated blocks; owner prose untouched.
3. Existing skill dirs / colliding names with the bundled corpus → skip collisions; never rename or delete user skills.
4. Existing `.gitignore` → keep it untouched (reported as skipped); never replace. The user merges any desired kit rules manually.
5. Existing `.engineering-kit` marker → keep original version; never re-stamp.
6. Idempotency → two `--adopt` runs produce identical bytes (no duplicated block/files).
7. `--adopt --dry-run` → print per-file plan (add / skip / merge), write nothing.
8. **Existing filled `docs/ai-context/*` → never replaced by MEASURE skeletons.** Highest-risk case.
9. `.env`, `.env.*`, credential files → untouched.

## Design constraints
- Default (no `--adopt`) guard + `cpSync` flow unchanged; lifecycle test's overwrite guard stays green.
- Placeholder replacement (`{{PROJECT_NAME}}`, `{{CHAT_LANGUAGE}}`, `{{KIT_VERSION}}`) runs only on files the kit added in adopt mode.
- `--no-skills` in adopt mode strips only directories the kit just added, never user-owned ones.
- Summary prints counts: added / skipped / merged.

## Out of scope
Multi-scope/monorepo config (separate ticket T-004), merge of arbitrary prose in AGENTS.md, conflict-resolution UI.
