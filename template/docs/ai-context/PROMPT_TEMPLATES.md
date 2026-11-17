# PROMPT_TEMPLATES — {{PROJECT_NAME}}

> Templates reused when prompting agents. Fill in per project; keep the original format.

## Task Execution
| Template | Use when | Content |
|---|---|---|
| Standard task | Any code/doc change | `Read: <files>` line → classify per Workflow Contract → **if non-trivial: create plan docs then STOP for approval** → after approval implement exactly the plan → verify with exact commands → fix until green → stop. Propose a commit message in the report, but commit/push only if explicitly asked in that turn — push/PR/merge does NOT imply commit permission; ask first when changes are uncommitted. |
| Casual "do this / do that" | Owner speaks loosely | Apply the Workflow Contract in AGENTS.md: prefer planning when in doubt; "plan"/"follow the process" forces a plan, "làm luôn"/"just do it" forces immediate action. |
| Ticket execution | Work from `docs/tickets/` | Read the ticket + its `Spec:` → rename `open-… → doing-…` at start → implement per the linked plan → verify green → rename `doing-… → done-…`. Never change state by editing the file body. |
| Verify before claim | Before saying "done" | Run the gates for the scope (tests, build, `node scripts/verify.mjs`, `node scripts/doc-truth.mjs`); quote actual output, never assert from memory. |

## Review / planning
| Template | Use when | Content |
|---|---|---|
| Plan | ≥3 files or ≥5 changes | Mandatory `drafts/plans/<MMDDYY>_<n>_<status>/implementation_plan.md` + `task.md`, immutable task IDs, verification last; tick `[x]` per task and rename to `_done`/`_cancelled` per the lifecycle. |
| UI critique | Visual/UX work | Load the design skill; decide Operate/Read mode; check contrast, focus, states, responsive; run the detector once; batch fixes. |
