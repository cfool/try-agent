import { OpenAICompatibleProvider } from "./openai-compatible.js";

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(options: { apiKey: string; model?: string }) {
    super({
      name: "deepseek",
      apiKey: options.apiKey,
      model: options.model ?? "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
    });
  }
}
