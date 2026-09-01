# Agent Note: Report a continuable child parking in `waiting` to its parent

Status: implemented

English | [中文](2026-09-01-subagent-waiting-park-notice.zh.md)

## Problem

A continuable background child that spawns its own continuable descendants enters a `waiting` residency state when its turn ends while those descendants are still running. Nothing fired on the running→waiting transition, so the parent received no signal between "child dispatched" and "child settled". `list_agents` collapses the state to `idle`, whose own contract admits the ambiguity (a resident Agent between turns, possibly waiting on agents it started), so a supervisor could not distinguish a child productively waiting on its descendants from a stalled one without polling.

## Decision

`SubagentContinuationManager` tells the durable direct parent when a child first parks in `waiting`. `watchSettlement` observes the running→waiting transition and calls the new `notifyParked`, which emits one user-role notice — `Background subagent <id> is waiting on its subagents (<ids>) and will report when they settle.` — sourced as a new `subagent-waiting` message source kind with form `notice`, parallel to the existing `subagent-settled` kind. The notice is reported once per Activation: `waitingNotified` is set on the first observation and never cleared, so a child that wakes and parks again is not re-reported.

Delivery reuses the settlement path, extracted as `deliverParentNotice`: a parent whose teardown began is injected without a wake, an idle parent is woken, a busy parent is steered, a parent that left the registry is skipped, and a rejected send is logged without blocking disposal. The message construction stays in each `notify*` method because the two notices differ in content; only the delivery policy is shared.

## Alternatives considered

**Hold the turn open until the descendants settle.** Not implementable as stated: the agent loop cannot force the model to keep producing. Its useful variant — auto-resume the parked manager with each descendant's settlement summary — is a larger behavior change with loop risk and belongs in its own discussion.

**Re-report every running→waiting transition.** Clearing `waitingNotified` on each waking delivery would emit a second notice after every interim turn. The first park is the signal the parent needs; later parks add no information.

**Expose the state through `list_agents` only.** Fixing the gap at the transition benefits every consumer and keeps the ambiguous `idle` reading unchanged rather than growing a new vocabulary in the list entry.

## Consequences

- The parent now receives one signal per child lifetime that the child is working through its descendants, closing the gap that forced polling. The eventual settlement notice still closes the loop.
- `subagent-waiting` is a merge-extensible `MessageSourceMap` entry, so consumers that do not recognize it fall through the documented default and present it as opaque content; no switch on the closed set of notice kinds breaks.
- A park summary naming many children is bounded by the existing notice summary cap (`boundContextSummary`); the full child list remains in the message content.
- `deliverParentNotice` consolidates the two parent-facing runtime accounts under one delivery policy. Its branches were already covered by the settlement-delivery tests; the new park wording and the dedup are pinned by a unit test that parks a child, wakes it, and asserts the parent still has exactly one notice.

## Related

The shared delivery policy and its ordering rules come from [settlement delivery](../feature/2026-08-06-manager-owned-subagent-settlement-delivery.md).
