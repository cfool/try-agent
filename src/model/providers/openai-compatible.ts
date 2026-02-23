import type { ModelProvider } from "./types.js";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

export class OpenAICompatibleProvider implements ModelProvider {
  name: string;
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(options: {
    name: string;
    apiKey: string;
    model: string;
    baseUrl: string;
  }) {
    this.name = options.name;
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl;
  }

  async sendMessage(text: string, systemInstruction?: string): Promise<string> {
    const messages: ChatMessage[] = [];

    if (systemInstruction) {
      messages.push({ role: "system", content: systemInstruction });
    }

    messages.push({ role: "user", content: text });

    const url = `${this.baseUrl}/chat/completions`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`${this.name} API error ${res.status}: ${errorText}`);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    return data.choices[0].message.content;
  }
}
