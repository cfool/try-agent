import type { SlashCommand } from "./types.js";

export type SlashCommandHandler = (args: string) => void | Promise<void>;

export interface SlashCommandDefinition extends SlashCommand {
  handler: SlashCommandHandler;
  /**
   * If set, executing this command opens the named panel instead of calling `handler`.
   * The App component maps panel IDs to specialized components.
   */
  panel?: string;
}

type Listener = () => void;

export interface ExecuteResult {
  matched: boolean;
  /** If set, the App should open this panel instead of the default handler. */
  panel?: string;
}

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
   * Returns an ExecuteResult indicating whether a command matched,
   * and optionally a panel ID to open.
   */
  execute(input: string): ExecuteResult {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) return { matched: false };

    const spaceIdx = trimmed.indexOf(" ");
    const name = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

    const def = this.commands.get(name.toLowerCase());
    if (!def) return { matched: false };

    // If the command declares a panel, signal it to the App
    if (def.panel) {
      return { matched: true, panel: def.panel };
    }

    def.handler(args);
    return { matched: true };
  }

  private buildSnapshot(): SlashCommand[] {
    return [...this.commands.values()].map(({ handler: _, panel: _p, ...rest }) => rest);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
