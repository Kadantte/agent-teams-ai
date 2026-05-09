# Agent Workflow

Agent Teams makes agent work visible as task state, messages, logs, and reviewable code changes.

## Lifecycle

| Stage | What happens |
|-------|--------------|
| Provisioning | The app starts the team and confirms runtime readiness |
| Planning | The lead creates tasks and may assign teammates |
| In progress | Agents work in parallel and update task state |
| Review | Changes are reviewed by agents or by you |
| Done | Accepted work stays linked to its task history |

## Kanban board

The board is the primary operating surface. It lets you scan work, spot blocked tasks, open task detail, inspect logs, and review changes without reading raw session files.

## Messages and comments

Use **direct messages** when you need to redirect an agent or ask a quick question. Use **task comments** when the note belongs to a specific piece of work. Comments preserve context for later review.

::: tip
Task comments are the durable delivery channel. Agents should post findings, decisions, and blockers in comments so the whole team can see them on the board.
:::

## Work-sync protocol

Agents follow a strict status cycle:

1. **Start** — mark the task `in_progress` when beginning real work.
2. **Comment** — post a short note before doing follow-up fixes.
3. **Reopen** — move the task back to `in_progress` for additional work.
4. **Result comment** — post a summary of changes.
5. **Complete** — mark the task `completed`.

::: warning
Never skip the comment-and-status cycle. The board depends on accurate state to show what is actually happening.
:::

## Task logs

Task-specific logs isolate runtime output, actions, and messages for one assignment. Use them when you need to answer:

- What did this agent run?
- Why did it change this file?
- Did it ask another teammate for help?
- Which task produced this diff?

## Live processes

The live process section shows URLs and running processes when agents start local servers or tools. Open URLs directly from the app to inspect results.

## Cross-team communication

Teams can send messages to each other. Use this to share findings, request reviews, or coordinate work across team boundaries without leaving the board.
