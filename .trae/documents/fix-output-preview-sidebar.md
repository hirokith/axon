# 修复 OutputPreviewSidebar.tsx 残留旧 API 引用

## 背景

P0 性能优化已基本完成（DB 分表、懒加载、虚拟化），但 `OutputPreviewSidebar.tsx` 中仍引用已删除的 `s.sessions` API，需要修复以通过编译。

## 当前问题

文件：`/Users/bytedance/dev/github/axon/src/renderer/src/components/OutputPreviewSidebar.tsx`

- 第 546 行：`const sessions = useChatStore((s) => s.sessions)` — `sessions` 已不存在于 store 中
- 第 553-554 行：通过 `sessions.find(...)` 获取活跃 session 的 messages — 应改用 `activeMessages`

## 修复方案

1. 将第 546 行改为：`const activeMessages = useChatStore((s) => s.activeMessages)`
2. 删除第 547 行的 `activeSessionId` selector（不再需要）
3. 将第 553-554 行改为：`const allDiffs = extractDiffsFromSession(activeMessages)`

## 验证

- `pnpm build` 通过
- grep 确认无残留 `s.sessions` 引用
