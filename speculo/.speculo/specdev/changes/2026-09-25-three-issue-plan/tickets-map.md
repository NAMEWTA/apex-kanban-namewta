---
schema_version: 1
artifact: goal-tickets-map
change: 2026-09-25-three-issue-plan
implementation_map: "<Path>{roots.state}/specdev/changes/2026-09-25-three-issue-plan/implementation-map.md</Path>"
implementation_plan: "<Path>{roots.state}/specdev/changes/2026-09-25-three-issue-plan/implementation-plan.md</Path>"
---

# Goal 总控入口

本文件只负责入口解析，不缓存成员、依赖、owner、状态或 Gate。

从这里读取上方 Implementation Map 和 Implementation Plan，再进入 `<Path>{roots.workflows}/specdev/P-goal-plan/P-goal-plan.md</Path>` 的 run 或 resume。先运行 `<Path>{roots.workflows}/specdev/common/tools/ticket-control.mjs</Path>` 的 `--map` 只读检查。仅计划调用不得启动实现。
