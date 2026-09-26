---
schema_version: 1
artifact: implementation-map
change: 2026-09-25-three-issue-plan
status: ready
revision: 1
members:
  - 2026-09-25-statusbar-hierarchy-error
  - 2026-09-25-terminal-connection-i18n
  - 2026-09-25-settings-narrow-column
tasks:
  - 2026-09-25-statusbar-hierarchy-error::T-01
  - 2026-09-25-terminal-connection-i18n::T-01
  - 2026-09-25-settings-narrow-column::T-01
dependencies:
  - 2026-09-25-settings-narrow-column::T-01 <- 2026-09-25-terminal-connection-i18n::T-01
serializations:
  - 2026-09-25-statusbar-hierarchy-error::T-01 <> 2026-09-25-terminal-connection-i18n::T-01
  - 2026-09-25-statusbar-hierarchy-error::T-01 <> 2026-09-25-settings-narrow-column::T-01
---

# Implementation Map: 三条设置与加载修复

## 1. Members and Source Authority

子 Spec、Ticket 和 Evidence 仍是行为权威。本 Map 只投影跨 change 的实现图。

| 成员 | 票 | 权威 |
|---|---|---|
| 2026-09-25-statusbar-hierarchy-error | T-01 | 该 change 的 spec.md 与 ticket/01-status-bar-parent.md |
| 2026-09-25-terminal-connection-i18n | T-01 | 该 change 的 spec.md 与 ticket/01-connection-menu-label.md |
| 2026-09-25-settings-narrow-column | T-01 | 该 change 的 spec.md 与 ticket/01-top-settings-tabs.md |

## 2. Composite Ticket Inventory

- `2026-09-25-statusbar-hierarchy-error::T-01`
- `2026-09-25-terminal-connection-i18n::T-01`
- `2026-09-25-settings-narrow-column::T-01`

三张票都是 ready。没有 done 或 cancelled。

## 3. Implementation Super-DAG

```text
statusbar::T-01
i18n::T-01
settings::T-01 <- i18n::T-01
```

依赖边的来源：设置 Tab 重排会再次编辑 `settings-tab.ts`，必须保留连接菜单已经验收的标签。状态栏票和另外两票没有行为前后件，只有 `main.js` 不能并发写。

## 4. Conflict and Serialization

| 重叠 | 处理 |
|---|---|
| 三张票的 `main.js` | 状态栏票与另外两票串行 |
| `settings-tab.ts`：连接菜单票和设置 Tab 票 | 依赖边，设置 Tab 票在后 |
| `package.json` | 只有连接菜单票可写 |
| `styles.css`、`nav.ts`、`home.ts` | 只有设置 Tab 票可写 |
| `src/terminal-agent/host/**` | 只有状态栏票可写 |

## 5. Contract and Path Coverage

每条成员 Spec 的 AC 都由该成员的 T-01 覆盖。跨 change 合同只有一条：设置 Tab 票不得把连接菜单改回键名。

## 6. Revision Log

- revision 1：首次投影三张 Ready 票。workspace 使用 current，因为用户没有要求独立 worktree，默认不开启。
