import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface ModelItem {
  name: string;
  alias?: string;
  active: boolean;
}

interface ModelsPanelProps {
  models: ModelItem[];
  onClose: () => void;
  onSelect: (modelName: string) => void;
}

export const ModelsPanel: React.FC<ModelsPanelProps> = ({ models, onClose, onSelect }) => {
  // Default cursor to the currently active model
  const activeIdx = models.findIndex((m) => m.active);
  const [selectedIndex, setSelectedIndex] = useState(activeIdx >= 0 ? activeIdx : 0);
  const clamped = Math.min(selectedIndex, models.length - 1);

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.return) {
      if (models.length > 0) {
        onSelect(models[clamped].name);
      }
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => (i < models.length - 1 ? i + 1 : 0));
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : models.length - 1));
    }
  });

  if (models.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
      >
        <Box justifyContent="space-between">
          <Text bold color="cyan">Models</Text>
          <Text dimColor>ESC to close</Text>
        </Box>
        <Text dimColor>No models registered.</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
    >
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          Models ({models.length})
        </Text>
        <Text dimColor>↑↓ navigate  Enter select  ESC close</Text>
      </Box>

      <Text dimColor>{"─".repeat(50)}</Text>

      {/* Model list */}
      <Box flexDirection="column">
        {models.map((model, i) => {
          const isCursor = i === clamped;
          const displayName = model.alias ? `${model.alias} (${model.name})` : model.name;

          return (
            <Box key={model.name}>
              <Text
                color={isCursor ? "cyan" : undefined}
                bold={isCursor}
              >
                {isCursor ? " > " : "   "}
                {displayName}
              </Text>
              {model.active && (
                <Text color="green" bold> [current]</Text>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
