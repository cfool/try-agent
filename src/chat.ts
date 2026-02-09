import { ModelClient } from "./model/client.js";
import type { Message } from "./model/providers/types.js";

export class Chat {
  private history: Message[] = [];
  private client: ModelClient;
  private systemPrompt: string;

  constructor(client: ModelClient, systemPrompt: string) {
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
