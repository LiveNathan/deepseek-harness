# Agent Note: 向父代理报告 continuable 子代理进入 waiting 停车状态

Status: implemented

[English](2026-09-01-subagent-waiting-park-notice.md) | 中文

## 问题

当一个 continuable 后台子代理派生出自己的 continuable 后代时，它会在自己的回合结束、而这些后代仍在运行的那一刻进入 `waiting` 常驻状态。running→waiting 的转变没有触发任何信号，因此父代理在「子代理已派出」与「子代理已结算」之间收不到任何通知。`list_agents` 把这个状态折叠为 `idle`，而该字段自身的契约也承认这种歧义（一个处于回合之间的常驻 Agent，可能正在等待它派生的子代理），于是监督者无法在不轮询的情况下区分「正在通过子代理正常工作」与「停滞」。

## 决策

`SubagentContinuationManager` 会在子代理首次停入 `waiting` 时告知其持久化的直接父代理。`watchSettlement` 观察到 running→waiting 的转变后调用新增的 `notifyParked`，它发出一个 user 角色通知——`Background subagent <id> is waiting on its subagents (<ids>) and will report when they settle.`——其来源是新增的 `subagent-waiting` 消息来源 kind，form 为 `notice`，与已有的 `subagent-settled` kind 并列。每个 Activation 只报告一次：`waitingNotified` 在首次观察到时置位且永不清除，因此被唤醒后再次停车的子代理不会被重复报告。

投递复用结算路径，抽取为 `deliverParentNotice`：已经开始销毁的父代理以注入方式送达且不唤醒，空闲的父代理被唤醒，忙碌的父代理被 steer，已离开注册表的父代理被跳过，投递失败则记录日志而不阻塞销毁。消息构造保留在各个 `notify*` 方法中，因为两种通知的内容不同；只有投递策略是共享的。

## 考虑过的替代方案

**保持回合开启直到后代结算。** 按现有表述无法实现：agent loop 不能强迫模型持续产出。其有用的变体——在每个后代的结算摘要到达时自动恢复被停车的管理者——是更大的行为变更，带有循环风险，应当单独讨论。

**每次 running→waiting 转变都重新报告。** 在每次唤醒投递时清除 `waitingNotified` 会在每次临时回合后发出第二个通知。首次停车才是父代理需要的信号；之后的停车不带来任何新信息。

**只通过 `list_agents` 暴露状态。** 在转变处修复该缺口能让每个消费方受益，并且保持含糊的 `idle` 读取不变，而不是为列表条目增加一套新词汇。

## 后果

- 父代理在子代理的整个生命周期中会收到一个信号，表明该子代理正在通过其后代工作，从而弥补了迫使轮询的缺口。最终的结算通知仍会闭合整个循环。
- `subagent-waiting` 是 merge-extensible 的 `MessageSourceMap` 条目，因此不认识它的消费方会落入已文档化的默认路径，将其呈现为不透明内容；没有任何针对通知 kind 封闭集合的 switch 会被破坏。
- 命名多个子代理的停车摘要受既有通知摘要上限约束（`boundContextSummary`）；完整的子代理列表仍保留在消息内容中。
- `deliverParentNotice` 把两种面向父代理的运行时说明统一到同一个投递策略下。它的分支已由结算投递测试覆盖；新的停车措辞与去重由一个单元测试锁定——让子代理停车、唤醒它，再断言父代理仍然只有一条通知。

## 相关

共享的投递策略及其顺序规则来自[结算投递](../feature/2026-08-06-manager-owned-subagent-settlement-delivery.zh.md)。
