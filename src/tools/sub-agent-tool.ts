import { Tool, ToolDefinition, ToolExecuteResult, ToolRegistry } from "./tool-registry.js";
import { SubAgentRegistry } from "../subagents/sub-agent-registry.js";
import { ModelClient } from "../model/client.js";
import { Chat } from "../chat.js";
import { ChatEventBus } from "../chat-events.js";

/**
 * SubAgentTool — 将任务委派给子 Agent 执行。
 *
 * 核心逻辑：
 * 1. 根据 agent_name 查找 SubAgentDefinition
 * 2. 构建受限 ToolRegistry（仅包含允许的工具，排除 sub_agent 防递归）
 * 3. 若指定 model 则临时切换 provider（finally 中恢复）
 * 4. 创建新 Chat 实例（独立上下文）
 * 5. 调用 subChat.send(task) 获取结果
 */
export class SubAgentTool implements Tool {
  definition: ToolDefinition;

  constructor(
    private subAgentRegistry: SubAgentRegistry,
    private parentRegistry: ToolRegistry,
    private client: ModelClient,
    private events: ChatEventBus
  ) {
    const agents = this.subAgentRegistry.list();
    const agentList = agents
      .map((a) => `- ${a.name}: ${a.description}`)
      .join("\n");

    this.definition = {
      name: "sub_agent",
      description:
        `Delegate a task to a specialized sub-agent. Available agents:\n${agentList}`,
      parameters: {
        type: "object",
        properties: {
          agent_name: {
            type: "string",
            description: "The name of the sub-agent to delegate the task to",
            enum: agents.map((a) => a.name),
          },
          task: {
            type: "string",
            description:
              "A detailed description of the task for the sub-agent to perform. " +
              "Include all necessary context, file paths, and requirements.",
          },
        },
        required: ["agent_name", "task"],
      },
    };
  }

  displayArgs(params: Record<string, unknown>): string {
    const name = params.agent_name as string;
    const task = params.task as string;
    const truncated = task.length > 80 ? task.slice(0, 80) + "..." : task;
    return `${name}: ${truncated}`;
  }

  async execute(params: Record<string, unknown>): Promise<ToolExecuteResult> {
    const agentName = params.agent_name as string;
    const task = params.task as string;

    const agentDef = this.subAgentRegistry.get(agentName);
    if (!agentDef) {
      return {
        data: { error: `Sub-agent "${agentName}" not found` },
        displayText: `Error: Sub-agent "${agentName}" not found`,
      };
    }

    // 构建受限 ToolRegistry
    const subRegistry = new ToolRegistry();
    const parentTools = this.parentRegistry.list();

    for (const toolDef of parentTools) {
      // 排除 sub_agent 工具，防止递归
      if (toolDef.name === "sub_agent") continue;

      // 如果子 Agent 指定了工具白名单，则只注册白名单中的工具
      if (agentDef.tools && !agentDef.tools.includes(toolDef.name)) continue;

      const tool = this.parentRegistry.get(toolDef.name);
      if (tool) {
        subRegistry.register(tool);
      }
    }

    // 若指定了 model，临时切换 model
    let previousModel: string | undefined;
    if (agentDef.model) {
      try {
        previousModel = this.client.getActiveModel()?.name;
        this.client.use(agentDef.model);
      } catch (err) {
        return {
          data: {
            error: `Failed to switch to model "${agentDef.model}": ${err instanceof Error ? err.message : err}`,
          },
          displayText: `Error: Failed to switch to model "${agentDef.model}"`,
        };
      }
    }

    try {
      // 创建独立 Chat 实例（共享事件总线，tool_call / tool_result 会出现在 TUI 中）
      const subChat = new Chat(this.client, agentDef.systemPrompt, subRegistry, {
        maxRounds: agentDef.maxTurns,
        events: this.events,
      });

      const result = await subChat.send(task);

      return {
        data: { agent: agentDef.name, result },
        displayText: `[SubAgent:${agentDef.name}] completed`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        data: { agent: agentDef.name, error: message },
        displayText: `[SubAgent:${agentDef.name}] Error: ${message}`,
      };
    } finally {
      // 恢复之前的 model
      if (previousModel) {
        try {
          this.client.use(previousModel);
        } catch {
          // 忽略恢复失败
        }
      }
    }
  }
}
