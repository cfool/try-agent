import { OpenAICompatibleProvider } from "./openai-compatible.js";

export class ZhiPuProvider extends OpenAICompatibleProvider {
  constructor(options: { apiKey: string; model: string }) {
    super({
      name: "zhipu",
      apiKey: options.apiKey,
      model: options.model,
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    });
  }
}
