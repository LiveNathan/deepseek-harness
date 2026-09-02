# Agent Note: pi-ai maps transient quota 429s to retryable RATE_LIMIT and honors the retry delay

Status: implemented

English | [中文](2026-09-02-pi-ai-transient-quota-retry.zh.md)

## Problem

Gemini returns HTTP 429 `RESOURCE_EXHAUSTED` for its per-minute input-token quota. The flattened pi-ai error text carries the quota wording ("You exceeded your current quota") alongside a transient retry hint — the Google RPC `RetryInfo` detail (`"retryDelay": "10s"`) and the `Please retry in 10.7s` prose. `classifyPiAiError` matched the quota wording first and mapped the failure to the terminal `QUOTA` code, which is deliberately outside the default retryable set, so `dsh-llm-retry` delegated and the turn failed immediately. The provider's retry delay was also dropped: `mapStopReason` built the error failure from only `message` and `code`. Concurrent fan-out of large prompts therefore lost the affected subagents instead of backing off and retrying.

## Decision

`dsh-llm-pi-ai` distinguishes a transient quota (one that names a retry delay) from terminal account-quota/balance exhaustion:

- `providerRetryAfterMs(message)` extracts the provider's retry-after hint from the flattened text: Google's `"retryDelay": "10s"` (a protobuf Duration of seconds) or the `Please retry in 10.7s` / `retry after 5s` wording, returning a positive millisecond delay or `undefined`.
- `classifyPiAiError` classifies a quota message that also carries a transient retry hint (`providerRetryAfterMs` present, or Google's `RESOURCE_EXHAUSTED` status) as `RATE_LIMIT`; a quota message with no such hint stays `QUOTA`.
- `mapStopReason` attaches the parsed delay to the error failure as `providerRetryAfterMs`, so the existing `dsh-llm-retry` policy honors the provider instruction (waiting the named delay when it does not exceed `maxDelayMs`) instead of the local exponential backoff.

No change to `dsh-llm`'s transient-code set or to `dsh-llm-retry`: `QUOTA` remains terminal by default, and the pi-ai adapter reports the transient case through the existing `RATE_LIMIT` code.

## Alternatives considered

**Add `QUOTA` to the default retryable codes.** Rejected: it would retry genuinely terminal account-quota or balance exhaustion (which carries no retry delay) up to `maxRetries` times for no benefit, contradicting the bounded-recovery decision that keeps quota non-transient by default.

**Classify every 429 with quota wording as `RATE_LIMIT`.** Rejected: the OpenAI terminal form ("You exceeded your current quota, please check your plan and billing details.") carries the same wording with no retry delay, and must stay `QUOTA`.

**Retry inside `dsh-llm-retry` based on `providerRetryAfterMs` presence alone.** Rejected: the retry plugin routes on the stable failure code, and adapters report facts while policy decides action; moving the transient/terminal judgment into the plugin would reverse that split.

## Consequences

- A transient per-minute quota 429 now backs off for the provider-named delay and retries instead of failing the turn immediately, so concurrent subagent fan-out recovers rather than losing children.
- A terminal quota error (no retry hint) still fails immediately with `QUOTA`, unchanged.
- The parsed delay is a provider observation carried on the existing `LlmFailure.providerRetryAfterMs` field, so the retry policy's over-cap delegation and no-jitter delay handling apply unchanged.
