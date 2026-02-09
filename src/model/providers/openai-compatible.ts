import type { ModelProvider, Message } from "./types.js";

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

  /**
   * 将内部 Message[] 格式转换为 OpenAI Chat API 所需的 ChatMessage[] 格式。
   * 转换包括：将 system 指令插入为首条消息，以及将 role "model" 映射为 "assistant"。
   */
  private toChatMessages(messages: Message[], systemInstruction?: string): ChatMessage[] {
    const chatMessages: ChatMessage[] = [];

    // system 指令作为首条消息，用于设定模型行为
    if (systemInstruction) {
      chatMessages.push({ role: "system", content: systemInstruction });
    }

    for (const m of messages) {
      chatMessages.push({
        // 内部统一使用 "model" 表示模型回复，OpenAI API 使用 "assistant"
        role: m.role === "model" ? "assistant" : "user",
        content: m.text,
      });
    }

    return chatMessages;
  }

  async sendMessage(messages: Message[], systemInstruction?: string): Promise<string> {
    const chatMessages = this.toChatMessages(messages, systemInstruction);

    const url = `${this.baseUrl}/chat/completions`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages: chatMessages }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`${this.name} API error ${res.status}: ${errorText}`);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    return data.choices[0].message.content;
  }
}
