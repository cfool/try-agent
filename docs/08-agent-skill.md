# 第 8 阶段：Agent Skill (技能)

Tool 是单个动作——读文件、跑命令、发请求。但很多实际任务是一套**固定流程**，需要多个 Tool 配合、加上特定的 prompt 指引。Skill 就是把这套流程**打包成一个可复用的快捷操作**。

## Skill 的定义

一个 Skill = **预封装的 prompt + 工具组合 + 执行流程**。

```
┌─────────────────────────────────────────┐
│              Agent Skill                 │
│                                          │
│  Prompt 模板：指导 Agent 按步骤执行       │
│  工具列表：  这个 Skill 需要用到的工具     │
│  触发方式：  用户通过命令或关键词触发       │
└─────────────────────────────────────────┘
```

类比：Tool 是一把螺丝刀，Skill 是"宜家家具组装说明书"——告诉你先拧哪个螺丝、再装哪块板。

## Skill 与 Tool 的区别

| | Tool | Skill |
|:--|:-----|:-----|
| **粒度** | 单个动作（读文件、执行命令） | 一套完整流程（多个动作 + 决策逻辑） |
| **触发** | LLM 在 Agent Loop 中自动选择 | 用户显式触发（如 `/commit`）或 Agent 内部调用 |
| **包含内容** | 工具定义 + 执行函数 | prompt 模板 + 工具集 + 流程编排 |
| **复用方式** | 注册到 ToolRegistry | 注册到 SkillRegistry，按名称触发 |

## Skill 注册与触发

### 注册

每个 Skill 声明自己的名称、描述、触发方式：

```typescript
interface Skill {
  name: string;              // "commit"
  description: string;       // "生成并执行 Git commit"
  trigger: string;           // "/commit" — 用户触发命令
  prompt: string;            // 指导 Agent 执行的 prompt 模板
  tools: string[];           // 需要用到的工具列表
}

const commitSkill: Skill = {
  name: "commit",
  description: "分析代码变更，生成 commit message 并提交",
  trigger: "/commit",
  prompt: `你是一个 Git 提交助手。请按以下步骤操作：
1. 执行 git status 查看变更
2. 执行 git diff 查看具体改动
3. 根据改动内容生成简洁的 commit message
4. 执行 git add 和 git commit`,
  tools: ["run_shell_command"],
};
```

### 触发

当用户输入匹配到 Skill 的 trigger 时，Agent 加载对应的 prompt 和工具集：

```typescript
function handleUserInput(input: string, skills: Skill[]): void {
  // 检查是否匹配某个 Skill 的触发命令
  const matchedSkill = skills.find((s) => input.startsWith(s.trigger));

  if (matchedSkill) {
    // 把 Skill 的 prompt 注入 Agent，限定可用工具
    agent.executeWithSkill(matchedSkill);
  } else {
    // 普通对话，走正常 Agent Loop
    agent.chat(input);
  }
}
```

## 示例：/commit Skill 的工作流

```
用户输入：/commit

  ┌──────────────────────────────────────────────────────────┐
  │ Skill 激活：加载 commit prompt + 限定工具集                │
  └───────────────────────┬──────────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 第 1 步：git status                                      │
  │ → 发现 3 个文件改动                                       │
  └───────────────────────┬──────────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 第 2 步：git diff                                        │
  │ → 看到具体代码变更内容                                     │
  └───────────────────────┬──────────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 第 3 步：LLM 生成 commit message                          │
  │ → "feat: add user authentication with JWT"               │
  └───────────────────────┬──────────────────────────────────┘
                          │
                          ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 第 4 步：git add . && git commit -m "..."                 │
  │ → 提交完成 ✅                                             │
  └──────────────────────────────────────────────────────────┘
```

整个流程由 Skill 的 prompt 驱动，Agent Loop 负责执行。用户只需输入 `/commit`，剩下的全自动。

## Skill 的价值

| 场景 | 不用 Skill | 用 Skill |
|:-----|:----------|:---------|
| Git 提交 | 用户手动描述每一步 | `/commit` 一键搞定 |
| 代码审查 | "帮我看看这个 PR 有什么问题" | `/review-pr 123` 自动拉取、分析、输出 |
| 创建 PR | 手动描述要做的事 | `/pr` 自动生成标题、描述、推送 |

Skill 本质上是**把专家经验固化成自动化流程**。一个好的 Skill 库，能让 Agent 从"什么都能做但需要你教"变成"常见任务一键搞定"。

> **Agent Skill = 预封装的自动化流程。Tool 是单个动作，Skill 是一整套操作手册。**
