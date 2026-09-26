---
schema_version: 1
artifact: implementation-plan
change: 2026-09-25-three-issue-plan
status: ready
source_map_revision: 1
orchestration: lead-directed
lead: session:01a0d7eb-c4aa-7c32-af22-cefd5caaf529
implementation_agent_limit: 1
integration_attempt_limit: 3
ticket_workspace_policy: current
integration_gate: direct-parent
ready_for_execution: true
---

# Implementation Plan: 三条设置与加载修复

## 1. Outcome and Authority

一次父计划交付三个已 Ready 的 change：状态栏不再打断首次加载，连接菜单显示现有文案，设置页只留顶部一排 Tab。子 Spec 和 Ticket 是行为权威。本计划不授权实现提交。

模式是 plan。用户要求规划这三个 change，没有要求现在改产品代码。

## 2. Ready Frontier and Waves

current 模式全局只有一个 implementation writer。执行顺序：

1. `2026-09-25-statusbar-hierarchy-error::T-01`
2. `2026-09-25-terminal-connection-i18n::T-01`
3. `2026-09-25-settings-narrow-column::T-01`

现在如果获得执行授权，frontier 只有状态栏票。后两张被串行或依赖挡住。

## 3. Workspace and Dispatch Contract

Ticket workspace 使用 current，不建 `specdev-worktree`。集成门是 direct-parent。同一父分支的集成串行。implementation agent 上限是 1，低于 config 的 3，因为 current 不能并行写。integration attempt 上限是 3，与 config 相同。Lead 不计入实现 agent。只读审查没有新增数字上限。

派单前读取 `<Path>{roots.workflows}/specdev/P-goal-plan/lead-orchestration.md</Path>`，并调用该票绑定的 dev skill。调度进入 `<Path>{roots.workflows}/specdev/I-implement/I-implement.md</Path>`。本 plan 不进入执行循环。

## 4. Repository Integration Queue

仓库是 `main`。队列按 Wave 顺序每次推进一个父 HEAD。前一张票的 result 进入父分支后，下一张票才能开始，避免 `main.js` 互相覆盖。

## 5. Gates and Aggregate Verification

每张票自己的定向测试通过后才集成。三张都 done 之后，Lead 在最终父 HEAD 上运行 `pnpm run build` 和 `pnpm run lint`，并按各票的 E2E disposition 观察 Obsidian。整体 Evidence 以后写到 `<Path>{roots.state}/specdev/changes/2026-09-25-three-issue-plan/evidence/implementation-orchestration.md</Path>`。票全部 done 也不等于父 Goal 完成。

计划质量检查：背景与边界、Skill 绑定、执行步骤、依赖和路径、AC 覆盖均为 pass。权限是 block 执行而不是 block 计划：三张票和父 change 的实现提交都是 not-authorized。恢复条件已写在每张票里。没有用 Lite 代替设置 Tab 这张 Standard 票。

## 6. Conflict, Drift and Recovery

子 Ticket 或 Spec 变化时，先重读子工件，再递增本 Map 的 revision，并让旧派单失效。不接管其他会话的锁。失败停止在当前票，不跳过直接做下一张。

## 7. Progress and Decisions

- 2026-09-25：创建父计划。workspace 采用默认 current。
- 实现、归档、推送和发布都没有授权。
- 下一步是用户明确授权 run 之后，从状态栏票进入 I-implement。
