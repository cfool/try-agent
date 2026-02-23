export interface ModelProvider {
  name: string;
  sendMessage(text: string, systemInstruction?: string): Promise<string>;
}
