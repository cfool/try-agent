import { ModelClient } from "./model/client.js";
import type { Message } from "./model/providers/types.js";
import { ToolRegistry, ToolDefinition } from "./tool-registry.js";
import { getProjectContext, formatProjectContext } from "./project-context.js";
import { ChatCompressService, CompressionStatus } from "./context/chat-compress-service.js";

export class Chat {
  private history: Message[] = [];
  private client: ModelClient;
  private systemPrompt: string;
  private toolRegistry?: ToolRegistry;
  private compressService: ChatCompressService;

  constructor(
    client: ModelClient,
    systemPrompt: string,
    toolRegistry?: ToolRegistry
  ) {
    this.client = client;
    this.systemPrompt = systemPrompt;
    this.toolRegistry = toolRegistry;
    this.compressService = new ChatCompressService(client);
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
    const maxRounds = 100;

    for (let i = 0; i < maxRounds; i++) {
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
      console.log(`\n[Tool Call] ${name}(${displayArgs})`);

      const toolResult = await this.toolRegistry!.execute(name, args);
      const response = toolResult.error
        ? { error: toolResult.error }
        : (toolResult.result as Record<string, unknown>);

      const displayOutput = toolResult.error
        ? `Error: ${toolResult.error}`
        : toolResult.displayText ?? JSON.stringify(response);
      console.log(`[Tool Result] ${displayOutput}\n`);

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
