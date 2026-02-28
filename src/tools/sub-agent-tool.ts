import { Tool, ToolDefinition, ToolExecuteResult, ToolRegistry } from "./tool-registry.js";
import { SubAgentRegistry } from "../subagents/sub-agent-registry.js";
import { ModelClient } from "../model/client.js";
import { Chat } from "../chat.js";
import { ChatEventBus } from "../chat-events.js";
import type { BackgroundTaskManager } from "../background-task-manager.js";

/**
 * SubAgentTool — 将任务委派给子 Agent 执行。
 *
 * 核心逻辑：
 * 1. 根据 agent_name 查找 SubAgentDefinition
 * 2. 构建受限 ToolRegistry（仅包含允许的工具，排除 sub_agent 防递归）
 * 3. 若指定 model 则临时切换 provider（finally 中恢复）
 * 4. 创建新 Chat 实例（独立上下文）
 * 5. 调用 subChat.send(task) 获取结果
 *
 * 支持 run_in_background 模式：异步执行子 Agent，立即返回 task ID。
 */
export class SubAgentTool implements Tool {
  definition: ToolDefinition;

  constructor(
    private subAgentRegistry: SubAgentRegistry,
    private parentRegistry: ToolRegistry,
    private client: ModelClient,
    private events: ChatEventBus,
    private bgManager?: BackgroundTaskManager
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
          description: {
            type: "string",
            description:
              "A brief one-line summary (under 20 words) of what this sub-agent call does, " +
              "shown to the user to help them understand the purpose of this invocation. " +
              "例如：'分析项目结构并生成依赖关系图' 或 'Investigate the root cause of login failure'.",
          },
          run_in_background: {
            type: "boolean",
            description:
              "If true, the sub-agent runs asynchronously in the background. " +
              "Returns a task ID immediately; use get_task_output to check results later.",
          },
        },
        required: ["agent_name", "task", "description"],
      },
    };
  }

  displayArgs(params: Record<string, unknown>): string {
    const name = params.agent_name as string;
    const desc = params.description as string | undefined;
    if (desc) {
      return `${name}: ${desc}`;
    }
    const task = params.task as string;
    const truncated = task.length > 80 ? task.slice(0, 80) + "..." : task;
    return `${name}: ${truncated}`;
  }

  async execute(params: Record<string, unknown>): Promise<ToolExecuteResult> {
    const agentName = params.agent_name as string;
    const task = params.task as string;
    const description = (params.description as string | undefined) || "";
    const runInBackground = params.run_in_background === true;

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

    // 异步后台模式
    if (runInBackground && this.bgManager) {
      // 若指定了 model，临时切换
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

      const subEvents = new ChatEventBus();
      const subChat = new Chat(this.client, agentDef.systemPrompt, subRegistry, {
        maxRounds: agentDef.maxTurns,
        events: subEvents,
      });

      const promise = subChat.send(task).finally(() => {
        // 恢复之前的 model
        if (previousModel) {
          try {
            this.client.use(previousModel);
          } catch {
            // 忽略恢复失败
          }
        }
      });

      const taskInfo = this.bgManager.startPromiseTask(promise, {
        agentName: agentDef.name,
        description: description || (task.length > 80 ? task.slice(0, 80) + "..." : task),
      });

      return {
        data: { taskId: taskInfo.taskId, status: "started", agent: agentDef.name, description },
        displayText: `[SubAgent:${agentDef.name}] ${description || "started"} (background: ${taskInfo.taskId})`,
      };
    }

    // 同步模式（原有逻辑）
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
      // 创建独立 Chat 实例和独立事件总线，SubAgent 内部的 tool_call / tool_result 不应发送到主 Agent 的事件总线
      const subEvents = new ChatEventBus();
      const subChat = new Chat(this.client, agentDef.systemPrompt, subRegistry, {
        maxRounds: agentDef.maxTurns,
        events: subEvents,
      });

      const result = await subChat.send(task);

      return {
        data: { agent: agentDef.name, result },
        displayText: `[SubAgent:${agentDef.name}] ${description || "completed"}`,
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
