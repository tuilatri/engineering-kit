# SKILL-SOURCES — where every skill comes from (and how to refresh it)

Skills are bundled into ONE canonical folder: `.claude/skills/` (repo-local,
versioned with the repo) with a disabled pool in `.claude/skills-disabled/`.
This manifest records provenance, license, refresh commands, the layer each skill
lives in, and triage status. **Update this file BEFORE adding any skill** — the
verify gate checks the shipped skill count against it.

**Standing rules:**
1. Skills are **repo-local** — never assume a global skills directory; repo docs
   must never depend on globally-installed skills.
2. A global layer is allowed as personal convenience only; keep global names
   distinct from local ones (shadowing precedence differs per tool).
3. Declare paths once in `kit.config.json` → `skillPaths`; register the same folder
   per tool (see "Register per tool" below).

## Inventory (fill in for THIS project)

| Group | Count | Source | License | Layer | Triage |
|---|---|---|---|---|---|
| *(group 1 — e.g. bundled kit set shipped at init)* | MEASURE | MEASURE | MEASURE | local | ACTIVE |
| *(group 2)* | MEASURE | MEASURE | MEASURE | local | ACTIVE/DISABLED |

Active total: MEASURE · pool: MEASURE — keep these numbers true whenever you triage
(move/delete skills); this manifest is the audit record. Optionally pin the dirs you
care about with `doc-truth` claims (`exists:<skill-dir>`) in `kit.config.json`.

### Group members

- *(list the member skill dirs per group — this is what makes the manifest auditable)*

## Refresh / add skills

```bash
# Example — pull an upstream skill set, diff, merge selectively:
npx skills@latest add mattpocock/skills -a claude-code -y
```

Workflow for a new skill: add a row here first → drop the folder into
`.claude/skills/` (or `skills-disabled/`) → run the project verify gate.

## Register per tool

| Tool | Local (canonical) | Optional global layer |
|---|---|---|
| Claude Code | `.claude/skills/` — native | `~/.claude/skills/` — native |
| OpenCode | `opencode.json` → `"skills": {"paths": [".claude/skills"]}` | append home path to the array |
| ZCode | project scope | user scope — auto-discovered, project shadows user |
| Antigravity | point the workspace skills dir at `.claude/skills/` | `~/.gemini/antigravity/skills/` — native |
