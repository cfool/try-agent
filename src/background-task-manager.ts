import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";

export type BackgroundTaskStatus = "running" | "completed" | "failed" | "killed";

export interface BackgroundTaskInfo {
  taskId: string;
  command: string;
  description?: string;
  status: BackgroundTaskStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  startedAt: number;
  completedAt: number | null;
}

interface BackgroundTaskEntry extends BackgroundTaskInfo {
  process: ChildProcess;
}

export interface BackgroundTaskManagerEventMap {
  task_started: [BackgroundTaskInfo];
  task_complete: [BackgroundTaskInfo];
}

export class BackgroundTaskManager extends EventEmitter<BackgroundTaskManagerEventMap> {
  private tasks = new Map<string, BackgroundTaskEntry>();

  private generateId(): string {
    return `bg-${randomBytes(4).toString("hex")}`;
  }

  startTask(command: string, description?: string): BackgroundTaskInfo {
    const taskId = this.generateId();
    const child = spawn("sh", ["-c", command], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const entry: BackgroundTaskEntry = {
      taskId,
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
    entry.process.kill("SIGTERM");
    return true;
  }

  killAll(): void {
    for (const entry of this.tasks.values()) {
      if (entry.status === "running") {
        entry.status = "killed";
        entry.process.kill("SIGTERM");
      }
    }
  }

  private toInfo(entry: BackgroundTaskEntry): BackgroundTaskInfo {
    return {
      taskId: entry.taskId,
      command: entry.command,
      description: entry.description,
      status: entry.status,
      exitCode: entry.exitCode,
      stdout: entry.stdout,
      stderr: entry.stderr,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt,
    };
  }
}
