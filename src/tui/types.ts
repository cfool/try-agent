import type { ModelClient } from "../model/client.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { McpClientManager } from "../mcp-client.js";
import type { SubAgentRegistry } from "../subagents/sub-agent-registry.js";
import type { SkillRegistry } from "../skills/skill-registry.js";
import type { SkillLoader } from "../skills/skill-loader.js";
import type { ChatEventBus } from "../chat-events.js";
import type { BackgroundTaskManager } from "../background-task-manager.js";
import type { SlashCommandRegistry } from "./slash-commands.js";

export type MessageType =
  | "user"
  | "assistant"
  | "tool_call"
  | "tool_result"
  | "error"
  | "system";

export interface ToolCallData {
  toolName: string;
  args: string;
  rawArgs?: Record<string, unknown>;
}

export interface ToolResultData {
  toolName: string;
  output: string;
  isError: boolean;
}

export interface DisplayMessage {
  id: number;
  type: MessageType;
  text: string;
  timestamp: Date;
  toolCall?: ToolCallData;
  toolResult?: ToolResultData;
}

export interface SlashCommand {
  name: string;
  description: string;
  /** If true, the command expects an argument after the name (e.g. /model) */
  hasArg?: boolean;
}

export interface AppContext {
  client: ModelClient;
  registry: ToolRegistry;
  mcpManager: McpClientManager;
  subAgentRegistry: SubAgentRegistry;
  skillRegistry: SkillRegistry;
  skillLoader: SkillLoader;
  systemPrompt: string;
  events: ChatEventBus;
  bgManager: BackgroundTaskManager;
  commands: SlashCommandRegistry;
}
