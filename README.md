# engineering-kit

This is the engineering kit **I use to start my own AI-assisted projects**.

Every time I began something new, I found myself re-teaching my AI agents the same
things: read the repo before touching it, which docs are the source of truth, what
to verify before claiming "done", which conventions not to break. So I extracted
what kept working across a real 3-app product into one scaffold — and now a single
command gives any new project the setup I wish I had on day one:

```
npx github:tuilatri/engineering-kit init my-new-project --yes
```

It is opinionated (it encodes how I like to work) but not frozen: everything
project-specific lives in `kit.config.json` and `MEASURE` placeholders — you fill
in your own numbers, gates and conventions.

## What lands in your project

| You get | Where | What it does |
|---|---|---|
| A contract for agents | `AGENTS.md` | Pre-task checklist, standing rules, the **Doc Trigger** (read-before-edit / update-after-change) |
| Honest docs | `docs/ai-context/` (10 files) | Source-of-truth skeletons with `MEASURE` placeholders — plus a gate that fails when docs drift from reality |
| Role cards | `.claude/agents/` (10 roles) | Frontend/backend/QA/... each with owned scope, definition-of-done, escalate rules |
| Skills | `.claude/skills/` (95) + `skills-disabled/` (13) | Bundled, versioned with the repo; provenance in `SKILL-SOURCES.md`; triage per project |
| Verify gates | `scripts/verify.mjs` + `doc-truth.mjs` | Serial fail-fast runner reading `kit.config.json`; docs-vs-truth checks |
| Workflow | `docs/agents/` | Local markdown issue tracker (state = file rename) + label vocabulary |

A hidden `.engineering-kit` marker records which kit version generated the scaffold.

## Quick start

```bash
# From GitHub — works today (public repo, no npm account needed). Pin a release with #v0.3.2:
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
language (`--lang`, written into AGENTS.md).

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

1. **Process layer vs facts layer**: process is portable; numbers are `MEASURE`
   placeholders — measure, never guess (`doc-truth.mjs` keeps docs honest).
2. **Config-driven**: no hardcoded apps/gates — works for 1 app or 5.
3. **Zero-dependency**: Node stdlib only, Node ≥ 18, Windows-safe.
4. **Safe-by-default**: empty config → verify exits 0 with a warning; it never fails
   just because it has not been filled in yet.

## License

MIT — see [LICENSE](LICENSE). `example/` carries content of a separate private seed
repository and is included for reference only.
