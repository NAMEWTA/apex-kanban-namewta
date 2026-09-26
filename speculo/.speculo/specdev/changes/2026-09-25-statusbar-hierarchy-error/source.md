---
schema_version: 1
artifact: source
change: 2026-09-25-statusbar-hierarchy-error
source_type: github-issue
canonical_locator: "https://github.com/NAMEWTA/nand/issues/1"
captured_at: 2026-09-25T10:16:50.855Z
content_sha256: 012cd8a43aa7b88a8302967f22c644051220af9ff1998960c9f4f7c90f971ee6
remote_state: open
close_capability: supported
---

# Source: 首次启用时 initStatusBar 抛 HierarchyRequestError，中断插件加载

## Capture Metadata

- **Capture method:** GitHub CLI
- **Author:** NAMEWTA
- **Created / updated:** 2026-09-25T09:33:06Z / 2026-09-25T09:37:48Z
- **Labels or classification supplied by source:** none
- **Attachments:** 见下方列表。正文中的图片只保留来源 URL，未保存二进制。
- **Redactions:** none
- **Content hash:** SHA-256 over UTF-8 `title + "\n---\n" + body + "\n---\ncomments:0\n"`。评论数为 0。

- 1. 首次启用控制台报错：<Url>https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue1-1-first-enable-console-errors.png</Url>
- 2. 命令面板缺少看板命令：<Url>https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue1-2-no-dashboard-command.png</Url>
- 3. 设置里没有 NAND 页：<Url>https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue1-3-settings-no-nand-tab.png</Url>
- 4. 重载后仍报同一错误：<Url>https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue1-4-reload-console-errors.png</Url>
- 5. 状态栏没有 NAND 入口：<Url>https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue1-5-statusbar-no-nand.png</Url>

## Original Content

## 问题概述
首次启用插件时，终端模块 `initStatusBar` 抛出 HierarchyRequestError，中断整个插件加载，导致看板命令、编辑器面板和 NAND 设置页全部缺失；重载后其余功能恢复，但状态栏 “NAND” 入口始终不出现。

## 环境
- 插件：nand 0.0.1（main @ d4aada6d2253d2596a50225ef571ccc5312ea67a）
- Obsidian：1.13.7（Linux AppImage）
- 测试库：干净库，仅启用本插件

## 复现步骤
1. 新建空库，把构建产物放入 `.obsidian/plugins/nand/`，`community-plugins.json` 写入 `["nand"]`
2. 打开库，点 “Trust author and enable plugins”
3. 打开开发者工具 Console；Ctrl+P 输入 “NAND”；打开 Settings 查看 Community plugins 下是否有 NAND
4. 执行 “Reload app without saving”，再看 Console 和状态栏

## 期望结果
插件完整加载：命令面板有「打开工作台」「打开编辑器面板」，设置里有 NAND 页，状态栏有 “NAND” 入口，控制台无报错。

## 实际结果
- 第 2 步后控制台报 `Plugin failure: nand HierarchyRequestError`，命令面板没有「打开工作台」「打开编辑器面板」，设置里没有 NAND 页；点智能体视图里的「打开首页」再报 `Cannot set properties of undefined (setting 'activeProduct')`。
- 重载后命令和设置页恢复，但同一个 HierarchyRequestError 仍会出现，状态栏始终没有 “NAND” 入口。

## 截图
1. 首次启用控制台报错

![1. 首次启用控制台报错](https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue1-1-first-enable-console-errors.png)

2. 命令面板缺少看板命令

![2. 命令面板缺少看板命令](https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue1-2-no-dashboard-command.png)

3. 设置里没有 NAND 页

![3. 设置里没有 NAND 页](https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue1-3-settings-no-nand-tab.png)

4. 重载后仍报同一错误

![4. 重载后仍报同一错误](https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue1-4-reload-console-errors.png)

5. 状态栏没有 NAND 入口

![5. 状态栏没有 NAND 入口](https://gist.githubusercontent.com/NAMEWTA/055537ff620ae786bd57e0033896754f/raw/issue1-5-statusbar-no-nand.png)

## 控制台错误（如有）
```
Plugin failure: nand HierarchyRequestError: Failed to execute 'appendChild' on 'Node': Only one element on document allowed.
    at HTMLDocument.createEl (enhance.js:1:8610)
    at Node.createSpan (enhance.js:1:8751)
    at Ns.initStatusBar (plugin:nand:229:16186)
    at eval (plugin:nand:229:11047)
    at t.onLayoutReady (app.js:1:2857748)
    at Ns.onload (plugin:nand:229:11023)
    at async Eh.ensureTerminal (plugin:nand:442:10210)
    at async Eh.applyModuleFlags (plugin:nand:442:8570)
    at async Eh.onload (plugin:nand:442:5831)
Uncaught TypeError: Cannot set properties of undefined (setting 'activeProduct')
    at Eh.openHome (plugin:nand:442:8189)
```

## 备注
`src/terminal-agent/host/controller.ts:571` 调用的是 `activeDocument.createSpan({ cls: 'terminal-status-bar-icon' })`。Obsidian 的 `createSpan` 挂在 Node 上时会把新元素 append 到该节点，对 Document 调用就是往 document 根下再挂一个元素，因此抛错。首次启用时 layout 已就绪，`onLayoutReady` 回调同步执行，异常沿 `ensureTerminal` 冒泡中断了主插件 onload；冷启动/重载时回调延后执行，所以只丢了状态栏入口。仓库自带的 40 个 test:* 脚本均通过，未覆盖此路径。

## Source Comments

无
