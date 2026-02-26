import { EventEmitter } from "node:events";

export interface ToolCallEvent {
  name: string;
  args: string;
  rawArgs?: Record<string, unknown>;
}

export interface ToolResultEvent {
  name: string;
  output: string;
  isError: boolean;
}

export interface CompressedEvent {
  from: number;
  to: number;
}

export interface ChatEventMap {
  tool_call: [ToolCallEvent];
  tool_result: [ToolResultEvent];
  compressed: [CompressedEvent];
}

export class ChatEventBus extends EventEmitter<ChatEventMap> {}
