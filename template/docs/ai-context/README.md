# ai-context — Agent Context Docs ({{PROJECT_NAME}})

Index of all context docs every agent reads before working. Each file is the
SOURCE OF TRUTH for one domain — docs contradict code ⇒ code is right, docs are wrong (fix the docs).

## How to maintain
- Numbers (lines/tests/files): measure with the commands in TESTING_GUIDE §1 — NEVER guess
- After each feature: update the matching doc per the Doc Trigger table in AGENTS.md
- Numbers use DOT as the thousands-separator: "5.670" = 5670 (docNum() strips dots)

## Index
| Doc | Content |
|---|---|
| MODULE_MAP.md | Repo structure + per-file line counts |
| ARCHITECTURE.md | Overall architecture + services + data + security |
| API_MAP.md | Endpoint map + rate limits + auth |
| FRONTEND_MAP.md | Routes + components + lib + patterns |
| TESTING_GUIDE.md | How to run tests + current counts |
| KNOWN_TRAPS.md | Pitfalls already hit — don't repeat them |
| UI_UX_RULES.md | Component conventions |
| BEHAVIORAL_GUIDELINES.md | Principles + skill/agent selection |
| PROMPT_TEMPLATES.md | Reusable templates |
