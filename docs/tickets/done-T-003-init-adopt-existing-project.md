# T-003 — Adopt mode for existing projects

Spec: SPEC-init-adopt
Blocks: —
Blocked by: —
Labels: feat, init, solo-dev

## Why
A solo developer with a half-finished project has no supported way to install kit process rules when `AGENTS.md` already exists — `init` dies at the guard. Manual diffing from a temp init is error-prone and can replace real docs with MEASURE skeletons.

## What
- Add `--adopt` (opt-in) and `--dry-run` to src/init.mjs.
- Planner: add absent files, skip existing user files, merge AGENTS.md via a marked block.
- Restrict placeholder replacement to kit-added files; leave .gitignore/.env/marker/skills/filled docs untouched.
- Lifecycle test: seeded project with custom AGENTS.md + filled ai-context + .env + colliding skill; assert all 9 spec cases, idempotency and dry-run.

## Done when
- [ ] Default init behavior and lifecycle section 1 guard unchanged
- [ ] Spec cases 1–9 covered by tests
- [ ] `npm test` → ALL CHECKS PASS; `npm pack --dry-run` OK
- [ ] Rename this file `doing-…` at start, `done-…` only after green
