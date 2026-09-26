---
schema_version: 1
artifact: source
change: 2026-09-25-settings-narrow-column
source_type: github-issue
canonical_locator: "https://github.com/NAMEWTA/nand/issues/2"
captured_at: 2026-09-25T10:16:50.855Z
content_sha256: fdc4d984cd56c549714d6e355960465acacbd777e1db8bae98381af6f8e179da
remote_state: open
close_capability: supported
---

# Source: NAND 设置页内容被挤成约 100px 宽的竖条，说明文字逐字换行、控件错位

## Capture Metadata

- **Capture method:** GitHub CLI
- **Author:** NAMEWTA
- **Created / updated:** 2026-09-25T09:34:43Z / 2026-09-25T09:37:49Z
- **Labels or classification supplied by source:** none
- **Attachments:** 见下方列表。正文中的图片只保留来源 URL，未保存二进制。
- **Redactions:** none
- **Content hash:** SHA-256 over UTF-8 `title + "\n---\n" + body + "\n---\ncomments:0\n"`。评论数为 0。

- 1. 设置首页：内容挤成窄竖条：<Url>https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue2-1-settings-home-narrow.png</Url>
- 2. 看板设置：说明文字逐字换行：<Url>https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue2-2-settings-board-narrow.png</Url>
- 3. 智能体设置：输入框飘到竖条外：<Url>https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue2-3-settings-agents-narrow.png</Url>

## Original Content

## 问题概述
打开 Settings → Community plugins → NAND，设置页没有铺满右侧内容区，而是挤在一条约 100px 宽的竖条里。首页、看板、编辑器、智能体各页都是这样：设置项说明文字每行只有一两个字，名称和开关挤在一起，智能体页的参数输入框飘到竖条外面，右侧大片空白，基本无法正常阅读和操作。

## 环境
- 插件：nand 0.0.1（main @ d4aada6d2253d2596a50225ef571ccc5312ea67a）
- Obsidian：1.13.7（Linux AppImage），设置窗口约 720×550
- 测试库：干净库，仅启用本插件

## 复现步骤
1. 安装并启用 NAND（如遇首次启用崩溃，先执行一次 “Reload app without saving”，见 #1）
2. 打开 Settings，点左侧 Community plugins 下的 NAND
3. 依次切换顶部的「首页」「看板」「编辑器」「智能体」

## 期望结果
设置项占满右侧内容区宽度，名称、说明和控件按 Obsidian 常规设置行横向排开；智能体页的二级导航在左、内容在右。

## 实际结果
- 整个设置内容挤在一条约 100px 宽的竖条中，说明文字逐字换行（如「备忘、待办、小组件……」被拆成七八行）。
- 智能体页：二级导航与内容都挤在同一窄列，「默认 Shell」说明竖排；参数输入框（placeholder「例如：PowerShell 使用 -NoLogo」）显示在竖条外面；右侧大片空白。

## 截图
1. 设置首页：内容挤成窄竖条

![1. 设置首页：内容挤成窄竖条](https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue2-1-settings-home-narrow.png)

2. 看板设置：说明文字逐字换行

![2. 看板设置：说明文字逐字换行](https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue2-2-settings-board-narrow.png)

3. 智能体设置：输入框飘到竖条外

![3. 智能体设置：输入框飘到竖条外](https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue2-3-settings-agents-narrow.png)

## 控制台错误（如有）
打开设置页时无新增报错。

## 备注
布局相关代码在 `src/plugin/settings/settings-tab.ts:345-405`（给 `.vertical-tab-content` 加 `nand-settings`、按是否有二级导航切换 `nand-settings-split`）和 `styles.css` 约 1829-1896 行（`.nand-settings` 为 `grid-template-columns: 180px minmax(0, 1fr)`，`.nand-settings-chrome` / `.dashboard-settings-shell` 为 `display: contents`）。从截图看，内容似乎全部落进了第一列或一个很窄的轨道里，但尚未用开发者工具确认具体是哪条规则导致，仅供排查参考。

## Source Comments

无
