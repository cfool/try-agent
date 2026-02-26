import { ToolDefinition } from "../../tools/tool-registry.js";
import type {
  ModelProvider,
  Message,
  SendMessageOptions,
  SendMessageResult,
  StreamChunk,
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

/** SSE 流式响应中每个 chunk 的结构 */
interface ChatCompletionChunk {
  choices: {
    delta: {
      content?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        type?: "function";
        function?: {
          name?: string;
          arguments?: string;
        };
      }[];
    };
    finish_reason?: string | null;
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
        // Tool result messages: 每个 functionResponse part 独立作为一条 tool message
        for (const p of m.parts) {
          if (p.functionResponse) {
            chatMessages.push({
              role: "tool",
              content: JSON.stringify(p.functionResponse.response),
              tool_call_id: p.functionResponse.id,
            });
          }
        }
        continue;
      }

      // 检查是否包含 functionCall parts（可能有多个并发工具调用）
      const fcParts = m.parts.filter((p) => p.functionCall !== undefined);
      if (fcParts.length > 0) {
        // Assistant message that contains tool calls
        chatMessages.push({
          role: "assistant",
          content: null,
          tool_calls: fcParts.map((p) => ({
            id: p.functionCall!.id,
            type: "function" as const,
            function: {
              name: p.functionCall!.name,
              arguments: JSON.stringify(p.functionCall!.args),
            },
          })),
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
      const functionCalls: FunctionCall[] = message.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));

      return {
        text,
        functionCalls,
      };
    }

    return {
      text,
    };
  }

  async *streamMessage(
    messages: Message[],
    options?: SendMessageOptions
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const chatMessages = this.toChatMessages(messages, options);
    const url = `${this.baseUrl}/chat/completions`;

    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages: chatMessages,
      stream: true,
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

    // 解析 SSE 流
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    // 用于按 index 累积多个 tool_call 的增量数据
    const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // 保留最后一行（可能不完整）
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        let chunk: ChatCompletionChunk;
        try {
          chunk = JSON.parse(data) as ChatCompletionChunk;
        } catch {
          continue;
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        // 处理文本增量
        if (choice.delta.content) {
          yield { deltaText: choice.delta.content };
        }

        // 处理 tool_call 增量（按 index 分别累积）
        if (choice.delta.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            let pending = pendingToolCalls.get(tc.index);
            if (!pending) {
              pending = { id: "", name: "", args: "" };
              pendingToolCalls.set(tc.index, pending);
            }
            if (tc.id) pending.id = tc.id;
            if (tc.function?.name) pending.name = tc.function.name;
            if (tc.function?.arguments) pending.args += tc.function.arguments;
          }
        }

        // 流结束时，如果有 tool_calls 则一次性 yield 出来
        if (choice.finish_reason === "tool_calls" || choice.finish_reason === "stop") {
          if (pendingToolCalls.size > 0) {
            const functionCalls: FunctionCall[] = [];
            // 按 index 排序确保顺序
            const sorted = [...pendingToolCalls.entries()].sort((a, b) => a[0] - b[0]);
            for (const [, tc] of sorted) {
              functionCalls.push({
                id: tc.id,
                name: tc.name,
                args: JSON.parse(tc.args) as Record<string, unknown>,
              });
            }
            yield { functionCalls };
          }
        }
      }
    }
  }
}
