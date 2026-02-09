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
    const maxRounds = 100;

    for (let i = 0; i < maxRounds; i++) {
      const result = await this.client.sendMessage(this.history, {
        systemInstruction: this.systemPrompt,
        tools: tools.length > 0 ? tools : undefined,
      });

      this.history.push({ role: "model", parts: [result] });

      if (!result.functionCall) {
        return result.text ?? "";
      }

      // Execute tool and feed result back to model
      const { id, name, args } = result.functionCall;
      console.log(`\n[Tool Call] ${name}(${JSON.stringify(args)})`);

      const toolResult = await this.toolRegistry!.execute(name, args);
      const response = toolResult.error
        ? { error: toolResult.error }
        : (toolResult.result as Record<string, unknown>);

      console.log(`[Tool Result] ${JSON.stringify(response)}\n`);

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
