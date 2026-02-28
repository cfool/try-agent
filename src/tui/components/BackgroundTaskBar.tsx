import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { BackgroundTaskInfo } from "../../background-task-manager.js";

interface BackgroundTaskBarProps {
  tasks: BackgroundTaskInfo[];
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const MAX_CMD_LEN = 40;

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function formatTime(seconds: number): string {
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}m${seconds % 60}s`
    : `${seconds}s`;
}

const TaskSpinner: React.FC = () => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return <Text color="yellow">{SPINNER_FRAMES[frame]}</Text>;
};

const TaskRow: React.FC<{ task: BackgroundTaskInfo }> = ({ task }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (task.status === "running") {
      const start = task.startedAt;
      const update = () => setElapsed(Math.round((Date.now() - start) / 1000));
      update();
      const timer = setInterval(update, 1000);
      return () => clearInterval(timer);
    } else if (task.completedAt) {
      setElapsed(Math.round((task.completedAt - task.startedAt) / 1000));
    }
  }, [task.status, task.startedAt, task.completedAt]);

  const isRunning = task.status === "running";
  const statusColor = isRunning
    ? "yellow"
    : task.status === "completed"
      ? "green"
      : "red";

  const label = task.type === "sub_agent"
    ? `[Agent:${task.agentName}] ${task.description || ""}`
    : task.description || truncate(task.command, MAX_CMD_LEN);

  if (isRunning) {
    return (
      <Box gap={1}>
        <TaskSpinner />
        <Text color="cyan">{task.taskId}</Text>
        <Text>{label}</Text>
        <Text color="yellow">{formatTime(elapsed)}</Text>
      </Box>
    );
  }

  // Completed / failed / killed — show only result summary
  const resultTag =
    task.type === "sub_agent"
      ? task.status
      : task.status === "completed"
        ? `exit 0`
        : `exit ${task.exitCode ?? "?"}`;

  return (
    <Box gap={1}>
      <Text color={statusColor}>●</Text>
      <Text color="cyan">{task.taskId}</Text>
      <Text>{label}</Text>
      <Text color={statusColor}>[{task.status}]</Text>
      <Text dimColor>{resultTag}, {formatTime(elapsed)}</Text>
    </Box>
  );
};

export const BackgroundTaskBar: React.FC<BackgroundTaskBarProps> = ({ tasks }) => {
  if (tasks.length === 0) return null;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
    >
      <Text bold color="yellow">
        Background Tasks ({tasks.length})
      </Text>
      {tasks.map((task) => (
        <TaskRow key={task.taskId} task={task} />
      ))}
    </Box>
  );
};
