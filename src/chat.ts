import { ModelClient } from "./model/client.js";
import type { Message } from "./model/providers/types.js";
import type { Part, FunctionCall } from "./model/providers/types.js";
import { ToolRegistry, ToolDefinition } from "./tools/tool-registry.js";
import { getProjectContext, formatProjectContext } from "./project-context.js";
import { ChatCompressService, CompressionStatus } from "./context/chat-compress-service.js";
import type { ChatEventBus } from "./chat-events.js";
import type { BackgroundTaskManager, BackgroundTaskInfo } from "./background-task-manager.js";

export interface ChatOptions {
  /** 最大工具调用轮数（默认 100） */
  maxRounds?: number;
  /** 事件总线，用于向 TUI 发送 tool_call / tool_result 事件 */
  events: ChatEventBus;
  /** 后台任务管理器（可选） */
  bgManager?: BackgroundTaskManager;
}

export class Chat {
  private history: Message[] = [];
  private client: ModelClient;
  private systemPrompt: string;
  private toolRegistry?: ToolRegistry;
  private compressService: ChatCompressService;
  private maxRounds: number;
  private events: ChatEventBus;
  private bgManager?: BackgroundTaskManager;
  private pendingBgResults: BackgroundTaskInfo[] = [];

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
    this.bgManager = options.bgManager;
    this.compressService = new ChatCompressService(client, this.events);
    this.maxRounds = options.maxRounds ?? 100;

    if (this.bgManager) {
      this.bgManager.on("task_complete", (info) => {
        this.pendingBgResults.push(info);
      });
    }
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

  /**
   * Drain completed background task results into history so the model
   * can see them on the next turn.
   */
  private drainPendingBackgroundResults(): void {
    if (this.pendingBgResults.length === 0) return;

    const results = this.pendingBgResults.splice(0);
    for (const task of results) {
      const elapsed = Math.round(
        ((task.completedAt ?? Date.now()) - task.startedAt) / 1000
      );

      const summary: string[] = [
        `[Background task ${task.taskId} ${task.status}]`,
      ];

      if (task.type === "sub_agent") {
        summary.push(`Agent: ${task.agentName}`);
        summary.push(`Elapsed: ${elapsed}s`);
        if (task.result) summary.push(`Result:\n${task.result.trimEnd()}`);
      } else {
        summary.push(`$ ${task.command}`);
        summary.push(`Exit code: ${task.exitCode ?? "N/A"}`);
        summary.push(`Elapsed: ${elapsed}s`);
        if (task.stdout) summary.push(`stdout:\n${task.stdout.trimEnd()}`);
        if (task.stderr) summary.push(`stderr:\n${task.stderr.trimEnd()}`);
      }

      const text = summary.join("\n");
      this.history.push({
        role: "user",
        parts: [{ text: `[System] Background task completed:\n${text}` }],
      });
      this.history.push({
        role: "model",
        parts: [{ text: `Acknowledged background task ${task.taskId} result.` }],
      });
    }
  }

  async send(text: string): Promise<string> {
    // Inject any completed background task results into history
    this.drainPendingBackgroundResults();

    // 压缩检测：超出阈值时替换 history
    const compression = await this.compressService.compressIfNeeded(this.history);
    if (compression.status === CompressionStatus.COMPRESSED && compression.newHistory) {
      this.history = compression.newHistory;
    }

    this.history.push({ role: "user", parts: [{ text }] });

    const tools = this.getToolDeclarations();

    for (let i = 0; i < this.maxRounds; i++) {
      // Drain any background results that arrived during tool execution
      this.drainPendingBackgroundResults();

      const messages = this.buildMessages();

      // 使用流式接口调用模型
      let fullText = "";
      let functionCalls: FunctionCall[] = [];

      const stream = this.client.streamMessage(messages, {
        systemInstruction: this.systemPrompt,
        tools: tools.length > 0 ? tools : undefined,
      });

      for await (const chunk of stream) {
        if (chunk.deltaText) {
          fullText += chunk.deltaText;
          this.events.emit("text_delta", { delta: chunk.deltaText });
        }
        if (chunk.functionCalls) {
          functionCalls.push(...chunk.functionCalls);
        }
      }

      // 构建 model 消息的 parts：文本 + 所有 functionCall
      const modelParts: Part[] = [];
      if (fullText) {
        modelParts.push({ text: fullText });
      }
      for (const fc of functionCalls) {
        modelParts.push({ functionCall: fc });
      }
      if (modelParts.length === 0) {
        modelParts.push({ text: "" });
      }
      this.history.push({ role: "model", parts: modelParts });

      if (functionCalls.length === 0) {
        return fullText;
      }

      // 并发执行所有工具调用
      for (const fc of functionCalls) {
        const displayArgs = this.toolRegistry!.formatArgs(fc.name, fc.args);
        this.events.emit("tool_call", { name: fc.name, args: displayArgs });
      }

      const toolResults = await Promise.all(
        functionCalls.map((fc) => this.toolRegistry!.execute(fc.name, fc.args))
      );

      // 将所有工具结果推入 history（放在同一条 tool 消息中）
      const toolParts: Part[] = [];
      for (let j = 0; j < functionCalls.length; j++) {
        const fc = functionCalls[j];
        const toolResult = toolResults[j];
        const response = toolResult.error
          ? { error: toolResult.error }
          : (toolResult.result as Record<string, unknown>);

        const displayOutput = toolResult.error
          ? `Error: ${toolResult.error}`
          : toolResult.displayText ?? JSON.stringify(response);
        this.events.emit("tool_result", {
          name: fc.name,
          output: displayOutput,
          isError: !!toolResult.error,
        });

        toolParts.push({
          functionResponse: {
            id: fc.id,
            name: fc.name,
            response: response as Record<string, unknown>,
          },
        });
      }
      this.history.push({ role: "tool", parts: toolParts });
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
