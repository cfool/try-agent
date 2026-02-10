import "dotenv/config";
import * as readline from "node:readline/promises";
import { GeminiClient } from "./gemini-client.js";
import { getSystemPrompt } from "./system-prompt.js";
import { Chat } from "./chat.js";
import { ToolRegistry } from "./tool-registry.js";
import { RunShellCommand } from "./tools/run-shell-command.js";
import { ReadFile } from "./tools/read-file.js";
import { ReadFolder } from "./tools/read-folder.js";
import { WriteFile } from "./tools/write-file.js";
import { EditFile } from "./tools/edit-file.js";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Please set GEMINI_API_KEY environment variable.");
  process.exit(1);
}

const client = new GeminiClient({
  apiKey,
  model: "gemini-3-flash-preview",
});

const registry = new ToolRegistry();
registry.register(new RunShellCommand({ timeoutMs: 30_000 }));
registry.register(new ReadFile());
registry.register(new ReadFolder());
registry.register(new WriteFile());
registry.register(new EditFile());

// 切换提示词风格：修改这里的参数即可
// 可选: personal-assistant | sarcastic-friend | coding-mentor | anime-girl | strict-engineer | gemini-cli
const systemPrompt = getSystemPrompt("gemini-cli");

let chat = new Chat(client, systemPrompt, registry);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("Gemini Chat (type 'exit' to quit, 'new' to start a new chat)\n");

while (true) {
  const input = await rl.question("You: ");
  const trimmed = input.trim().toLowerCase();

  if (trimmed === "exit") {
    rl.close();
    break;
  }

  if (trimmed === "new") {
    chat = new Chat(client, systemPrompt, registry);
    console.log("\n--- New chat started ---\n");
    continue;
  }

  if (!input.trim()) continue;

  try {
    const reply = await chat.send(input);
    console.log(`\nGemini: ${reply}\n`);
  } catch (err) {
    console.error(`\nError: ${err}\n`);
  }
}
