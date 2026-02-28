import { Tool, ToolDefinition, ToolExecuteResult } from "./tool-registry.js";
import type { BackgroundTaskManager } from "../background-task-manager.js";

export class GetTaskOutput implements Tool {
  private bgManager: BackgroundTaskManager;

  definition: ToolDefinition = {
    name: "get_task_output",
    description:
      "Query the status and output of a background task started with run_shell_command(run_in_background=true). " +
      "Returns the task's current status, exit code, stdout, stderr, and elapsed time.",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "The background task ID (e.g. bg-a1b2c3d4)",
        },
      },
      required: ["task_id"],
    },
  };

  constructor(bgManager: BackgroundTaskManager) {
    this.bgManager = bgManager;
  }

  displayArgs(params: Record<string, unknown>): string {
    return `task: ${params.task_id}`;
  }

  execute(params: Record<string, unknown>): Promise<ToolExecuteResult> {
    const taskId = params.task_id as string;
    const task = this.bgManager.getTask(taskId);

    if (!task) {
      return Promise.resolve({
        data: { error: `Task "${taskId}" not found` },
        displayText: `Task "${taskId}" not found`,
      });
    }

    const now = Date.now();
    const elapsedSeconds = Math.round(
      ((task.completedAt ?? now) - task.startedAt) / 1000
    );

    const data = {
      taskId: task.taskId,
      command: task.command,
      status: task.status,
      exitCode: task.exitCode,
      stdout: task.stdout,
      stderr: task.stderr,
      elapsedSeconds,
    };

    const lines: string[] = [
      `Task ${task.taskId}: ${task.status} (${elapsedSeconds}s)`,
      `$ ${task.command}`,
    ];
    if (task.exitCode !== null) {
      lines.push(`Exit code: ${task.exitCode}`);
    }
    if (task.stdout) lines.push(task.stdout.trimEnd());
    if (task.stderr) lines.push(`stderr: ${task.stderr.trimEnd()}`);

    return Promise.resolve({
      data,
      displayText: lines.join("\n"),
    });
  }
}
