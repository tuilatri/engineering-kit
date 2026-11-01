# engineering-kit

Engineering kit for AI-assisted projects: **prompt / context / loop / harness / agentic setup**.
One `init` command gives a new project the full battle-tested scaffolding.

```
npx github:tuilatri/engineering-kit init my-new-project --yes
```

## What the kit provides (6 layers)

| Layer | Files after init | Purpose |
|---|---|---|
| 1. Contract | `AGENTS.md` (+ `CLAUDE.md` shim if needed) | The agent constitution: Pre-Task Checklist, Standing Rules, **Doc Trigger** (one condition, two directions), Quick Facts |
| 2. Context docs | `docs/ai-context/` (10 files) | Source of truth describing the existing code: MODULE_MAP, ARCHITECTURE, API_MAP, FRONTEND_MAP, TESTING_GUIDE, KNOWN_TRAPS, BEHAVIORAL_GUIDELINES, UI_UX_RULES, PROMPT_TEMPLATES |
| 3. Agent roles | `.claude/agents/` (10 role cards) | Standard frontmatter + Tier + Required Reading + Owned Scope + Verify (definition of done) + Escalate/Never Do + Handover |
| 4. Skills | `.claude/skills/` (bundled corpus, 95 skills) + `skills-disabled/` pool | One canonical folder, versioned with the repo; manifest + provenance in `SKILL-SOURCES.md`; triage per project |
| 5. Harness (loop) | `scripts/verify.mjs` + `scripts/doc-truth.mjs` | Fail-fast **config-driven** gate runner + the docs-stale gate ("code is right, docs are wrong") |
| 6. Workflow | `docs/agents/` issue tracker + triage | Local markdown tracker (state = file rename), label vocabulary |

## Quick start

```bash
# From GitHub — works today (public repo, no npm account needed). Pin a release with #v0.3.1:
npx github:tuilatri/engineering-kit init my-new-project --yes

# From the npm registry — only after the owner runs `npm publish --access public`:
npx engineering-kit init my-new-project

# Dev mode without any publishing:
node <this-repo>/src/init.mjs my-new-project --yes

cd my-new-project
# 1. Fill kit.config.json: apps + gates + claims (see kit.config.schema.json)
# 2. Try the harness:
node scripts/verify.mjs --list   # list gates; add --fast to skip "slow"-tagged gates
# 3. Measure real numbers (test/line counts) → docs/ai-context/TESTING_GUIDE.md §1 + AGENTS.md Quick Facts
# 4. Read every docs/ai-context file — replace content that does not match your domain
# 5. Review the bundled skills triage per your stack (.claude/skills vs skills-disabled)
#    and record every source in SKILL-SOURCES.md  (--no-skills skips the bundle)
```

CLI: `engineering-kit init <dir> [--name <name>] [--lang vi|en] [--no-skills] [--yes]`.
Without `--yes` it asks at most 2 questions (project name, agent chat language).
Guard: it never overwrites a directory that already has `AGENTS.md`.

All kit artifacts are written in English; the only language knob is the agent chat
language (`--lang`, written into AGENTS.md as `{{CHAT_LANGUAGE}}`).

## `template/` vs `example/`

| Directory | Role | In npm package? |
|---|---|---|
| `template/` | Copied 1:1 into the target project by `init` — scrubbed of all seed numbers (placeholders say `MEASURE`) | ✅ |
| `example/` | A real repository that ran the kit (3 apps) — reference for how to fill it in | ❌ — browse on GitHub |

Browse `example/`: <https://github.com/tuilatri/engineering-kit/tree/main/example>

## `kit.config.json` — the single configuration source

`verify.mjs` + `doc-truth.mjs` read gates/claims from it; init generates a starter
(empty arrays).

```json
{
  "project": { "name": "my-project", "chatLanguage": "vi" },
  "apps":   [{ "id": "backend", "path": "backend", "verify": "python -m pytest tests/ -q" }],
  "claims": [{ "doc": "docs/ai-context/MODULE_MAP.md", "re": "^## backend — .* · ([\\d.]+) lines", "kind": "lines:backend" }],
  "gates":  [{ "id": "backend-tests", "cmd": "python", "args": ["-m", "pytest", "tests/", "-q"], "cwd": "backend", "tags": ["slow"] }]
}
```

Full schema: [kit.config.schema.json](kit.config.schema.json). Full 3-app example:
[kit.config.example.json](kit.config.example.json).

## Developing this kit

```bash
git clone https://github.com/tuilatri/engineering-kit && cd engineering-kit
npm test                    # lifecycle test: init → verify PASS/FAIL → determinism → npm pack
node src/init.mjs /tmp/demo # try init manually
```

Publish (only when the repo owner says so): `npm pack` to inspect the tarball → `npm publish --access public`.

## Design principles

1. **Process layer vs facts layer**: process is portable; numbers (test/line counts) are
   `MEASURE` placeholders — measure, never guess (`doc-truth.mjs` keeps docs honest).
2. **Config-driven**: no hardcoded apps/gates — works for 1 app or 5.
3. **Zero-dependency**: Node stdlib only, Node ≥ 18, Windows-safe.
4. **Safe-by-default**: empty config → verify exits 0 with a warning; it never fails
   just because it has not been filled in yet.

## License

MIT — see [LICENSE](LICENSE). `example/` carries content of a separate private seed
repository and is included for reference only.
