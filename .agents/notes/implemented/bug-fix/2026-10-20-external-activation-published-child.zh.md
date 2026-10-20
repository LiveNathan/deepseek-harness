# Agent Note: 外部 activation 可以发布自己的子级

Status: implemented

[English](2026-10-20-external-activation-published-child.md) | 中文

## 问题

`SubagentManager` 在启动外部后端前预留随机 `pendingId`，随后把提供方返回的 `SubagentRun.id` 作为 activation 的子级 id。修复前，它要求该 id 不在 `resident`、`ctx.agents` 和 `ctx.sessions` 中。若提供方在 `start()` 内创建由本地 Session 支撑的子级——`subagent_worktree` profile 插件的 `worktree` 提供方就是如此——它会用返回的 id 同时注册这两处，于是检查把自己的子级判为 `DUPLICATE_CHILD` 并释放。每次 `subagent_worktree` 调用都失败；普通 `subagent` 与 `subagent_flash` 不受影响，因为它们是通过 `prepareContinuable()` 准备的本地后端。

## 决定

`assertChildIdAvailable` 在外部启动时接收委派父级，并忽略 `parentSession` 等于该父级的 Agent 或 Session。该 id 上已有驻留 activation 时仍然拒绝；不属于该父级子级的 Agent 或 Session 也仍然拒绝。本地创建不传父级调用该方法，保留严格检查。

提供方契约本就把 `SubagentRun.id` 放进共享的 Session id 命名空间。检查现在能区分“本次运行刚发布的子级”和“别人拥有的 id”，且不要求提供方声明是哪一种。

## 备选方案

**把 `subagent_worktree` 改成通过 `prepareContinuable()` 的本地提供方。** 由 manager 创建子级并沿用 `request.cwd`，插件可以删掉复制自 in-process driver 的分叉。插件会更小，但改动落到本仓库之外，而且 manager 仍会拒绝其他在 `start()` 中发布 Session 子级的提供方。

**外部运行只保留 `resident` 检查。** 只有一个条件，但提供方若返回无关活动父级或 Session 的 id，就会覆盖 `resident` 中对应条目。按父级豁免保留了这道防线。

**让外部提供方在 `SubagentRun` 上返回子级 Agent。** 能精确认出子级，但会为一个使用方把宿主 Agent 加进公开的外部运行契约。

## 后果

发布自己子级的外部提供方现在可以成功启动；既有的、未挂到该父级下的 Agent 或 Session 冲突仍会明确失败并释放新句柄。检查信任子级的 `parentSession` 而不是对象身份，因此提供方若返回同一父级下已存在的兄弟子级 id 会被接受；该 id 上若有活动 activation 仍会被拒绝，而提供方会生成新 id。

## 测试

`packages/subagent/subagent/tests/external-activation.spec.ts` 启动一个外部运行，发布挂到委派父级下的 Agent 与 Session，并断言启动与结果交付成功。`external-lifecycle.spec.ts` 保留未挂父级的 Session 冲突拒绝。
