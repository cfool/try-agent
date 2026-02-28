import { useState, useRef, useEffect, useCallback } from "react";
import { Chat } from "../chat.js";
import type { ToolCallEvent, ToolResultEvent, BackgroundTaskEvent } from "../chat-events.js";
import type { BackgroundTaskInfo } from "../background-task-manager.js";
import type { AppContext, DisplayMessage, MessageType, ToolCallData, ToolResultData } from "./types.js";

interface UseChatReturn {
  messages: DisplayMessage[];
  loading: boolean;
  modelName: string;
  backgroundTasks: BackgroundTaskInfo[];
  sendMessage: (text: string) => void;
  newChat: () => void;
  switchModel: (model: string) => void;
  addSystemMessage: (text: string) => void;
}

let nextId = 1;

/**
 * Format a completed BackgroundTaskInfo into a text summary for the model.
 */
function formatBgTaskResult(task: BackgroundTaskInfo): string {
  const elapsed = Math.round(
    ((task.completedAt ?? Date.now()) - task.startedAt) / 1000
  );
  const lines = [
    `[Background task ${task.taskId} ${task.status}]`,
    `$ ${task.command}`,
    `Exit code: ${task.exitCode ?? "N/A"}`,
    `Elapsed: ${elapsed}s`,
  ];
  if (task.stdout) lines.push(`stdout:\n${task.stdout.trimEnd()}`);
  if (task.stderr) lines.push(`stderr:\n${task.stderr.trimEnd()}`);
  return lines.join("\n");
}

export function useChat(ctx: AppContext): UseChatReturn {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTaskInfo[]>([]);
  const [modelName, setModelName] = useState(
    () => ctx.client.getActiveModel()?.alias || ctx.client.getActiveModel()?.name || "unknown"
  );

  const chatRef = useRef<Chat>(
    new Chat(ctx.client, ctx.systemPrompt, ctx.registry, {
      events: ctx.events,
      bgManager: ctx.bgManager,
    })
  );

  // Track loading state in a ref so event callbacks always see the latest value
  const loadingRef = useRef(false);
  // Queue of completed bg tasks that arrived while the model was busy
  const pendingNotifyRef = useRef<BackgroundTaskInfo[]>([]);

  const addMessage = useCallback(
    (type: MessageType, text: string, extra?: { toolCall?: ToolCallData; toolResult?: ToolResultData }) => {
      setMessages((prev) => [
        ...prev,
        { id: nextId++, type, text, timestamp: new Date(), ...extra },
      ]);
    },
    []
  );

  // 用于追踪当前正在流式输出的 assistant 消息 id
  const streamingIdRef = useRef<number | null>(null);

  /**
   * Internally send a message to the model (sets loading state, calls chat.send).
   * This is extracted so it can be called both by user input and by bg-task notifications.
   */
  const doSend = useCallback(
    (text: string, displayType: MessageType = "user") => {
      addMessage(displayType, text);
      setLoading(true);
      loadingRef.current = true;
      streamingIdRef.current = null;

      chatRef.current
        .send(text)
        .then(() => {
          streamingIdRef.current = null;
        })
        .catch((err) => {
          addMessage("error", String(err));
        })
        .finally(() => {
          setLoading(false);
          loadingRef.current = false;
          // After finishing a turn, check if any bg tasks completed while we were busy
          drainPendingNotifications();
        });
    },
    [addMessage] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /**
   * If the model is idle and there are pending completed bg tasks,
   * send a notification turn to the model so it can react.
   */
  const drainPendingNotifications = useCallback(() => {
    if (loadingRef.current) return;
    const pending = pendingNotifyRef.current.splice(0);
    if (pending.length === 0) return;

    const text = pending.map(formatBgTaskResult).join("\n\n");
    doSend(`[System] Background task(s) completed:\n${text}`, "system");
  }, [doSend]);

  useEffect(() => {
    const events = ctx.events;
    const onToolCall = (e: ToolCallEvent) => {
      // tool_call 出现时结束当前流式消息
      streamingIdRef.current = null;
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
    const onTextDelta = (e: { delta: string }) => {
      if (streamingIdRef.current === null) {
        // 创建新的 assistant 消息
        const id = nextId++;
        streamingIdRef.current = id;
        setMessages((prev) => [
          ...prev,
          { id, type: "assistant" as MessageType, text: e.delta, timestamp: new Date() },
        ]);
      } else {
        // 追加到已有的流式消息
        const sid = streamingIdRef.current;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === sid ? { ...msg, text: msg.text + e.delta } : msg
          )
        );
      }
    };

    const onBgTaskStarted = (e: BackgroundTaskEvent) => {
      setBackgroundTasks((prev) => [...prev, e.task]);
    };
    const onBgTaskComplete = (e: BackgroundTaskEvent) => {
      // Update the task in the bar
      setBackgroundTasks((prev) =>
        prev.map((t) => (t.taskId === e.task.taskId ? e.task : t))
      );

      // Auto-remove completed tasks from the bar after 5 seconds
      setTimeout(() => {
        setBackgroundTasks((prev) => prev.filter((t) => t.taskId !== e.task.taskId));
      }, 5000);

      // Notify the model about the completed task
      if (loadingRef.current) {
        // Model is busy — queue the notification for when the current turn ends
        pendingNotifyRef.current.push(e.task);
      } else {
        // Model is idle — send a notification turn immediately
        const text = formatBgTaskResult(e.task);
        doSend(`[System] Background task completed:\n${text}`, "system");
      }
    };

    events.on("tool_call", onToolCall);
    events.on("tool_result", onToolResult);
    events.on("compressed", onCompressed);
    events.on("text_delta", onTextDelta);
    events.on("background_task_started", onBgTaskStarted);
    events.on("background_task_complete", onBgTaskComplete);

    return () => {
      events.off("tool_call", onToolCall);
      events.off("tool_result", onToolResult);
      events.off("compressed", onCompressed);
      events.off("text_delta", onTextDelta);
      events.off("background_task_started", onBgTaskStarted);
      events.off("background_task_complete", onBgTaskComplete);
    };
  }, [ctx.events, addMessage, doSend]);

  const sendMessage = useCallback(
    (text: string) => {
      doSend(text, "user");
    },
    [doSend]
  );

  const newChat = useCallback(() => {
    chatRef.current = new Chat(ctx.client, ctx.systemPrompt, ctx.registry, {
      events: ctx.events,
      bgManager: ctx.bgManager,
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
    backgroundTasks,
    sendMessage,
    newChat,
    switchModel,
    addSystemMessage,
  };
}
