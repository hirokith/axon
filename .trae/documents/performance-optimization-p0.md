# P0 性能优化：消息按 Session 分离存储 + 消息列表虚拟化

## Context

Axon 应用在会话数量增长后出现明显卡顿。根本原因：

1. 所有 session 的所有 messages 作为单个 JSON blob 存储在 SQLite，启动时一次性加载到内存
2. MessageList 使用 `.map()` 全量渲染所有消息 DOM，每条 Agent 消息都走 ReactMarkdown 重渲染

本方案解决这两个 P0 问题。

***

## 优化一：消息按 Session 分离存储（懒加载）

### 数据库层变更 (`src/main/db.ts`)

新增两张表：

```sql
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  label TEXT NOT NULL DEFAULT 'New Session',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  timestamp INTEGER NOT NULL,
  is_thought INTEGER NOT NULL DEFAULT 0,
  tool_calls TEXT,
  seq INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_session_seq ON messages(session_id, seq ASC);
```

新增函数：

* `getAllSessionMetas()` — 启动时加载所有 session 元数据（不含 messages）

* `getSessionMessages(sessionId)` — 按需加载单个 session 的消息

* `upsertSessionMeta(meta)` — 插入/更新 session 元数据

* `deleteSessionFromDb(sessionId)` — 删除 session 及其消息（CASCADE）

* `saveSessionMessages(sessionId, messages[])` — 批量覆写某 session 的消息（DELETE + INSERT 方式）

* `migrateFromBlobIfNeeded()` — 旧 blob 格式一次性迁移到新表

### 迁移策略

在 `src/main/index.ts` 的 `app.whenReady()` 中、注册 IPC handlers 前调用 `migrateFromBlobIfNeeded()`。迁移逻辑：

1. 检查 `chat_history` 表 key='state' 行是否存在
2. 检查 `sessions` 表是否为空（防重复迁移）
3. 在 TRANSACTION 中将旧 blob 的每个 session 拆入 `sessions` 和 `messages` 表
4. 删除旧 blob 行

### IPC 通道 (`src/shared/constants.ts`)

新增：

```
SessionMetasGetAll: 'sessions:get-all-metas'
SessionMessagesGet: 'sessions:get-messages'
SessionMetaUpsert: 'sessions:meta-upsert'
SessionDelete: 'sessions:delete'
MessagesSync: 'messages:sync'
```

保留旧的 `ChatHistoryGet` / `ChatHistorySet`（迁移后不再使用）。

### Preload 层 (`src/preload/index.ts`)

新增 `sessions` 和 `messages` 命名空间：

```typescript
sessions: {
  getAllMetas: () => ipcRenderer.invoke(IpcChannel.SessionMetasGetAll),
  getMessages: (sessionId: string) => ipcRenderer.invoke(IpcChannel.SessionMessagesGet, sessionId),
  upsertMeta: (meta: any) => ipcRenderer.invoke(IpcChannel.SessionMetaUpsert, meta),
  delete: (sessionId: string) => ipcRenderer.invoke(IpcChannel.SessionDelete, sessionId),
},
messages: {
  sync: (sessionId: string, messages: any[]) => ipcRenderer.invoke(IpcChannel.MessagesSync, sessionId, messages),
}
```

### chatStore 重构 (`src/renderer/src/stores/chatStore.ts`)

**核心变更**：移除 zustand `persist` 中间件，手动管理持久化。

新 state 结构：

```typescript
interface SessionMeta {
  sessionId: string
  agentId: string
  agentName?: string
  label: string
  createdAt: number
  updatedAt: number
}

interface ChatState {
  sessionMetas: SessionMeta[]        // 启动时全量加载的轻量元数据
  activeSessionId: string | null
  activeMessages: ChatMessage[]      // 仅当前活跃 session 的消息
  isLoadingMessages: boolean
  isPromptingMap: Record<string, boolean>  // 各 session 的 prompting 状态
  sessionCounter: number

  // 运行时状态（不持久化）
  connectedAgents: ConnectedAgent[]
  permissionRequests: PermissionRequestInfo[]
  pendingNewSessionAgentId: string | null

  // 初始化
  initFromDb: () => Promise<void>

  // Session 管理
  addSession: (sessionId: string, agentId: string, agentName?: string) => void
  switchSession: (sessionId: string) => Promise<void>
  removeSession: (sessionId: string) => void
  updateSessionId: (oldSessionId: string, newSessionId: string) => void

  // 消息操作（操作 activeMessages，仅限活跃 session）
  addUserMessage: (text: string, sessionId?: string) => void
  appendAgentText: (text: string, sessionId?: string) => void
  appendThoughtText: (text: string, sessionId?: string) => void
  addToolCall: (tc: ToolCallInfo, sessionId?: string) => void
  updateToolCall: (toolCallId: string, updates: Partial<ToolCallInfo>, sessionId?: string) => void
  setIsPrompting: (v: boolean, sessionId?: string) => void

  // ...其余 actions 保持不变
}
```

**关键行为变化**：

1. **`initFromDb()`**：应用启动时调用，加载 `sessionMetas`，若有 `activeSessionId` 则加载其消息。
2. **`switchSession(sessionId)`**：先 flush 当前 session 消息到 DB（debounced），再从 DB 加载目标 session 消息。含 race condition 防护。
3. **消息操作** (`appendAgentText` 等)：当 `sessionId === activeSessionId` 时，直接更新 `activeMessages`（保持同步快速）。当 `sessionId !== activeSessionId` 时（多 session 并行场景），消息存入模块级 `inactiveBuffers: Map<string, ChatMessage[]>`，在 `switchSession` 或 debounce 时间到达后写入 DB。
4. **持久化**：模块级 3 秒 debounce timer，将 `activeMessages` 通过 IPC `messages:sync` 写入 DB。`addSession` / `removeSession` 等元数据操作直接通过 IPC 持久化（无需 debounce，频率低）。

### 受影响的其他文件

* **`App.tsx`** (行 51, 101, 159)：`sessions` 引用改为 `sessionMetas`。`s.sessions.filter(...)` 改为 `s.sessionMetas.filter(...)`。

* **`ChatInput.tsx`** (行 13-16)：`activeSession` selector 改为从 `sessionMetas` 取元数据 + 从 `isPromptingMap` 取 prompting 状态。

* **`SessionSidebar.tsx`** (行 10, 85-87, 100-101, 114, 120-124)：`sessions` 改为 `sessionMetas`；分组时间戳使用 `meta.createdAt` 代替 `s.messages[0].timestamp`；`openNewDialog` 中检查空 session 不再依赖 messages。

* **`useAcpEvents.ts`**：无需改动——它通过 actions 操作 store，actions 内部逻辑变了但接口签名不变。

* **`src/main/index.ts`**：注册新 IPC handlers，启动时调 migrate。

***

## 优化二：消息列表虚拟化

### 新增依赖

```bash
pnpm add @tanstack/react-virtual
```

### MessageList.tsx 重写

**核心方案**：使用 `@tanstack/react-virtual` 的 `useVirtualizer`。

虚拟化单元为 `RenderGroup`（一个用户消息或一个连续 Agent 消息组）。每个 group 高度不固定，通过 `measureElement` + ResizeObserver 动态测量。

关键结构：

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

// 1. useMemo 计算 renderGroups（从 activeMessages）
// 2. useVirtualizer 管理虚拟化
// 3. 每个虚拟化 item 用 position: absolute + transform 定位
// 4. 自动滚动到底部保持现有行为
```

**自动滚动逻辑**：

* 维护 `isUserScrolledUp` ref（现有逻辑不变）

* 当不在上滚状态且消息更新时，调用 `virtualizer.scrollToIndex(last, { align: 'end' })`

* streaming 时最后一条消息高度在增长，ResizeObserver 自动触发虚拟化器重新测量

**参数**：

* `estimateSize: () => 120`（平均高度估值）

* `overscan: 5`（上下各多渲染 5 个 group）

* `getItemKey: (i) => renderGroups[i].key`（稳定 key，基于消息 id）

### React.memo 优化

在同一文件中：

* `MessageBubble` 包裹 `React.memo`（用户消息不可变，id 相同即跳过）

* `AgentGroup` 包裹 `React.memo`，自定义比较：items 长度 + 末条消息 text/toolCalls 变化时才重渲染

* `renderGroups` 用 `useMemo(messages)` 缓存分组计算

***

## 实现顺序

1. **DB 层 + IPC + Preload**：新增表、CRUD 函数、迁移逻辑、IPC handlers、preload API
2. **chatStore 重构**：移除 persist 中间件，实现新的 state 结构和持久化逻辑
3. **组件适配**：App.tsx、SessionSidebar.tsx、ChatInput.tsx 适配新 store API
4. **MessageList 虚拟化**：安装 @tanstack/react-virtual，重写 MessageList
5. **验证**：运行 `pnpm dev`，测试创建 session、发消息、切换 session、长对话滚动

***

## 验证方案

1. 启动应用，确认旧数据迁移成功（旧会话和消息均保留）
2. 创建新 session，发送消息，确认消息正常显示和持久化
3. 切换 session，验证消息懒加载正常（切换瞬间有短暂 loading 或无感）
4. 在一个长对话中（100+ 消息）滚动，确认 DOM 节点数保持在较少量（\~15-20 个 group）
5. streaming 时确认自动滚动到底部行为正常
6. 关闭/重启应用，确认数据持久化正确

