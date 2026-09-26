---
schema_version: 1
artifact: triage
change: 2026-09-25-terminal-connection-i18n
mode: intake
source: <Path>{roots.state}/specdev/changes/2026-09-25-terminal-connection-i18n/source.md</Path>
classification: bug
risk: low
route: specdev/spec
ready_for_implementation: false
external_action: not-applicable
publish_action: not-requested
publish: null
updated_at: 2026-09-25T10:16:50.855Z
---

# Triage: 智能体设置「连接」菜单显示原始 i18n 键名 terminalAgent.settingsDetails.terminal.serverConnection

## 当前判定

- **影响：** 智能体设置左侧「连接」菜单显示未翻译的键名。点进该页后标题仍是「服务器连接」。没有控制台错误，也不影响连接设置本身。
- **紧急度：** normal
- **当前证据：** <Path>src/plugin/settings/settings-tab.ts</Path> 的 sectionTabs 用共享 t() 查询 terminalAgent.settingsDetails.terminal.serverConnection。<Path>src/shared/i18n/runtime.ts</Path> 在中文和英文都没有该键时返回键名本身。<Path>src/shared/i18n/terminal-agent.ts</Path> 只有 terminalAgent.settingsDetails.advanced.serverConnection，英文 Server connection，中文服务器连接。页面标题走终端 t()，会加上 terminalAgent. 前缀，对应 <Path>src/terminal-agent/settings/renderer.ts</Path> 的 settingsDetails.advanced.serverConnection。
- **相关代码/工件：** <Path>src/plugin/settings/settings-tab.ts</Path>、<Path>src/shared/i18n/runtime.ts</Path>、<Path>src/shared/i18n/terminal-agent.ts</Path>、<Path>src/terminal-agent/settings/renderer.ts</Path>、<Path>src/terminal-agent/i18n.ts</Path>

## 未知项

- **可发现事实：** 无。菜单键缺失、回退为键名、页面标题使用另一条已存在文案，都已在仓库中定位。
- **需要用户决定：** 无。来源期望的菜单文案就是现有的「服务器连接」和 Server connection。
- **低影响实现细节：** 菜单改为读取已有的 advanced.serverConnection，还是新增 terminal.serverConnection 并写入相同文案。两种都不改变来源要求的可见文字。

## 路由

- **下一 Work：** <Path>{roots.workflows}/specdev/S-spec/S-spec.md</Path>
- **理由：** 期望文案已经由来源写明，缺失的键和页面标题所用的现有键都已在仓库里定位。没有未锁定的产品或架构决定，下一步是把外部行为写成 Spec。
- **查重：** 捕获时 active 与 archive 都没有相同 canonical locator。永久 ADR 与永久 context 只有空目录。没有可对照的已归档拒绝。
- **内容哈希：** `a435b2f6326a56ff2f498e22485ca7349dc30efa5c70e75473338cfc0817a218`

## 外部动作

- **远程目标：** <Url>https://github.com/NAMEWTA/nand/issues/3</Url>
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
