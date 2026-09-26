---
schema_version: 3
plan_contract_version: 1
skill_scan: 已扫描 <Path>.agents/skills/dev/SKILL.md</Path>。name 是 dev。触发范围覆盖设置页文案、共享 i18n 和 main.js。仓库内没有第二份项目 Skill。
skill_bindings: [{"id":"dev","path":"<Path>.agents/skills/dev/SKILL.md</Path>","sha256":"41d6440245cd01b6c7b551282d042447232d1111fa43b5fde22e55eaa7ea1ce1","phase":"implement","operation":"edit-connection-menu-label","inputs":["本 Ticket","<Path>src/plugin/settings/settings-tab.ts</Path>"],"outputs":["连接菜单项在中英文下显示现有文案的源码改动"],"required":true,"on_failure":"block-ticket","references":[{"path":"<Path>.agents/skills/dev/references/architecture.md</Path>","sha256":"8108e348f227a7a5c804213db9db93bd4927c11f67720a356839f8df6fa932e1","when":"改设置页文案之前"},{"path":"<Path>.agents/skills/dev/references/obsidian-api.md</Path>","sha256":"479da555adbb1a04a6a7cf4d3fa7cbc71a0506338bc917d616594a910c966f41","when":"改设置 DOM 或文案读取之前"}]},{"id":"dev","path":"<Path>.agents/skills/dev/SKILL.md</Path>","sha256":"41d6440245cd01b6c7b551282d042447232d1111fa43b5fde22e55eaa7ea1ce1","phase":"verify","operation":"run-connection-label-checks","inputs":["菜单标签测试","验证矩阵"],"outputs":["命令、退出码和 AC 映射"],"required":true,"on_failure":"block-ticket","references":[{"path":"<Path>.agents/skills/dev/references/build-and-release.md</Path>","sha256":"44080c38f6b330e7336fb7ef8d768d088c67591da767fab7119c48b78c298a5d","when":"运行 build、lint 或设置测试之前"}]}]
resource_claims: ["nand-main-bundle","settings-tab","terminal-connection-menu-label"]
artifact: ticket
change: 2026-09-25-terminal-connection-i18n
id: T-01
title: 连接菜单显示服务器连接文案
status: ready
kind: bug
planning_depth: lite
planning_depth_reason: 只改变一个菜单标签的可见文字，不改设置字段、页面结构或加载路径。
ready: true
risk: low
blocked_by: []
contract_ids: [AC-001, AC-002, AC-003, AC-004]
owner: session:01a0d7eb-c4aa-7c32-af22-cefd5caaf529
expected_changes: ["<Path>src/plugin/settings/settings-tab.ts</Path>","<Path>main.js</Path>"]
writable_paths: ["<Path>src/plugin/settings/settings-tab.ts</Path>","<Path>src/plugin/settings/connection-menu.ts</Path>","<Path>src/plugin/settings/connection-menu.test.ts</Path>","<Path>package.json</Path>","<Path>main.js</Path>"]
read_only_paths: ["<Path>src/shared/i18n/terminal-agent.ts</Path>","<Path>src/terminal-agent/settings/renderer.ts</Path>","<Path>src/plugin/settings/nav.ts</Path>"]
shared_paths: ["<Path>main.js</Path>","<Path>package.json</Path>"]
shared_path_owners: ["<Path>main.js</Path> => T-01","<Path>package.json</Path> => T-01"]
---

# Ticket T-01: 连接菜单显示服务器连接文案

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-09-25-terminal-connection-i18n/ticket/01-connection-menu-label.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-09-25-terminal-connection-i18n/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-09-25-terminal-connection-i18n/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-09-25-terminal-connection-i18n/evidence/T-01.md</Path>`

实现本 Ticket 时，Lead 与 implementation subagent 必须按顺序完整读取总体 Map，读取项目 Skill 的 frontmatter 与入口并只展开适用于 `ALL`/`T-01` 的匹配项，再读取本 Ticket 与相关上游工件。

## 1. 战略与来源

- **目标：** 让智能体设置里的连接菜单项显示已经存在的「服务器连接」和 Server connection。
- **可观察产出：** 中文菜单是服务器连接，英文菜单是 Server connection，页面标题仍是同一对文案。
- **来源：** `US-001`、`US-002`、`US-003`、`AC-001`、`AC-002`、`AC-003`、`AC-004`、`DEC-001`、`USER-DECISION:2026-09-25-连接菜单使用现有文案`。
- **当前事实：** 菜单读取一条不存在的键，因此显示键名。页面标题读取另一条已存在的文案。
- **Planning Depth 原因：** 可见结果只有一个标签，属于 Lite。

## 2. 决策状态

### 已锁定决策

- 菜单和子页标题使用同一对中英文文案。

### 已采用的低影响假设

- 复用子页标题已经使用的那对翻译。验证方式是 AC-001、AC-002 与 AC-003 的文字相同。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| 连接菜单项的可见标签，以及读取该标签的定向测试 | 子页标题文案、其余二级菜单项、服务器连接字段 | 顶部 Tab 结构、状态栏初始化 |

## 4. 要构建什么

用户把插件语言设为中文或英文，打开智能体设置的连接菜单项。标签分别是服务器连接和 Server connection。点进页面后标题仍是这两句。其他菜单项的标签保持不变。

## 5. 实现契约

- **入口或接缝：** 连接菜单项实际呈现的标签。
- **输入与输出：** 输入是插件语言。输出是菜单标签和不变的页面标题。
- **公共接口变化：** 无。
- **不变量：** 菜单和标题不是一个为文案、另一个为键名。
- **状态或数据流：** 不改已保存的终端设置。
- **错误与失败行为：** 这条菜单不再因为缺键而回退成键名。
- **兼容要求：** 无迁移。
- **安全与隐私要求：** 不适用：不展示新的配置值。

## 6. 执行路线

1. 先写读取连接菜单项标签的测试，使当前键名回退变红。
2. 让菜单使用已有的服务器连接文案，测试变绿。
3. 确认其他菜单项标签没有被改写。
4. 重建 main.js，并运行本票验证矩阵。

## 7. 路径访问契约

- **预计修改点：** 与 `expected_changes` 对齐。
- **可写范围：** 与 `writable_paths` 对齐。可以新增只负责这个标签的小模块和测试，以免把导航结构文件算进本票。
- **只读上下文：** 文案表、页面标题渲染和导航顺序。
- **共享路径：** `main.js` 和 `package.json` 由本票独占写入。`settings-tab.ts` 还会被设置 Tab 那条 change 修改，父计划要求本票先完成。
- **保留或不动：** `nav.ts` 的产品顺序。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 中英文标签 | 读取连接菜单项标签 | 沿 `pnpm run test:settings-nav` 增加的定向测试 | 中文是服务器连接，英文是 Server connection | `<Path>{roots.state}/specdev/changes/2026-09-25-terminal-connection-i18n/evidence/T-01.md</Path>` |
| 标题和其他项 | 同一接缝对照标题文案和其他菜单标签 | 同一命令 | 标题与菜单相同，其他标签不变 | `<Path>{roots.state}/specdev/changes/2026-09-25-terminal-connection-i18n/evidence/T-01.md</Path>` |
| 构建回归 | 类型检查、打包和 lint | `pnpm run build` 然后 `pnpm run lint` | 退出码 0，且没有新的 error | `<Path>{roots.state}/specdev/changes/2026-09-25-terminal-connection-i18n/evidence/T-01.md</Path>` |

- **Workspace checks：** current workspace 运行定向测试、build 和 lint。
- **E2E disposition：** not-required。菜单标签已经由不依赖 Obsidian 的标签接缝判定；设置页外观属于另一条 change 的端到端。环境仍记为 current-workspace。
- **E2E owner/environment：** 不适用。标签合同不依赖 Obsidian 运行时。
- **Integration evidence：** current 模式记录 implementation commit、parent before、result SHA。

## 9. 发布、迁移与恢复

- **迁移顺序：** 不适用：没有持久化字段变化。
- **兼容窗口：** 不适用。
- **监控信号：** 不适用：没有控制台错误。
- **回滚或前向恢复：** 回退本票 commit。
- **不可逆操作与批准点：** 无。
- **收缩条件：** 不适用。

## 10. 验收标准

- [ ] `AC-001`：中文界面的连接菜单项是服务器连接。
- [ ] `AC-002`：英文界面的连接菜单项是 Server connection。
- [ ] `AC-003`：子页标题仍分别是这两句。
- [ ] `AC-004`：其他菜单项标签不变。
- [ ] 实现开始前已完整读取 Tickets Map，已读取项目 Skill 入口并完整展开其中适用于 `ALL`/`T-01` 的匹配项。
- [ ] 验证矩阵全部执行并记录到 `<Path>{roots.state}/specdev/changes/2026-09-25-terminal-connection-i18n/evidence/T-01.md</Path>`。
- [ ] 实际项目修改未超出 `writable_paths`，shared path 由指定 owner 修改。
- [ ] Ticket 已按 Goal Plan 策略形成非空 implementation commit，direct-parent 验证通过且父分支 result 已记录。
- [ ] E2E disposition 已按 not-required 记录原因。
- [ ] 未发生未批准的范围、契约或发布偏差。
- [ ] Ticket、Tickets Map 和 Evidence 状态一致。

## 11. SKILL 调用计划

实现阶段调用 dev 的 `edit-connection-menu-label`，先读 architecture 和 obsidian-api。验证阶段调用 `run-connection-label-checks`，先读 build-and-release。失败则停止本票。

## 12. 停止、检查点与交付

- **用户交付要求与数量：** 没有额外件数。本票交付一个正确的菜单标签。
- **必需 Skill/引用/测试不可用：** 阻塞本票。
- **归属与资源冲突：** `settings-tab.ts` 或 `main.js` 与设置 Tab change 重叠时，本票必须先集成；不在对方的工作区里改同一文件。
- **检查点：** 记录标签测试是否先看到键名，以及 Evidence 缺口。
- **完成出口：** 验收和 Skill 证据通过后交回父计划。实现提交目前没有授权。
