import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { ToolCallData, ToolResultData } from "../types.js";

interface ToolCallBoxProps {
  toolCall: ToolCallData;
  toolResult?: ToolResultData;
}

const MAX_DIFF_LEN = 500;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function renderDiff(rawArgs: Record<string, unknown>): React.ReactNode {
  const oldStr = String(rawArgs.old_string ?? "");
  const newStr = String(rawArgs.new_string ?? "");
  const lines: React.ReactNode[] = [];

  for (const line of truncate(oldStr, MAX_DIFF_LEN).split("\n")) {
    lines.push(
      <Text key={`old-${lines.length}`} color="red">
        {"- "}{line}
      </Text>
    );
  }
  for (const line of truncate(newStr, MAX_DIFF_LEN).split("\n")) {
    lines.push(
      <Text key={`new-${lines.length}`} color="green">
        {"+ "}{line}
      </Text>
    );
  }

  return <Box flexDirection="column">{lines}</Box>;
}

function getTitle(toolCall: ToolCallData): string {
  const { toolName, args, rawArgs } = toolCall;

  switch (toolName) {
    case "replace": {
      const filePath = rawArgs?.file_path ?? args;
      return `Edit  ${filePath}`;
    }
    case "run_shell_command": {
      const cmd = rawArgs?.command ?? args;
      const desc = rawArgs?.description as string | undefined;
      const bgSuffix = rawArgs?.run_in_background ? " (background)" : "";
      return desc
        ? `${desc}${bgSuffix}  $ ${cmd}`
        : `Shell${bgSuffix}  $ ${cmd}`;
    }
    case "read_file": {
      const filePath = rawArgs?.file_path ?? args;
      return `ReadFile  ${filePath}`;
    }
    case "write_file": {
      const filePath = rawArgs?.file_path ?? args;
      return `WriteFile  ${filePath}`;
    }
    case "read_folder": {
      const folderPath = rawArgs?.folder_path ?? args;
      return `ReadFolder  ${folderPath}`;
    }
    default:
      return `${toolName}  ${args}`;
  }
}

const Spinner: React.FC = () => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return <Text color="yellow">{SPINNER_FRAMES[frame]}</Text>;
};

function renderBody(
  toolCall: ToolCallData,
  toolResult?: ToolResultData
): React.ReactNode {
  const parts: React.ReactNode[] = [];

  // Tool-specific call rendering
  if (toolCall.toolName === "replace" && toolCall.rawArgs) {
    parts.push(
      <Box key="diff" marginBottom={toolResult ? 1 : 0}>
        {renderDiff(toolCall.rawArgs)}
      </Box>
    );
  }

  // Result rendering
  if (toolResult) {
    if (toolResult.isError) {
      parts.push(
        <Text key="result" color="red">
          {toolResult.output}
        </Text>
      );
    } else {
      parts.push(
        <Text key="result" dimColor>
          {toolResult.output}
        </Text>
      );
    }
  }

  return <>{parts}</>;
}

export const ToolCallBox: React.FC<ToolCallBoxProps> = ({
  toolCall,
  toolResult,
}) => {
  const title = getTitle(toolCall);
  const isRunning = !toolResult;
  const borderColor = toolResult?.isError
    ? "red"
    : isRunning
      ? "yellow"
      : toolCall.toolName === "run_shell_command"
        ? "yellow"
        : "cyan";

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
    >
      <Box>
        {isRunning && (
          <Box marginRight={1}>
            <Spinner />
          </Box>
        )}
        <Text bold color={borderColor}>
          {title}
        </Text>
      </Box>
      {isRunning && !toolCall.rawArgs?.old_string ? (
        <Text color="yellow">Running...</Text>
      ) : (
        renderBody(toolCall, toolResult)
      )}
    </Box>
  );
};
