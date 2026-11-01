# BEHAVIORAL_GUIDELINES — {{PROJECT_NAME}}

> Thinking principles + skill/agent selection. Copy the frame from engineering-kit —
> the process parts are portable; swap the examples for your project's.

## 1. Think Before Coding
- State assumptions. If uncertain, ask.
- Simplicity First. Surgical Changes.
## 2. Goal-Driven Execution
## 3. Skill / Agent Auto-Selection

Skills live in ONE folder: `.claude/skills/` (bundled, repo-local — provenance and
refresh commands in `SKILL-SOURCES.md`; disabled pool in `.claude/skills-disabled/`).
Load a skill only when the task matches its trigger — loading costs context.

| Task Type | Load |
|---|---|
| *(fill in per stack — map task types to the bundled skills you actually use)* | |
| Any code change (discipline) | `clean-code` |
| Testing / TDD | `tdd`, `verification-before-completion` |
| Debugging (any) | `systematic-debugging` |
| Planning a large task | `writing-plans`, `plan-writing` |
| Frontend design/UX polish | `impeccable` |
| PixiJS engine work | `pixijs` (router) first, then the specific `pixijs-*` skill |

**Triage discipline**: skills not worth their context cost in this project go to
`.claude/skills-disabled/` (move the folder, note the reason in SKILL-SOURCES.md).
Do not re-enable them "just in case" — that is how the catalog noise grows back.

## 4. Do Not Use (forbidden — saves context)

*(list the bundled skills that are irrelevant to this repo's stack — deleting them
outright is even better than listing them; keep this section honest after triage)*
