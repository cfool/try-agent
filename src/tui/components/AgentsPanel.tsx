import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { SubAgentDefinition } from "../../subagents/sub-agent-types.js";

interface AgentsPanelProps {
  agents: SubAgentDefinition[];
  onClose: () => void;
}

export const AgentsPanel: React.FC<AgentsPanelProps> = ({ agents, onClose }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const clamped = Math.min(selectedIndex, agents.length - 1);

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => (i < agents.length - 1 ? i + 1 : 0));
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : agents.length - 1));
    }
  });

  if (agents.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
      >
        <Box justifyContent="space-between">
          <Text bold color="cyan">Sub-Agents</Text>
          <Text dimColor>ESC to close</Text>
        </Box>
        <Text dimColor>No sub-agents registered.</Text>
      </Box>
    );
  }

  const selected = agents[clamped];

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
          Sub-Agents ({agents.length})
        </Text>
        <Text dimColor>↑↓ navigate  ESC close</Text>
      </Box>

      <Text dimColor>{"─".repeat(50)}</Text>

      {/* Two-column: list on left, detail on right */}
      <Box>
        {/* Agent list */}
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
          {agents.map((agent, i) => {
            const active = i === clamped;
            return (
              <Text
                key={agent.name}
                color={active ? "cyan" : undefined}
                bold={active}
                wrap="truncate"
              >
                {active ? " > " : "   "}
                {agent.name}
              </Text>
            );
          })}
        </Box>

        {/* Detail pane */}
        {selected && (
          <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
            <Text bold color="white">{selected.name}</Text>
            <Text>{selected.description}</Text>

            <Box marginTop={1} flexDirection="column">
              {selected.model && (
                <Box>
                  <Text dimColor>model   </Text>
                  <Text color="yellow">{selected.model}</Text>
                </Box>
              )}
              {selected.maxTurns !== undefined && (
                <Box>
                  <Text dimColor>maxTurns</Text>
                  <Text color="yellow"> {selected.maxTurns}</Text>
                </Box>
              )}
              {selected.tools && selected.tools.length > 0 && (
                <Box flexDirection="column">
                  <Text dimColor>tools</Text>
                  {selected.tools.map((t) => (
                    <Text key={t} color="green">  {t}</Text>
                  ))}
                </Box>
              )}
              {!selected.tools && (
                <Box>
                  <Text dimColor>tools   </Text>
                  <Text color="gray">all (inherited)</Text>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};
