---
schema_version: 1
artifact: source
change: 2026-09-25-terminal-connection-i18n
source_type: github-issue
canonical_locator: "https://github.com/NAMEWTA/nand/issues/3"
captured_at: 2026-09-25T10:16:50.855Z
content_sha256: a435b2f6326a56ff2f498e22485ca7349dc30efa5c70e75473338cfc0817a218
remote_state: open
close_capability: supported
---

# Source: 智能体设置「连接」菜单显示原始 i18n 键名 terminalAgent.settingsDetails.terminal.serverConnection

## Capture Metadata

- **Capture method:** GitHub CLI
- **Author:** NAMEWTA
- **Created / updated:** 2026-09-25T09:40:14Z / 2026-09-25T09:40:14Z
- **Labels or classification supplied by source:** none
- **Attachments:** 见下方列表。正文中的图片只保留来源 URL，未保存二进制。
- **Redactions:** none
- **Content hash:** SHA-256 over UTF-8 `title + "\n---\n" + body + "\n---\ncomments:0\n"`。评论数为 0。

- 智能体设置子菜单显示原始键名：<Url>https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue3-1-settings-raw-i18n-key.png</Url>

## Original Content

## 问题概述
设置 → NAND → 智能体 的「连接」菜单项显示原始键名 `terminalAgent.settingsDetails.terminal.serverConnection`，没有中文/英文文案。

## 环境
- 插件：nand 0.0.1（main @ d4aada6d2253d2596a50225ef571ccc5312ea67a）
- Obsidian：1.13.7（Linux AppImage）
- 测试库：干净库，仅启用本插件（插件语言：中文）

## 复现步骤
1. 打开 Settings → Community plugins → NAND
2. 点顶部「智能体」
3. 查看左侧子页菜单

## 期望结果
该菜单项显示「服务器连接」（英文界面为 “Server connection”）。

## 实际结果
显示 `terminalAgent.settingsDetails.terminal.serverConnection`（被截断），点开后页面标题正常显示「服务器连接」。

## 截图
智能体设置子菜单显示原始键名

![智能体设置子菜单显示原始键名](https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue3-1-settings-raw-i18n-key.png)

## 控制台错误（如有）
```
无
```

## 备注
`src/plugin/settings/settings-tab.ts:332` 使用 `terminalAgent.settingsDetails.terminal.serverConnection`，而 `src/shared/i18n/terminal-agent.ts` 里只有 `terminalAgent.settingsDetails.advanced.serverConnection`（186 行英文、586 行中文）。

## Source Comments

无
