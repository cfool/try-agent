export interface Part {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

export interface Content {
  role: "user" | "model" | "tool";
  parts: Part[];
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      { type: string; description: string; enum?: string[] }
    >;
    required?: string[];
  };
}

interface GeminiRequest {
  system_instruction: { parts: { text: string }[] };
  contents: Content[];
  tools?: { function_declarations: FunctionDeclaration[] }[];
}

interface GeminiResponse {
  candidates: {
    content: Content;
  }[];
}

export interface SendMessageOptions {
  systemInstruction?: string;
  tools?: FunctionDeclaration[];
}

export interface GeminiResponseResult {
  parts: Part[];
  text: string | null;
  functionCall: { name: string; args: Record<string, unknown> } | null;
}

export class GeminiClient {
  private apiKey: string;
  private model: string;

  constructor(options: { apiKey: string; model: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async sendMessage(
    messages: Content[],
    options?: SendMessageOptions
  ): Promise<GeminiResponseResult> {
    const body: GeminiRequest = {
      system_instruction: {
        parts: [{ text: options?.systemInstruction ?? "" }],
      },
      contents: messages,
    };

    if (options?.tools && options.tools.length > 0) {
      body.tools = [{ function_declarations: options.tools }];
    }

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
    const parts = data.candidates[0].content.parts;

    const textPart = parts.find((p) => p.text !== undefined);
    const fcPart = parts.find((p) => p.functionCall !== undefined);

    return {
      parts,
      text: textPart?.text ?? null,
      functionCall: fcPart?.functionCall ?? null,
    };
  }
}
