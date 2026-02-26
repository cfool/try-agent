import { useState, useRef, useEffect, useCallback } from "react";
import { Chat } from "../chat.js";
import type { ToolCallEvent, ToolResultEvent } from "../chat-events.js";
import type { AppContext, DisplayMessage, MessageType, ToolCallData, ToolResultData } from "./types.js";

interface UseChatReturn {
  messages: DisplayMessage[];
  loading: boolean;
  modelName: string;
  sendMessage: (text: string) => void;
  newChat: () => void;
  switchModel: (model: string) => void;
  addSystemMessage: (text: string) => void;
}

let nextId = 1;

export function useChat(ctx: AppContext): UseChatReturn {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelName, setModelName] = useState(
    () => ctx.client.getActiveModel()?.alias || ctx.client.getActiveModel()?.name || "unknown"
  );

  const chatRef = useRef<Chat>(
    new Chat(ctx.client, ctx.systemPrompt, ctx.registry, {
      events: ctx.events,
    })
  );

  const addMessage = useCallback(
    (type: MessageType, text: string, extra?: { toolCall?: ToolCallData; toolResult?: ToolResultData }) => {
      setMessages((prev) => [
        ...prev,
        { id: nextId++, type, text, timestamp: new Date(), ...extra },
      ]);
    },
    []
  );

  useEffect(() => {
    const events = ctx.events;

    const onToolCall = (e: ToolCallEvent) => {
      addMessage("tool_call", `${e.name}(${e.args})`, {
        toolCall: { toolName: e.name, args: e.args, rawArgs: e.rawArgs },
      });
    };
    const onToolResult = (e: ToolResultEvent) => {
      addMessage(e.isError ? "error" : "tool_result", e.output, {
        toolResult: { toolName: e.name, output: e.output, isError: e.isError },
      });
    };
    const onCompressed = (e: { from: number; to: number }) => {
      addMessage("system", `[Context] Compressed: ${e.from} → ${e.to} tokens`);
    };

    events.on("tool_call", onToolCall);
    events.on("tool_result", onToolResult);
    events.on("compressed", onCompressed);

    return () => {
      events.off("tool_call", onToolCall);
      events.off("tool_result", onToolResult);
      events.off("compressed", onCompressed);
    };
  }, [ctx.events, addMessage]);

  const sendMessage = useCallback(
    (text: string) => {
      addMessage("user", text);
      setLoading(true);

      chatRef.current
        .send(text)
        .then((reply) => {
          addMessage("assistant", reply);
        })
        .catch((err) => {
          addMessage("error", String(err));
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [addMessage]
  );

  const newChat = useCallback(() => {
    chatRef.current = new Chat(ctx.client, ctx.systemPrompt, ctx.registry, {
      events: ctx.events,
    });
    setMessages([]);
    addMessage("system", "--- New chat started ---");
  }, [ctx, addMessage]);

  const switchModel = useCallback(
    (model: string) => {
      try {
        ctx.client.use(model);
        const name =
          ctx.client.getActiveModel()?.alias || ctx.client.getActiveModel()?.name || model;
        setModelName(name);
        addMessage("system", `Switched to Model: ${name}`);
      } catch (err) {
        addMessage("error", String(err));
      }
    },
    [ctx, addMessage]
  );

  const addSystemMessage = useCallback(
    (text: string) => {
      addMessage("system", text);
    },
    [addMessage]
  );

  return {
    messages,
    loading,
    modelName,
    sendMessage,
    newChat,
    switchModel,
    addSystemMessage,
  };
}
