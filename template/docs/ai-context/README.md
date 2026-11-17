# ai-context — Agent Context Docs ({{PROJECT_NAME}})

Index of all context docs every agent reads before working. Each file is the
SOURCE OF TRUTH for one domain — docs contradict code ⇒ code is right, docs are wrong (fix the docs).

## How to maintain
- Numbers (lines/tests/files): measure with the commands in TESTING_GUIDE §1 — NEVER guess
- After each feature: update the matching doc per the Doc Trigger table in AGENTS.md
- Numbers use DOT as the thousands-separator: "5.670" = 5670 (docNum() strips dots)
- Process rules (Workflow Contract, plan status lifecycle, commit permission, ticket `open- → doing- → done-`) live in `AGENTS.md`; workflow prompts live in `PROMPT_TEMPLATES.md`; ticket conventions in `docs/agents/issue-tracker-local.md`.

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

## Starter files (fill them in — placeholders on purpose)

| File | What it is | When to fill it |
|---|---|---|
| `PRODUCT.md` | Product truth: apps, audience, jobs, constraints | Once the product is clear; replace every `<...>` with real facts |
| `DESIGN.md` | Durable visual decisions: tokens, type, surfaces, motion | When the UI world is chosen; use your own hex values |
| `GLOSSARY.md` | Ubiquitous-language table | As the domain sharpens; add real terms (≤ 2 lines each) |
| `.githooks/pre-commit` | Fast gate before each commit | Install with `git config core.hooksPath .githooks` |
| `scripts/gate.mjs` | Cross-platform Node/Python gate dispatcher | Set your backend path; pair with root npm scripts |

These files deliberately contain no project facts — the kit's process is portable,
the numbers and decisions belong to your project. `doc-truth.mjs` fails when
documented numbers drift from reality, so measure before filling `MEASURE`.
