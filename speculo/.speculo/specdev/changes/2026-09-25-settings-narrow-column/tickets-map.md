---
schema_version: 3
plan_contract_version: 1
plan_revision: 1
requested_deliverables: []
deliverable_policy: 用户要求规划这三个 change，没有另指定交付件数。Ticket 数量不算交付数量。
artifact: tickets-map
change: 2026-09-25-settings-narrow-column
status: ready
---

# Tickets Map: 设置页收成顶部一排 Tab

- **Map：** `<Path>{roots.state}/specdev/changes/2026-09-25-settings-narrow-column/tickets-map.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/2026-09-25-settings-narrow-column/spec.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/2026-09-25-settings-narrow-column/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/2026-09-25-settings-narrow-column/evidence/</Path>`
- **可选 Goal Plan：** 本 change 不单独写 Goal Plan。跨 change 编排在 `<Path>{roots.state}/specdev/changes/2026-09-25-three-issue-plan/implementation-plan.md</Path>`。

## 1. 目标与拆分策略

一条 Standard 切片覆盖 AC-001 到 AC-006。不把「去掉子页」和「隐藏 Tab」拆成两票，因为它们是同一次导航切换。

### 总体实施背景

连接菜单文案必须先落在父分支上。本票重排设置页时，只能保留那对已经验收的标签。`main.js` 也要等前两张票集成后再重建。

### 项目 Skill 读取矩阵

| Applies To | Project Skill | Trigger / Scope | Read Timing | Purpose |
|---|---|---|---|---|
| ALL | `<Path>.agents/skills/dev/SKILL.md</Path>` | 改设置导航、样式、首页开关或 main.js | Map 后、Ticket 前 | 插件开发规则和验证命令 |

## 2. 执行清单

| ID | Ticket | 可观察产出 | Blocked By | Depth | Risk | Ready | Owner | Contract IDs | Wave/Gate | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 | `<Path>{roots.state}/specdev/changes/2026-09-25-settings-narrow-column/ticket/01-top-settings-tabs.md</Path>` | 顶部只剩一排 Tab，关闭的领域不再出现 | — | standard | high | yes | session:01a0d7eb-c4aa-7c32-af22-cefd5caaf529 | AC-001, AC-002, AC-003, AC-004, AC-005, AC-006 | 父计划第 3 个 | ready |

## 3. 依赖 DAG

```text
T-01 [READY]
```

票内无前驱。父计划中的前驱是连接菜单票。

## 4. 合同覆盖矩阵

| Contract ID | 覆盖 Ticket | 验证接缝 | 状态 | 说明 |
|---|---|---|---|---|
| AC-001 | T-01 | 顶部 Tab 回归 | covered | 一排且顺序正确 |
| AC-002 | T-01 | 顶部 Tab 回归 | covered | 关闭后立刻消失 |
| AC-003 | T-01 | 顶部 Tab 回归 | covered | 打开后回到原位 |
| AC-004 | T-01 | 顶部 Tab 回归 | covered | 关闭期间没有别的入口 |
| AC-005 | T-01 | 顶部 Tab 回归 | covered | 首页和同步始终在 |
| AC-006 | T-01 | 设置项顺序 | covered | 原设置项按原顺序保留 |

## 5. 并行与路径所有权

- 本 change 只有一张实现票。
- `main.js` 与两份 dev skill 文件的 owner 是 T-01。
- `settings-tab.ts` 与连接菜单票的重叠由父计划的依赖边处理。

| Ticket A | Ticket B | Writable 交集 | 真实依赖 | 处理 |
|---|---|---|---|---|
| T-01 | — | 无第二张票 | 否 | 不适用 |

## 6. Gate、Wave 与集成点

父计划的最后一个集成点。它通过后，三条 change 的父级整体验证才开始。

## 7. 横切契约与风险

必须保住连接菜单已经验收的中英文标签。不得把同步做成开关。

## 8. 同步规则

- Ticket 状态变化后同步执行清单。
- 内部工件不使用相对 Markdown 链接。

## 9. 总控与恢复

从父入口 `<Path>{roots.state}/specdev/changes/2026-09-25-three-issue-plan/tickets-map.md</Path>` 进入 Goal。实现提交尚未授权。没有额外交付件数。
