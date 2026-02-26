import { ToolDefinition } from "../../tools/tool-registry";

export interface FunctionCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Gemini-only: encrypted thought signature required by Gemini 3 models for multi-turn tool calling. */
  thoughtSignature?: string;
}

export interface Part {
  text?: string;
  functionCall?: FunctionCall;
  functionResponse?: {
    id: string;
    name: string;
    response: Record<string, unknown>;
  };
}

export interface Message {
  role: "user" | "model" | "tool";
  parts: Part[];
}

export interface SendMessageOptions {
  systemInstruction?: string;
  tools?: ToolDefinition[];
}

export interface SendMessageResult {
  text?: string;
  functionCalls?: FunctionCall[];
}

/**
 * 流式响应的增量数据块。
 * - deltaText: 本次增量的文本片段
 * - functionCalls: 当模型决定调用工具时，在流结束时返回完整的 functionCall 列表
 */
export interface StreamChunk {
  deltaText?: string;
  functionCalls?: FunctionCall[];
}

export interface ModelProvider {
  name: string;
  sendMessage(
    messages: Message[],
    options?: SendMessageOptions
  ): Promise<SendMessageResult>;

  /**
   * 流式发送消息，返回 AsyncGenerator 逐步产出 StreamChunk。
   * 最后一个 yield 的 chunk 可能包含 functionCall（如果模型决定调用工具）。
   */
  streamMessage(
    messages: Message[],
    options?: SendMessageOptions
  ): AsyncGenerator<StreamChunk, void, unknown>;
}
