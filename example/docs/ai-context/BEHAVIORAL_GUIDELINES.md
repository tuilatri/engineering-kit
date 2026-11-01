# Behavioral Guidelines — Thinking Principles & Skill Selection

> Split from AGENTS.md (P8-1) — read when starting a large task, choosing a skill, or designing architecture.
> Referenced by the AGENTS.md Doc Trigger table.

---

## 1. Think Before Coding

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

- Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- If you write 200 lines and it could be 50, rewrite it.

## 3. Surgical Changes

- Touch only what you must. Clean up only your own mess.
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

## 4. Goal-Driven Execution

- Transform tasks into verifiable goals: "Add validation" → "Write tests for invalid inputs, then make them pass"
- For multi-step tasks, state a brief plan with verification steps.
- Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Skill Auto-Selection by Task Type

**All skills in this table are loaded via `skill({id})`.** The `.agent/skills/` branch only works after `opencode.json` declares `skills.paths: [".agent/skills"]`.

> **Agent roles (P12-1):** skill = CAPABILITY (how to do it), agent = ROLE (who does it). `.claude/agents/` has 11 role files (fe/be/map-artist/qa + mobile/devops/db/security/test-writer/release/doc-writer) — spawned via `subagent_type`; their bodies ONLY reference these docs, they do not copy them.

> **External skills — mattpocock/skills (P12-3, MIT):** 28 skills ACTIVE in
> `.claude/skills/`; 9 DISABLED in `.claude/skills-disabled/` per triage (writing
> craft ×4, loop/teach/triage/questionnaire/scaffold, claude-handoff); 3 DELETED as
> duplicates (gitnexus bundle — use `.agents/skills/gitnexus-*`, chief-of-staff —
> Lead role, grill-me — superseded by grill-with-docs). Main groups: spec-driven
> workflow (to-spec → to-tickets → implement-spec; tracker = local markdown at
> `docs/agents/issue-tracker-local.md`), discipline (tdd, diagnosing-bugs,
> codebase-design, domain-modeling), docs craft (writing-for-agents, grilling).
> Full triage table: `drafts/plans/103126_02_in_progress/` (untracked).

| Task Type | Auto-load Skills |
|---|---|
| **Any change in `backend/`, `frontend/`, `mobile/`** | **`book-collection-conventions`** |
| UI / UX / Styling / Visual Polish | `impeccable`, `ui-ux-pro-max`, `frontend-design` |
| Tailwind / CSS | `tailwind-patterns` |
| React / Frontend Architecture | `react-patterns`, `typescript-expert`, `clean-code` |
| Next.js / Routing | `nextjs-best-practices` |
| Python / FastAPI / Backend API | `python-patterns`, `api-patterns`, `clean-code` |
| Database / Schema / Prisma | `database-design`, `prisma-expert` |
| Performance & Optimization | `performance-profiling`, `clean-code` |
| Testing & Verification | `testing-patterns`, `tdd-workflow` |
| Debugging (any) | `systematic-debugging` (also installed from obra/superpowers) |
| **PixiJS v8 (any)** | **`pixijs`** (router) + `pixijs-application`, `pixijs-ticker`, `pixijs-scene-*`, `pixijs-assets`, `pixijs-performance`, `pixijs-events`, `pixijs-blend-modes`, `pixijs-color`, `pixijs-filters`, `pixijs-math` — 26 official skills from pixijs/pixijs-skills |
| Testing / TDD | `test-driven-development` (obra/superpowers) — force tests before code |
| Writing plans | `writing-plans` (obra/superpowers) — detailed plan template |
| Brainstorming | `brainstorming` (obra/superpowers) — before creating a new feature |
| Verification | `verification-before-completion` (obra/superpowers) — before claiming done |
| Code review / security | `code-review-checklist`, `red-team-tactics`, `vulnerability-scanner` |
| Lint / type-check after edits | `lint-and-validate` |
| Multi-step planning | `plan-writing`, `behavioral-modes` |
| Windows / PowerShell / shell | `powershell-windows`, `bash-linux` |
| Architecture / Docs | `architecture`, `documentation-templates` |
| GitNexus / Exploring | `gitnexus-exploring` |
| GitNexus / Impact | `gitnexus-impact-analysis` |
| GitNexus / Debugging | `gitnexus-debugging` |
| GitNexus / Refactoring | `gitnexus-refactoring` |
| GitNexus / Guide | `gitnexus-guide` |
| GitNexus / CLI | `gitnexus-cli` |
| GitNexus / Security review (taint) | `gitnexus-taint-analysis` |
| GitNexus / PDG query (CDG, data flow) | `gitnexus-pdg-query` |
| GitNexus / PR review | `gitnexus-pr-review` |

### Do not use in this repo

The following skills **are installed but not relevant** — do not load them, they waste context and cause misdirection:

`webapp-testing` (FE/mobile has no tests) · `deployment-procedures`, `docker-expert`, `server-management`, `nodejs-best-practices` (repo does not deploy) · `seo-fundamentals`, `geo-fundamentals` (internal app, not public) · `nestjs-expert` (no NestJS) · `i18n-localization` (single language only) · `mcp-builder` (no MCP server) · `mobile-design` (`mobile/` only captures photos, not a product app) · `templates`, `app-builder`, `brainstorming`, `parallel-agents` (repo already has structure, no new scaffolding).

> **P6-1+**: The repo DOES have a 2D game (PixiJS v8 top-down map) — the `pixijs-*` skills are installed from [pixijs/pixijs-skills](https://github.com/pixijs/pixijs-skills) (26 skills, MIT). The `pixijs` skill is the router — load it BEFORE touching engine code.

**Principle:** before installing a skill/script from an external source, **read it first** and run `grep` for danger signs (network calls to unknown hosts, `eval`, `exec`, unguarded `subprocess`). There is no built-in scanner in this repo — check yourself.

---

## Hierarchical Plan for Large Tasks

When a task involves **>=3 files**, **>=5 distinct changes**, or **spans multiple components**, create a hierarchical plan:

```
1. [Component/Area]
   1.1. [Sub-task]
      1.1.1. [Specific action] — file: `path/to/file`
      1.1.2. [Specific action] — file: `path/to/file`
   1.2. [Sub-task]
2. [Component/Area]
   ...
```

---

## Pre-Task Workflow (adapted from `.agent/rules/AUTO_AGENT_LOADING.md`)

At the start of every task — **all steps are MANDATORY, in order, before writing any code**:
1. **Re-read AGENTS.md** — refresh all rules for this session
2. **Check GitNexus index freshness** — `read_mcp_resource` `gitnexus://repo/BooK_Collection_Management/context` (re-index with `node .gitnexus/run.cjs analyze` if stale)
3. **Check the Doc Trigger table below** — read the `docs/ai-context/*` file matching what you're about to touch. Declare it in your first line of reply.
4. **Load the relevant skill(s)** from `.agent/skills/` based on task type (table above) via the `skill` tool — do this BEFORE starting the work, not after
5. **Before EVERY edit to a function/class/method/variable** — run `impact({target, direction})` (and `context`/`query` when needed) on the target symbol; report blast radius to the user. NEVER skip this. Do not begin editing until impact is run and (if HIGH/CRITICAL) the user is warned.
6. **If task is large (>=3 files, >=5 changes, or spans more than one of backend/frontend/mobile)** — create a hierarchical plan before coding
7. **Before committing** — run `detect_changes()` to verify only expected symbols/flows changed
8. 🔴 **Tasks must be referenced by immutable ID** (`P2-9`, `PR #7`, commit `8a12e83`) — do **NOT** use "item N" / "that thing" / "what was just mentioned".
9. 🔴 **Read `drafts/notes/lessons.md`** (gitignored) — apply the **final checklist** in that file.
