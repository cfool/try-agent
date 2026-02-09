import { DeepSeekProvider } from "./providers/deepseek.js";
import { GeminiProvider } from "./providers/gemini.js";
import { TencentProvider } from "./providers/tencent.js";
import type { Message, ModelProvider } from "./providers/types.js";
import { ZhiPuProvider } from "./providers/zhipu.js";

interface ModelConfig {
  name: string;
  alias?: string;
  provider: ModelProvider;
}

export class ModelClient {
  private providers = new Map<string, ModelConfig>();
  private currentModel: string | null = null;

  registerModel(model: ModelConfig): void {
    this.providers.set(model.name, model);
    if (!this.currentModel) {
      this.currentModel = model.name;
    }
  }

  use(model: string): void {
    if (!this.providers.has(model)) {
      throw new Error(
        `Unknown model "${model}". Available: ${[...this.providers.keys()].join(", ")}`
      );
    }
    this.currentModel = model;
  }

  getActiveModel(): ModelConfig {
    if (!this.currentModel || !this.providers.has(this.currentModel)) {
      throw new Error("No model registered.");
    }
    return this.providers.get(this.currentModel)!;
  }

  async sendMessage(messages: Message[], systemInstruction?: string): Promise<string> {
    if (!this.currentModel || !this.providers.has(this.currentModel)) {
      throw new Error("No model registered.");
    }
    const provider = this.providers.get(this.currentModel)!.provider;
    return provider.sendMessage(messages, systemInstruction);
  }
}

const client = new ModelClient();

// Register available providers based on env vars
const geminiKey = process.env.GEMINI_API_KEY;
if (geminiKey) {
  client.registerModel({
    name: 'gemini-3-flash-preview',
    alias: 'Gemini-3-Flash',
    provider: new GeminiProvider({ apiKey: geminiKey, model: 'gemini-3-flash-preview' }),
  });
}

const deepseekKey = process.env.DEEPSEEK_API_KEY;
if (deepseekKey) {
  client.registerModel({
    name: 'deepseek-v3.2',
    alias: 'DeepSeek-V3.2',
    provider: new DeepSeekProvider({ apiKey: deepseekKey, model: 'deepseek-chat' })
  });
}

const zhipuKey = process.env.ZHIPU_API_KEY;
if (zhipuKey) {
  client.registerModel({
    name: 'glm-5',
    alias: 'GLM-5',
    provider: new ZhiPuProvider({ apiKey: zhipuKey, model: 'glm-5' })
  });
}

const tencentKey = process.env.TENCENT_API_KEY;
if (tencentKey) {
  client.registerModel({
    name: 'hunyuan-turbos-latest',
    alias: 'Hunyuan-Turbos',
    provider: new TencentProvider({ apiKey: tencentKey, model: 'hunyuan-turbos-latest' })
  });
}

export { client };