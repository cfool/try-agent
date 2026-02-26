import React from "react";
import { Box, Text } from "ink";
import type { DisplayMessage } from "../types.js";

interface MessageProps {
  message: DisplayMessage;
}

export const Message: React.FC<MessageProps> = ({ message }) => {
  switch (message.type) {
    case "user":
      return (
        <Box>
          <Text bold color="green">
            You:{" "}
          </Text>
          <Text>{message.text}</Text>
        </Box>
      );

    case "assistant":
      return (
        <Box>
          <Text bold color="blue">
            AI:{" "}
          </Text>
          <Text>{message.text}</Text>
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
