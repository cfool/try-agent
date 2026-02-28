# 第 11 阶段：后台任务管理 (Background Task)

> **导航**：首页 » 进阶架构
>
> ⬅️ [上一章：流式输出与并行工具调用](./10-streaming.md) | ➡️ [返回目录](../README.md)

---

**Branch:** `11-background-task`

到上一章为止，Agent 有两类耗时操作是同步阻塞的：

1. **Shell 命令**——模型调用 `run_shell_command` 后，整个对话挂起，直到命令执行完毕才能继续。跑个 `npm test` 要等 30 秒，启动一个 dev server 直接卡死。
2. **Sub-Agent 调用**——模型调用 `sub_agent` 后，子 Agent 可能需要多轮工具调用才能完成任务，主对话同样被阻塞。一个代码分析任务跑 2 分钟，用户只能干等。

这一章做一件事：**让耗时操作在后台执行，对话不中断**。

## 问题发现

| 场景 | 之前（同步执行） | 问题 |
|:-----|:---------------|:-----|
| `npm test` | 命令跑 30 秒，对话卡 30 秒 | 用户无法继续提问 |
| `npm run dev` | 启动 dev server，永远不返回 | 直接把 Agent 卡死 |
| Sub-Agent 分析代码 | 子 Agent 跑 2 分钟，对话卡 2 分钟 | 完全失去交互性 |
| 多个任务 | 只能一个一个串行跑 | 效率低，等待时间叠加 |

核心矛盾：**Shell 命令和 Sub-Agent 调用都可能运行很长时间，但对话不应该因此阻塞**。

## 解决方案

引入 `BackgroundTaskManager`——一个统一的异步任务管理器，支持两种后台任务：

1. **Shell 任务**：用 `child_process.spawn` 异步启动子进程，立刻返回 task ID（`bg-` 前缀）
2. **Sub-Agent 任务**：用 Promise 包裹子 Agent 的 `chat.send()` 调用，立刻返回 task ID（`sa-` 前缀）

```
场景 1：后台 Shell
之前：run_shell_command("npm test") → 等…… 等…… 等…… → 返回结果 → 对话继续
之后：run_shell_command("npm test", run_in_background=true) → 立刻返回 bg-a1b2c3d4 → 对话继续
      后台：npm test 在子进程中运行，完成后事件通知

场景 2：后台 Sub-Agent
之前：sub_agent("codebase-investigator", task) → 等子 Agent 多轮调用…… → 返回结果 → 对话继续
之后：sub_agent("codebase-investigator", task, run_in_background=true) → 立刻返回 sa-c3d4e5f6 → 对话继续
      后台：子 Agent 独立运行，完成后事件通知

两种任务都可以用 get_task_output 随时查看进度。
```

## 核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│ TUI Layer                                                       │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ BackgroundTask│  │   MessageList    │  │    StatusBar     │  │
│  │    Bar       │  │                  │  │ [2 bg tasks]     │  │
│  │ ⠋ bg-a1b2... │  │                  │  │                  │  │
│  │ ⠹ sa-c3d4... │  │                  │  │                  │  │
│  │ ● bg-e5f6... │  │                  │  │                  │  │
│  └──────┬───────┘  └──────────────────┘  └────────┬─────────┘  │
│         │                                          │            │
│         └────────── ChatEventBus ──────────────────┘            │
│                         ▲                                       │
└─────────────────────────┼───────────────────────────────────────┘
                          │ background_task_started
                          │ background_task_complete
                          │
┌─────────────────────────┼───────────────────────────────────────┐
│ Core Layer              │                                       │
│  ┌─────────────────────────────────────────┐                   │
│  │       BackgroundTaskManager             │                   │
│  │  ┌───────────┐ ┌───────────┐           │                   │
│  │  │ Shell Task│ │SubAgent   │ ...       │                   │
│  │  │ bg-xxxx   │ │Task       │           │                   │
│  │  │ (spawn)   │ │ sa-xxxx   │           │                   │
│  │  │           │ │ (Promise) │           │                   │
│  │  └─────┬─────┘ └─────┬─────┘           │                   │
│  │        │              │                 │                   │
│  │   child_process   chat.send()          │                   │
│  └────────┼──────────────┼─────────────────┘                   │
│           │              │                                     │
│  ┌────────┴────────┐ ┌──┴──────────────┐ ┌─────────────────┐  │
│  │ RunShellCommand │ │  SubAgentTool   │ │  GetTaskOutput  │  │
│  │(run_in_background│ │(run_in_background│ │ (查询任务状态)  │  │
│  │ = true)         │ │ = true)         │ │                 │  │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────┐                     │
│  │            Chat                      │                     │
│  │  pendingBgResults[]                  │                     │
│  │  drainPendingBackgroundResults()     │                     │
│  └──────────────────────────────────────┘                     │
└────────────────────────────────────────────────────────────────┘
```

五个模块各司其职：

| 模块 | 职责 |
|:-----|:-----|
| `BackgroundTaskManager` | 统一管理两种异步任务：Shell 子进程 + Sub-Agent Promise，发射生命周期事件 |
| `RunShellCommand` | Shell 工具入口：根据 `run_in_background` 决定同步还是异步执行 |
| `SubAgentTool` | Sub-Agent 工具入口：根据 `run_in_background` 决定同步还是异步执行 |
| `GetTaskOutput` | 查询工具：让模型主动查看后台任务的状态和输出（Shell / Sub-Agent 通用） |
| `Chat` | 结果注入：把已完成的后台任务结果塞进对话历史，让模型在下一轮看到 |

## 接口定义

后台任务的核心数据结构，通过 `type` 字段区分两种任务类型：

```typescript
// src/background-task-manager.ts

export type BackgroundTaskStatus = "running" | "completed" | "failed" | "killed";

export type BackgroundTaskType = "shell" | "sub_agent";

export interface BackgroundTaskInfo {
  taskId: string;              // 唯一标识：shell 用 bg-{hex}，sub_agent 用 sa-{hex}
  type: BackgroundTaskType;    // 任务类型
  command: string;             // shell: 执行的命令；sub_agent: "[SubAgent:name]"
  description?: string;        // 用户友好的描述
  status: BackgroundTaskStatus;
  exitCode: number | null;     // 仅 shell 任务使用
  stdout: string;              // 仅 shell 任务：实时累积的标准输出
  stderr: string;              // 仅 shell 任务：实时累积的错误输出
  startedAt: number;           // 启动时间戳
  completedAt: number | null;
  result?: string;             // 仅 sub_agent 任务：Agent 返回的结果文本
  agentName?: string;          // 仅 sub_agent 任务：Agent 名称
}

export interface BackgroundTaskManagerEventMap {
  task_started: [BackgroundTaskInfo];
  task_complete: [BackgroundTaskInfo];
}
```

与上一版只支持 Shell 的接口相比，关键变化是引入了 `type` 字段和 Sub-Agent 专属的 `result` / `agentName` 字段。同一套事件接口覆盖两种任务类型，下游消费者（Chat / TUI）通过 `type` 字段分别处理。

事件总线新增两个事件：

```typescript
// src/chat-events.ts

export interface BackgroundTaskEvent {
  task: BackgroundTaskInfo;
}

export interface ChatEventMap {
  // ... 已有事件
  background_task_started: [BackgroundTaskEvent];   // 新增
  background_task_complete: [BackgroundTaskEvent];   // 新增
}
```

## BackgroundTaskManager 实现

核心类继承 `EventEmitter`，内部用联合类型 `ShellTaskEntry | PromiseTaskEntry` 区分两种任务的内部状态：

```typescript
// src/background-task-manager.ts

// 内部类型：Shell 任务持有 ChildProcess 引用
interface ShellTaskEntry extends BackgroundTaskInfo {
  type: "shell";
  process: ChildProcess;
}

// 内部类型：Sub-Agent 任务不需要额外引用
interface PromiseTaskEntry extends BackgroundTaskInfo {
  type: "sub_agent";
}

type BackgroundTaskEntry = ShellTaskEntry | PromiseTaskEntry;
```

### startTask：Shell 后台任务

```typescript
export class BackgroundTaskManager extends EventEmitter<BackgroundTaskManagerEventMap> {
  private tasks = new Map<string, BackgroundTaskEntry>();

  startTask(command: string, description?: string): BackgroundTaskInfo {
    const taskId = this.generateShellId();  // bg-{randomBytes(4).hex}
    const child = spawn("sh", ["-c", command], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const entry: ShellTaskEntry = {
      taskId, type: "shell", command, description,
      status: "running",
      exitCode: null, stdout: "", stderr: "",
      startedAt: Date.now(), completedAt: null,
      process: child,
    };
    this.tasks.set(taskId, entry);

    // 实时捕获输出
    child.stdout?.on("data", (chunk: Buffer) => { entry.stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { entry.stderr += chunk.toString(); });

    // 进程结束 → 更新状态 + 发射事件
    child.on("close", (code) => {
      if (entry.status !== "killed") {
        entry.status = code === 0 ? "completed" : "failed";
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
```

### startPromiseTask：Sub-Agent 后台任务

```typescript
  /**
   * 启动一个 Promise 类型的后台任务（如子 Agent）。
   * resolve 的值作为 result 字段存储。
   */
  startPromiseTask(
    promise: Promise<string>,
    options: { agentName: string; description?: string }
  ): BackgroundTaskInfo {
    const taskId = this.generatePromiseId();  // sa-{randomBytes(4).hex}

    const entry: PromiseTaskEntry = {
      taskId, type: "sub_agent",
      command: `[SubAgent:${options.agentName}]`,
      description: options.description,
      agentName: options.agentName,
      status: "running",
      exitCode: null, stdout: "", stderr: "",
      startedAt: Date.now(), completedAt: null,
    };
    this.tasks.set(taskId, entry);

    // Promise 完成/失败 → 更新状态 + 发射事件
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
```

### killTask：区分类型的终止逻辑

```typescript
  killTask(taskId: string): boolean {
    const entry = this.tasks.get(taskId);
    if (!entry || entry.status !== "running") return false;
    entry.status = "killed";
    entry.completedAt = Date.now();
    if (entry.type === "shell") {
      entry.process.kill("SIGTERM");  // Shell 任务：发 SIGTERM
    }
    // Sub-Agent 任务：Promise 无法外部取消，只标记状态
    return true;
  }
```

### 两种任务的对比

| 维度 | Shell 任务 (`startTask`) | Sub-Agent 任务 (`startPromiseTask`) |
|:-----|:------------------------|:-----------------------------------|
| ID 前缀 | `bg-` | `sa-` |
| 底层机制 | `child_process.spawn` | `Promise<string>` |
| 输出捕获 | 实时 stdout/stderr 流 | 最终 result 文本 |
| 终止能力 | `SIGTERM` 杀进程 | 无法外部取消，仅标记状态 |
| 完成判定 | 进程 `close` 事件 + exit code | Promise resolve/reject |
| 典型场景 | `npm test`、`npm run dev` | 代码分析、文件搜索等复杂子任务 |

设计要点：

1. **统一的事件接口**：两种任务都通过 `task_started` / `task_complete` 事件通知，下游消费者不需要关心任务是如何执行的。
2. **`toInfo()` 隔离**：对外暴露的 `BackgroundTaskInfo` 不包含 `ChildProcess` 引用。内部通过联合类型 `ShellTaskEntry | PromiseTaskEntry` 持有内部状态，`toInfo()` 转换后再返回。
3. **状态机**：`running` → `completed` / `failed` / `killed`。Shell 任务的 `killTask` 先标记 `killed` 再发 `SIGTERM`，避免 `close` 事件里覆盖状态。

## 工具改造

### RunShellCommand：新增后台模式

工具定义新增两个参数：

```typescript
// src/tools/run-shell-command.ts

definition: ToolDefinition = {
  name: "run_shell_command",
  description: "Run a shell command... Set run_in_background=true for long-running commands...",
  parameters: {
    properties: {
      command: { type: "string", description: "The shell command to execute" },
      description: {                                     // 新增
        type: "string",
        description: "A short summary of what this command does...",
      },
      run_in_background: {                               // 新增
        type: "boolean",
        description: "If true, run as a background task and return immediately with a task ID.",
      },
    },
    required: ["command", "description"],
  },
};
```

执行逻辑分叉：

```typescript
execute(params: Record<string, unknown>): Promise<ToolExecuteResult> {
  const command = params.command as string;
  const description = params.description as string | undefined;
  const runInBackground = params.run_in_background === true;

  // 后台模式：交给 bgManager，立刻返回 task ID
  if (runInBackground && this.bgManager) {
    const info = this.bgManager.startTask(command, description);
    return Promise.resolve({
      data: { taskId: info.taskId, status: "started", command: info.command },
      displayText: `Background task started: ${info.taskId}\n$ ${command}`,
    });
  }

  // 同步模式：原有逻辑不变
  return new Promise((resolve) => {
    exec(command, { timeout: this.timeoutMs }, (error, stdout, stderr) => {
      // ...
    });
  });
}
```

关键区别：后台模式用 `spawn`（不等结束），同步模式用 `exec`（等结束）。模型可以根据命令特性自行选择——短命令同步执行，长命令或 server 类命令后台执行。

### SubAgentTool：新增后台模式

同样通过 `run_in_background` 参数控制：

```typescript
// src/tools/sub-agent-tool.ts

definition: ToolDefinition = {
  name: "sub_agent",
  description: "Delegate a task to a specialized sub-agent...",
  parameters: {
    properties: {
      agent_name: { type: "string", description: "The name of the sub-agent" },
      task: { type: "string", description: "Detailed task description..." },
      description: { type: "string", description: "Brief one-line summary..." },
      run_in_background: {                               // 新增
        type: "boolean",
        description: "If true, the sub-agent runs asynchronously in the background.",
      },
    },
    required: ["agent_name", "task", "description"],
  },
};
```

后台执行逻辑——创建独立 Chat 实例，包裹为 Promise 交给 `bgManager`：

```typescript
// 异步后台模式
if (runInBackground && this.bgManager) {
  // 1. 若指定了 model，临时切换
  let previousModel: string | undefined;
  if (agentDef.model) {
    previousModel = this.client.getActiveModel()?.name;
    this.client.use(agentDef.model);
  }

  // 2. 创建独立 Chat 实例（独立事件总线，子 Agent 的 tool_call 不会污染主 Agent）
  const subEvents = new ChatEventBus();
  const subChat = new Chat(this.client, agentDef.systemPrompt, subRegistry, {
    maxRounds: agentDef.maxTurns,
    events: subEvents,
  });

  // 3. 启动异步执行，完成后恢复 model
  const promise = subChat.send(task).finally(() => {
    if (previousModel) {
      try { this.client.use(previousModel); } catch { /* 忽略恢复失败 */ }
    }
  });

  // 4. 注册为后台 Promise 任务
  const taskInfo = this.bgManager.startPromiseTask(promise, {
    agentName: agentDef.name,
    description: description || (task.length > 80 ? task.slice(0, 80) + "..." : task),
  });

  // 5. 立刻返回 task ID
  return {
    data: { taskId: taskInfo.taskId, status: "started", agent: agentDef.name, description },
    displayText: `[SubAgent:${agentDef.name}] ${description} (background: ${taskInfo.taskId})`,
  };
}
```

关键设计：
- **独立事件总线**：`new ChatEventBus()` 确保子 Agent 内部的 `tool_call` / `tool_result` 事件不会发到主 Agent 的 TUI 上——否则用户会看到一堆混乱的工具调用日志。
- **Model 切换与恢复**：子 Agent 可能使用不同模型，`finally` 中恢复确保不影响主对话。
- **Promise 包裹**：`chat.send()` 返回 `Promise<string>`，天然适合 `startPromiseTask` 的接口。

### GetTaskOutput：统一查询两种任务

查询工具根据 `task.type` 返回不同格式的结果：

```typescript
// src/tools/get-task-output.ts

execute(params: Record<string, unknown>): Promise<ToolExecuteResult> {
  const taskId = params.task_id as string;
  const task = this.bgManager.getTask(taskId);

  if (!task) {
    return Promise.resolve({ data: { error: `Task "${taskId}" not found` }, /* ... */ });
  }

  const elapsedSeconds = Math.round(
    ((task.completedAt ?? Date.now()) - task.startedAt) / 1000
  );

  // Sub-Agent 任务：返回 agentName + result
  if (task.type === "sub_agent") {
    return Promise.resolve({
      data: { taskId, type: task.type, agentName: task.agentName,
              status: task.status, result: task.result, elapsedSeconds },
      displayText: `Task ${task.taskId}: ${task.status} (${elapsedSeconds}s)\nAgent: ${task.agentName}`,
    });
  }

  // Shell 任务：返回 command + stdout/stderr + exitCode
  return Promise.resolve({
    data: { taskId, command: task.command, status: task.status,
            exitCode: task.exitCode, stdout: task.stdout, stderr: task.stderr,
            elapsedSeconds },
    displayText: `Task ${task.taskId}: ${task.status} (${elapsedSeconds}s)\n$ ${task.command}`,
  });
}
```

模型可以在对话过程中随时调用 `get_task_output` 查看任意任务的进度，不用等任务完成。ID 的前缀（`bg-` / `sa-`）也让模型和用户一眼区分任务类型。

## Chat 层集成

后台任务完成后，结果需要注入对话历史，让模型在下一轮看到。`drainPendingBackgroundResults()` 根据 `task.type` 格式化不同的摘要：

```typescript
// src/chat.ts

export class Chat {
  private bgManager?: BackgroundTaskManager;
  private pendingBgResults: BackgroundTaskInfo[] = [];

  constructor(/* ... */, options: ChatOptions) {
    if (this.bgManager) {
      this.bgManager.on("task_complete", (info) => {
        this.pendingBgResults.push(info);
      });
    }
  }

  private drainPendingBackgroundResults(): void {
    if (this.pendingBgResults.length === 0) return;

    const results = this.pendingBgResults.splice(0);
    for (const task of results) {
      const elapsed = Math.round(
        ((task.completedAt ?? Date.now()) - task.startedAt) / 1000
      );

      const summary: string[] = [
        `[Background task ${task.taskId} ${task.status}]`,
      ];

      if (task.type === "sub_agent") {
        // Sub-Agent：展示 Agent 名称 + 返回结果
        summary.push(`Agent: ${task.agentName}`);
        summary.push(`Elapsed: ${elapsed}s`);
        if (task.result) summary.push(`Result:\n${task.result.trimEnd()}`);
      } else {
        // Shell：展示命令 + exit code + stdout/stderr
        summary.push(`$ ${task.command}`);
        summary.push(`Exit code: ${task.exitCode ?? "N/A"}`);
        summary.push(`Elapsed: ${elapsed}s`);
        if (task.stdout) summary.push(`stdout:\n${task.stdout.trimEnd()}`);
        if (task.stderr) summary.push(`stderr:\n${task.stderr.trimEnd()}`);
      }

      const text = summary.join("\n");
      this.history.push({
        role: "user",
        parts: [{ text: `[System] Background task completed:\n${text}` }],
      });
      this.history.push({
        role: "model",
        parts: [{ text: `Acknowledged background task ${task.taskId} result.` }],
      });
    }
  }

  async send(text: string): Promise<string> {
    // 发送前注入已完成的后台任务结果
    this.drainPendingBackgroundResults();
    // ... 压缩检测、追加用户消息

    for (let i = 0; i < this.maxRounds; i++) {
      // 每轮工具调用前也检查一次
      this.drainPendingBackgroundResults();
      // ... 流式调用模型
    }
  }
}
```

为什么要 drain 两次？第一次在 `send()` 开头——处理上一轮对话结束后完成的任务。第二次在每轮循环开头——处理工具执行期间完成的任务。这保证模型在每次调用前都能看到最新的后台任务结果。

## TUI 集成

### BackgroundTaskBar 组件

`BackgroundTaskBar` 组件在消息列表和输入框之间显示后台任务状态，根据任务类型显示不同的标签：

```tsx
// src/tui/components/BackgroundTaskBar.tsx

const TaskRow: React.FC<{ task: BackgroundTaskInfo }> = ({ task }) => {
  const [elapsed, setElapsed] = useState(0);

  // running 任务每秒更新计时
  useEffect(() => {
    if (task.status === "running") {
      const timer = setInterval(() => {
        setElapsed(Math.round((Date.now() - task.startedAt) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [task.status]);

  // label 根据类型不同：
  // sub_agent → "[Agent:name] description"
  // shell → description 或截断的 command
  const label = task.type === "sub_agent"
    ? `[Agent:${task.agentName}] ${task.description || ""}`
    : task.description || task.command;

  if (task.status === "running") {
    return (
      <Box gap={1}>
        <TaskSpinner />
        <Text color="cyan">{task.taskId}</Text>
        <Text>{label}</Text>
        <Text color="yellow">{formatTime(elapsed)}</Text>
      </Box>
    );
  }

  return (
    <Box gap={1}>
      <Text color={statusColor}>●</Text>
      <Text color="cyan">{task.taskId}</Text>
      <Text>{label}</Text>
      <Text color={statusColor}>[{task.status}]</Text>
      <Text dimColor>{formatTime(elapsed)}</Text>
    </Box>
  );
};
```

效果示意：

```
╭ Background Tasks (3) ─────────────────────────────────────────────╮
│ ⠹ bg-a1b2c3d4  Run unit tests                           12s      │
│ ⠋ sa-c3d4e5f6  [Agent:codebase-investigator] 分析依赖关系  8s     │
│ ● bg-e5f6a7b8  Install dependencies               [completed]    │
│                                                    exit 0, 5s     │
╰───────────────────────────────────────────────────────────────────╯
```

### StatusBar 扩展

状态栏新增后台任务计数显示：

```tsx
// src/tui/components/StatusBar.tsx

{(backgroundTaskCount ?? 0) > 0 && (
  <Text color="magenta">
    [{backgroundTaskCount} background task{backgroundTaskCount! > 1 ? "s" : ""}]
  </Text>
)}
```

效果：`deepseek  Working... 5s  [2 background tasks]`

### useChat Hook：事件处理与通知

`useChat` 新增后台任务的事件订阅和智能通知逻辑：

```typescript
// src/tui/use-chat.ts

const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTaskInfo[]>([]);
const pendingNotifyRef = useRef<BackgroundTaskInfo[]>([]);

// 任务启动 → 加入列表
const onBgTaskStarted = (e: BackgroundTaskEvent) => {
  setBackgroundTasks((prev) => [...prev, e.task]);
};

// 任务完成 → 更新状态 + 5秒后自动移除 + 通知模型
const onBgTaskComplete = (e: BackgroundTaskEvent) => {
  // 更新任务状态显示
  setBackgroundTasks((prev) =>
    prev.map((t) => (t.taskId === e.task.taskId ? e.task : t))
  );

  // 5 秒后从 bar 中移除
  setTimeout(() => {
    setBackgroundTasks((prev) => prev.filter((t) => t.taskId !== e.task.taskId));
  }, 5000);

  // 通知模型
  if (loadingRef.current) {
    // 模型正在工作 → 排队，等当前轮次结束后统一通知
    pendingNotifyRef.current.push(e.task);
  } else {
    // 模型空闲 → 立即发送系统消息触发新一轮对话
    const text = formatBgTaskResult(e.task);
    doSend(`[System] Background task completed:\n${text}`, "system");
  }
};
```

这里有个细节：**模型忙碌时不能直接发通知**（会导致并发调用 `chat.send()`）。所以用 `pendingNotifyRef` 队列缓存，等当前轮次结束后，在 `finally` 回调中统一 drain：

```typescript
const drainPendingNotifications = useCallback(() => {
  if (loadingRef.current) return;
  const pending = pendingNotifyRef.current.splice(0);
  if (pending.length === 0) return;
  const text = pending.map(formatBgTaskResult).join("\n\n");
  doSend(`[System] Background task(s) completed:\n${text}`, "system");
}, [doSend]);

// 在每轮对话结束时调用
.finally(() => {
  setLoading(false);
  loadingRef.current = false;
  drainPendingNotifications();
});
```

### 组件树变化

```
<App>
  <WelcomeBox />
  <MessageList />
  <BackgroundTaskBar />      ← 新增
  {renderMiddle()}
  <StatusBar />              ← 新增 backgroundTaskCount prop
</App>
```

## TUI 入口改造

`src/tui/index.tsx` 的初始化流程新增四部分：

```typescript
// 1. 创建 BackgroundTaskManager
const bgManager = new BackgroundTaskManager();

// 2. 注册工具时传入 bgManager
registry.register(new RunShellCommand({ timeoutMs: 30_000, bgManager }));
registry.register(new GetTaskOutput(bgManager));

// 3. SubAgentTool 也传入 bgManager
registry.register(new SubAgentTool(subAgentRegistry, registry, client, events, bgManager));

// 4. 桥接事件：bgManager → ChatEventBus
bgManager.on("task_started", (task) => {
  events.emit("background_task_started", { task });
});
bgManager.on("task_complete", (task) => {
  events.emit("background_task_complete", { task });
});

// 5. 退出时清理所有后台任务
const cleanup = () => { bgManager.killAll(); };
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
```

为什么需要事件桥接？`BackgroundTaskManager` 是纯逻辑模块，它的事件类型是 `task_started` / `task_complete`。TUI 层监听的是 `ChatEventBus` 的 `background_task_started` / `background_task_complete`。桥接让两套事件系统解耦——`BackgroundTaskManager` 不需要知道 `ChatEventBus` 的存在。

## 完整数据流

### 场景 1：后台 Shell 命令

```
用户: "帮我跑一下测试"
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│ LLM 决定调用 run_shell_command                            │
│   command: "npm test"                                     │
│   description: "Run unit tests"                          │
│   run_in_background: true                                │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│ RunShellCommand.execute()                                 │
│   → bgManager.startTask("npm test", "Run unit tests")    │
│   → 立刻返回 { taskId: "bg-a1b2c3d4", status: "started" }│
└──────────────────────┬───────────────────────────────────┘
                       │
    ┌──────────────────┼──────────────────────┐
    │                  │                      │
    ▼                  ▼                      ▼
 子进程运行         bgManager 事件          LLM 继续对话
 npm test          emit("task_started")    "测试已在后台启动"
    │                  │
    │ (30 秒后完成)     ▼
    │              TUI: ⠹ bg-a1b2c3d4
    ▼
 child.on("close", code=0)
    │
    ▼
 bgManager.emit("task_complete") → Chat.pendingBgResults.push()
                                 → TUI: ● [completed]
                                 → 下一轮 drain → LLM 看到结果
```

### 场景 2：后台 Sub-Agent

```
用户: "帮我分析一下项目的依赖关系"
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│ LLM 决定调用 sub_agent                                    │
│   agent_name: "codebase-investigator"                    │
│   task: "分析项目依赖关系..."                              │
│   run_in_background: true                                │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│ SubAgentTool.execute()                                    │
│   创建独立 ChatEventBus + Chat 实例                       │
│   promise = subChat.send(task)                           │
│   → bgManager.startPromiseTask(promise, { agentName })   │
│   → 立刻返回 { taskId: "sa-c3d4e5f6", status: "started" }│
└──────────────────────┬───────────────────────────────────┘
                       │
    ┌──────────────────┼──────────────────────┐
    │                  │                      │
    ▼                  ▼                      ▼
 子 Agent 运行      bgManager 事件          LLM 继续对话
 独立 Chat 实例    emit("task_started")    "分析任务已在后台启动"
 多轮工具调用...       │                    用户可以继续提问
    │                  ▼
    │              TUI: ⠋ sa-c3d4e5f6
    │
    │ (子 Agent 完成所有工具调用)
    ▼
 promise.resolve(result)
    │
    ▼
 bgManager.emit("task_complete") → Chat.pendingBgResults.push()
                                 → TUI: ● [completed]
                                 → 下一轮 drain → LLM 看到子 Agent 的分析结果
```

两种任务的完成通知路径完全一致——都经过 `task_complete` 事件 → `pendingBgResults` 队列 → `drainPendingBackgroundResults()` 注入历史。区别只在于注入时格式化的内容不同（Shell 展示 stdout/stderr，Sub-Agent 展示 result）。

## 目录结构变更

```
src/
├── background-task-manager.ts          ← 新增：后台任务管理器（Shell + Sub-Agent）
├── chat-events.ts                      ← 修改：新增 background_task_started/complete 事件
├── chat.ts                             ← 修改：pendingBgResults + drainPendingBackgroundResults（按 type 格式化）
├── tools/
│   ├── run-shell-command.ts            ← 修改：新增 run_in_background 和 description 参数
│   ├── sub-agent-tool.ts              ← 修改：新增 run_in_background 参数 + bgManager 集成
│   └── get-task-output.ts              ← 新增：查询后台任务状态（Shell / Sub-Agent 通用）
└── tui/
    ├── types.ts                        ← 修改：AppContext 新增 bgManager 字段
    ├── use-chat.ts                     ← 修改：后台任务事件订阅 + 智能通知
    ├── index.tsx                       ← 修改：初始化 bgManager + 事件桥接 + SubAgentTool 传入 bgManager
    └── components/
        ├── App.tsx                     ← 修改：引入 BackgroundTaskBar
        ├── BackgroundTaskBar.tsx       ← 新增：后台任务状态栏组件（区分 Shell / Sub-Agent 显示）
        └── StatusBar.tsx              ← 修改：显示后台任务计数
```

## 总结

```
之前：run_shell_command / sub_agent → 同步等待 → 对话阻塞
        ↓
问题：长命令卡死对话，子 Agent 分析任务卡死对话，server 类命令永远不返回
        ↓
解法：BackgroundTaskManager 统一管理两种异步任务
      Shell → spawn() 子进程，ID 前缀 bg-
      Sub-Agent → Promise 包裹 chat.send()，ID 前缀 sa-
      新工具 get_task_output → 随时查看任意任务进度
        ↓
之后：Shell 和 Sub-Agent 都能后台跑，对话不中断，结果自动注入历史
```

后台任务管理的核心是**统一抽象 + 事件驱动**。`BackgroundTaskManager` 通过两个方法（`startTask` / `startPromiseTask`）将 Shell 子进程和 Sub-Agent Promise 统一为同一套 `BackgroundTaskInfo` 接口和 `task_started` / `task_complete` 事件。下游消费者不需要关心任务是进程还是 Promise——**Chat 层**根据 `type` 字段格式化后注入对话历史，**TUI 层**根据 `type` 字段展示不同的标签和信息。通知机制区分模型忙碌/空闲状态避免并发问题，退出时 `killAll()` 确保不留孤儿进程。

> **后台任务 = 统一异步抽象（spawn + Promise）+ EventEmitter 生命周期通知 + 双层消费（Chat 注入历史 / TUI 实时展示）。Shell 和 Sub-Agent 共享同一条事件管道，对话不中断，结果自动汇合。从"干等任务"到"边聊边跑"，Agent 学会了真正的多任务并行。**

---

> **导航**：首页 » 进阶架构
>
> ⬅️ [上一章：流式输出与并行工具调用](./10-streaming.md) | ➡️ [返回目录](../README.md)
