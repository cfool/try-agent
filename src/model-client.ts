import type { ModelProvider } from "./providers/types.js";

export class ModelClient {
  private providers = new Map<string, ModelProvider>();
  private activeProvider: string | null = null;

  registerProvider(provider: ModelProvider): void {
    this.providers.set(provider.name, provider);
    if (!this.activeProvider) {
      this.activeProvider = provider.name;
    }
  }

  use(providerName: string): void {
    if (!this.providers.has(providerName)) {
      throw new Error(
        `Unknown provider "${providerName}". Available: ${[...this.providers.keys()].join(", ")}`
      );
    }
    this.activeProvider = providerName;
  }

  getActiveProviderName(): string {
    if (!this.activeProvider) {
      throw new Error("No provider registered.");
    }
    return this.activeProvider;
  }

  async sendMessage(text: string, systemInstruction?: string): Promise<string> {
    if (!this.activeProvider) {
      throw new Error("No provider registered.");
    }
    const provider = this.providers.get(this.activeProvider)!;
    return provider.sendMessage(text, systemInstruction);
  }
}
