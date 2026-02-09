import { ModelClient } from "./model/client.js";
import type { Message } from "./model/providers/types.js";
import { ToolRegistry, ToolDefinition } from "./tool-registry.js";

export class Chat {
  private history: Message[] = [];
  private client: ModelClient;
  private systemPrompt: string;
  private toolRegistry?: ToolRegistry;

  constructor(
    client: ModelClient,
    systemPrompt: string,
    toolRegistry?: ToolRegistry
  ) {
    this.client = client;
    this.systemPrompt = systemPrompt;
    this.toolRegistry = toolRegistry;
  }

  async send(text: string): Promise<string> {
    this.history.push({ role: "user", parts: [{ text }] });

    const tools = this.getToolDeclarations();
    const result = await this.client.sendMessage(this.history, {
      systemInstruction: this.systemPrompt,
      tools: tools.length > 0 ? tools : undefined,
    });

    this.history.push({ role: "model", parts: [result] });

    if (result.functionCall) {
      const { id, name, args } = result.functionCall;
      console.log(`\n[Tool Call] ${name}(${JSON.stringify(args)}) [id=${id}]`);

      const toolResult = await this.toolRegistry!.execute(name, args);
      const response = toolResult.error
        ? { error: toolResult.error }
        : toolResult.result;

      return JSON.stringify(response);
    }

    return result.text ?? "";
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
