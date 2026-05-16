export const IpcChannel = {
  AcpConnect: 'acp:connect',
  AcpDisconnect: 'acp:disconnect',
  AcpCreateSession: 'acp:create-session',
  AcpSendPrompt: 'acp:send-prompt',
  AcpCancelPrompt: 'acp:cancel-prompt',
  AcpRespondPermission: 'acp:respond-permission',
  AcpGetLogEntries: 'acp:get-log-entries',
  LogsQuery: 'logs:query',
  LogsClear: 'logs:clear',
  StructuredLogsInsert: 'structured-logs:insert',
  StructuredLogsQuery: 'structured-logs:query',
  AgentsList: 'agents:list',
  AgentsAdd: 'agents:add',
  AgentsUpdate: 'agents:update',
  AgentsDelete: 'agents:delete',
  McpServersList: 'mcp-servers:list',
  McpServersAdd: 'mcp-servers:add',
  McpServersUpdate: 'mcp-servers:update',
  McpServersDelete: 'mcp-servers:delete',
  DialogSelectDirectory: 'dialog:select-directory',
  ShellOpenExternal: 'shell:open-external',
  FsListFiles: 'fs:list-files',
  FsReadFile: 'fs:read-file',
  FsStartStaticServer: 'fs:start-static-server',
  FsStopStaticServer: 'fs:stop-static-server',
  AcpTestConnection: 'acp:test-connection',
} as const

export enum ToolCallStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
}

export enum SessionUpdateKind {
  AgentThoughtChunk = 'agent_thought_chunk',
  ThoughtMessageChunk = 'thought_message_chunk',
  AgentMessageChunk = 'agent_message_chunk',
  ToolCall = 'tool_call',
  ToolCallUpdate = 'tool_call_update',
  TurnEnd = 'turn_end',
  Done = 'done',
}

export enum LogEntryType {
  ToolCall = 'tool_call',
  Thought = 'thought',
  Message = 'message',
  Plan = 'plan',
  Other = 'other',
}

export enum MessageRole {
  User = 'user',
  Agent = 'agent',
}

export enum LogDirection {
  Outgoing = 'outgoing',
  Incoming = 'incoming',
}

export enum McpTransport {
  Stdio = 'stdio',
  Http = 'http',
}
