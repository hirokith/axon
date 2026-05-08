# ACP Client Desktop Application Spec

## Why
目前缺少一个专注于日志可视化和调试的 ACP 桌面客户端。开发者需要一个友好的工具来配置自定义 ACP Agent，实时查看交互日志（包括工具调用 Input/Output、reasoning 日志），并在 debug 模式下查看所有底层协议通信过程。

## What Changes
- 新建基于 Electron + React + TypeScript 的桌面应用
- 实现 ACP 协议 stdio transport 层（JSON-RPC 2.0）
- 支持配置和管理多个自定义 ACP Agent
- 实现对话界面，支持发送 prompt 和接收 agent 响应
- 实现实时日志面板，可视化展示工具调用的 Input/Output、reasoning（thought）内容
- 实现 Debug 模式，展示所有 JSON-RPC 消息的原始数据流

## Impact
- Affected specs: ACP Protocol (stdio transport, session management, tool calls, content)
- Affected code: 全新项目，无现有代码影响

## ADDED Requirements

### Requirement: Agent 配置管理
系统 SHALL 提供一个配置界面，允许用户添加、编辑、删除 ACP Agent 配置。

每个 Agent 配置包含：
- 名称（显示用）
- 启动命令（command + args）
- 工作目录（可选）
- 环境变量（可选）

#### Scenario: 添加新 Agent
- **WHEN** 用户在设置页面点击"添加 Agent"
- **THEN** 弹出表单让用户填写 Agent 配置信息
- **AND** 保存后在 Agent 列表中可见

#### Scenario: 启动 Agent 连接
- **WHEN** 用户选择一个已配置的 Agent 并点击连接
- **THEN** 系统通过 stdio 启动子进程并完成 ACP `initialize` 握手
- **AND** 显示连接状态为"已连接"

### Requirement: 对话交互
系统 SHALL 提供聊天界面，允许用户与已连接的 Agent 进行对话。

#### Scenario: 发送消息
- **WHEN** 用户在输入框输入文本并发送
- **THEN** 系统通过 `session/prompt` 发送给 Agent
- **AND** 实时流式显示 Agent 的 `agent_message_chunk` 响应

#### Scenario: 工具调用展示
- **WHEN** Agent 执行工具调用
- **THEN** 在对话流中显示工具调用卡片，包含 title、kind、status
- **AND** 可展开查看工具调用的 Input（rawInput）和 Output（content）

### Requirement: 实时日志面板
系统 SHALL 提供独立的日志面板，实时展示结构化日志。

#### Scenario: 查看工具调用日志
- **WHEN** Agent 发送 `tool_call` 或 `tool_call_update` 通知
- **THEN** 日志面板按时间序显示：工具名称、状态变化、rawInput、rawOutput
- **AND** 支持按工具名称/状态筛选

#### Scenario: 查看 Reasoning 日志
- **WHEN** Agent 发送 `thought_message_chunk` 类型的 session/update
- **THEN** 日志面板展示 reasoning/thinking 内容，带有明显的视觉区分

### Requirement: Debug 模式
系统 SHALL 提供 Debug 模式开关，切换后展示所有底层 JSON-RPC 通信。

#### Scenario: 开启 Debug 模式
- **WHEN** 用户切换到 Debug 模式
- **THEN** 显示所有 stdin/stdout 上的原始 JSON-RPC 消息
- **AND** 消息按时间排列，区分方向（Client→Agent / Agent→Client）
- **AND** JSON 内容可折叠展开，带有语法高亮

#### Scenario: 关闭 Debug 模式
- **WHEN** 用户切换回普通模式
- **THEN** 隐藏原始 JSON-RPC 消息，仅展示结构化日志

### Requirement: 会话管理
系统 SHALL 支持创建和管理多个会话。

#### Scenario: 新建会话
- **WHEN** 用户点击"新建会话"
- **THEN** 系统调用 `session/new` 创建新会话
- **AND** 可在多个会话间切换

### Requirement: 权限请求处理
系统 SHALL 处理 Agent 发出的 `session/request_permission` 请求。

#### Scenario: Agent 请求权限
- **WHEN** Agent 发送权限请求
- **THEN** 在 UI 中弹出权限确认对话框，展示操作描述和可选项
- **AND** 用户选择后将结果返回给 Agent
