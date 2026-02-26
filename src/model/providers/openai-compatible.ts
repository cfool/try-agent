import { ToolDefinition } from "../../tools/tool-registry.js";
import type {
  ModelProvider,
  Message,
  SendMessageOptions,
  SendMessageResult,
  FunctionCall,
} from "./types.js";

interface ToolCallFunction {
  name: string;
  arguments: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: ToolCallFunction;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface OpenAITool {
  type: "function";
  function: ToolDefinition;
}

interface ChatCompletionResponse {
  choices: {
    message: {
      content: string | null;
      tool_calls?: ToolCall[];
    };
  }[];
}

export class OpenAICompatibleProvider implements ModelProvider {
  name: string;
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(options: {
    name: string;
    apiKey: string;
    model: string;
    baseUrl: string;
  }) {
    this.name = options.name;
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl;
  }

  /**
   * 将内部 Message[] 格式转换为 OpenAI Chat API 所需的 ChatMessage[] 格式。
   * 转换包括：将 system 指令插入为首条消息，以及将 role "model" 映射为 "assistant"。
   */
  private toChatMessages(messages: Message[], options?: SendMessageOptions): ChatMessage[] {
    const chatMessages: ChatMessage[] = [];

    if (options?.systemInstruction) {
      chatMessages.push({ role: "system", content: options.systemInstruction });
    }

    for (const m of messages) {
      if (m.role === "tool") {
        // Tool result message: find the functionResponse part
        const frPart = m.parts.find((p) => p.functionResponse !== undefined);
        if (frPart?.functionResponse) {
          chatMessages.push({
            role: "tool",
            content: JSON.stringify(frPart.functionResponse.response),
            tool_call_id: frPart.functionResponse.id,
          });
        }
        continue;
      }

      const fcPart = m.parts.find((p) => p.functionCall !== undefined);
      if (fcPart?.functionCall) {
        // Assistant message that contains a tool call
        chatMessages.push({
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: fcPart.functionCall.id,
              type: "function",
              function: {
                name: fcPart.functionCall.name,
                arguments: JSON.stringify(fcPart.functionCall.args),
              },
            },
          ],
        });
        continue;
      }

      const textPart = m.parts.find((p) => p.text !== undefined);
      chatMessages.push({
        // 内部统一使用 "model" 表示模型回复，OpenAI API 使用 "assistant"
        role: m.role === "model" ? "assistant" : "user",
        content: textPart?.text ?? "",
      });
    }

    return chatMessages;
  }

  async sendMessage(messages: Message[], options?: SendMessageOptions): Promise<SendMessageResult> {
    const chatMessages = this.toChatMessages(messages, options);

    const url = `${this.baseUrl}/chat/completions`;

    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages: chatMessages,
    };

    if (options?.tools && options.tools.length > 0) {
      requestBody.tools = options.tools.map(
        (decl): OpenAITool => ({
          type: "function",
          function: decl,
        })
      );
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`${this.name} API error ${res.status}: ${errorText}`);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const message = data.choices[0].message;
    const text = message.content ?? undefined;

    // Check for tool calls in the response
    if (message.tool_calls && message.tool_calls.length > 0) {
      const tc = message.tool_calls[0];
      const functionCall: FunctionCall = {
        id: tc.id,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      };

      return {
        text,
        functionCall,
      };
    }

    return {
      text,
    };
  }
}
