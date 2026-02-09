import { ToolDefinition } from "../../tool-registry";

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
  functionCall?: FunctionCall;
}

export interface ModelProvider {
  name: string;
  sendMessage(
    messages: Message[],
    options?: SendMessageOptions
  ): Promise<SendMessageResult>;
}
