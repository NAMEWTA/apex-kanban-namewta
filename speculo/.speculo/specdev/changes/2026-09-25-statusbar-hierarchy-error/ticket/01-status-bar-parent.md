---
schema_version: 3
plan_contract_version: 1
skill_scan: 已扫描 <Path>.agents/skills/dev/SKILL.md</Path>。name 是 dev。触发范围覆盖终端宿主、状态栏 DOM 和提交的 main.js。仓库内没有第二份项目 Skill。
skill_bindings: [{"id":"dev","path":"<Path>.agents/skills/dev/SKILL.md</Path>","sha256":"41d6440245cd01b6c7b551282d042447232d1111fa43b5fde22e55eaa7ea1ce1","phase":"implement","operation":"edit-status-bar-init","inputs":["本 Ticket","<Path>src/terminal-agent/host/controller.ts</Path>"],"outputs":["状态栏图标和 NAND 文字挂在状态栏项上的源码改动"],"required":true,"on_failure":"block-ticket","references":[{"path":"<Path>.agents/skills/dev/references/architecture.md</Path>","sha256":"8108e348f227a7a5c804213db9db93bd4927c11f67720a356839f8df6fa932e1","when":"改终端宿主或插件加载顺序之前"},{"path":"<Path>.agents/skills/dev/references/obsidian-api.md</Path>","sha256":"479da555adbb1a04a6a7cf4d3fa7cbc71a0506338bc917d616594a910c966f41","when":"改状态栏 DOM 之前"}]},{"id":"dev","path":"<Path>.agents/skills/dev/SKILL.md</Path>","sha256":"41d6440245cd01b6c7b551282d042447232d1111fa43b5fde22e55eaa7ea1ce1","phase":"verify","operation":"run-status-bar-checks","inputs":["定向测试 diff","验证矩阵"],"outputs":["命令、退出码和 AC 映射"],"required":true,"on_failure":"block-ticket","references":[{"path":"<Path>.agents/skills/dev/references/build-and-release.md</Path>","sha256":"44080c38f6b330e7336fb7ef8d768d088c67591da767fab7119c48b78c298a5d","when":"运行 build、lint 或 test:terminal-agent 之前"}]}]
resource_claims: ["nand-main-bundle","terminal-status-bar-init"]
artifact: ticket
change: 2026-09-25-statusbar-hierarchy-error
id: T-01
title: 状态栏入口改挂到状态栏项上
status: ready
kind: bug
planning_depth: standard
planning_depth_reason: 改动集中在终端状态栏初始化，但失败时会中断整个插件加载，需要同时锁定异常继续抛出。
ready: true
risk: high
blocked_by: []
contract_ids: [AC-001, AC-002, AC-003, AC-004]
owner: session:01a0d7eb-c4aa-7c32-af22-cefd5caaf529
expected_changes: ["<Path>src/terminal-agent/host/controller.ts</Path>","<Path>main.js</Path>"]
writable_paths: ["<Path>src/terminal-agent/host/**</Path>","<Path>main.js</Path>"]
read_only_paths: ["<Path>src/plugin/main.ts</Path>"]
shared_paths: ["<Path>main.js</Path>"]
shared_path_owners: ["<Path>main.js</Path> => T-01"]
---

# Ticket T-01: 状态栏入口改挂到状态栏项上

- **Ticket 文件：** `<Path>{roots.state}/specdev/changes/2026-09-25-statusbar-hierarchy-error/ticket/01-status-bar-parent.md</Path>`
- **总体 Map：** `<Path>{roots.state}/specdev/changes/2026-09-25-statusbar-hierarchy-error/tickets-map.md</Path>`
- **上游 Spec：** `<Path>{roots.state}/specdev/changes/2026-09-25-statusbar-hierarchy-error/spec.md</Path>`
- **完成 Evidence：** `<Path>{roots.state}/specdev/changes/2026-09-25-statusbar-hierarchy-error/evidence/T-01.md</Path>`

实现本 Ticket 时，Lead 与 implementation subagent 必须按顺序完整读取总体 Map，读取项目 Skill 的 frontmatter 与入口并只展开适用于 `ALL`/`T-01` 的匹配项，再读取本 Ticket 与相关上游工件。

## 1. 战略与来源

- **目标：** 让 NAND 状态栏入口在布局已就绪时也能创建完成，使首次启用不再被 HierarchyRequestError 打断。
- **可观察产出：** 状态栏有图标和文字 NAND；控制台没有这次 HierarchyRequestError；命令和设置页能够完成注册。
- **来源：** `US-001`、`US-002`、`US-003`、`AC-001`、`AC-002`、`AC-003`、`AC-004`、`DEC-001`、`USER-DECISION:2026-09-25-只修正父节点`。
- **当前事实：** `initStatusBar` 对 Document 调用 `createSpan`。插件 onload 在这次初始化之后才注册命令和设置页。
- **Planning Depth 原因：** 行为路径只有状态栏创建，但失败会吞掉整个加载，所以不是只改一行而不写失败合同的 Lite。

## 2. 决策状态

### 已锁定决策

- 图标和文字 NAND 都创建在状态栏项上。
- 初始化抛错时继续向外抛出，不用捕获把缺少入口伪装成加载成功。

### 已采用的低影响假设

- 可见文字保持 NAND。验证方式是 AC-001。

### 未决问题

无。

## 3. 范围边界

| IN（本 Ticket 构建） | REUSE（复用且不改变契约） | OUT（明确不做） |
|---|---|---|
| 状态栏图标和标签的父节点；初始化失败仍抛出的回归 | 预设脚本菜单、可见性开关、命令注册顺序 | 设置页 Tab、连接菜单文案、异常隔离层 |

## 4. 要构建什么

桌面端启用终端模块并加载插件。布局已经就绪时，状态栏初始化同步执行，在状态栏项内放上图标和 NAND，并保持点击和右键打开预设脚本菜单。初始化成功返回后，后面的命令和设置页照常注册。若状态栏项拒绝接受子元素，异常离开初始化，加载失败仍然可见。

## 5. 实现契约

- **入口或接缝：** 布局就绪时执行的状态栏初始化。
- **输入与输出：** 输入是已有的状态栏项。输出是其中的图标和文字 NAND，或继续向外的异常。
- **公共接口变化：** 无。
- **不变量：** 新元素不是 Document 的额外根元素。
- **状态或数据流：** 不写新的设置字段。
- **错误与失败行为：** 不捕获这次创建的异常。
- **兼容要求：** 不提高 minAppVersion。
- **安全与隐私要求：** 不适用：不读取新的用户数据。

## 6. 执行路线

1. 先写会在 Document 接受第二个根元素时失败的定向测试，并让当前初始化变红。
2. 把图标和文字改到状态栏项上，使成功路径变绿。
3. 用拒绝子元素的桩确认异常仍然抛出。
4. 重建提交用的 main.js，并运行本票验证矩阵。

## 7. 路径访问契约

- **预计修改点：** 与 `expected_changes` 对齐。
- **可写范围：** 与 `writable_paths` 对齐。
- **只读上下文：** 与 `read_only_paths` 对齐。插件 onload 的注册顺序只读，不在本票改写。
- **共享路径：** `main.js` 由 T-01 在本 change 内独占写入。父计划还要把它和另外两条 change 串行。
- **保留或不动：** 设置页和连接菜单。

## 8. 验证矩阵

| 行为或风险 | 验证接缝 | 命令或步骤 | 预期结果 | Evidence |
|---|---|---|---|---|
| 成功创建 | 会拒绝第二个 Document 根元素的桩 | `pnpm run test:terminal-agent` 中的新增定向测试 | 不抛 HierarchyRequestError，状态栏项含图标和 NAND | `<Path>{roots.state}/specdev/changes/2026-09-25-statusbar-hierarchy-error/evidence/T-01.md</Path>` |
| 失败仍抛出 | 状态栏项拒绝子元素 | 同一命令 | 异常离开初始化 | `<Path>{roots.state}/specdev/changes/2026-09-25-statusbar-hierarchy-error/evidence/T-01.md</Path>` |
| 构建回归 | 类型检查、打包和 lint | `pnpm run build` 然后 `pnpm run lint` | 退出码 0，且没有新的 error | `<Path>{roots.state}/specdev/changes/2026-09-25-statusbar-hierarchy-error/evidence/T-01.md</Path>` |

- **Workspace checks：** current workspace 运行上述定向测试、build 和 lint。
- **E2E disposition：** required。干净库首次启用和 Reload app without saving。环境是 current-workspace，由 Lead 执行。预期是命令、设置页和 NAND 状态栏都在，且没有这次 HierarchyRequestError。
- **E2E owner/environment：** Lead / current-workspace。
- **Integration evidence：** current 模式记录 implementation commit、parent before、result SHA。candidate 不适用。

## 9. 发布、迁移与恢复

- **迁移顺序：** 不适用：没有设置或笔记数据迁移。
- **兼容窗口：** 不适用：没有并行的旧协议。
- **监控信号：** 不适用：成功路径不再出现这次异常即可。
- **回滚或前向恢复：** 回退本票 commit。
- **不可逆操作与批准点：** 无。
- **收缩条件：** 不适用：没有旧调用协议要清零。

## 10. 验收标准

- [ ] `AC-001`：布局就绪时的初始化不抛出 HierarchyRequestError，状态栏项内有图标和 NAND。
- [ ] `AC-002`：点击或右键仍打开预设脚本菜单。
- [ ] `AC-003`：初始化成功返回后，命令和设置页的注册不被这次错误打断。
- [ ] `AC-004`：状态栏项拒绝子元素时，异常继续向外抛出。
- [ ] 实现开始前已完整读取 Tickets Map，已读取项目 Skill 入口并完整展开其中适用于 `ALL`/`T-01` 的匹配项。
- [ ] 验证矩阵全部执行并记录到 `<Path>{roots.state}/specdev/changes/2026-09-25-statusbar-hierarchy-error/evidence/T-01.md</Path>`。
- [ ] 实际项目修改未超出 `writable_paths`，shared path 由指定 owner 修改。
- [ ] Ticket 已按 Goal Plan 策略形成非空 implementation commit，direct-parent 验证通过且父分支 result 已记录。
- [ ] E2E disposition 已执行；current 模式由 Lead 在 current workspace 完成。
- [ ] 未发生未批准的范围、契约或发布偏差。
- [ ] Ticket、Tickets Map 和 Evidence 状态一致。

## 11. SKILL 调用计划

实现阶段调用 dev 的 `edit-status-bar-init`。进入源码前读取 architecture 和 obsidian-api 两份参考。验证阶段调用 dev 的 `run-status-bar-checks`，并先读 build-and-release。绑定失败则停止本票，不改用别的规则来源。

## 12. 停止、检查点与交付

- **用户交付要求与数量：** 没有额外件数。本票交付一条可用的状态栏入口。
- **必需 Skill/引用/测试不可用：** 阻塞本票。
- **归属与资源冲突：** `main.js` 与另外两条 change 冲突时暂停本票，不接管它们的状态。
- **检查点：** 记录 dev 入口摘要、定向测试是否先变红、以及 Evidence 缺口。
- **完成出口：** 验收和 Skill 证据都通过后交回父计划。实现提交目前没有授权。
