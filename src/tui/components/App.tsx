import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, useApp } from "ink";
import { StatusBar } from "./StatusBar.js";
import { MessageList } from "./MessageList.js";
import { InputBox } from "./InputBox.js";
import { WelcomeBox } from "./WelcomeBox.js";
import { AgentsPanel } from "./AgentsPanel.js";
import { SkillsPanel } from "./SkillsPanel.js";
import { ModelsPanel } from "./ModelsPanel.js";
import { useChat } from "../use-chat.js";
import type { AppContext } from "../types.js";

interface AppProps {
  ctx: AppContext;
}

export const App: React.FC<AppProps> = ({ ctx }) => {
  const { messages, loading, modelName, sendMessage, newChat, switchModel, addSystemMessage } =
    useChat(ctx);
  const [input, setInput] = useState("");
  /** Which panel is currently open, or null for the normal input box */
  const [activePanel, setActivePanel] = useState<string | null>(null);
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
      name: "/model",
      description: "Select a model interactively",
      panel: "models",
      handler: () => {},
    });

    commands.register({
      name: "/agents",
      description: "List registered sub-agents",
      panel: "agents",
      handler: () => {},
    });

    commands.register({
      name: "/skills",
      description: "List registered skills",
      panel: "skills",
      handler: () => {},
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

      const result = ctx.commands.execute(text);
      if (result.matched) {
        if (result.panel) {
          setActivePanel(result.panel);
        }
        return;
      }

      sendMessage(text);
    },
    [ctx, sendMessage]
  );

  const handleClosePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

  // Render the active panel, or fall back to InputBox
  const renderMiddle = () => {
    switch (activePanel) {
      case "agents":
        return (
          <AgentsPanel
            agents={ctx.subAgentRegistry.list()}
            onClose={handleClosePanel}
          />
        );
      case "skills":
        return (
          <SkillsPanel
            skills={ctx.skillRegistry.list()}
            onClose={handleClosePanel}
          />
        );
      case "models":
        return (
          <ModelsPanel
            models={ctx.client.listModels()}
            onClose={handleClosePanel}
            onSelect={(modelName) => {
              actionsRef.current.switchModel(modelName);
              setActivePanel(null);
            }}
          />
        );
      default:
        return (
          <InputBox
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            disabled={loading}
            commands={ctx.commands}
          />
        );
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      <WelcomeBox />
      <MessageList messages={messages} />
      {renderMiddle()}
      <StatusBar modelName={modelName} loading={loading} />
    </Box>
  );
};
