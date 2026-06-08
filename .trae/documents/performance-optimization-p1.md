# P1 性能优化：减少流式传输期间的无效计算和重渲染

## Context

P0 问题（懒加载 + 虚拟化）已解决。但在流式传输（streaming）期间，LLM 每产生几个 token 就触发一次 store 更新，导致以下 P1 级别问题：

1. 多个组件订阅了 `activeMessages`，流式时每次 token 都引起不必要的重渲染
2. ReactMarkdown 在 AgentGroup 重渲染时对所有消息重新解析（而非只解析正在变化的那条）
3. `appendAgentText` 每次调用都 O(n) 拷贝整个消息数组，长对话时 GC 压力大
4. `OutputPreviewSidebar` 中 `extractDiffsFromSession` 未 memoize，流式时反复执行

***

## 修复 1：SessionSidebar 不再订阅 activeMessages

**文件**: `src/renderer/src/components/SessionSidebar.tsx`

**问题**: 第 18 行 `const activeMessages = useChatStore((s) => s.activeMessages)` 导致流式时每 token 重渲染。它仅在 `openNewDialog`（第 122 行）判断当前会话是否为空。

**方案**: 将判断逻辑改为在点击时通过 `useChatStore.getState()` 读取，去掉组件级的 activeMessages 订阅。

```typescript
// 删除第 18 行的 activeMessages selector

// 第 122 行改为：
const openNewDialog = () => {
  if (activeAgentId && activeSessionId) {
    const msgs = useChatStore.getState().activeMessages
    const isCurrentEmpty = msgs.length === 0 || !msgs.some((m) => m.role === 'user')
    const currentMeta = sessionMetas.find((m) => m.sessionId === activeSessionId)
    if (isCurrentEmpty && currentMeta?.agentId === activeAgentId) {
      return
    }
  }
  // ... 其余逻辑不变
}
```

***

## 修复 2：ChatInput 精确订阅当前 session 的 prompting 状态

**文件**: `src/renderer/src/components/ChatInput.tsx`

**问题**: 第 14 行订阅整个 `isPromptingMap` 对象，其他 session 状态变化也会触发重渲染。

**方案**: 将 selector 改为只获取当前 session 的状态布尔值：

```typescript
// 删除第 14 行的 isPromptingMap selector 和第 17 行的派生
// 替换为：
const isPrompting = useChatStore((s) => {
  const sid = s.activeSessionId
  return sid ? (s.isPromptingMap[sid] ?? false) : false
})
```

***

## 修复 3：ReactMarkdown 组件级 memo

**文件**: `src/renderer/src/components/MessageList.tsx`

**问题**: `AgentGroup` 被 memo 了，但比较函数只看最后一条消息——最后一条变化时，组内**所有**消息的 ReactMarkdown 都重新解析。ReactMarkdown 解析开销大（remark/rehype pipeline + KaTeX）。

**方案**: 将单条消息的 Markdown 渲染提取为独立的 memo 组件：

```typescript
const remarkPlugins = [remarkGfm, remarkMath]
const rehypePlugins = [rehypeKatex]

const MemoMarkdown = memo(function MemoMarkdown({ text, isDark }: { text: string; isDark: boolean }) {
  return (
    <div className={`text-sm text-text prose prose-sm max-w-none ${isDark ? 'prose-invert' : ''} [&_pre]:bg-panel-bg [&_pre]:border [&_pre]:border-border [&_code]:text-warning [&_a]:text-accent`}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>{text}</ReactMarkdown>
    </div>
  )
})
```

在 `AgentGroup` 内部，将第 149-153 行替换为 `<MemoMarkdown text={seg.msg.text} isDark={isDark} />`。

这样只有 text 实际变化的那条消息才会重新解析 Markdown，其余已完成的消息完全跳过。

同时将 plugins 数组提升为模块级常量（避免每次创建新引用）。

***

## 修复 4：appendAgentText 优化——只替换最后一个元素

**文件**: `src/renderer/src/stores/chatStore.ts`

**问题**: 第 431 行 `const msgs = [...s.activeMessages]` 每次 token 追加都拷贝整个数组。对于 200 条消息的对话，流式过程中会进行数百次 200 元素的数组拷贝。

**方案**: 利用 Zustand 的 shallow equality 行为，只替换最后一个元素而非拷贝全量数组：

```typescript
appendAgentText: (text, sessionId?) => {
  // ... 前置检查不变
  set((s) => {
    const msgs = s.activeMessages
    const last = msgs[msgs.length - 1]
    if (last && last.role === MessageRole.Agent && !last.isThought && !(last.toolCalls && last.toolCalls.length > 0)) {
      const updated = { ...last, text: last.text + text }
      const newMsgs = msgs.slice()
      newMsgs[newMsgs.length - 1] = updated
      return { activeMessages: newMsgs }
    } else {
      return { activeMessages: [...msgs, { id: crypto.randomUUID(), role: MessageRole.Agent, text, timestamp: Date.now() }] }
    }
  })
  schedulePersist()
}
```

> 注意：`[...arr]` 和 `arr.slice()` 性能相同，但关键优化是**只在 push 新消息时才完整拷贝**，而追加 text 到最后一条消息时可以用 `slice()` 替代展开运算符（语义相同，不产生额外中间对象）。实际上这两个写法等价——真正的优化在修复 5 中的 throttle。

实际优化策略改为：**对 appendAgentText 进行 throttle**，减少 set() 调用频率。

***

## 修复 5：appendAgentText 增加 microtask batching

**文件**: `src/renderer/src/stores/chatStore.ts`

**问题**: LLM 流式输出时，每几个 token（甚至每个 token）就调用一次 `appendAgentText`，每次都触发 React 重渲染。

**方案**: 在模块级引入一个文本缓冲区 + `queueMicrotask` 批处理。将同一事件循环中的多次追加合并为一次 store 更新：

```typescript
let pendingTextBuffer = ''
let pendingTextFlushScheduled = false

// 在 appendAgentText 中：
pendingTextBuffer += text
if (!pendingTextFlushScheduled) {
  pendingTextFlushScheduled = true
  queueMicrotask(() => {
    const buffered = pendingTextBuffer
    pendingTextBuffer = ''
    pendingTextFlushScheduled = false
    // 执行实际的 set() 更新
    set((s) => { ... use buffered ... })
    schedulePersist()
  })
}
```

这样即使 LLM 在同一个 tick 内发送多个 token chunk，也只触发一次 React 更新。

***

## 修复 6：OutputPreviewSidebar extractDiffsFromSession 加 useMemo

**文件**: `src/renderer/src/components/OutputPreviewSidebar.tsx`

**问题**: 第 552 行直接在组件体调用 `extractDiffsFromSession(activeMessages)`，且下方 `useMemo` 依赖 `[allDiffs]`（每次新引用，永远不命中缓存）。

**方案**: 将整个 diff 计算包裹在一个 `useMemo` 中：

```typescript
const diffs = useMemo(() => {
  const allDiffs = extractDiffsFromSession(activeMessages)
  const seen = new Map<string, FileDiff>()
  for (const diff of allDiffs) {
    seen.set(diff.filePath, diff)
  }
  return Array.from(seen.values())
}, [activeMessages])
```

合并两步计算为一个 `useMemo`，删除原先的 `allDiffs` 中间变量和无效的第二个 `useMemo`。

***

## 实现顺序

1. 修复 3（MemoMarkdown） — 影响最大，独立性强
2. 修复 1（SessionSidebar） — 一行改动
3. 修复 2（ChatInput） — 小改动
4. 修复 5 + 4（appendAgentText batching） — 核心优化
5. 修复 6（OutputPreviewSidebar useMemo）
6. 验证：`pnpm build` 通过

***

## 验证

1. `pnpm build` 无编译错误
2. 运行应用，发送消息触发流式响应，确认：

   * 消息正常显示，markdown 渲染正确

   * 滚动行为正常

   * SessionSidebar 在流式期间不闪烁/不重渲染（可通过 React DevTools Profiler 确认）
3. 在长对话（50+ 消息）中触发新消息流式，确认无明显卡顿

