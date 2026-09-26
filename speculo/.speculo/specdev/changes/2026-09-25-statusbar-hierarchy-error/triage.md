---
schema_version: 1
artifact: triage
change: 2026-09-25-statusbar-hierarchy-error
mode: intake
source: <Path>{roots.state}/specdev/changes/2026-09-25-statusbar-hierarchy-error/source.md</Path>
classification: bug
risk: high
route: specdev/grill-with-docs
ready_for_implementation: false
external_action: not-applicable
publish_action: not-requested
publish: null
updated_at: 2026-09-25T10:16:50.855Z
---

# Triage: 首次启用时 initStatusBar 抛 HierarchyRequestError，中断插件加载

## 当前判定

- **影响：** 首次启用时整个插件 onload 在注册命令和设置页之前中断；重载后命令和设置恢复，但状态栏 NAND 入口仍然不会出现。
- **紧急度：** immediate
- **当前证据：** 来源堆栈是 HierarchyRequestError，位于 initStatusBar。<Path>src/terminal-agent/host/controller.ts</Path> 在布局就绪回调里调用 activeDocument.createSpan。Obsidian 类型把 activeDocument 声明为 Document，并把 Node.createSpan 定义为创建元素后 append 到该节点。Document 上再挂一个元素会触发来源里的 “Only one element on document allowed.”。<Path>src/plugin/main.ts</Path> 的 onload 先 await applyModuleFlags，其中 ensureTerminal await 终端 onload；功能区图标、命令和设置页都排在这次 await 之后。onLayoutReady 的类型注释写明布局已就绪时回调立即执行。仓库里没有测试调用 initStatusBar。本次没有在 Obsidian 里重跑。
- **相关代码/工件：** <Path>src/terminal-agent/host/controller.ts</Path>、<Path>src/plugin/main.ts</Path>、<Path>node_modules/obsidian/obsidian.d.ts</Path>

## 未知项

- **可发现事实：** 无。同步回调和 Document 挂载这两点已由类型注释和调用顺序说明。
- **需要用户决定：** 状态栏初始化将来再抛错时，是否只修这次的父节点，还是同时隔离异常，使插件其余加载继续完成。
- **低影响实现细节：** 图标用状态栏项自己的 createSpan，还是 createElement 后再 append 到状态栏项。标签文字保持来源里的 NAND。

## 路由

- **下一 Work：** <Path>{roots.workflows}/specdev/G-grill-with-docs/G-grill-with-docs.md</Path>
- **理由：** 调用点、类型定义、onload 顺序和来源堆栈已经对上。还没锁定的是失败隔离范围：只修正把节点挂到 document 的调用，还是同时让状态栏初始化失败不再中断整个插件加载。
- **查重：** 捕获时 active 与 archive 都没有相同 canonical locator。永久 ADR 与永久 context 只有空目录。没有可对照的已归档拒绝。
- **内容哈希：** `012cd8a43aa7b88a8302967f22c644051220af9ff1998960c9f4f7c90f971ee6`

## 外部动作

- **远程目标：** <Url>https://github.com/NAMEWTA/nand/issues/1</Url>
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
