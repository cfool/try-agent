import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SkillDefinition } from "../../skills/skill-types.js";

interface SkillsPanelProps {
  skills: SkillDefinition[];
  onClose: () => void;
}

export const SkillsPanel: React.FC<SkillsPanelProps> = ({ skills, onClose }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const clamped = Math.min(selectedIndex, skills.length - 1);

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => (i < skills.length - 1 ? i + 1 : 0));
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : skills.length - 1));
    }
  });

  if (skills.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="magenta"
        paddingX={1}
      >
        <Box justifyContent="space-between">
          <Text bold color="magenta">Skills</Text>
          <Text dimColor>ESC to close</Text>
        </Box>
        <Text dimColor>No skills registered.</Text>
      </Box>
    );
  }

  const selected = skills[clamped];

  // Truncate prompt preview to avoid flooding the terminal
  const promptPreview = selected
    ? selected.prompt.length > 200
      ? selected.prompt.slice(0, 200) + "…"
      : selected.prompt
    : "";

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="magenta"
      paddingX={1}
    >
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold color="magenta">
          Skills ({skills.length})
        </Text>
        <Text dimColor>↑↓ navigate  ESC close</Text>
      </Box>

      <Text dimColor>{"─".repeat(50)}</Text>

      {/* Two-column: list on left, detail on right */}
      <Box>
        {/* Skill list */}
        <Box
          flexDirection="column"
          flexShrink={0}
          borderStyle="single"
          borderTop={false}
          borderBottom={false}
          borderLeft={false}
          borderColor="gray"
          paddingRight={1}
        >
          {skills.map((skill, i) => {
            const active = i === clamped;
            return (
              <Box key={skill.name}>
                <Text
                  color={active ? "magenta" : undefined}
                  bold={active}
                >
                  {active ? " > " : "   "}
                </Text>
                <Text color={active ? "magenta" : "cyan"} bold={active}>
                  {skill.trigger}
                </Text>
              </Box>
            );
          })}
        </Box>

        {/* Detail pane */}
        {selected && (
          <Box flexDirection="column" flexGrow={1}>
            <Text bold color="white">{selected.name}</Text>
            <Text>{selected.description}</Text>

            <Box marginTop={1} flexDirection="column">
              <Box>
                <Text dimColor>trigger </Text>
                <Text color="cyan">{selected.trigger}</Text>
              </Box>
              {selected.skillPath && (
                <Box>
                  <Text dimColor>path    </Text>
                  <Text color="gray">{selected.skillPath}</Text>
                </Box>
              )}
            </Box>

            <Box marginTop={1} flexDirection="column">
              <Text dimColor>prompt preview:</Text>
              <Text color="gray">{promptPreview}</Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};
