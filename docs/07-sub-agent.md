---
title: Sub-Agent
nav_order: 12
---

# 第 7 阶段：Sub-Agent 模式 (子智能体)

**Branch:** `07-sub-agent`

一个 Agent 什么都干，就像让一个人同时写代码、做设计、跑测试、写文档——精力分散，上下文也被塞满无关信息。Sub-Agent 模式就是**分工协作**。

## 单 Agent 的瓶颈

当任务变复杂，单 Agent 会遇到两个问题：

| 问题 | 表现 |
|:-----|:-----|
| **上下文污染** | 搜索代码的中间结果、测试日志等占满上下文，影响后续决策 |
| **任务过杂** | Agent 需要在"写代码"和"搜索文档"之间反复切换，容易出错 |

本质上是**一个人干太多事，脑子不够用了**。

## Sub-Agent 架构

解法很直接——拆分任务，委派给专门的子 Agent：

```
用户："帮我调研 React 和 Vue 的优缺点，然后写一个技术选型报告"

                    ┌──────────────┐
                    │   主 Agent    │  ← 理解任务、拆分、汇总
                    │ (Orchestrator)│
                    └───────┬──────┘
                  ┌─────────┼─────────┐
                  ▼         ▼         ▼
           ┌───────────┐ ┌──────────┐ ┌──────────┐
           │调研 Agent  │ │调研 Agent│ │写作 Agent│
           │ (React)   │ │ (Vue)    │ │ (报告)   │
           └───────────┘ └──────────┘ └──────────┘
```

每个子 Agent：
- 有自己**独立的上下文**——互不干扰
- 有自己**专属的工具集**——搜索 Agent 有搜索工具，写作 Agent 有文件工具
- 做完后**只返回结果**——不带过程中的废料

## 核心架构

系统由三个核心模块组成：

```
┌─────────────────────────────────────────────────────────────────┐
│                        Sub-Agent System                          │
│                                                                   │
│  ┌──────────────────┐   解析    ┌──────────────────┐             │
│  │  .agent/agents/   │ ───────→ │  SubAgentRegistry │             │
│  │  *.md 文件        │          │  (子Agent注册中心) │             │
│  └──────────────────┘          └───────┬──────────┘             │
│                                        │                         │
│                                        ▼                         │
│                              ┌──────────────────┐                │
│                              │   SubAgentTool   │                │
│                              │  (LLM可调用工具)  │                │
│                              └──────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

### 模块职责

| 模块 | 文件 | 职责 |
|:-----|:-----|:-----|
| **SubAgentDefinition** | `src/subagents/sub-agent-types.ts` | 定义 SubAgent 数据结构，提供 `parseSubAgentFile()` 解析 Markdown 文件 |
| **SubAgentRegistry** | `src/subagents/sub-agent-registry.ts` | 子 Agent 注册中心：加载目录、按名称查找、内置 Agent 注册 |
| **SubAgentTool** | `src/tools/sub-agent-tool.ts` | 实现 Tool 接口，让 LLM 可以通过工具调用委派任务给子 Agent |

## SubAgent 定义格式

每个 SubAgent 是一个 Markdown 文件，由 YAML frontmatter 和正文两部分组成：

### SubAgentDefinition 接口

```typescript
interface SubAgentDefinition {
  name: string;         // 唯一标识（默认取文件名）
  description: string;  // 描述（用于 LLM 决策选择子 Agent）
  systemPrompt: string; // Markdown 正文作为子 Agent 的系统提示词
  tools?: string[];     // 允许的工具名列表（不设则继承全部）
  model?: string;       // 模型 provider 覆盖（如 "deepseek"）
  maxTurns?: number;    // 最大工具调用轮数
}
```

### frontmatter 字段说明

| 字段 | 必填 | 说明 |
|:-----|:-----|:-----|
| `name` | 否 | SubAgent 唯一标识，默认取文件名（不含 `.md`） |
| `description` | 否 | 描述信息，用于 LLM 决策时选择合适的子 Agent |
| `tools` | 否 | 工具白名单（逗号分隔），不设则继承主 Agent 的全部工具 |
| `model` | 否 | 覆盖默认模型 provider（如 "deepseek"） |
| `maxTurns` | 否 | 限制最大工具调用轮数 |

### 示例文件

```markdown
---
name: code-reviewer
description: Reviews code for quality, bugs, security issues, and best practices
tools: read_file, read_folder, run_shell_command
model: deepseek
maxTurns: 15
---

You are a code reviewer specialized in identifying:
- Security vulnerabilities
- Performance issues
- Code style violations
- Missing error handling

When reviewing code, provide actionable feedback with specific line numbers...
```

## SubAgent 注册与加载

### 目录布局

SubAgent 从 `.agent/agents/` 目录加载，支持扁平布局：

```
.agent/agents/
├── code-reviewer.md
├── test-writer.md
└── doc-writer.md
```

文件名（去掉 `.md`）作为默认 name。

### 加载流程

```typescript
// 初始化：创建注册中心
const subAgentRegistry = new SubAgentRegistry();

// 注册内置 Agent（编程方式）
subAgentRegistry.registerBuiltin(createCodebaseInvestigator());

// 加载用户定义的 Agent（从目录）
await subAgentRegistry.loadFromDirectory();  // 默认扫描 .agent/agents/
```

### 内置 SubAgent

系统内置了一个 `codebase_investigator` 子 Agent，专门用于代码库分析、架构映射和理解系统级依赖关系：

```typescript
// src/subagents/codebase-investigator.ts
export function createCodebaseInvestigator(): SubAgentDefinition {
  return {
    name: "codebase_investigator",
    description:
      "The specialized tool for codebase analysis, architectural mapping, " +
      "and understanding system-wide dependencies...",
    tools: ["read_file", "read_folder", "run_shell_command"],
    maxTurns: 20,
    systemPrompt: CODEBASE_INVESTIGATOR_SYSTEM_PROMPT,
  };
}
```

## LLM 调用 SubAgent

主 Agent 通过 `SubAgentTool` 委派任务给子 Agent：

### 工具定义

```json
{
  "name": "sub_agent",
  "description": "Delegate a task to a specialized sub-agent. Available agents:\n- codebase_investigator: ...",
  "parameters": {
    "agent_name": {
      "type": "string",
      "enum": ["codebase_investigator", "code-reviewer", ...]
    },
    "task": {
      "type": "string",
      "description": "A detailed description of the task..."
    }
  }
}
```

### 调用示例

```json
{
  "tool": "sub_agent",
  "parameters": {
    "agent_name": "codebase_investigator",
    "task": "Analyze the authentication flow in this codebase"
  }
}
```

### 执行流程

```
LLM 调用 sub_agent 工具
    │
    ▼
┌──────────────────────────────────────────────────┐
│ 1. 根据 agent_name 查找 SubAgentDefinition       │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│ 2. 构建受限 ToolRegistry                          │
│    - 排除 sub_agent 工具（防止递归）               │
│    - 若有工具白名单，仅注册白名单中的工具           │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│ 3. 若指定 model，临时切换 provider                 │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│ 4. 创建新 Chat 实例（独立上下文）                  │
│    - systemPrompt = 子 Agent 的系统提示词          │
│    - maxRounds = maxTurns                        │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│ 5. subChat.send(task) 执行任务                    │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│ 6. 恢复之前的 provider（如有切换）                 │
│ 7. 返回结果给主 Agent                             │
└──────────────────────────────────────────────────┘
```

## 管理命令

在聊天中输入 `/agents` 可以查看所有已注册的子 Agent 信息：

```
📋 Registered Sub-Agents (2):

  • codebase_investigator
    Description: The specialized tool for codebase analysis...
    Tools: read_file, read_folder, run_shell_command
    Model: default | Max Turns: 20

  • code-reviewer
    Description: Reviews code for quality...
    Tools: read_file, read_folder, run_shell_command
    Model: deepseek | Max Turns: 15
```

## 协作流程图

```
用户请求
    │
    ▼
┌──────────────┐
│   主 Agent    │
│  分析 & 拆分  │
└──────┬───────┘
       │
  ┌────┼────┐
  ▼    ▼    ▼
 子A  子B  子C    ← 并发执行，各自独立
  │    │    │
  └────┼────┘
       │
       ▼
┌──────────────┐
│   主 Agent    │
│  汇总 & 输出  │
└──────────────┘
       │
       ▼
  返回给用户 ✅
```

> **Sub-Agent = 团队协作模式。主 Agent 是 Tech Lead，子 Agent 是专才工程师。各干各的，最后汇总。**
