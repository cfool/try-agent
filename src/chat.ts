import { GeminiClient } from "./gemini-client.js";

export interface Message {
  role: "user" | "model";
  text: string;
}

export class Chat {
  private history: Message[] = [];
  private client: GeminiClient;
  private systemPrompt: string;

  constructor(client: GeminiClient, systemPrompt: string) {
    this.client = client;
    this.systemPrompt = systemPrompt;
  }

  async send(text: string): Promise<string> {
    this.history.push({ role: "user", text });

    const reply = await this.client.sendMessage(
      this.history,
      this.systemPrompt
    );

    this.history.push({ role: "model", text: reply });
    return reply;
  }

  getHistory(): ReadonlyArray<Message> {
    return this.history;
  }

  clear(): void {
    this.history = [];
  }
}
