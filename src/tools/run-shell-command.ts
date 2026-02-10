import { exec } from "node:child_process";
import { Tool, ToolDefinition, ToolExecuteResult } from "../tool-registry.js";

export class RunShellCommand implements Tool {
  private timeoutMs: number;
  private maxBuffer: number;

  definition: ToolDefinition = {
    name: "run_shell_command",
    description:
      "Run a shell command on the user's machine and return stdout, stderr, and exit code.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
      },
      required: ["command"],
    },
  };

  constructor(options?: { timeoutMs?: number; maxBuffer?: number }) {
    this.timeoutMs = options?.timeoutMs ?? 10_000;
    this.maxBuffer = options?.maxBuffer ?? 1024 * 1024;
  }

  displayArgs(params: Record<string, unknown>): string {
    return `$ ${params.command}`;
  }

  execute(params: Record<string, unknown>): Promise<ToolExecuteResult> {
    const command = params.command as string;

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
