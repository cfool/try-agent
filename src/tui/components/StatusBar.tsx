import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  modelName: string;
  loading: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({ modelName, loading }) => {
  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
      <Text bold color="cyan">
        {modelName}
      </Text>
      <Box>
        {loading ? (
          <Text color="yellow">Working...</Text>
        ) : (
          <Text dimColor>/exit /new /use /agents /skills</Text>
        )}
      </Box>
    </Box>
  );
};
