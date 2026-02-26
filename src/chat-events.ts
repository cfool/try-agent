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

export interface TextDeltaEvent {
  delta: string;
}

export interface ChatEventMap {
  tool_call: [ToolCallEvent];
  tool_result: [ToolResultEvent];
  compressed: [CompressedEvent];
  text_delta: [TextDeltaEvent];
}

export class ChatEventBus extends EventEmitter<ChatEventMap> {}
