# LOG

## LOG-001 — 2026-09-25T10:16:50.855Z — 状态栏抛错的机制
- **设计树节点：** 不适用
- **轮次与依赖：** round 1 / 无
- **状态：** confirmed
- **问题：** 首次启用的 HierarchyRequestError 从哪里来，为什么会带走命令和设置页。
- **事实与来源：** <Path>src/terminal-agent/host/controller.ts</Path> 的 initStatusBar 对 activeDocument 调用 createSpan。Obsidian 类型声明 activeDocument 是 Document，且 Node.createSpan 会把新元素 append 到该节点。来源堆栈与 “Only one element on document allowed.” 一致。<Path>src/plugin/main.ts</Path> 在 applyModuleFlags 的 await 之后才注册命令和设置页。onLayoutReady 在布局已就绪时同步执行。
- **选项：** 不适用。这是机制，不是取舍。
- **推荐：** 不适用。
- **结论：** 错误父节点和同步回调已经足以解释来源描述的首次中断与重载后只丢状态栏。这不是用户决定。
- **原因：** 类型注释、调用顺序和来源堆栈一致。本次没有在 Obsidian 中重跑。
- **影响工件：** CONTEXT / Spec
- **约束或不变量：** 状态栏图标和 NAND 标签仍要出现在状态栏项里，不能留在 document 根上。
- **后续：** D-001 仍打开。回答前不写 Spec，也不把失败隔离写成决定。
- **替代/被替代：** 无

## LOG-002 — 2026-09-25T19:53:09+08:00 — 只修正状态栏父节点
- **设计树节点：** D-001
- **轮次与依赖：** round 2 / 无
- **状态：** confirmed
- **问题：** 状态栏初始化将来再抛错时，插件加载是否继续完成。
- **事实与来源：** 用户于 2026-09-25 接受推荐方案。当前 initStatusBar 对 Document 调用 createSpan，异常没有被捕获。
- **选项：** 只把图标和 NAND 文字创建在状态栏项上。或者同时隔离异常，让命令和设置页在状态栏失败时仍完成注册。
- **推荐：** 只修正父节点。
- **结论：** 只修正父节点。不添加把状态栏初始化失败变成成功加载的异常隔离。
- **原因：** 来源要求状态栏入口存在，并且这次 HierarchyRequestError 消失。隔离会隐藏下一次入口缺失。
- **影响工件：** Spec
- **约束或不变量：** 图标和文字 NAND 属于 NAND 状态栏入口。失败继续向外抛出。
- **后续：** 该决定可逆，不满足架构决定的三项准入，不写入 ADR。Spec 用 DEC-001 锁定它。
- **替代/被替代：** 替代 LOG-001 里“D-001 仍打开”的后续。
