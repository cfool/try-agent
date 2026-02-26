import type { SlashCommand } from "./types.js";

export type SlashCommandHandler = (args: string) => void | Promise<void>;

export interface SlashCommandDefinition extends SlashCommand {
  handler: SlashCommandHandler;
}

type Listener = () => void;

export class SlashCommandRegistry {
  private commands = new Map<string, SlashCommandDefinition>();
  private listeners = new Set<Listener>();
  private snapshot: SlashCommand[] = [];

  register(def: SlashCommandDefinition): void {
    this.commands.set(def.name.toLowerCase(), def);
    this.snapshot = this.buildSnapshot();
    this.emit();
  }

  /** Get all registered commands (for autocomplete) */
  list(): SlashCommand[] {
    return this.snapshot;
  }

  /** Subscribe to registry changes. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Return a referentially-stable snapshot (changes only on register). */
  getSnapshot(): SlashCommand[] {
    return this.snapshot;
  }

  /**
   * Try to execute input as a slash command.
   * Returns true if a command was matched and executed, false otherwise.
   */
  execute(input: string): boolean {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) return false;

    const spaceIdx = trimmed.indexOf(" ");
    const name = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

    const def = this.commands.get(name.toLowerCase());
    if (!def) return false;

    def.handler(args);
    return true;
  }

  private buildSnapshot(): SlashCommand[] {
    return [...this.commands.values()].map(({ handler: _, ...rest }) => rest);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
