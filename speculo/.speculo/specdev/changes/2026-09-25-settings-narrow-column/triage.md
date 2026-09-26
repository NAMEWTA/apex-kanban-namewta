---
schema_version: 1
artifact: triage
change: 2026-09-25-settings-narrow-column
mode: intake
source: <Path>{roots.state}/specdev/changes/2026-09-25-settings-narrow-column/source.md</Path>
classification: bug
risk: high
route: specdev/diagnose-bugs
ready_for_implementation: false
external_action: not-applicable
publish_action: not-requested
publish: null
updated_at: 2026-09-25T10:16:50.855Z
---

# Triage: NAND 设置页内容被挤成约 100px 宽的竖条，说明文字逐字换行、控件错位

## 当前判定

- **影响：** NAND 设置各页挤在窄列里，说明文字竖排，智能体页输入框越出该列，设置难以阅读和操作。插件其余功能不受这次报错影响；来源写明打开设置页没有新的控制台错误。
- **紧急度：** immediate
- **当前证据：** 声明式设置在 <Path>src/plugin/settings/settings-tab.ts</Path> 的 getSettingDefinitions 里把每个区块渲染成 setting 行，并给宿主加上 dashboard-settings-section。renderChrome 把 nand-settings 加到最近的 vertical-tab-content，再按有没有二级导航切换 nand-settings-split。<Path>styles.css</Path> 里 .nand-settings 是两列网格：180px 和 minmax(0, 1fr)。chrome 与 dashboard-settings-shell 为 display: contents。跨列规则只选择 .nand-settings 的直接子元素 setting-item.dashboard-settings-section。520px 以下媒体查询把网格改成单列。首页和同步没有二级导航，看板、编辑器和智能体有，见 <Path>src/plugin/settings/nav.ts</Path>。
- **相关代码/工件：** <Path>src/plugin/settings/settings-tab.ts</Path>、<Path>src/plugin/settings/nav.ts</Path>、<Path>styles.css</Path>

## 未知项

- **可发现事实：** Obsidian 1.13.7 设置页里 .vertical-tab-content 的直接子节点是什么，以及内容实际落在 180px 列、1fr 列还是另一条宽度规则上。来源备注也写明尚未用开发者工具确认。
- **需要用户决定：** 无。期望布局已由来源写明：设置项占满右侧内容区，名称、说明和控件按 Obsidian 常规设置行横向排列；有二级导航时导航在左、内容在右。
- **低影响实现细节：** 诊断确认规则之后，选择改网格选择器、改声明式 DOM，还是两者一起改。现有 520px 单列规则是否保留，等诊断证明它参与了这次症状再决定。

## 路由

- **下一 Work：** <Path>{roots.workflows}/specdev/D-diagnose-bugs/D-diagnose-bugs.md</Path>
- **理由：** 期望布局已经写明，但约 100px 竖条对应的是哪条实际布局规则还没有在 Obsidian DOM 上确认。根因未知的 bug 先诊断。
- **查重：** 捕获时 active 与 archive 都没有相同 canonical locator。永久 ADR 与永久 context 只有空目录。没有可对照的已归档拒绝。
- **内容哈希：** `fdc4d984cd56c549714d6e355960465acacbd777e1db8bae98381af6f8e179da`

## 外部动作

- **远程目标：** <Url>https://github.com/NAMEWTA/nand/issues/2</Url>
- **关闭能力：** supported
- **当前状态：** not-applicable
- **授权记录：** 本次 intake 没有关闭或修改源 Issue 的授权。
- **尝试与结果：** 远程写入为零。

外部动作只投影来源 Issue 的最终完成，不替代本地状态、Ticket、Map 或 Evidence。

## 发布投影

- **publish_action：** not-requested
- **账本：** 无
- **origin：** intake
- **计数：** 未请求发布投影。
