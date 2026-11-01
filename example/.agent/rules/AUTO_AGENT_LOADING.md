# AUTO_AGENT_LOADING.md - Auto-apply .agent/ resources

> **Priority:** P0 - Must execute BEFORE any task implementation.

---

## MANDATORY: Pre-Task Agent Loading

**At the start of EVERY conversation or task, you MUST:**

1. **Read `.agent/rules/`** - Load all rule files and apply them throughout the session
2. **Read `.agent/ARCHITECTURE.md`** - Understand the project structure and agent system
3. **Scan `.agent/workflows/`** - Identify workflows relevant to the current task
4. **Scan `.agent/skills/`** - Identify skills relevant to the current task type
5. **Read `color_used.txt`** - Load brand color palette for any UI-related work
6. **Read `accounts.txt`** - If testing with different roles is required, ALWAYS use the accounts provided in this file.
7. **Update Artifacts** - You MUST create or update the `task.md` and `implementation_plan.md` artifacts for the current chat session, regardless of whether the user's task is large or small.

### Skill Auto-Selection by Task Type

| Task Type | Auto-load Skills |
|-----------|-----------------|
| UI/CSS/Design | `frontend-design`, `ui-ux-pro-max`, `clean-code` |
| React Components | `react-patterns`, `frontend-design`, `clean-code` |
| API/Backend | `api-patterns`, `database-design`, `clean-code` |
| Debugging | `systematic-debugging`, `clean-code` |
| Planning/Architecture | `plan-writing`, `architecture` |
| Testing | `testing-patterns`, `webapp-testing` |
| Performance | `performance-profiling` |
| Deployment | `deployment-procedures` |

### Workflow Auto-Selection

| Task Complexity | Suggested Workflow |
|----------------|-------------------|
| Multi-file, structural changes | `orchestrate.md` |
| New feature creation | `create.md` + `plan.md` |
| UI/UX improvements | `ui-ux-pro-max.md` + `enhance.md` |
| Bug fixing | `debug.md` |
| Code review/testing | `test.md` |

---

## 🔔 MANDATORY: Activation Report

> **At the START of every task**, BEFORE any implementation, you MUST display a brief **Activation Report** to the user. This confirms that resources are actually loaded and applied.

### Report Format

```
📋 **Activation Report**
- **Rules:** [list of .agent/rules/ files loaded]
- **Agent:** [agent name, e.g. frontend-specialist]
- **Skills:** [list of skills applied, e.g. react-patterns, clean-code]
- **Workflow:** [workflow used, e.g. enhance.md, or "N/A"]
- **Artifacts:** task.md ✅ | implementation_plan.md ✅
```

### Rules
1. This report MUST be the **first thing** communicated to the user when starting a task
2. If any resource is not applicable, write "N/A"
3. The report should be **concise** — a single block, not a long explanation
4. After displaying the report, proceed with the task immediately

---

## Enforcement

- **DO NOT** start coding without first checking `.agent/` resources
- **DO NOT** ask the user which agent/skill to use - auto-select based on task type
- **Display the Activation Report** at the start of every task to confirm loaded resources
- **ONLY** if the user explicitly mentions `commands.txt` in the prompt, read it AND apply `.agent/` resources together. Otherwise, ignore `commands.txt` and proceed with auto-applying resources.
---

## Detailed Plan for Large Tasks

When a task meets ANY of these criteria, create a **hierarchical plan** (1 → 1.1 → 1.1.1):
- Involves **>= 3 files**
- Requires **>= 5 distinct changes**
- Spans **multiple components** (e.g. backend + frontend)
- User explicitly asks for a detailed plan

### Plan Format

```
1. [Component/Area]
   1.1. [Sub-task]
      1.1.1. [Specific action] — file: `path/to/file`
      1.1.2. [Specific action] — file: `path/to/file`
   1.2. [Sub-task]
2. [Component/Area]
   ...
```

### Quota-Safe Execution

- **Always update `task.md`** with `[x]` after completing each sub-task
- If the task is very large, **ask user**: "Should I do section 1 first, then continue in the next chat?"
- `task.md` serves as a **checkpoint** — a new conversation can read it and resume from where it stopped
- Prioritize completing **logical units** (e.g. finish all of section 1 before starting section 2) so partial completion is still useful

---

## 💬 Commit Message Suggestion

**MANDATORY:** At the end of every completed task, suggest a **commit message** for the user following Conventional Commits format:

- Use prefixes: `feat:`, `fix:`, `refactor:`, `chore:`, `style:`, `docs:`, `test:`, `perf:`
- Add scope when applicable: `fix(product-status):`, `feat(supplier):`
- Provide 2–3 options: one short, one detailed with bullet body
- Keep the subject line under 72 characters

---

## Chat Language

- Respond in Vietnamese when chatting with the user
- Code comments, variable names, and technical documentation remain in English
