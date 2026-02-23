import "dotenv/config";
import * as readline from "node:readline/promises";
import { client } from "./model/client.js";
import { getSystemPrompt } from "./system-prompt.js";

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

// 切换提示词风格：修改这里的参数即可
// 可选: personal-assistant | sarcastic-friend | coding-mentor | anime-girl | strict-engineer
const systemPrompt = getSystemPrompt("personal-assistant");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("AI Chat (type '/exit' to quit, '/use <model>' to switch)\n");

while (true) {
  const input = await rl.question("You: ");

  if (input.trim().toLowerCase() === "/exit") {
    rl.close();
    break;
  }

  if (!input.trim()) continue;

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

  try {
    const reply = await client.sendMessage(input, systemPrompt);
    console.log(`\n${client.getActiveModel()?.alias}: ${reply}\n`);
  } catch (err) {
    console.error(`\nError: ${err}\n`);
  }
}
