import {
  GeminiClient,
  Content,
  FunctionDeclaration,
} from "./gemini-client.js";
import { ToolRegistry, ToolDefinition } from "./tool-registry.js";

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

  async send(text: string): Promise<string> {
    this.history.push({ role: "user", parts: [{ text }] });

    const tools = this.getToolDeclarations();
    const result = await this.client.sendMessage(this.history, {
      systemInstruction: this.systemPrompt,
      tools: tools.length > 0 ? tools : undefined,
    });

    this.history.push({ role: "model", parts: result.parts });

    if (result.functionCall) {
      const { name, args } = result.functionCall;
      console.log(`\n[Tool Call] ${name}(${JSON.stringify(args)})`);

      const toolResult = await this.toolRegistry!.execute(name, args);
      const response = toolResult.error
        ? { error: toolResult.error }
        : toolResult.result;

      return JSON.stringify(response);
    }

    return result.text ?? "";
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
