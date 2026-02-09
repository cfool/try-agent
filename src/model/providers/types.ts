export interface Message {
  role: "user" | "model";
  text: string;
}

export interface ModelProvider {
  name: string;
  sendMessage(messages: Message[], systemInstruction?: string): Promise<string>;
}
