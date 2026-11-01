# SKILL-SOURCES — where every skill comes from (and how to refresh it)

The kit bundles skills into ONE canonical folder: `.claude/skills/` (repo-local,
versioned with the repo) with a disabled pool in `.claude/skills-disabled/`.
This file is the manifest: provenance, license, how to refresh each group, which
layer (local/global) each lives in, and the triage status.

**Standing rules** (mirror of `AGENTS.md` → BEHAVIORAL_GUIDELINES):
1. Skills are **repo-local** — never assume a global skills directory. Repo docs
   must never depend on globally-installed skills.
2. A global layer is allowed as **personal convenience** (tool-agnostic work habits
   only). Keep global skill names distinct from local ones to avoid shadowing
   (precedence differs per tool).
3. Per-tool registration lives in "Register per tool" below — one canonical folder,
   every tool pointed at it.

## Inventory (measured at packaging)

| Group | Count | Source | License | Layer | Triage |
|---|---|---|---|---|---|
| Engineering process skills (mattpocock) | 27 | `github:mattpocock/skills` | MIT | local | ACTIVE |
| PixiJS v8 API reference (26 dirs) | 26 | `github:pixijs/pixijs-skills` | MIT | local | ACTIVE — load only for PixiJS work |
| obra/superpowers discipline skills | 3 (`verification-before-completion`, `writing-plans`, `systematic-debugging`) | `github:obra/superpowers` | MIT | local | ACTIVE |
| Impeccable (frontend design/UX) | 1 | vendored (v4.1.2, identical copy in both seed trees) | Apache 2.0 | local | ACTIVE |
| Antigravity Kit v5.0 core (stack knowledge + process) | 38 | bundled toolkit (⚠ provenance unclear — personal use; no license field in source) | — | local | ACTIVE — triage per project |
| Seed triage pool (disabled as irrelevant/mature) | 11 | see below | MIT | local (pool) | DISABLED |
| TDD dedupe | 2 (`tdd-workflow`, `test-driven-development`) | Antigravity / obra | — | local (pool) | DISABLED — `tdd` (mattpocock) is the active one |
| GitNexus code-intelligence | 9 sub-skills | auto-provided by `npx gitnexus analyze` | — | tool-managed | NOT bundled — do not vendor |

Active total: **95 skill dirs** · pool: **13 dirs** · not bundled: gitnexus (9).

### Group members

- **mattpocock (27)**: ask-matt, code-review, codebase-design, diagnosing-bugs, domain-modeling, git-guardrails-claude-code, grill-with-docs, grilling, handoff, implement, implement-spec, improve-codebase-architecture, migrate-to-shoehorn, pr, prototype, research, retro, setup-matt-pocock-skills, setup-pre-commit, setup-ts-deep-modules, tdd, to-spec, to-tickets, wait-what, wayfinder, wizard, writing-for-agents
- **pixijs (26)**: pixijs (router), pixijs-accessibility, pixijs-application, pixijs-assets, pixijs-blend-modes, pixijs-color, pixijs-core-concepts, pixijs-create, pixijs-custom-rendering, pixijs-environments, pixijs-events, pixijs-filters, pixijs-html-source, pixijs-math, pixijs-migration-v8, pixijs-performance, pixijs-scene-container, pixijs-scene-core-concepts, pixijs-scene-dom-container, pixijs-scene-gif, pixijs-scene-graphics, pixijs-scene-mesh, pixijs-scene-particle-container, pixijs-scene-sprite, pixijs-scene-text, pixijs-ticker
- **obra (3 active)**: verification-before-completion, writing-plans, systematic-debugging
- **impeccable (1)**: impeccable
- **Antigravity core (38)**: api-patterns, app-builder, architecture, bash-linux, behavioral-modes, brainstorming, clean-code, code-review-checklist, database-design, deployment-procedures, docker-expert, documentation-templates, frontend-design, game-development, geo-fundamentals, i18n-localization, lint-and-validate, mcp-builder, mobile-design, nestjs-expert, nextjs-best-practices, nodejs-best-practices, parallel-agents, performance-profiling, plan-writing, powershell-windows, prisma-expert, python-patterns, react-patterns, red-team-tactics, seo-fundamentals, server-management, tailwind-patterns, testing-patterns, typescript-expert, ui-ux-pro-max, vulnerability-scanner, webapp-testing
- **Allowlisted content**: `ui-ux-pro-max/data/products.csv` + `data/ui-reasoning.csv` contain the design-aesthetic keyword "Cozy" in third-party dataset rows (upstream vocabulary, not a seed-project reference) — exempt from the seed-name grep gate.
- **Pool (13)**: chief-of-staff, claude-handoff, grill-me, loop-me, scaffold-exercises, tdd-workflow, teach, test-driven-development, to-questionnaire, triage, writing-beats, writing-fragments, writing-shape

## Refresh / add skills

```bash
# Re-pull the latest mattpocock set into a scratch dir, then diff/merge selectively:
npx skills@latest add mattpocock/skills -a claude-code -y
# PixiJS skills: re-vendor from the repo when PixiJS majors change.
# GitNexus: never vendor — `npx gitnexus analyze` restores its own skills per repo.
```

When adding a skill from a new source: add a row here FIRST (source, license, layer,
triage), then drop the folder into `.claude/skills/` (or `skills-disabled/`), then run
the project's verify gate (skill-integrity checks count dirs against this manifest).

## Register per tool (both layers: local + optional global)

| Tool | Local (canonical) | Optional global layer |
|---|---|---|
| Claude Code | `.claude/skills/` — scanned natively | `~/.claude/skills/` — scanned natively |
| OpenCode | `opencode.json` → `"skills": {"paths": [".claude/skills"]}` | append your home path to the same array |
| ZCode | workspace/project scope | user scope (`~/.agents/skills/`) — auto-discovered, workspace shadows user |
| Antigravity | workspace `.agent/`-style dirs → point at `.claude/skills/` | `~/.gemini/antigravity/skills/` — scanned natively |

`kit.config.json` → `skillPaths` is the declarative single source for these paths
(default `[".claude/skills"]`; append a global path only if you accept that fresh
clones/CI won't see that layer). Tools differ in shadowing order — keep names unique
across layers.
