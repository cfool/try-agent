import { useMemo, useSyncExternalStore } from "react";
import type { SlashCommandRegistry } from "./slash-commands.js";
import type { SlashCommand } from "./types.js";

/**
 * Subscribe to the command registry and return a filtered candidate list
 * for the current input value. Components using this hook will automatically
 * re-render when commands are registered or unregistered.
 */
export function useCommandList(
  registry: SlashCommandRegistry,
  inputValue: string,
): SlashCommand[] {
  const commands = useSyncExternalStore(
    (cb) => registry.subscribe(cb),
    () => registry.getSnapshot(),
  );

  return useMemo(() => {
    if (!inputValue.startsWith("/")) return [];
    const query = inputValue.toLowerCase();
    return commands.filter((cmd) => cmd.name.toLowerCase().startsWith(query));
  }, [inputValue, commands]);
}
