import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import type { SlashCommandRegistry } from "../slash-commands.js";
import { useCommandList } from "../use-command-list.js";

interface InputBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled: boolean;
  commands: SlashCommandRegistry;
}

export const InputBox: React.FC<InputBoxProps> = ({
  value,
  onChange,
  onSubmit,
  disabled,
  commands,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const candidates = useCommandList(commands, value);

  const showMenu = !disabled && candidates.length > 0 && value !== "";

  // Clamp selected index when candidates change
  const clampedIndex = showMenu
    ? Math.min(selectedIndex, candidates.length - 1)
    : 0;

  // Handle all keyboard input: text entry, arrow keys, Tab completion, Enter submit
  useInput(
    (input, key) => {
      // Arrow keys for completion navigation
      if (showMenu && key.downArrow) {
        setSelectedIndex((prev) =>
          prev < candidates.length - 1 ? prev + 1 : 0
        );
        return;
      }

      if (showMenu && key.upArrow) {
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : candidates.length - 1
        );
        return;
      }

      if (showMenu && key.tab) {
        const cmd = candidates[clampedIndex];
        if (cmd) {
          const filled = cmd.hasArg ? cmd.name + " " : cmd.name;
          onChange(filled);
          setSelectedIndex(0);
        }
        return;
      }

      // Submit on Enter
      if (key.return) {
        if (showMenu && candidates.length > 0) {
          const selected = candidates[clampedIndex];
          if (
            selected &&
            selected.name.toLowerCase() !== value.toLowerCase() &&
            selected.name.toLowerCase().startsWith(value.toLowerCase())
          ) {
            const filled = selected.hasArg ? selected.name + " " : selected.name;
            onChange(filled);
            setSelectedIndex(0);
            return;
          }
        }
        onSubmit(value);
        return;
      }

      // Backspace / Delete
      if (key.backspace || key.delete) {
        const next = value.slice(0, -1);
        onChange(next);
        setSelectedIndex(0);
        return;
      }

      // Ignore other control keys
      if (
        key.upArrow ||
        key.downArrow ||
        key.leftArrow ||
        key.rightArrow ||
        key.tab ||
        key.escape ||
        key.ctrl ||
        key.meta
      ) {
        return;
      }

      // Normal character input
      if (input) {
        onChange(value + input);
        setSelectedIndex(0);
      }
    },
    { isActive: !disabled }
  );

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Input row */}
      <Box borderStyle="single" borderLeft={false} borderRight={false}>
        <Text bold color="green">
          {"> "}
        </Text>
        {disabled ? (
          <Text dimColor>Working...</Text>
        ) : (
          <Text backgroundColor="#333333">
            {value}
            <Text backgroundColor="white">{" "}</Text>
            {!value && <Text dimColor>Type a message...</Text>}
          </Text>
        )}
      </Box>

      {/* Completion dropdown — rendered below the input box */}
      {showMenu && (
        <Box flexDirection="column">
          {candidates.map((cmd, i) => {
            const isSelected = i === clampedIndex;
            return (
              <Box key={cmd.name}>
                <Text
                  color={isSelected ? "cyan" : undefined}
                  bold={isSelected}
                >
                  {isSelected ? "> " : "  "}
                  {cmd.name}
                </Text>
                <Text dimColor>
                  {"  "}
                  {cmd.description}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
