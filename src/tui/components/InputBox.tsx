import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
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

  // Handle arrow keys and Tab for completion navigation
  useInput(
    (input, key) => {
      if (!showMenu) return;

      if (key.downArrow) {
        setSelectedIndex((prev) =>
          prev < candidates.length - 1 ? prev + 1 : 0
        );
        return;
      }

      if (key.upArrow) {
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : candidates.length - 1
        );
        return;
      }

      if (key.tab) {
        const cmd = candidates[clampedIndex];
        if (cmd) {
          const filled = cmd.hasArg ? cmd.name + " " : cmd.name;
          onChange(filled);
          setSelectedIndex(0);
        }
        return;
      }
    },
    { isActive: !disabled }
  );

  const handleChange = useCallback(
    (v: string) => {
      onChange(v);
      setSelectedIndex(0);
    },
    [onChange]
  );

  const handleSubmit = useCallback(
    (v: string) => {
      if (showMenu && candidates.length > 0) {
        const selected = candidates[clampedIndex];
        if (
          selected &&
          selected.name.toLowerCase() !== v.toLowerCase() &&
          selected.name.toLowerCase().startsWith(v.toLowerCase())
        ) {
          const filled = selected.hasArg ? selected.name + " " : selected.name;
          onChange(filled);
          setSelectedIndex(0);
          return;
        }
      }
      onSubmit(v);
    },
    [showMenu, candidates, clampedIndex, onChange, onSubmit]
  );

  return (
    <Box flexDirection="column">
      {/* Input row */}
      <Box borderStyle="single" paddingX={1}>
        <Text bold color="green">
          {"You: "}
        </Text>
        {disabled ? (
          <Text dimColor>Working...</Text>
        ) : (
          <TextInput
            value={value}
            onChange={handleChange}
            onSubmit={handleSubmit}
            placeholder="Type a message..."
          />
        )}
      </Box>

      {/* Completion dropdown — rendered below the input box */}
      {showMenu && (
        <Box flexDirection="column" paddingX={2}>
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
