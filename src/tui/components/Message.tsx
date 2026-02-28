import React, { useEffect, useState } from "react";
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

  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!isPending) {
      setVisible(true);
      return;
    }
    const timer = setInterval(() => {
      setVisible((v) => !v);
    }, 500);
    return () => clearInterval(timer);
  }, [isPending]);

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
            {visible ? "● " : "  "}
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

    case "system": {
      const firstLine = message.text.split("\n")[0];
      const truncated = message.text.includes("\n") ? firstLine + "…" : firstLine;
      return (
        <Box borderStyle="round" borderColor="gray" paddingLeft={1} paddingRight={1}>
          <Text color="gray">ℹ {truncated}</Text>
        </Box>
      );
    }

    default:
      return <Text>{message.text}</Text>;
  }
};
