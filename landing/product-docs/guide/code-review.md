# Code Review

Code review in Agent Teams is task-centered. You inspect what changed for a specific task instead of hunting through a large unstructured diff.

## Review surface

Use the review UI to:

- Inspect changed files
- Accept or reject individual hunks
- Leave comments
- Connect the diff back to the task and agent logs

## Review lifecycle

When a task is ready for review:

1. The author marks it `completed`.
2. A reviewer calls `review_start` to move the task into the **REVIEW** column.
3. The reviewer inspects hunks and logs.
4. If accepted, the reviewer calls `review_approve` to move the task to **APPROVED**.
5. If changes are needed, the reviewer calls `review_request_changes` with a comment describing what to fix.

::: tip
Approve the **work task** itself (e.g. `#1234`), not a separate "review task". The task ends in APPROVED, not DONE.
:::

## Hunk-level decisions

Accept small correct changes and reject isolated mistakes without throwing away the whole task. This is useful when an agent mostly solved the task but overreached in one file.

## Agent review workflow

Teams can review each other's work before you make the final call. This catches obvious regressions and keeps the board honest, but you should still review risky areas yourself.

## What to check manually

Prioritize:

- Provider auth and runtime detection
- IPC, preload, and filesystem boundaries
- Git and worktree behavior
- Parsing and task lifecycle logic
- Persistence and code review flows

## Verification

Prefer focused verification commands. Broad formatting or lint-fix commands should not be used unless the task explicitly intends broad formatting churn.
