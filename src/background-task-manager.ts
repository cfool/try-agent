import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";

export type BackgroundTaskStatus = "running" | "completed" | "failed" | "killed";

export type BackgroundTaskType = "shell" | "sub_agent";

export interface BackgroundTaskInfo {
  taskId: string;
  type: BackgroundTaskType;
  command: string;
  description?: string;
  status: BackgroundTaskStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: number;
  completedAt: number | null;
  /** sub_agent 任务的返回结果 */
  result?: string;
  /** sub_agent 名称（用于展示） */
  agentName?: string;
}

interface ShellTaskEntry extends BackgroundTaskInfo {
  type: "shell";
  process: ChildProcess;
}

interface PromiseTaskEntry extends BackgroundTaskInfo {
  type: "sub_agent";
}

type BackgroundTaskEntry = ShellTaskEntry | PromiseTaskEntry;

export interface BackgroundTaskManagerEventMap {
  task_started: [BackgroundTaskInfo];
  task_complete: [BackgroundTaskInfo];
}

export class BackgroundTaskManager extends EventEmitter<BackgroundTaskManagerEventMap> {
  private tasks = new Map<string, BackgroundTaskEntry>();

  private generateShellId(): string {
    return `bg-${randomBytes(4).toString("hex")}`;
  }

  private generatePromiseId(): string {
    return `sa-${randomBytes(4).toString("hex")}`;
  }

  startTask(command: string, description?: string): BackgroundTaskInfo {
    const taskId = this.generateShellId();
    const child = spawn("sh", ["-c", command], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const entry: ShellTaskEntry = {
      taskId,
      type: "shell",
      command,
      description,
      status: "running",
      exitCode: null,
      stdout: "",
      stderr: "",
      startedAt: Date.now(),
      completedAt: null,
      process: child,
    };

    this.tasks.set(taskId, entry);

    child.stdout?.on("data", (chunk: Buffer) => {
      entry.stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      entry.stderr += chunk.toString();
    });

    child.on("close", (code, signal) => {
      if (entry.status === "killed") {
        // Already marked as killed by killTask()
      } else if (code === 0) {
        entry.status = "completed";
      } else {
        entry.status = "failed";
      }
      entry.exitCode = code;
      entry.completedAt = Date.now();
      this.emit("task_complete", this.toInfo(entry));
    });

    child.on("error", (err) => {
      entry.status = "failed";
      entry.stderr += `\nProcess error: ${err.message}`;
      entry.completedAt = Date.now();
      this.emit("task_complete", this.toInfo(entry));
    });

    const info = this.toInfo(entry);
    this.emit("task_started", info);
    return info;
  }

  /**
   * 启动一个 Promise 类型的后台任务（如子 Agent）。
   * resolve 的值作为 result 字段存储。
   */
  startPromiseTask(
    promise: Promise<string>,
    options: { agentName: string; description?: string }
  ): BackgroundTaskInfo {
    const taskId = this.generatePromiseId();

    const entry: PromiseTaskEntry = {
      taskId,
      type: "sub_agent",
      command: `[SubAgent:${options.agentName}]`,
      description: options.description,
      agentName: options.agentName,
      status: "running",
      exitCode: null,
      stdout: "",
      stderr: "",
      startedAt: Date.now(),
      completedAt: null,
    };

    this.tasks.set(taskId, entry);

    promise
      .then((result) => {
        entry.status = "completed";
        entry.result = result;
        entry.completedAt = Date.now();
        this.emit("task_complete", this.toInfo(entry));
      })
      .catch((err) => {
        entry.status = "failed";
        entry.result = err instanceof Error ? err.message : String(err);
        entry.completedAt = Date.now();
        this.emit("task_complete", this.toInfo(entry));
      });

    const info = this.toInfo(entry);
    this.emit("task_started", info);
    return info;
  }

  getTask(taskId: string): BackgroundTaskInfo | undefined {
    const entry = this.tasks.get(taskId);
    return entry ? this.toInfo(entry) : undefined;
  }

  listTasks(): BackgroundTaskInfo[] {
    return Array.from(this.tasks.values()).map((e) => this.toInfo(e));
  }

  listRunning(): BackgroundTaskInfo[] {
    return Array.from(this.tasks.values())
      .filter((e) => e.status === "running")
      .map((e) => this.toInfo(e));
  }

  killTask(taskId: string): boolean {
    const entry = this.tasks.get(taskId);
    if (!entry || entry.status !== "running") return false;
    entry.status = "killed";
    entry.completedAt = Date.now();
    if (entry.type === "shell") {
      entry.process.kill("SIGTERM");
    }
    return true;
  }

  killAll(): void {
    for (const entry of this.tasks.values()) {
      if (entry.status === "running") {
        entry.status = "killed";
        entry.completedAt = Date.now();
        if (entry.type === "shell") {
          entry.process.kill("SIGTERM");
        }
      }
    }
  }

  private toInfo(entry: BackgroundTaskEntry): BackgroundTaskInfo {
    return {
      taskId: entry.taskId,
      type: entry.type,
      command: entry.command,
      description: entry.description,
      status: entry.status,
      exitCode: entry.exitCode,
      stdout: entry.stdout,
      stderr: entry.stderr,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt,
      result: entry.result,
      agentName: entry.agentName,
    };
  }
}
