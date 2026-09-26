---
schema_version: 3
plan_contract_version: 1
skill_scan: 已扫描 <Path>.agents/skills/dev/SKILL.md</Path>。name 是 dev。触发范围覆盖设置导航、样式、首页开关和 main.js。仓库内没有第二份项目 Skill。
skill_bindings: [{"id":"dev","path":"<Path>.agents/skills/dev/SKILL.md</Path>","sha256":"41d6440245cd01b6c7b551282d042447232d1111fa43b5fde22e55eaa7ea1ce1","phase":"implement","operation":"edit-settings-tabs","inputs":["本 Ticket","<Path>src/plugin/settings/nav.ts</Path>","<Path>src/plugin/settings/settings-tab.ts</Path>"],"outputs":["只有顶部一排 Tab 且关闭的领域不显示的源码改动"],"required":true,"on_failure":"block-ticket","references":[{"path":"<Path>.agents/skills/dev/references/architecture.md</Path>","sha256":"8108e348f227a7a5c804213db9db93bd4927c11f67720a356839f8df6fa932e1","when":"改设置产品导航之前"},{"path":"<Path>.agents/skills/dev/references/obsidian-api.md</Path>","sha256":"479da555adbb1a04a6a7cf4d3fa7cbc71a0506338bc917d616594a910c966f41","when":"改设置 UI 或 CSS 之前"},{"path":"<Path>.agents/skills/dev/references/skill-maintenance.md</Path>","sha256":"1677334d43181025c275a1bbe84f02a114980c326e9e328b3fee90a1cf0a1f75","when":"改设置产品导航并因此需要更新 dev skill 之前"}]},{"id":"dev","path":"<Path>.agents/skills/dev/SKILL.md</Path>","sha256":"41d6440245cd01b6c7b551282d042447232d1111fa43b5fde22e55eaa7ea1ce1","phase":"verify","operation":"run-settings-tab-checks","inputs":["顶部 Tab 测试","验证矩阵"],"outputs":["命令、退出码和 AC 映射"],"required":true,"on_failure":"block-ticket","references":[{"path":"<Path>.agents/skills/dev/references/build-and-release.md</Path>","sha256":"44080c38f6b330e7336fb7ef8d768d088c67591da767fab7119c48b78c298a5d","when":"运行 build、lint 或 test:settings-nav 之前"}]}]
resource_claims: ["nand-main-bundle","settings-tab","settings-top-tabs"]
artifact: ticket
change: 2026-09-25-settings-narrow-column
id: T-01
title: 设置页收成顶部一排 Tab
status: ready
kind: feature
planning_depth: standard
planning_depth_reason: 要同时改导航结构、模块开关引起的 Tab 显隐，以及原设置项所在的页面，但没有数据迁移。
ready: true
risk: high
blocked_by: []
contract_ids: [AC-001, AC-002, AC-003, AC-004, AC-005, AC-006]
owner: session:01a0d7eb-c4aa-7c32-af22-cefd5caaf529
expected_changes: ["<Path>src/plugin/settings/nav.ts</Path>","<Path>src/plugin/settings/settings-tab.ts</Path>","<Path>src/plugin/settings/home.ts</Path>","<Path>styles.css</Path>","<Path>main.js</Path>"]
writable_paths: ["<Path>src/plugin/settings/nav.ts</Path>","<Path>src/plugin/settings/nav.test.ts</Path>","<Path>src/plugin/settings/settings-tab.ts</Path>","<Path>src/plugin/settings/home.ts</Path>","<Path>styles.css</Path>","<Path>main.js</Path>","<Path>.agents/skills/dev/SKILL.md</Path>","<Path>.agents/skills/dev/references/architecture.md</Path>"]
read_only_paths: ["<Path>src/plugin/settings/connection-menu.ts</Path>","<Path>src/plugin/main.ts</Path>"]
shared_paths: ["<Path>main.js</Path>","<Path>.agents/skills/dev/SKILL.md</Path>","<Path>.agents/skills/dev/references/architecture.md</Path>"]
shared_path_owners: ["<Path>main.js</Path> => T-01","<Path>.agents/skills/dev/SKILL.md</Path> => T-01","<Path>.agents/skills/dev/references/architecture.md</Path> => T-01"]
---

# Ticket T-01: 设置页收成顶部一排 Tab

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-09-25-settings-narrow-column/ticket/01-top-settings-tabs.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-09-25-settings-narrow-column/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-09-25-settings-narrow-column/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-09-25-settings-narrow-column/evidence/T-01.md</Path>`

实现本 Ticket 时，Lead 与 implementation subagent 必须按顺序完整读取总体 Map，读取项目 Skill 的 frontmatter 与入口并只展开适用于 `ALL`/`T-01` 的匹配项，再读取本 Ticket 与相关上游工件。

## 1. 战略与来源

- **目标：** 让 NAND 设置只通过顶部一排 Tab 切换，并在领域关闭时藏起对应 Tab。
- **可观察产出：** 没有左侧子页；关闭的领域从顶部消失；打开后原设置项按原顺序可用。
- **来源：** `US-001`、`US-002`、`US-003`、`AC-001`、`AC-002`、`AC-003`、`AC-004`、`AC-005`、`AC-006`、`DEC-001`、`DEC-002`。
- **当前事实：** 顶部已有首页、看板、编辑器、智能体、同步。后三个领域另有左侧子页。首页已能开关这三个模块，但 Tab 不会因此隐藏。
- **Planning Depth 原因：** 导航、显隐和页内设置顺序跨多个设置文件，属于 Standard。没有不可逆迁移，所以不是 Deep。

## 2. 决策状态

### 已锁定决策

- 只有顶部一排 Tab，顺序固定，关闭的领域不占位。
- 要改某个领域的设置，必须先在首页打开它。
- 同步始终留在顶部，且不是开关。

### 已采用的低影响假设

- 切换开关后立即重绘顶部 Tab。验证方式是 AC-002。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| 顶部 Tab 的显隐、左侧子页的移除、原设置项在领域 Tab 内的顺序 | 三个模块开关的保存字段、各设置项控件、同步预留说明 | 状态栏初始化、连接菜单文案键、新的同步开关 |

## 4. 要构建什么

用户打开 NAND 设置。三个模块都打开时，顶部是首页、看板、编辑器、智能体、同步，没有左侧子页。在首页关闭一个领域，该 Tab 立刻消失，用户留在首页。再次打开后，Tab 回到原来的顺序位置，页内仍是该领域原来各子页的设置项，控件含义不变。首页和同步在任何组合下都在。

## 5. 实现契约

- **入口或接缝：** 给定三个模块开关后的顶部 Tab 列表，以及领域页内的设置区块顺序。
- **输入与输出：** 输入是现有模块布尔值。输出是可见 Tab 和页内设置项。
- **公共接口变化：** 无新的设置字段。
- **不变量：** 关闭期间没有第二入口进入该领域的设置。
- **状态或数据流：** 继续写入现有 modules 字段。
- **错误与失败行为：** 不适用独立错误码。开关保存失败时不改 Tab。
- **兼容要求：** 已关闭的模块保持关闭。1.13 以下回退页使用同一规则。
- **安全与隐私要求：** 不适用：不读取新的用户数据。

## 6. 执行路线

1. 先改 `pnpm run test:settings-nav` 的断言，使左侧子页和「关闭后仍显示 Tab」变红。
2. 去掉左侧子页，并让顶部 Tab 跟随三个模块开关显隐。
3. 把原设置项按原顺序放进对应领域 Tab，确认连接菜单标签仍是上一张票留下的文案。
4. 去掉把设置内容锁进窄列的分栏，重建 main.js，并运行验证矩阵。

## 7. 路径访问契约

- **预计修改点：** 与 `expected_changes` 对齐。
- **可写范围：** 与 `writable_paths` 对齐。若导航事实改了 dev skill 的设置产品描述，只能改列出的那两份 skill 文件。
- **只读上下文：** 连接菜单的独立模块、插件 onload。
- **共享路径：** `main.js` 和列出的 skill 文件由本票独占。`settings-tab.ts` 必须在连接菜单那张票集成之后再改。
- **保留或不动：** 各设置项的默认值和保存字段。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| Tab 显隐和顺序 | 给定模块开关，读取顶部 Tab | `pnpm run test:settings-nav` | 符合 AC-001 到 AC-005，且没有左侧子页 | `<Path>{roots.state}/specdev/changes/2026-09-25-settings-narrow-column/evidence/T-01.md</Path>` |
| 设置项顺序 | 领域页内区块顺序 | 同一命令或设置定义的顺序断言 | 与原来的子页顺序一致 | `<Path>{roots.state}/specdev/changes/2026-09-25-settings-narrow-column/evidence/T-01.md</Path>` |
| 构建回归 | 类型检查、打包和 lint | `pnpm run build` 然后 `pnpm run lint` | 退出码 0，且没有新的 error | `<Path>{roots.state}/specdev/changes/2026-09-25-settings-narrow-column/evidence/T-01.md</Path>` |

- **Workspace checks：** current workspace 运行 `pnpm run test:settings-nav`、build 和 lint。
- **E2E disposition：** required。在 Obsidian 设置页关闭再打开一个模块。环境是 current-workspace，由 Lead 执行。预期是 Tab 立刻消失或回到原位，页内设置项仍可操作，内容不再挤在窄列里。
- **E2E owner/environment：** Lead / current-workspace。
- **Integration evidence：** current 模式记录 implementation commit、parent before、result SHA。

## 9. 发布、迁移与恢复

- **迁移顺序：** 不适用：沿用现有模块布尔值，没有新字段。
- **兼容窗口：** 不适用。
- **监控信号：** 不适用。
- **回滚或前向恢复：** 回退本票 commit。已有的模块开关值仍然有效。
- **不可逆操作与批准点：** 无。
- **收缩条件：** 不适用：没有旧数据协议。左侧子页从界面移除，不保留第二套入口。

## 10. 验收标准

- [ ] `AC-001`：三个模块打开时，顶部只有一排，顺序是首页、看板、编辑器、智能体、同步。
- [ ] `AC-002`：关闭一个领域后，该 Tab 立刻消失，用户仍在首页。
- [ ] `AC-003`：重新打开后，Tab 回到原位置，页内是原来的设置项。
- [ ] `AC-004`：关闭期间没有其他入口进入该领域的设置。
- [ ] `AC-005`：首页和同步始终在，同步不是开关。
- [ ] `AC-006`：领域页内的设置项按原来的子页顺序排列，控件含义不变。
- [ ] 实现开始前已完整读取 Tickets Map，已读取项目 Skill 入口并完整展开其中适用于 `ALL`/`T-01` 的匹配项。
- [ ] 验证矩阵全部执行并记录到 `<Path>{roots.state}/specdev/changes/2026-09-25-settings-narrow-column/evidence/T-01.md</Path>`。
- [ ] 实际项目修改未超出 `writable_paths`，shared path 由指定 owner 修改。
- [ ] Ticket 已按 Goal Plan 策略形成非空 implementation commit，direct-parent 验证通过且父分支 result 已记录。
- [ ] E2E disposition 已执行；current 模式由 Lead 在 current workspace 完成。
- [ ] 未发生未批准的范围、契约或发布偏差。
- [ ] Ticket、Tickets Map 和 Evidence 状态一致。

## 11. SKILL 调用计划

实现阶段调用 dev 的 `edit-settings-tabs`。改导航前读 architecture、obsidian-api；若设置产品描述变化，再读 skill-maintenance 并只更新已授权的 skill 文件。验证阶段调用 `run-settings-tab-checks`，先读 build-and-release。失败则停止本票。

## 12. 停止、检查点与交付

- **用户交付要求与数量：** 没有额外件数。本票交付一套顶部 Tab。
- **必需 Skill/引用/测试不可用：** 阻塞本票。
- **归属与资源冲突：** 必须等连接菜单票集成后才能改 `settings-tab.ts`。`main.js` 也要等前两张票的结果进入父分支后再重建。
- **检查点：** 记录导航测试是否先因旧的左侧子页变红，以及 Evidence 缺口。
- **完成出口：** 验收和 Skill 证据通过后交回父计划。实现提交目前没有授权。
