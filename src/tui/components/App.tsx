import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, useApp } from "ink";
import { StatusBar } from "./StatusBar.js";
import { MessageList } from "./MessageList.js";
import { InputBox } from "./InputBox.js";
import { useChat } from "../use-chat.js";
import type { AppContext } from "../types.js";

interface AppProps {
  ctx: AppContext;
}

export const App: React.FC<AppProps> = ({ ctx }) => {
  const { messages, loading, modelName, sendMessage, newChat, switchModel, addSystemMessage } =
    useChat(ctx);
  const [input, setInput] = useState("");
  const app = useApp();

  // Ref that always holds the latest callbacks, read at invocation time by handlers
  const actionsRef = useRef({ sendMessage, newChat, switchModel, addSystemMessage });
  actionsRef.current = { sendMessage, newChat, switchModel, addSystemMessage };

  // Register built-in commands once on mount
  useEffect(() => {
    const { commands } = ctx;

    commands.register({
      name: "/exit",
      description: "Quit the application",
      handler: () => { ctx.mcpManager.close().then(() => app.exit()); },
    });

    commands.register({
      name: "/new",
      description: "Start a new chat",
      handler: () => actionsRef.current.newChat(),
    });

    commands.register({
      name: "/use",
      description: "Switch model — /use <model>",
      hasArg: true,
      handler: (args) => {
        if (!args) {
          actionsRef.current.addSystemMessage("Usage: /use <model>");
          return;
        }
        actionsRef.current.switchModel(args);
      },
    });

    commands.register({
      name: "/agents",
      description: "List registered sub-agents",
      handler: () => {
        const agents = ctx.subAgentRegistry.list();
        if (agents.length === 0) {
          actionsRef.current.addSystemMessage("No sub-agents registered.");
        } else {
          const lines = agents.map((a) => `  ${a.name} — ${a.description}`);
          actionsRef.current.addSystemMessage(
            `Registered Sub-Agents (${agents.length}):\n${lines.join("\n")}`
          );
        }
      },
    });

    commands.register({
      name: "/skills",
      description: "List registered skills",
      handler: () => {
        const skills = ctx.skillRegistry.list();
        if (skills.length === 0) {
          actionsRef.current.addSystemMessage("No skills registered.");
        } else {
          const lines = skills.map(
            (s) => `  ${s.trigger} — ${s.name}: ${s.description}`
          );
          actionsRef.current.addSystemMessage(
            `Registered Skills (${skills.length}):\n${lines.join("\n")}`
          );
        }
      },
    });

    // Register skill triggers as slash commands
    for (const skill of ctx.skillRegistry.list()) {
      commands.register({
        name: skill.trigger,
        description: `${skill.name}: ${skill.description}`,
        handler: (args) => {
          const injectedPrompt = ctx.skillLoader.load(skill, args);
          actionsRef.current.sendMessage(injectedPrompt);
        },
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = useCallback(
    (value: string) => {
      const text = value.trim();
      if (!text) return;

      setInput("");

      if (ctx.commands.execute(text)) return;

      sendMessage(text);
    },
    [ctx, sendMessage]
  );

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar modelName={modelName} loading={loading} />
      <MessageList messages={messages} />
      <InputBox
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        disabled={loading}
        commands={ctx.commands}
      />
    </Box>
  );
};
