import React from "react";
import { Box } from "ink";
import { Message } from "./Message.js";
import type { DisplayMessage } from "../types.js";

interface MessageListProps {
  messages: DisplayMessage[];
}

const MAX_VISIBLE = 50;

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const visible = messages.slice(-MAX_VISIBLE);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {visible.map((msg) => (
        <Message key={msg.id} message={msg} />
      ))}
    </Box>
  );
};
