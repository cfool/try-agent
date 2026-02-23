import "dotenv/config";
import * as readline from "node:readline/promises";
import { client } from "./model/client.js";
import { getSystemPrompt } from "./system-prompt.js";
import { Chat } from "./chat.js";
import { ToolRegistry } from "./tool-registry.js";
import { RunShellCommand } from "./tools/run-shell-command.js";
import { ReadFile } from "./tools/read-file.js";
import { ReadFolder } from "./tools/read-folder.js";
import { WriteFile } from "./tools/write-file.js";
import { EditFile } from "./tools/edit-file.js";
import { McpClientManager } from "./mcp-client.js";
import { SubAgentRegistry } from "./subagents/sub-agent-registry.js";
import { SubAgentTool } from "./tools/sub-agent-tool.js";
import { createCodebaseInvestigator } from "./subagents/codebase-investigator.js";
import { SkillRegistry } from "./skills/skill-registry.js";
import { SkillLoader } from "./skills/skill-loader.js";
import { SkillTool } from "./tools/skill-tool.js";

// Default to specified model, or fall back to the first registered one
const preferredModel = process.env.MODEL;
if (preferredModel) {
  try {
    client.use(preferredModel);
    console.log(`[DEBUG] Using preferred model: ${preferredModel}`);
  } catch (err) {
    // If the default model isn't available, the first registered one is already active
    // (registerModel automatically sets the first model as active)
    console.log(`[DEBUG] Preferred model "${preferredModel}" not available: ${err}`);
    console.log(`[DEBUG] Falling back to first registered model: ${client.getActiveModel()?.alias || client.getActiveModel()?.name }`);
  }
}

try {
  console.log(`Current Model: ${client.getActiveModel()?.alias || client.getActiveModel()?.name}`);
} catch {
  console.error("No model configured. Set at least one API key in .env");
  process.exit(1);
}

const registry = new ToolRegistry();
registry.register(new RunShellCommand({ timeoutMs: 30_000 }));
registry.register(new ReadFile());
registry.register(new ReadFolder());
registry.register(new WriteFile());
registry.register(new EditFile());

const mcpManager = new McpClientManager();
await mcpManager.connect();
mcpManager.registerTools(registry);

// SubAgent: register built-in agents and load user-defined ones from directory
const subAgentRegistry = new SubAgentRegistry();
subAgentRegistry.registerBuiltin(createCodebaseInvestigator());
await subAgentRegistry.loadFromDirectory();
if (!subAgentRegistry.isEmpty) {
  registry.register(new SubAgentTool(subAgentRegistry, registry, client));
}

// Skill: load user-defined skills from .agent/skills/ directory
const skillRegistry = new SkillRegistry();
await skillRegistry.loadFromDirectory();
const skillLoader = new SkillLoader();

// Register SkillTool if there are LLM-invocable skills
const llmSkills = skillRegistry.list();
if (llmSkills.length > 0) {
  registry.register(new SkillTool(skillRegistry, skillLoader));
}

// 切换提示词风格：修改这里的参数即可
// 可选: personal-assistant | sarcastic-friend | coding-mentor | anime-girl | strict-engineer | gemini-cli
const systemPrompt = getSystemPrompt("gemini-cli");

// Inject skill metadata into system prompt so LLM knows available skills
const skillMetadata = skillRegistry.generateMetadataXml();
const fullSystemPrompt = skillMetadata
  ? `${systemPrompt}\n\n${skillMetadata}`
  : systemPrompt;

let chat = new Chat(client, fullSystemPrompt, registry);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("AI Chat (type '/exit' to quit, '/new' to start a new chat, '/use <model>' to switch, '/agents' to list agents, '/skills' to list skills)\n");

while (true) {
  const input = await rl.question("You: ");
  const trimmed = input.trim().toLowerCase();

  if (trimmed === "/exit") {
    await mcpManager.close();
    rl.close();
    break;
  }

  if (trimmed === "/new") {
    chat = new Chat(client, fullSystemPrompt, registry);
    console.log("\n--- New chat started ---\n");
    continue;
  }

  if (!input.trim()) continue;

  // Handle /agents command to list registered sub-agents
  if (trimmed === "/agents") {
    const agents = subAgentRegistry.list();
    if (agents.length === 0) {
      console.log("\nNo sub-agents registered.\n");
    } else {
      console.log(`\n📋 Registered Sub-Agents (${agents.length}):\n`);
      for (const agent of agents) {
        const tools = agent.tools ? agent.tools.join(", ") : "all";
        const model = agent.model ?? "default";
        const maxTurns = agent.maxTurns ?? "default";
        console.log(`  • ${agent.name}`);
        console.log(`    Description: ${agent.description}`);
        console.log(`    Tools: ${tools}`);
        console.log(`    Model: ${model} | Max Turns: ${maxTurns}`);
        console.log();
      }
    }
    continue;
  }

  // Handle /skills command to list registered skills
  if (trimmed === "/skills") {
    const skills = skillRegistry.list();
    if (skills.length === 0) {
      console.log("\nNo skills registered.\n");
    } else {
      console.log(`\nRegistered Skills (${skills.length}):\n`);
      for (const skill of skills) {
        console.log(`  ${skill.trigger} — ${skill.name}`);
        console.log(`    Description: ${skill.description}`);
        console.log();
      }
    }
    continue;
  }

  // Handle /use command to switch models
  const useMatch = input.trim().match(/^\/use\s+(\S+)$/);
  if (useMatch) {
    try {
      client.use(useMatch[1]);
      console.log(`\nSwitched to Model: ${client.getActiveModel()?.alias}\n`);
    } catch (err) {
      console.error(`\n${err}\n`);
    }
    continue;
  }

  // Check if input matches a skill trigger
  const skillMatch = skillRegistry.match(input.trim());
  if (skillMatch) {
    const injectedPrompt = skillLoader.load(skillMatch.skill, skillMatch.args);
    // Send through main chat — the model reads the skill prompt and acts on it
    try {
      const reply = await chat.send(injectedPrompt);
      console.log(`\n${client.getActiveModel()?.alias}: ${reply}\n`);
    } catch (err) {
      console.error(`\nError: ${err}\n`);
    }
    continue;
  }

  try {
    const reply = await chat.send(input);
    console.log(`\n${client.getActiveModel()?.alias}: ${reply}\n`);
  } catch (err) {
    console.error(`\nError: ${err}\n`);
  }
}
