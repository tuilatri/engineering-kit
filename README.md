# engineering-kit

Personal engineering kit I use to scaffold my own AI-assisted projects.

```
npx github:tuilatri/engineering-kit init my-new-project --yes
```

Pin a release: `npx github:tuilatri/engineering-kit#v0.3.2 init my-new-project --yes`.
Registry path (only after `npm publish`): `npx engineering-kit init my-new-project`.
Dev mode: `node <this-repo>/src/init.mjs my-new-project --yes`.

## What lands in the project

| You get | Where | What it does |
|---|---|---|
| A contract for agents | `AGENTS.md` | Pre-task checklist, standing rules, the **Doc Trigger** (read-before-edit / update-after-change) |
| Honest docs | `docs/ai-context/` (10 files) | Source-of-truth skeletons with `MEASURE` placeholders — plus a gate that fails when docs drift from reality |
| Role cards | `.claude/agents/` (10 roles) | Frontend/backend/QA/... each with owned scope, definition-of-done, escalate rules |
| Skills | `.claude/skills/` (95) + `skills-disabled/` (13) | Bundled, versioned with the repo; provenance in `SKILL-SOURCES.md`; triage per project |
| Verify gates | `scripts/verify.mjs` + `doc-truth.mjs` | Serial fail-fast runner reading `kit.config.json`; docs-vs-truth checks |
| Workflow | `docs/agents/` | Local markdown issue tracker (state = file rename) + label vocabulary |

A hidden `.engineering-kit` marker records which kit version generated the scaffold.

## After init

```bash
cd my-new-project
# 1. Fill kit.config.json: apps + gates + claims (see kit.config.schema.json)
# 2. node scripts/verify.mjs --list   # list gates; add --fast to skip "slow"-tagged gates
# 3. Measure real numbers (test/line counts) → docs/ai-context/TESTING_GUIDE.md §1 + AGENTS.md Quick Facts
# 4. Read every docs/ai-context file — replace content that does not match your domain
# 5. Review the bundled skills triage per your stack (.claude/skills vs skills-disabled)
#    and record every source in SKILL-SOURCES.md  (--no-skills skips the bundle)
```

CLI: `engineering-kit init <dir> [--name <name>] [--lang vi|en] [--no-skills] [--yes]`.
Guard: it never overwrites a directory that already has `AGENTS.md`.

## `template/` vs `example/`

| Directory | Role | In npm package? |
|---|---|---|
| `template/` | Copied 1:1 into the target project by `init` — scrubbed of all seed numbers (placeholders say `MEASURE`) | ✅ |
| `example/` | A real repository that ran the kit (3 apps) — reference for how to fill it in | ❌ — browse on GitHub |

Browse `example/`: <https://github.com/tuilatri/engineering-kit/tree/main/example>

## `kit.config.json` — the single configuration source

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
4. **Safe-by-default**: empty config → verify exits 0 with a warning.

## License

MIT — see [LICENSE](LICENSE). `example/` carries content of a separate private seed
repository and is included for reference only.
