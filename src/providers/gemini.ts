import type { ModelProvider } from "./types.js";

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

  constructor(options: { apiKey: string; model?: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gemini-3-flash-preview";
  }

  async sendMessage(text: string, systemInstruction?: string): Promise<string> {
    const body: GeminiRequest = {
      system_instruction: {
        parts: [{ text: systemInstruction ?? "" }],
      },
      contents: [{ role: "user", parts: [{ text }] }],
    };

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
