# Agent Note: External activation may publish its own child

Status: implemented

English | [中文](2026-10-20-external-activation-published-child.zh.md)

## Problem

`SubagentManager` reserves a random `pendingId` before starting an external backend, then adopts the provider's `SubagentRun.id` as the activation's child id. Until this fix it required that id to be absent from `resident`, `ctx.agents`, and `ctx.sessions`. A provider that creates a local Session-backed child inside `start()` — the `subagent_worktree` profile plugin's `worktree` provider — publishes both registries under the id it returns, so the check rejected the run's own child with `DUPLICATE_CHILD` and disposed it. Every `subagent_worktree` call failed; plain `subagent` and `subagent_flash` were unaffected because they are local backends prepared through `prepareContinuable()`.

## Decision

`assertChildIdAvailable` accepts the delegating parent for an external start and ignores an Agent or Session whose `parentSession` is that parent. A resident activation under the id still rejects, and so does any Agent or Session outside that parent's children. Local creation calls the method without a parent and keeps the strict check.

The provider contract already places `SubagentRun.id` in the shared Session id namespace. The check now distinguishes the child this run just published from an id someone else owns, without requiring the provider to declare which.

## Alternatives considered

**Make `subagent_worktree` a local provider through `prepareContinuable()`.** The manager would create the child and honor `request.cwd`, and the plugin would drop its fork of the in-process driver. That is the smaller plugin, but it moves the change outside this repository and leaves the manager rejecting every other provider that publishes a Session-backed child from `start()`.

**Keep only the `resident` check for external runs.** One condition, but a provider returning the id of an unrelated live parent or Session would then overwrite that entry in `resident`. The parent-scoped exception keeps that guard.

**Have an external provider return its child Agent on `SubagentRun`.** That identifies the child exactly, but adds a host Agent to the public external-run contract for one consumer.

## Consequences

An external provider that publishes its own child now starts successfully, and the existing unparented Agent or Session rejection still fails loud and disposes the new handle. The check trusts the child's `parentSession` rather than object identity, so an external provider that returns the id of a pre-existing sibling child of the same parent is accepted; a live activation under that id is still rejected, and providers mint fresh ids.

## Testing

`packages/subagent/subagent/tests/external-activation.spec.ts` starts an external run that publishes an Agent and Session parented to the delegating parent and asserts startup and result delivery succeed. `external-lifecycle.spec.ts` keeps the unparented-Session collision rejection.
