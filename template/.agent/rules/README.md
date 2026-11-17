# `.agent/rules/` — Agent bootstrap & router

This directory holds the rule files an agent reads **before starting a task** — the
repo's bootstrap/router: pre-task resource loading order, the skill auto-select
table by task type, the workflow auto-select table by complexity (pattern of
`AUTO_AGENT_LOADING.md` + `GEMINI.md` — see the sample at the link below).

The template **ships no rules by default** — a good rule must describe YOUR repo;
it cannot be generic. Two options:

1. **Write a minimal rule file yourself**, e.g. `.agent/rules/ROUTER.md`:
   - Pre-task loading order: AGENTS.md → `docs/ai-context/` (name which files to read)
   - A "task type → which doc/skill" table — 3–6 rows is enough
   - General rules (commit convention, plan location) already live in AGENTS.md —
     reference them, don't duplicate.
2. **Port from the sample**: https://github.com/tuilatri/engineering-kit/tree/main/example/.agent/rules
   When porting, **scrub the project-specific parts**: accounts/palette files, chat-language
   rules, app names, and any skill/workflow that does not exist in your repo.

## Minimal ROUTER.md skeleton (port this, then fill in your paths)

```markdown
# ROUTER — pre-task bootstrap

## Loading order
1. AGENTS.md — contract, Pre-Task Checklist, Doc Trigger.
2. docs/ai-context/README.md → the matching doc for this task.
3. docs/ai-context/KNOWN_TRAPS.md — always before fixing anything.

## Task type → docs / skills
| Task type | Read | Skill |
|---|---|---|
| API endpoint | API_MAP.md, ARCHITECTURE.md | api-patterns |
| Service / data | ARCHITECTURE.md, MODULE_MAP.md | database-design |
| Frontend / UX | FRONTEND_MAP.md, UI_UX_RULES.md | design skill |
| Tests / bug fix | TESTING_GUIDE.md, KNOWN_TRAPS.md | tdd, systematic-debugging |

General rules (commit convention, plan folder, Workflow Contract) live in AGENTS.md —
reference them, never duplicate them here.
```

Keep the table to 3–6 rows; an empty router is worse than none.
