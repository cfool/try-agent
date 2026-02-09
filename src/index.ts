import "dotenv/config";
import * as readline from "node:readline/promises";
import { GeminiClient } from "./gemini-client.js";
import { getSystemPrompt } from "./system-prompt.js";
import { Chat } from "./chat.js";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Please set GEMINI_API_KEY environment variable.");
  process.exit(1);
}

const client = new GeminiClient({
  apiKey,
  model: "gemini-3-flash-preview",
});

// 切换提示词风格：修改这里的参数即可
// 可选: personal-assistant | sarcastic-friend | coding-mentor | anime-girl | strict-engineer
const systemPrompt = getSystemPrompt("personal-assistant");
let chat = new Chat(client, systemPrompt);

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
    chat = new Chat(client, systemPrompt);
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
