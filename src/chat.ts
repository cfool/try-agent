import {
  GeminiClient,
  Content,
  FunctionDeclaration,
} from "./gemini-client.js";
import { ToolRegistry, ToolDefinition } from "./tool-registry.js";
import { getProjectContext, formatProjectContext } from "./project-context.js";

export class Chat {
  private history: Content[] = [];
  private client: GeminiClient;
  private systemPrompt: string;
  private toolRegistry?: ToolRegistry;

  constructor(
    client: GeminiClient,
    systemPrompt: string,
    toolRegistry?: ToolRegistry
  ) {
    this.client = client;
    this.systemPrompt = systemPrompt;
    this.toolRegistry = toolRegistry;
  }

  /**
   * 实时获取项目信息并构建带上下文的消息列表。
   * 每轮对话都会重新获取，确保时间戳等信息是最新的。
   */
  private buildMessages(): Content[] {
    const projectContext = formatProjectContext(getProjectContext());
    return [
      { role: "user", parts: [{ text: projectContext }] },
      { role: "model", parts: [{ text: "Understood. I have the project context." }] },
      ...this.history,
    ];
  }

  async send(text: string): Promise<string> {
    this.history.push({ role: "user", parts: [{ text }] });

    const tools = this.getToolDeclarations();
    const maxRounds = 10;

    for (let i = 0; i < maxRounds; i++) {
      const messages = this.buildMessages();

      const result = await this.client.sendMessage(messages, {
        systemInstruction: this.systemPrompt,
        tools: tools.length > 0 ? tools : undefined,
      });

      this.history.push({ role: "model", parts: result.parts });

      if (!result.functionCall) {
        return result.text ?? "";
      }

      // Execute tool and feed result back to model
      const { name, args } = result.functionCall;
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
        role: "user",
        parts: [
          {
            functionResponse: {
              name,
              response: response as Record<string, unknown>,
            },
          },
        ],
      });
    }

    throw new Error("Max tool call rounds exceeded");
  }

  private getToolDeclarations(): FunctionDeclaration[] {
    if (!this.toolRegistry) return [];

    return this.toolRegistry.list().map((def: ToolDefinition) => ({
      name: def.name,
      description: def.description,
      parameters: {
        type: "object" as const,
        properties: Object.fromEntries(
          Object.entries(def.parameters).map(([key, param]) => [
            key,
            {
              type: param.type,
              description: param.description,
              ...(param.enum ? { enum: param.enum } : {}),
            },
          ])
        ),
        required: def.required,
      },
    }));
  }

  getHistory(): ReadonlyArray<Content> {
    return this.history;
  }

  clear(): void {
    this.history = [];
  }
}
