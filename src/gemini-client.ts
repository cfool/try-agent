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

export interface MessageInput {
  role: "user" | "model";
  text: string;
}

export class GeminiClient {
  private apiKey: string;
  private model: string;

  constructor(options: { apiKey: string; model: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async sendMessage(
    messages: MessageInput[],
    systemInstruction?: string
  ): Promise<string> {
    const contents: Content[] = messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    const body: GeminiRequest = {
      system_instruction: {
        parts: [{ text: systemInstruction ?? "" }],
      },
      contents,
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
