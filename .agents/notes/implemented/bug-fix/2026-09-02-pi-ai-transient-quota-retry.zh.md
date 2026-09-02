# Agent Note: pi-ai 将瞬时配额 429 归类为可重试的 RATE_LIMIT 并遵守重试延迟

Status: implemented

[English](2026-09-02-pi-ai-transient-quota-retry.md) | 中文

## 问题

Gemini 对其每分钟输入 token 配额返回 HTTP 429 `RESOURCE_EXHAUSTED`。被压平的 pi-ai 错误文本同时携带配额措辞（"You exceeded your current quota"）和一个瞬时重试提示——Google RPC 的 `RetryInfo` 详情（`"retryDelay": "10s"`）以及 `Please retry in 10.7s` 这种行文。`classifyPiAiError` 先命中了配额措辞，把失败归类为终止性的 `QUOTA` 代码，而该代码被有意排除在默认可重试集合之外，于是 `dsh-llm-retry` 直接委托下游，该轮次立即失败。提供方给出的重试延迟也被丢弃了：`mapStopReason` 只根据 `message` 和 `code` 构造错误失败。因此，大 prompt 的并发扇出会丢失受影响的子代理，而不是退避后重试。

## 决策

`dsh-llm-pi-ai` 现在区分瞬时配额（指名了重试延迟的那种）与终止性的账户配额／余额耗尽：

- `providerRetryAfterMs(message)` 从被压平的文本中提取提供方的 retry-after 提示：Google 的 `"retryDelay": "10s"`（以秒为单位的 protobuf Duration）或 `Please retry in 10.7s` / `retry after 5s` 这种行文，返回正的毫秒延迟或 `undefined`。
- `classifyPiAiError` 把「同时携带瞬时重试提示（存在 `providerRetryAfterMs`，或出现 Google 的 `RESOURCE_EXHAUSTED` 状态）的配额消息」归类为 `RATE_LIMIT`；没有这类提示的配额消息仍保持 `QUOTA`。
- `mapStopReason` 把解析出的延迟以 `providerRetryAfterMs` 附加到错误失败上，使既有的 `dsh-llm-retry` 策略遵守提供方指示（当该延迟不超过 `maxDelayMs` 时等待该延迟），而不是使用本地指数退避。

没有改动 `dsh-llm` 的瞬时代码集合，也没有改动 `dsh-llm-retry`：`QUOTA` 默认仍为终止性，pi-ai 适配器通过既有的 `RATE_LIMIT` 代码上报瞬时情形。

## 考虑过的替代方案

**把 `QUOTA` 加入默认可重试代码集合。** 予以否决：这会把真正终止性的账户配额或余额耗尽（不携带重试延迟）最多重试 `maxRetries` 次却毫无收益，违背了「配额默认非瞬时」的有界恢复决策。

**把每一个带配额措辞的 429 都归类为 `RATE_LIMIT`。** 予以否决：OpenAI 的终止形式（"You exceeded your current quota, please check your plan and billing details."）携带同样的措辞却没有重试延迟，必须保持 `QUOTA`。

**在 `dsh-llm-retry` 中仅凭是否存在 `providerRetryAfterMs` 来决定重试。** 予以否决：重试插件依据稳定的失败代码进行路由，适配器上报事实而策略决定动作；把瞬时／终止的判断挪进插件会颠倒这一分工。

## 后果

- 瞬时性的每分钟配额 429 现在会按提供方指名的延迟退避后重试，而不是让该轮次立即失败，因此并发子代理扇出得以恢复而不是丢失子代理。
- 终止性配额错误（没有重试提示）仍以 `QUOTA` 立即失败，行为不变。
- 解析出的延迟是承载在既有 `LlmFailure.providerRetryAfterMs` 字段上的提供方观察值，因此重试策略的超上限委托与无抖动延迟处理原样生效。
