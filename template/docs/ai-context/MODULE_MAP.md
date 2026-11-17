# MODULE_MAP — {{PROJECT_NAME}}

> Source of truth for repo structure. Line counts = non-empty (TESTING_GUIDE §1 convention).
> doc-truth.mjs parses the table below: `| \`path\` | number |` — keep the format when editing.
>
> **How to fill:** one `## <app> — <stack>` block per app with measured non-empty line counts (see TESTING_GUIDE §1). Never hand-write numbers — measure them; keep the row format intact so doc-truth can verify it.

## <app1> — <stack> · MEASURE lines · MEASURE files

### `<app1>/src/` — MEASURE lines

| File | Lines | Role |
|---|---:|---|
| `<file>` | MEASURE | <role> |

## Conventions
- Line counts: non-empty lines (`git ls-files` + count non-empty lines)
- Numbers use dot thousands-separators: "5.670" = 5670
- This table is parsed by doc-truth.mjs — new rows must carry MEASURED numbers
