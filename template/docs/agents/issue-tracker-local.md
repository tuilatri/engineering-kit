# Issue Tracker — Local Markdown Mode

> Private repo / solo dev — want a tracker without an external service: the entire
> ticket lifecycle lives in git, as plain markdown.
>
> The engineering skills (to-spec / to-tickets / implement / implement-spec — installed
> via `npx skills@latest add mattpocock/skills -a claude-code -y`) follow exactly this convention.

- **Location**: `docs/tickets/` — one file per ticket, named `T-NNN-slug.md`
- **Ticket states** (filename prefix): `open-` → `doing-` → `done-` — changing state = **RENAME the file**, do not edit its content
- **Blocking edges**: declared in the ticket body as `Blocks: T-xxx` / `Blocked by: T-xxx`
- **Specs**: `docs/specs/SPEC-slug.md` — tickets link back via a `Spec: SPEC-slug` line
- Creation rule: tickets and specs are written in English (repo doc convention)

## Current mode

- Tracker tool: none (local markdown only)
- Ready for: to-spec → to-tickets → implement-spec pipeline

## Example ticket

`docs/tickets/doing-T-004-add-refresh-token-rotation.md`:

````markdown
# T-004 — Add refresh token rotation

Spec: SPEC-auth
Blocks: T-005
Blocked by: T-002

## Why
Access tokens live 24h; a stolen token cannot be revoked.

## What
- Issue refresh token (7d) on login, store only its hash in `sessions`
- `POST /auth/refresh` rotates the refresh token (old one invalidated)
- Reuse of a rotated token revokes the whole session

## Done when
- [ ] Rotation covered by tests (reuse → 401 + session revoked)
- [ ] TESTING_GUIDE updated with the new endpoint
````
