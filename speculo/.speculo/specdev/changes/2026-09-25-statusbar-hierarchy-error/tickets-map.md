---
schema_version: 3
plan_contract_version: 1
plan_revision: 1
requested_deliverables: []
deliverable_policy: 用户要求规划这三个 change，没有另指定交付件数。Ticket 数量不算交付数量。
artifact: tickets-map
change: 2026-09-25-statusbar-hierarchy-error
status: ready
---

# Tickets Map: 状态栏入口不再打断插件加载

- **Map：** `<Path>{roots.state}/specdev/changes/2026-09-25-statusbar-hierarchy-error/tickets-map.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/2026-09-25-statusbar-hierarchy-error/spec.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/2026-09-25-statusbar-hierarchy-error/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/2026-09-25-statusbar-hierarchy-error/evidence/</Path>`
- **可选 Goal Plan：** 本 change 不单独写 Goal Plan。跨 change 编排在 `<Path>{roots.state}/specdev/changes/2026-09-25-three-issue-plan/implementation-plan.md</Path>`。

## 1. 目标与拆分策略

一条垂直切片覆盖 AC-001 到 AC-004：把状态栏入口挂到状态栏项上，并保持失败可见。没有 prefactor。

### 总体实施背景

插件 onload 先等终端初始化，再注册命令和设置页。本票不改这条顺序，只让初始化本身不再抛出 HierarchyRequestError。`main.js` 是三张票共同写入的打包结果，不能并行重建。

### 项目 Skill 读取矩阵

| Applies To | Project Skill | Trigger / Scope | Read Timing | Purpose |
|---|---|---|---|---|
| ALL | `<Path>.agents/skills/dev/SKILL.md</Path>` | 改终端宿主、状态栏 DOM 或 main.js | Map 后、Ticket 前 | 插件开发规则和验证命令 |

## 2. 执行清单

| ID | Ticket | 可观察产出 | Blocked By | Depth | Risk | Ready | Owner | Contract IDs | Wave/Gate | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 | `<Path>{roots.state}/specdev/changes/2026-09-25-statusbar-hierarchy-error/ticket/01-status-bar-parent.md</Path>` | 状态栏有 NAND，首次加载不再被这次错误打断 | — | standard | high | yes | session:01a0d7eb-c4aa-7c32-af22-cefd5caaf529 | AC-001, AC-002, AC-003, AC-004 | 父计划第 1 个 | ready |

## 3. 依赖 DAG

```text
T-01 [READY]
```

没有票内前驱。父计划把它排在另外两张票之前，因为它们都要写 `main.js`。

## 4. 合同覆盖矩阵

| Contract ID | 覆盖 Ticket | 验证接缝 | 状态 | 说明 |
|---|---|---|---|---|
| AC-001 | T-01 | 状态栏父节点回归 | covered | 成功创建 |
| AC-002 | T-01 | 状态栏父节点回归 | covered | 菜单仍可打开 |
| AC-003 | T-01 | 初始化不再抛出 | covered | 后续注册不被打断 |
| AC-004 | T-01 | 失败仍抛出的桩 | covered | 异常继续向外 |

## 5. 并行与路径所有权

- 本 change 只有一张实现票，票内没有并行。
- `main.js` 的 owner 是 T-01。父计划还把它和另外两条 change 串行。
- current 模式使用当前 workspace。

| Ticket A | Ticket B | Writable 交集 | 真实依赖 | 处理 |
|---|---|---|---|---|
| T-01 | — | 无第二张票 | 否 | 不适用 |

## 6. Gate、Wave 与集成点

父计划的第 1 个集成点。通过后，连接菜单票才能安全重建 `main.js`。

## 7. 横切契约与风险

不隔离状态栏异常。这个约束只属于本票。

## 8. 同步规则

- Ticket 状态变化后同步执行清单。
- 内部工件不使用相对 Markdown 链接。

## 9. 总控与恢复

从父入口 `<Path>{roots.state}/specdev/changes/2026-09-25-three-issue-plan/tickets-map.md</Path>` 进入 Goal 的 plan 或以后的 run。实现提交尚未授权。没有额外交付件数。
