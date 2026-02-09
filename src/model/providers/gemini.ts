import type { ToolDefinition } from "../../tool-registry.js";
import type {
  ModelProvider,
  Message,
  SendMessageOptions,
  SendMessageResult,
  FunctionCall,
} from "./types.js";

interface GeminiRequest {
  system_instruction: { parts: { text: string }[] };
  contents: GeminiContent[];
  tools?: { function_declarations: ToolDefinition[] }[];
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  thoughtSignature?: string;
}

interface GeminiResponse {
  candidates: {
    content: { parts: GeminiPart[] };
  }[];
}

let geminiCallCounter = 0;

function generateGeminiCallId(): string {
  return `gemini_call_${Date.now()}_${geminiCallCounter++}`;
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
  private toGeminiRequest(messages: Message[], options?: SendMessageOptions): GeminiRequest {
    // Gemini 直接使用 "user" | "model" 作为 role，与内部格式一致，无需映射

    // Convert internal MessageInput to Gemini-native content format
    const contents: GeminiContent[] = [];
    for (const m of messages) {
      if (m.role === "tool") {
        // Gemini expects functionResponse as a user-role part
        const frPart = m.parts.find((p) => p.functionResponse !== undefined);
        if (frPart?.functionResponse) {
          contents.push({
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: frPart.functionResponse.name,
                  response: frPart.functionResponse.response,
                },
              },
            ],
          });
        }
        continue;
      }

      const geminiParts: GeminiPart[] = [];
      for (const p of m.parts) {
        if (p.text !== undefined) {
          geminiParts.push({ text: p.text });
        } else if (p.functionCall) {
          const fcPart: GeminiPart = {
            functionCall: { name: p.functionCall.name, args: p.functionCall.args },
          };
          if (p.functionCall.thoughtSignature) {
            fcPart.thoughtSignature = p.functionCall.thoughtSignature;
          }
          geminiParts.push(fcPart);
        } else if (p.functionResponse) {
          geminiParts.push({
            functionResponse: {
              name: p.functionResponse.name,
              response: p.functionResponse.response,
            },
          });
        }
      }

      contents.push({
        role: m.role === "user" ? "user" : "model",
        parts: geminiParts,
      });
    }

    return {
      // system 指令通过独立的 system_instruction 字段传递，而非混入对话消息
      system_instruction: {
        parts: [{ text: options?.systemInstruction ?? "" }],
      },
      contents,
    };
  }

  async sendMessage(
    messages: Message[],
    options?: SendMessageOptions
  ): Promise<SendMessageResult> {
    const body = this.toGeminiRequest(messages, options);

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

    let functionCall: FunctionCall | undefined;
    if (fcPart?.functionCall) {
      functionCall = {
        id: generateGeminiCallId(),
        name: fcPart.functionCall.name,
        args: fcPart.functionCall.args,
        thoughtSignature: fcPart.thoughtSignature,
      };
    }

    return {
      text: textPart?.text,
      functionCall,
    };
  }
}
