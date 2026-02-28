import { render } from "ink";
import { client } from "../model/client.js";
import { getSystemPrompt } from "../system-prompt.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import { RunShellCommand } from "../tools/run-shell-command.js";
import { ReadFile } from "../tools/read-file.js";
import { ReadFolder } from "../tools/read-folder.js";
import { WriteFile } from "../tools/write-file.js";
import { EditFile } from "../tools/edit-file.js";
import { GetTaskOutput } from "../tools/get-task-output.js";
import { McpClientManager } from "../mcp-client.js";
import { SubAgentRegistry } from "../subagents/sub-agent-registry.js";
import { SubAgentTool } from "../tools/sub-agent-tool.js";
import { createCodebaseInvestigator } from "../subagents/codebase-investigator.js";
import { SkillRegistry } from "../skills/skill-registry.js";
import { SkillLoader } from "../skills/skill-loader.js";
import { SkillTool } from "../tools/skill-tool.js";
import { ChatEventBus } from "../chat-events.js";
import { BackgroundTaskManager } from "../background-task-manager.js";
import { SlashCommandRegistry } from "./slash-commands.js";
import { App } from "./components/App.js";
import type { AppContext } from "./types.js";

export interface StartAppOptions {
  /** 覆盖 MODEL 环境变量，指定使用的模型 */
  model?: string;
}

export async function startApp(options: StartAppOptions = {}): Promise<void> {
  const preferredModel = options.model ?? process.env.MODEL;
  if (preferredModel) {
    try {
      client.use(preferredModel);
    } catch {
      // fall back to first registered model
    }
  }

  try {
    client.getActiveModel();
  } catch {
    console.error("No model configured. Set at least one API key in .env");
    process.exit(1);
  }

  const bgManager = new BackgroundTaskManager();

  const registry = new ToolRegistry();
  registry.register(new RunShellCommand({ timeoutMs: 30_000, bgManager }));
  registry.register(new ReadFile());
  registry.register(new ReadFolder());
  registry.register(new WriteFile());
  registry.register(new EditFile());
  registry.register(new GetTaskOutput(bgManager));

  const mcpManager = new McpClientManager();
  await mcpManager.connect();
  mcpManager.registerTools(registry);

  const events = new ChatEventBus();

  // Bridge bgManager events to ChatEventBus
  bgManager.on("task_started", (task) => {
    events.emit("background_task_started", { task });
  });
  bgManager.on("task_complete", (task) => {
    events.emit("background_task_complete", { task });
  });

  const subAgentRegistry = new SubAgentRegistry();
  subAgentRegistry.registerBuiltin(createCodebaseInvestigator());
  await subAgentRegistry.loadFromDirectory();
  if (!subAgentRegistry.isEmpty) {
    registry.register(new SubAgentTool(subAgentRegistry, registry, client, events));
  }

  const skillRegistry = new SkillRegistry();
  await skillRegistry.loadFromDirectory();
  const skillLoader = new SkillLoader();

  const llmSkills = skillRegistry.list();
  if (llmSkills.length > 0) {
    registry.register(new SkillTool(skillRegistry, skillLoader));
  }

  const baseSystemPrompt = getSystemPrompt('gemini-cli');
  const skillMetadata = skillRegistry.generateMetadataXml();
  const systemPrompt = skillMetadata
    ? `${baseSystemPrompt}\n\n${skillMetadata}`
    : baseSystemPrompt;

  const commands = new SlashCommandRegistry();

  const ctx: AppContext = {
    client,
    registry,
    mcpManager,
    subAgentRegistry,
    skillRegistry,
    skillLoader,
    systemPrompt,
    events,
    bgManager,
    commands,
  };

  // Kill all background tasks on exit
  const cleanup = () => {
    bgManager.killAll();
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  render(<App ctx={ctx} />);
}
