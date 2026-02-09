# 第 4.5 阶段：工程化完善 (Refinement)

> **导航**：首页 » 实战开发
>
> ⬅️ [上一章：Agent Loop](./04-agent-loop.md) | ➡️ [下一章：上下文管理](./05-context-management.md)

---

**Branch:** `04b-refine`

在完成了第四阶段的 Agent Loop 后，我们已经拥有了一个能自主运行的 Agent。但直接拿它来干活，你会发现它还像个\"刚出生的婴儿\"：对环境一无所知、干活笨手笨脚、说话（输出）也让人看不懂。

这一阶段，我们通过四个关键改进，把这个雏形打磨成一个真正可用的工具。

## 1. 完善工具箱：从 \"万能胶\" 到 \"手术刀\"

**改进前：**
我们只有一个 `run_shell_command` 工具。虽然它万能，但对 AI 来说门槛很高：
- 要查文件，它得写 `ls -la src/`；
- 要改代码，它得写复杂的 `sed` 命令或者 `echo '...' > file.ts`。
- 容易出错（转义问题、路径问题），且返回的 raw string 很难解析。

**改进后：**
引入了专门的文件系统工具：`read_file`, `write_file`, `edit_file`, `read_folder`。

- **`read_file`**：支持分页读取，避免大文件直接撑爆上下文。
- **`edit_file`**：通过 `old_string` -> `new_string` 的方式修改代码，比 `sed` 安全且符合 AI 的直觉。
- **`read_folder`**：返回结构化的 JSON 列表，包含文件大小和类型。

> **启示**：给 Agent 提供的工具越\"原子化\"、越\"结构化\"，Agent 运行的成功率就越高。

## 2. 注入上下文：给 Agent 戴上 \"扩增实境眼镜\"

**改进前：**
每次启动程序，Agent 都是\"失明\"的。如果你问\"帮我改下 index.ts\"，它得先调 `ls` 确认文件在不在，再调 `pwd` 确认自己在哪个目录。这白白浪费了 Token 和往返时间。

**改进后：**
我们在每轮对话启动前，自动采集项目信息并注入到 Prompt 中：
- **当前工作目录 (CWD)**
- **文件列表 (File List)**
- **当前时间 (Timestamp)**

```typescript
// src/chat.ts 中的 buildMessages 方法
private buildMessages(): Message[] {
  const projectContext = formatProjectContext(getProjectContext());
  return [
    { role: "user", parts: [{ text: projectContext }] },
    { role: "model", parts: [{ text: "Understood. I have the project context." }] },
    ...this.history,
  ];
}
```

现在，Agent 一落地就知道：\"我在 `/workspace/try_agent`，现在是下午 5 点，我手头有 `package.json` 和 `src/` 目录\"。

## 3. 体验优化：让 \"黑盒\" 变透明

**改进前：**
终端只是一直在跳 JSON。作为用户，你很难一眼看清 Agent 到底在调哪个工具、传了什么参数、结果是成功还是失败。

**改进后：**
我们重构了工具接口，引入了 `displayText` 和 `displayArgs`：

- **调用阶段**：不再显示 `{"command": "ls"}`，而是显示简洁的 `$ ls`。
- **结果阶段**：如果是读取文件，不再打印出带行号的几百行文本，而是显示 `Read src/index.ts (lines 1-20)`。

```typescript
// 工具返回结果包含两部分：给 AI 的数据，和给用户看的文本
export interface ToolExecuteResult {
  data: unknown;      // LLM 需要的结构化原始数据
  displayText?: string; // 用户在终端看到的友好提示
}
```

这让 Agent 的运行过程像一个真正的命令行工具一样丝滑。

## 4. 指令优化：从 \"聊天\" 到 \"工作\"

**改进前：**
我们使用了通用的系统提示词（如 `coding-mentor` 或 `personal-assistant`）。这些提示词虽然友好，但往往带有过多的开场白和废话（"Certainly! I can help you with that..."）。

**改进后：**
站在巨人的肩膀上进行开发，引入了专门为开发者工具设计的 `gemini-cli` 提示词。现在，Agent 明白它不是在陪你聊天，而是在帮你写代码、查日志、执行命令。
- **强制要求**：禁止废话，直接输出结果。
- **角色定位**：明确自己是一个交互式 CLI Agent。
- **思考链**：鼓励在调用工具前进行简短的推理。

---

通过这四步，我们完成了从 **"玩具 Agent"** 到 **"工程化 Agent"** 的跨越。它现在更聪明（有上下文）、更稳健（有专用工具）、更友好（有漂亮的 UI）、更高效（提示词精简）。

---

> **导航**：首页 » 实战开发
>
> ⬅️ [上一章：Agent Loop](./04-agent-loop.md) | ➡️ [下一章：上下文管理](./05-context-management.md)