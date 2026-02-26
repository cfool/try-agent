import React from "react";
import { Box, Text, useStdout } from "ink";
import type { DisplayMessage } from "../types.js";
import { MarkdownDisplay } from "./markdown/MarkdownDisplay.js";

interface MessageProps {
  message: DisplayMessage;
  /** True while the model is still generating this message */
  isPending?: boolean;
}

export const Message: React.FC<MessageProps> = ({ message, isPending = false }) => {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns ?? 80;

  switch (message.type) {
    case "user":
      return (
        <Box>
          <Text bold color="green">
            {"> "}
          </Text>
          <Text backgroundColor="#333333">{message.text}</Text>
        </Box>
      );

    case "assistant":
      return (
        <Box flexDirection="row">
          <Text bold color="blue">
            {"● "}
          </Text>
          <Box flexDirection="column">
            <MarkdownDisplay
              text={message.text}
              isPending={isPending}
              terminalWidth={terminalWidth - 2}
            />
          </Box>
        </Box>
      );

    case "tool_call":
      return (
        <Box>
          <Text color="magenta">[Tool Call] </Text>
          <Text dimColor>{message.text}</Text>
        </Box>
      );

    case "tool_result":
      return (
        <Box>
          <Text color="magenta">[Tool Result] </Text>
          <Text dimColor>{message.text}</Text>
        </Box>
      );

    case "error":
      return (
        <Box>
          <Text bold color="red">
            Error:{" "}
          </Text>
          <Text color="red">{message.text}</Text>
        </Box>
      );

    case "system":
      return (
        <Box>
          <Text color="gray">{message.text}</Text>
        </Box>
      );

    default:
      return <Text>{message.text}</Text>;
  }
};
