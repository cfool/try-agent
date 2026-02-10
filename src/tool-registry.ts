export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolExecuteResult {
  /** 返回给模型的结构化数据 */
  data: unknown;
  /** 展示给用户的友好文本（可选，不提供则回退到 JSON） */
  displayText?: string;
}

export interface Tool {
  definition: ToolDefinition;
  execute(params: Record<string, unknown>): Promise<ToolExecuteResult>;
  /** 格式化调用参数为用户友好的展示文本（可选，不实现则回退到 JSON） */
  displayArgs?(params: Record<string, unknown>): string;
}

export interface ToolResult {
  toolName: string;
  result?: unknown;
  displayText?: string;
  error?: string;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.definition.name)) {
      throw new Error(`Tool "${tool.definition.name}" is already registered`);
    }
    this.tools.set(tool.definition.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * 格式化工具调用参数为展示文本。
   * 优先使用工具自身的 displayArgs，否则回退到 JSON。
   */
  formatArgs(name: string, params: Record<string, unknown>): string {
    const tool = this.tools.get(name);
    if (tool?.displayArgs) {
      return tool.displayArgs(params);
    }
    return JSON.stringify(params);
  }

  async execute(
    name: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { toolName: name, error: `Tool "${name}" not found` };
    }

    try {
      const { data, displayText } = await tool.execute(params);
      return { toolName: name, result: data, displayText };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { toolName: name, error: message };
    }
  }
}
