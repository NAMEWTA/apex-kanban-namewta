---
schema_version: 3
plan_contract_version: 1
plan_revision: 1
requested_deliverables: []
deliverable_policy: 用户要求规划这三个 change，没有另指定交付件数。Ticket 数量不算交付数量。
artifact: tickets-map
change: 2026-09-25-terminal-connection-i18n
status: ready
---

# Tickets Map: 连接菜单显示现有文案

- **Map：** `<Path>{roots.state}/specdev/changes/2026-09-25-terminal-connection-i18n/tickets-map.md</Path>`
- **Spec：** `<Path>{roots.state}/specdev/changes/2026-09-25-terminal-connection-i18n/spec.md</Path>`
- **Ticket 目录：** `<Path>{roots.state}/specdev/changes/2026-09-25-terminal-connection-i18n/ticket/</Path>`
- **Evidence 目录：** `<Path>{roots.state}/specdev/changes/2026-09-25-terminal-connection-i18n/evidence/</Path>`
- **可选 Goal Plan：** 本 change 不单独写 Goal Plan。跨 change 编排在 `<Path>{roots.state}/specdev/changes/2026-09-25-three-issue-plan/implementation-plan.md</Path>`。

## 1. 目标与拆分策略

一条 Lite 切片覆盖 AC-001 到 AC-004。不改导航结构，避免和设置 Tab 票抢同一轮行为。

### 总体实施背景

连接菜单和子页标题必须使用同一对文案。设置 Tab 票随后会重排 `settings-tab.ts`，所以本票先集成，重排时只能保留已经改好的标签。

### 项目 Skill 读取矩阵

| Applies To | Project Skill | Trigger / Scope | Read Timing | Purpose |
|---|---|---|---|---|
| ALL | `<Path>.agents/skills/dev/SKILL.md</Path>` | 改设置文案、i18n 或 main.js | Map 后、Ticket 前 | 插件开发规则和验证命令 |

## 2. 执行清单

| ID | Ticket | 可观察产出 | Blocked By | Depth | Risk | Ready | Owner | Contract IDs | Wave/Gate | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| T-01 | `<Path>{roots.state}/specdev/changes/2026-09-25-terminal-connection-i18n/ticket/01-connection-menu-label.md</Path>` | 连接菜单显示服务器连接或 Server connection | — | lite | low | yes | session:01a0d7eb-c4aa-7c32-af22-cefd5caaf529 | AC-001, AC-002, AC-003, AC-004 | 父计划第 2 个 | ready |

## 3. 依赖 DAG

```text
T-01 [READY]
```

票内无前驱。父计划中的前驱是状态栏票，因为两票都写 `main.js`。后继是设置 Tab 票，因为它也写 `settings-tab.ts`。

## 4. 合同覆盖矩阵

| Contract ID | 覆盖 Ticket | 验证接缝 | 状态 | 说明 |
|---|---|---|---|---|
| AC-001 | T-01 | 菜单标签回归 | covered | 中文 |
| AC-002 | T-01 | 菜单标签回归 | covered | 英文 |
| AC-003 | T-01 | 菜单标签回归 | covered | 标题不变 |
| AC-004 | T-01 | 菜单标签回归 | covered | 其他项不变 |

## 5. 并行与路径所有权

- 本 change 只有一张实现票。
- `main.js` 与 `package.json` 的 owner 是 T-01。
- `settings-tab.ts` 与设置 Tab change 的写入由父计划排成先后，不在本 Map 里伪造跨 change 的 blocked_by。

| Ticket A | Ticket B | Writable 交集 | 真实依赖 | 处理 |
|---|---|---|---|---|
| T-01 | — | 无第二张票 | 否 | 不适用 |

## 6. Gate、Wave 与集成点

父计划的第 2 个集成点。完成后设置 Tab 票才可以改同一份设置文件。

## 7. 横切契约与风险

标签合同是设置 Tab 重排时必须保住的可见结果。

## 8. 同步规则

- Ticket 状态变化后同步执行清单。
- 内部工件不使用相对 Markdown 链接。

## 9. 总控与恢复

从父入口 `<Path>{roots.state}/specdev/changes/2026-09-25-three-issue-plan/tickets-map.md</Path>` 进入 Goal。实现提交尚未授权。没有额外交付件数。
