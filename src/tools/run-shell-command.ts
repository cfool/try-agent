import { exec } from "node:child_process";
import { Tool, ToolDefinition, ToolExecuteResult } from "./tool-registry.js";
import type { BackgroundTaskManager } from "../background-task-manager.js";

export class RunShellCommand implements Tool {
  private timeoutMs: number;
  private maxBuffer: number;
  private bgManager?: BackgroundTaskManager;

  definition: ToolDefinition = {
    name: "run_shell_command",
    description:
      "Run a shell command on the user's machine and return stdout, stderr, and exit code. " +
      "Set run_in_background=true for long-running commands (builds, tests, servers) to execute " +
      "asynchronously while the conversation continues. Use get_task_output to check on background tasks.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
        description: {
          type: "string",
          description:
            "A short summary of what this command does or why it is being run, " +
            "displayed to the user for clarity (e.g. \"Install dependencies\", \"Run unit tests\").",
        },
        run_in_background: {
          type: "boolean",
          description:
            "If true, run the command as a background task and return immediately with a task ID. " +
            "Use this for long-running commands like builds, tests, or server starts.",
        },
      },
      required: ["command", "description"],
    },
  };

  constructor(options?: {
    timeoutMs?: number;
    maxBuffer?: number;
    bgManager?: BackgroundTaskManager;
  }) {
    this.timeoutMs = options?.timeoutMs ?? 10_000;
    this.maxBuffer = options?.maxBuffer ?? 1024 * 1024;
    this.bgManager = options?.bgManager;
  }

  displayArgs(params: Record<string, unknown>): string {
    const desc = params.description as string | undefined;
    return desc ? `${desc}  $ ${params.command}` : `$ ${params.command}`;
  }

  execute(params: Record<string, unknown>): Promise<ToolExecuteResult> {
    const command = params.command as string;
    const description = params.description as string | undefined;
    const runInBackground = params.run_in_background === true;

    if (runInBackground && this.bgManager) {
      const info = this.bgManager.startTask(command, description);
      const data = {
        taskId: info.taskId,
        status: "started" as const,
        command: info.command,
      };
      return Promise.resolve({
        data,
        displayText: `Background task started: ${info.taskId}\n$ ${command}`,
      });
    }

    return new Promise((resolve) => {
      exec(
        command,
        { timeout: this.timeoutMs, maxBuffer: this.maxBuffer },
        (error, stdout, stderr) => {
          const exitCode = error?.code ?? 0;
          const data = {
            exitCode,
            stdout: stdout.toString(),
            stderr: stderr.toString(),
          };

          const lines: string[] = [`$ ${command}  (exit code: ${exitCode})`];
          if (data.stdout) lines.push(data.stdout.trimEnd());
          if (data.stderr) lines.push(`stderr: ${data.stderr.trimEnd()}`);

          resolve({ data, displayText: lines.join("\n") });
        }
      );
    });
  }
}
