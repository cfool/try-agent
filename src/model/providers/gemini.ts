import type { ModelProvider, Message } from "./types.js";

interface Part {
  text: string;
}

interface Content {
  role: "user" | "model";
  parts: Part[];
}

interface GeminiRequest {
  system_instruction: { parts: Part[] };
  contents: Content[];
}

interface GeminiResponse {
  candidates: {
    content: {
      parts: Part[];
    };
  }[];
}

export class GeminiProvider implements ModelProvider {
  name = "gemini";
  private apiKey: string;
  private model: string;

  constructor(options: { apiKey: string; model: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  /**
   * 将内部 Message[] 格式转换为 Gemini API 所需的请求体。
   * Gemini 的消息结构使用 parts 数组包裹文本，且 system 指令作为独立字段传递而非消息列表的一部分。
   */
  private toGeminiRequest(messages: Message[], systemInstruction?: string): GeminiRequest {
    // Gemini 直接使用 "user" | "model" 作为 role，与内部格式一致，无需映射
    const contents: Content[] = messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    return {
      // system 指令通过独立的 system_instruction 字段传递，而非混入对话消息
      system_instruction: {
        parts: [{ text: systemInstruction ?? "" }],
      },
      contents,
    };
  }

  async sendMessage(
    messages: Message[],
    systemInstruction?: string
  ): Promise<string> {
    const body = this.toGeminiRequest(messages, systemInstruction);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errorText}`);
    }

    const data = (await res.json()) as GeminiResponse;
    return data.candidates[0].content.parts[0].text;
  }
}
