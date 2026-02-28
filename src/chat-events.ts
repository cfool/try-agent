import { EventEmitter } from "node:events";
import type { BackgroundTaskInfo } from "./background-task-manager.js";

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

export interface BackgroundTaskEvent {
  task: BackgroundTaskInfo;
}

export interface ChatEventMap {
  tool_call: [ToolCallEvent];
  tool_result: [ToolResultEvent];
  compressed: [CompressedEvent];
  text_delta: [TextDeltaEvent];
  background_task_started: [BackgroundTaskEvent];
  background_task_complete: [BackgroundTaskEvent];
}

export class ChatEventBus extends EventEmitter<ChatEventMap> {}
