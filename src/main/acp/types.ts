// ACP-specific protocol types

// Content types
export interface TextContent {
  type: 'text'
  text: string
}

export interface ImageContent {
  type: 'image'
  url: string
  mimeType?: string
}

export interface ResourceContent {
  type: 'resource'
  uri: string
  mimeType?: string
  text?: string
}

export type Content = TextContent | ImageContent | ResourceContent

// Tool call types
export interface ToolCall {
  toolCallId: string
  title: string
  kind?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  rawInput?: string
  rawOutput?: string
  content?: Content[]
}

// Session update types
export type SessionUpdateKind =
  | 'agent_message_chunk'
  | 'tool_call'
  | 'tool_call_update'
  | 'thought_message_chunk'
  | 'plan'

export interface SessionUpdateBase {
  sessionId: string
  kind: SessionUpdateKind
}

export interface AgentMessageChunkUpdate extends SessionUpdateBase {
  kind: 'agent_message_chunk'
  text: string
}

export interface ToolCallUpdate extends SessionUpdateBase {
  kind: 'tool_call'
  toolCall: ToolCall
}

export interface ToolCallStatusUpdate extends SessionUpdateBase {
  kind: 'tool_call_update'
  toolCallId: string
  status: ToolCall['status']
  rawOutput?: string
  content?: Content[]
}

export interface ThoughtMessageChunkUpdate extends SessionUpdateBase {
  kind: 'thought_message_chunk'
  text: string
}

export interface PlanUpdate extends SessionUpdateBase {
  kind: 'plan'
  steps: string[]
}

export type SessionUpdate =
  | AgentMessageChunkUpdate
  | ToolCallUpdate
  | ToolCallStatusUpdate
  | ThoughtMessageChunkUpdate
  | PlanUpdate

// Permission request types
export interface PermissionRequest {
  id: number | string
  sessionId: string
  toolCallId: string
  title: string
  description?: string
  rawInput?: string
}

export type PermissionOutcome = 'allow' | 'deny' | 'allow_always'

// Session types
export interface Session {
  sessionId: string
  status: 'active' | 'idle' | 'closed'
}

// Agent connection config
export interface AgentConfig {
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
}
