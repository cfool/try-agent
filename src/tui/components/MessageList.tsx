import React from "react";
import { Box } from "ink";
import { Message } from "./Message.js";
import { ToolCallBox } from "./ToolCallBox.js";
import type { DisplayMessage } from "../types.js";

interface MessageListProps {
  messages: DisplayMessage[];
}

const MAX_VISIBLE = 50;

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const visible = messages.slice(-MAX_VISIBLE);
  const elements: React.ReactNode[] = [];

  let i = 0;
  while (i < visible.length) {
    const msg = visible[i];

    // Group tool_call + following tool_result/error into a single ToolCallBox
    if (msg.type === "tool_call" && msg.toolCall) {
      const next = visible[i + 1];
      if (
        next &&
        (next.type === "tool_result" || next.type === "error") &&
        next.toolResult
      ) {
        elements.push(
          <ToolCallBox
            key={msg.id}
            toolCall={msg.toolCall}
            toolResult={next.toolResult}
          />
        );
        i += 2;
        continue;
      }
      // Unpaired tool_call (result hasn't arrived yet)
      elements.push(
        <ToolCallBox key={msg.id} toolCall={msg.toolCall} />
      );
      i += 1;
      continue;
    }

    // Skip tool_result/error that was already paired above won't happen
    // because we advance i by 2 in the paired case. But if a tool_result
    // has toolResult data and appears without a preceding tool_call, render
    // it via Message fallback.
    elements.push(<Message key={msg.id} message={msg} />);
    i += 1;
  }

  return (
    <Box flexDirection="column" flexGrow={1} gap={1}>
      {elements}
    </Box>
  );
};
