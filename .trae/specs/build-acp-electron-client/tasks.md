# Tasks

- [x] Task 1: 项目初始化 — 搭建 Electron + React + TypeScript 项目脚手架
  - [x] SubTask 1.1: 使用 electron-vite 初始化项目，配置 TypeScript、React
  - [x] SubTask 1.2: 配置项目结构（main 进程、renderer 进程、preload）
  - [x] SubTask 1.3: 添加基础依赖（tailwindcss、zustand 状态管理、uuid）
  - [x] SubTask 1.4: 验证项目能正常启动并展示空白窗口

- [x] Task 2: ACP 协议通信层 — 实现 stdio transport 和 JSON-RPC 消息处理
  - [x] SubTask 2.1: 实现 JSON-RPC 2.0 消息编解码（request、response、notification）
  - [x] SubTask 2.2: 实现 stdio transport（子进程管理、stdin 写入、stdout 按行读取解析）
  - [x] SubTask 2.3: 实现 ACP Client 核心类，封装 initialize、session/new、session/prompt 等方法
  - [x] SubTask 2.4: 实现消息日志记录器，记录所有收发的 JSON-RPC 消息（供 Debug 模式使用）

- [x] Task 3: Agent 配置管理 — 实现 Agent 配置的 CRUD 和持久化
  - [x] SubTask 3.1: 设计 Agent 配置数据模型，使用 electron-store 持久化
  - [x] SubTask 3.2: 实现设置页面 UI（Agent 列表 + 添加/编辑/删除表单）
  - [x] SubTask 3.3: 通过 IPC 将配置操作桥接到 main 进程

- [x] Task 4: 对话交互界面 — 实现聊天 UI 和消息流展示
  - [x] SubTask 4.1: 实现聊天消息列表组件（支持用户消息、Agent 文本响应的流式渲染）
  - [x] SubTask 4.2: 实现输入框组件（支持发送文本、取消正在进行的 prompt）
  - [x] SubTask 4.3: 实现工具调用卡片组件（展示 title、kind、status、可展开的 Input/Output）
  - [x] SubTask 4.4: 实现权限请求弹窗组件

- [x] Task 5: 实时日志面板 — 可视化展示结构化日志
  - [x] SubTask 5.1: 实现日志面板布局（可调整大小的侧边/底部面板）
  - [x] SubTask 5.2: 实现工具调用日志条目组件（时间戳、工具名、状态徽章、Input/Output 折叠）
  - [x] SubTask 5.3: 实现 Reasoning/Thought 日志条目组件（带视觉区分样式）
  - [x] SubTask 5.4: 实现日志筛选功能（按类型、工具名称、状态过滤）

- [x] Task 6: Debug 模式 — 原始 JSON-RPC 消息查看器
  - [x] SubTask 6.1: 实现 Debug 模式切换开关（全局状态）
  - [x] SubTask 6.2: 实现原始消息查看器组件（方向标识、时间戳、JSON 语法高亮、折叠展开）
  - [x] SubTask 6.3: 整合到日志面板中，支持 Normal/Debug 视图切换

- [x] Task 7: 会话管理 — 多会话支持
  - [x] SubTask 7.1: 实现会话列表侧边栏（新建会话、切换会话）
  - [x] SubTask 7.2: 实现会话状态隔离（每个会话独立维护消息历史和日志）

# Task Dependencies
- Task 2 depends on Task 1（需要项目脚手架就绪）
- Task 3 depends on Task 1（需要项目脚手架就绪）
- Task 4 depends on Task 2（需要 ACP 通信层支持）
- Task 5 depends on Task 2（需要消息日志记录器）
- Task 6 depends on Task 2, Task 5（需要消息日志和日志面板）
- Task 7 depends on Task 2, Task 4（需要通信层和对话界面）
