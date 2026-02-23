import "dotenv/config";
import * as readline from "node:readline/promises";
import { ModelClient } from "./model-client.js";
import { GeminiProvider } from "./providers/gemini.js";
import { DeepSeekProvider } from "./providers/deepseek.js";
import { ZhiPuProvider } from "./providers/zhipu.js";
import { getSystemPrompt } from "./system-prompt.js";

const client = new ModelClient();

// Register available providers based on env vars
const geminiKey = process.env.GEMINI_API_KEY;
if (geminiKey) {
  client.registerProvider(new GeminiProvider({ apiKey: geminiKey }));
}

const deepseekKey = process.env.DEEPSEEK_API_KEY;
if (deepseekKey) {
  client.registerProvider(new DeepSeekProvider({ apiKey: deepseekKey, model: 'deepseek-chat' }));
}

const zhipuKey = process.env.ZHIPU_API_KEY;
if (zhipuKey) {
  client.registerProvider(new ZhiPuProvider({ apiKey: zhipuKey, model: 'glm-5' }));
}

// Default to specified provider, or fall back to the first registered one
const preferredProvider = process.env.MODEL_PROVIDER ?? "gemini";
try {
  client.use(preferredProvider);
  console.log(`[DEBUG] Using preferred provider: ${preferredProvider}`);
} catch (err) {
  // If the default provider isn't available, the first registered one is already active
  // (registerProvider automatically sets the first provider as active)
  console.log(`[DEBUG] Preferred provider "${preferredProvider}" not available: ${err}`);
  console.log(`[DEBUG] Falling back to first registered provider: ${client.getActiveProviderName()}`);
}

try {
  console.log(`Active provider: ${client.getActiveProviderName()}`);
} catch {
  console.error("No model provider configured. Set at least one API key in .env");
  process.exit(1);
}

// 切换提示词风格：修改这里的参数即可
// 可选: personal-assistant | sarcastic-friend | coding-mentor | anime-girl | strict-engineer
const systemPrompt = getSystemPrompt("personal-assistant");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("AI Chat (type '/exit' to quit, '/use <provider>' to switch)\n");

while (true) {
  const input = await rl.question("You: ");

  if (input.trim().toLowerCase() === "/exit") {
    rl.close();
    break;
  }

  if (!input.trim()) continue;

  // Handle /use command to switch providers
  const useMatch = input.trim().match(/^\/use\s+(\S+)$/);
  if (useMatch) {
    try {
      client.use(useMatch[1]);
      console.log(`\nSwitched to provider: ${client.getActiveProviderName()}\n`);
    } catch (err) {
      console.error(`\n${err}\n`);
    }
    continue;
  }

  try {
    const reply = await client.sendMessage(input, systemPrompt);
    console.log(`\n${client.getActiveProviderName()}: ${reply}\n`);
  } catch (err) {
    console.error(`\nError: ${err}\n`);
  }
}
