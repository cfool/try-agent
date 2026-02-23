import { OpenAICompatibleProvider } from "./openai-compatible.js";

export class TencentProvider extends OpenAICompatibleProvider {
  constructor(options: { apiKey: string; model: string }) {
    super({
      name: "tencent",
      apiKey: options.apiKey,
      model: options.model,
      baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    });
  }
}
