# 第 7 阶段：Sub-Agent 模式 (子智能体)

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

## 通信方式

主 Agent 和子 Agent 之间有两种典型的通信模式：

### 独立上下文（推荐）

每个子 Agent 有全新的、独立的对话历史。主 Agent 通过**任务描述**传递需求，子 Agent 通过**返回结果**交付成果。

```
主 Agent
  │
  ├── 启动子 Agent A（带任务描述）
  │     └── 子 Agent A 独立工作 → 返回结果
  │
  ├── 启动子 Agent B（带任务描述）
  │     └── 子 Agent B 独立工作 → 返回结果
  │
  └── 汇总 A、B 的结果 → 输出给用户
```

**优点**：上下文干净，子 Agent 之间互不影响，可以并发执行。

**缺点**：子 Agent 看不到主 Agent 的完整上下文，任务描述要写清楚。

### 共享上下文

子 Agent 可以读取主 Agent 的部分上下文（比如之前的对话摘要）。

```
主 Agent
  │
  ├── 启动子 Agent A（带任务描述 + 对话摘要）
  │     └── 子 Agent A 有更多背景信息 → 返回结果
  │
  └── ...
```

**优点**：子 Agent 有更多背景信息，理解能力更强。

**缺点**：上下文管理更复杂，可能引入噪声。

## 实现示意

一个简化的主 Agent 调度逻辑：

```typescript
async function orchestrate(task: string): Promise<string> {
  // 主 Agent 分析任务，决定如何拆分
  const plan = await mainAgent.analyze(task);

  // 并发启动子 Agent
  const results = await Promise.all(
    plan.subtasks.map((subtask) =>
      spawnSubAgent({
        type: subtask.agentType,    // "research" | "coding" | "testing"
        prompt: subtask.description,
        tools: subtask.tools,        // 每个子 Agent 有不同的工具集
      })
    )
  );

  // 主 Agent 汇总结果
  return mainAgent.summarize(results);
}
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
