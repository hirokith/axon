# Checklist

- [x] Electron 应用能正常启动，显示主窗口
- [x] 能通过 UI 添加、编辑、删除 Agent 配置，配置重启后持久化
- [x] 能通过 stdio 启动 Agent 子进程并完成 ACP initialize 握手
- [x] 能创建 session 并通过 session/prompt 发送消息
- [x] Agent 的文本响应能实时流式显示在聊天界面
- [x] 工具调用在对话中以卡片形式展示，可展开查看 rawInput 和 Output
- [x] 实时日志面板能按时间序展示工具调用日志（名称、状态、Input/Output）
- [x] Reasoning/Thought 内容在日志面板中有明显视觉区分
- [x] 日志面板支持按类型和关键字筛选
- [x] Debug 模式能展示所有原始 JSON-RPC 消息，区分收发方向
- [x] Debug 模式下 JSON 有语法高亮且支持折叠展开
- [x] 权限请求弹窗能正确展示并将用户选择返回给 Agent
- [x] 支持创建多个会话并在之间切换
