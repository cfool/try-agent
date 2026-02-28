---
title: 工具系统
nav_order: 4
parent: 实战开发
---

# 第 3 阶段：给 AI 一双手 (Tools)

**Branch:** `03-tools`

## 问题发现

完成第二阶段后，AI 已经能记住对话了。但试着问它一些需要"动手"的问题：

```
你: 我当前目录下有哪些文件？
AI: 抱歉，我无法直接访问你的文件系统。不过你可以在终端运行 `ls -la` 来查看～

你: 今天深圳天气怎么样？
AI: 深圳今天晴，气温 25-32°C，适合户外活动！（纯属虚构）
```

**AI 只能"说"，不能"做"。**

问文件列表，它只能教你怎么查；问天气，它只能瞎编一个。因为 LLM 本质上只是一个"文字接龙机器"——它没有眼睛看不到你的屏幕，没有手碰不到你的键盘，更没有网络能力去查实时信息。

就像一个嘴很能说但手是摆设的人：道理讲得头头道，让他动手就傻眼。

## 解决方案

给 AI 一双"手"——**Tool Calling（工具调用）**。

我们告诉 AI："你有这些工具可以用"，然后 AI 就能在需要时说"我想调用 xxx 工具"，由我们的代码去真正执行。

这是从"聊天机器人"到"Agent"的质变。

## 工具注册表

建一个"工具箱"（`tool-registry.ts`），用标准格式描述每个工具——**这是给 AI 看的**：

```typescript
{
  name: "run_shell_command",
  description: "Run a shell command on the user's machine...",
  parameters: {
    command: { type: "string", description: "The shell command to execute" },
  },
  required: ["command"],
}
```

## 工具实现

`tools/run-shell-command.ts` 用 `child_process.exec` 执行命令：

```typescript
execute(params: Record<string, unknown>): Promise<unknown> {
  const command = params.command as string;
  return new Promise((resolve) => {
    exec(command, { timeout: this.timeoutMs }, (error, stdout, stderr) => {
      resolve({ exitCode: error?.code ?? 0, stdout, stderr });
    });
  });
}
```

## Function Calling 协议

把工具列表随请求发给 API 后，AI 的回复可能从文本变成**函数调用请求**：

```json
// 纯文本回复
{ "text": "你好！有什么可以帮你的？" }

// 工具调用请求
{ "functionCall": { "name": "run_shell_command", "args": { "command": "ls -la" } } }
```

**AI 没有真的执行命令**，它只是下达指令，代码负责跑腿。
