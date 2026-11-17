# `.opencode/skills/` — Conventions skill pattern

A "conventions" skill is a rule set **invoked while writing code**. Its position
relative to AGENTS.md: **AGENTS.md is the contract, this skill is what you
invoke while writing code.** Long reference material lives in `docs/ai-context/`;
the skill keeps only the hard rules worth remembering mid-task.

This directory ships no skills by default (the bundled corpus lives in
`.claude/skills/`) — conventions must be extracted from the project's real code.
Create `<project>-conventions/SKILL.md` following this pattern:

- **Frontmatter**: `name:` + `description:` dense with triggers ("Use when writing,
  changing, or reviewing code in backend/... Also use when touching ...") +
  `metadata: { scope: backend/, frontend/... }` to limit where it applies.
- **Body**: numbered hard rules — "Rule 0 — ...", "Rule 1 — ..." — each rule states
  the rule + why + a short example, so the agent can follow it mid-task.

Reference example (port it, then scrub the project-specific parts — app names,
test counts, paths specific to the sample repo):
https://github.com/tuilatri/engineering-kit/tree/main/example/.opencode/skills/book-collection-conventions/SKILL.md

Minimal `SKILL.md` skeleton (generic — fill the scope with real paths from your repo):

```markdown
---
name: <project>-conventions
description: Hard rules for <project> — use when writing/changing code in the app's
  backend/**, frontend/**, or docs/**. Also use when editing the matching context docs.
metadata:
  scope: backend/**, frontend/**, docs/**
---

# <project> conventions

Rule 0 — Read before edit. First line of every reply is `Read: <files>`; follow the
AGENTS.md Doc Trigger. Why: docs are the agent's source of truth. Example: touching
an endpoint → read + update API_MAP.md in the same change.

Rule 1 — Measure, never guess. Numbers in docs come from commands in TESTING_GUIDE §1.
Why: drift is the most common failure of agent-written docs.

Rule 2 — Verify with real evidence. Run the relevant gates and quote output; fix until
green before claiming success.
```

**Registering the path**: this directory only takes effect if the tool is configured
to scan the right skills location — OpenCode needs `opencode.json` with
`"skills": { "paths": [".opencode/skills"] }`, Claude Code needs
the equivalent skills config. Same philosophy as `docPaths` in `kit.config.json`:
**one source of truth** for docs/context locations — declare the path once and
every tool reads the same place.
