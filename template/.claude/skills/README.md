# Skills — one canonical folder

ALL skills live here (repo-local, versioned with the repo). `init` bundles them by
default; `init --no-skills` skips them (this folder then starts empty and
`SKILL-SOURCES.md` is your starting manifest).

- **Manifest**: `SKILL-SOURCES.md` (repo root) — provenance, license, refresh
  commands, layer (local/global), triage status. Update it BEFORE adding a skill.
- **Disabled pool**: `../skills-disabled/` — installed but not loaded. Move a folder
  between the two to flip its state; record the reason in SKILL-SOURCES.md.
- **Layer rule**: these are the project's local skills; repo docs may depend on them
  (they ship with the repo). Never depend on globally-installed skills, and keep
  global-scope skill names distinct from these (shadowing precedence differs per tool).
- **Register per tool**: see the table at the bottom of SKILL-SOURCES.md.
