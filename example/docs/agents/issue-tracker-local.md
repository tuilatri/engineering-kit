# Issue Tracker — Local Markdown Mode

> P12-3: repo private + solo dev — no external issue tracker. Engineering skills
> (to-spec / to-tickets / implement / implement-spec) use THIS convention.

- **Location**: `docs/tickets/` — one file per ticket, named `T-NNN-slug.md`
- **Ticket states** (filename prefix): `open-` → `doing-` → `done-` (move = rename)
- **Blocking edges**: declared in the ticket body as `Blocks: T-xxx` / `Blocked by: T-xxx`
- **Specs**: `docs/specs/SPEC-slug.md` — tickets link back via `Spec: SPEC-slug`
- Creation rule: tickets and specs are written in English (repo doc convention)

## Current mode
- Tracker tool: none (local markdown only)
- Ready for: to-spec → to-tickets → implement-spec pipeline
