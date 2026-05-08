// Types for JSON-RPC 2.0
export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: any
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: any
  error?: { code: number; message: string; data?: any }
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: any
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification

export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'method' in msg && 'id' in msg
}

export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return !('method' in msg) && 'id' in msg
}

export function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return 'method' in msg && !('id' in msg)
}

export function encodeMessage(msg: JsonRpcMessage): string {
  return JSON.stringify(msg)
}

export function decodeMessage(line: string): JsonRpcMessage {
  return JSON.parse(line)
}
