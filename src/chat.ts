import { ModelClient } from "./model/client.js";
import type { Message } from "./model/providers/types.js";
import { ToolRegistry, ToolDefinition } from "./tools/tool-registry.js";
import { getProjectContext, formatProjectContext } from "./project-context.js";
import { ChatCompressService, CompressionStatus } from "./context/chat-compress-service.js";
import type { ChatEventBus } from "./chat-events.js";

export interface ChatOptions {
  /** 最大工具调用轮数（默认 100） */
  maxRounds?: number;
  /** 事件总线，用于向 TUI 发送 tool_call / tool_result 事件 */
  events: ChatEventBus;
}

export class Chat {
  private history: Message[] = [];
  private client: ModelClient;
  private systemPrompt: string;
  private toolRegistry?: ToolRegistry;
  private compressService: ChatCompressService;
  private maxRounds: number;
  private events: ChatEventBus;

  constructor(
    client: ModelClient,
    systemPrompt: string,
    toolRegistry: ToolRegistry,
    options: ChatOptions
  ) {
    this.client = client;
    this.systemPrompt = systemPrompt;
    this.toolRegistry = toolRegistry;
    this.events = options.events;
    this.compressService = new ChatCompressService(client, this.events);
    this.maxRounds = options.maxRounds ?? 100;
  }

  /**
   * 实时获取项目信息并构建带上下文的消息列表。
   * 每轮对话都会重新获取，确保时间戳等信息是最新的。
   */
  private buildMessages(): Message[] {
    const projectContext = formatProjectContext(getProjectContext());
    return [
      { role: "user", parts: [{ text: projectContext }] },
      { role: "model", parts: [{ text: "Understood. I have the project context." }] },
      ...this.history,
    ];
  }

  async send(text: string): Promise<string> {
    // 压缩检测：超出阈值时替换 history
    const compression = await this.compressService.compressIfNeeded(this.history);
    if (compression.status === CompressionStatus.COMPRESSED && compression.newHistory) {
      this.history = compression.newHistory;
    }

    this.history.push({ role: "user", parts: [{ text }] });

    const tools = this.getToolDeclarations();

    for (let i = 0; i < this.maxRounds; i++) {
      const messages = this.buildMessages();

      const result = await this.client.sendMessage(messages, {
        systemInstruction: this.systemPrompt,
        tools: tools.length > 0 ? tools : undefined,
      });

      this.history.push({ role: "model", parts: [result] });

      if (!result.functionCall) {
        return result.text ?? "";
      }

      // Execute tool and feed result back to model
      const { id, name, args } = result.functionCall;
      const displayArgs = this.toolRegistry!.formatArgs(name, args);
      this.events.emit("tool_call", { name, args: displayArgs, rawArgs: args as Record<string, unknown> });

      const toolResult = await this.toolRegistry!.execute(name, args);
      const response = toolResult.error
        ? { error: toolResult.error }
        : (toolResult.result as Record<string, unknown>);

      const displayOutput = toolResult.error
        ? `Error: ${toolResult.error}`
        : toolResult.displayText ?? JSON.stringify(response);
      this.events.emit("tool_result", {
        name,
        output: displayOutput,
        isError: !!toolResult.error,
      });

      this.history.push({
        role: "tool",
        parts: [
          {
            functionResponse: {
              id,
              name,
              response: response as Record<string, unknown>,
            },
          },
        ],
      });
    }

    throw new Error("Max tool call rounds exceeded");
  }

  private getToolDeclarations(): ToolDefinition[] {
    if (!this.toolRegistry) return [];

    return this.toolRegistry.list();
  }

  getHistory(): ReadonlyArray<Message> {
    return this.history;
  }

  clear(): void {
    this.history = [];
  }
}
