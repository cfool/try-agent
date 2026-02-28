---
title: Agent Skill
nav_order: 13
---

# 第 8 阶段：Agent Skill (技能)

**Branch:** `08-skills`

Tool 是单个动作——读文件、跑命令、发请求。但很多实际任务是一套**固定流程**，需要多个 Tool 配合、加上特定的 prompt 指引。Skill 就是把这套流程**打包成一个可复用的快捷操作**。

## Skill 的定义

一个 Skill = **Markdown 文件（YAML frontmatter + prompt 正文）**。

```
┌─────────────────────────────────────────────────────┐
│                   Agent Skill                        │
│                                                      │
│  YAML Frontmatter:                                   │
│    name / description / trigger                      │
│                                                      │
│  Markdown Body:                                      │
│    作为 prompt 模板注入主对话上下文                    │
│    指导 Agent 按步骤执行任务                          │
└─────────────────────────────────────────────────────┘
```

类比：Tool 是一把螺丝刀，Skill 是"宜家家具组装说明书"——告诉你先拧哪个螺丝、再装哪块板。与 Sub-Agent 不同的是，Skill **不会**派生独立的对话，而是将 prompt 注入**主 Agent 的上下文**中执行。

## Skill 与 Tool、Sub-Agent 的区别

| | Tool | Skill | Sub-Agent |
|:--|:-----|:------|:----------|
| **粒度** | 单个动作（读文件、执行命令） | 一套完整流程（prompt 驱动的多步操作） | 独立的子任务（有自己的对话上下文） |
| **触发** | LLM 在 Agent Loop 中自动选择 | 用户斜杠命令 **或** LLM 通过 SkillTool 调用 | LLM 通过 SubAgentTool 调用 |
| **执行方式** | 直接执行函数返回结果 | prompt 注入主对话上下文，由主 Agent 继续执行 | 派生独立 Chat 实例执行 |
| **定义方式** | TypeScript 代码实现 Tool 接口 | `.agent/skills/` 目录下的 Markdown 文件 | `.agent/agents/` 目录下的 Markdown 文件 |
| **复用方式** | 注册到 ToolRegistry | 注册到 SkillRegistry，按名称触发 | 注册到 SubAgentRegistry |

## 核心架构

系统由四个核心模块组成：

```
┌─────────────────────────────────────────────────────────────────┐
│                          Skill System                            │
│                                                                   │
│  ┌──────────────────┐   解析    ┌──────────────────┐             │
│  │  .agent/skills/   │ ───────→ │  SkillRegistry   │             │
│  │  *.md 文件        │          │  (技能注册中心)    │             │
│  └──────────────────┘          └───────┬──────────┘             │
│                                        │                         │
│                          ┌─────────────┼─────────────┐           │
│                          ▼                           ▼           │
│                 ┌─────────────────┐        ┌──────────────────┐  │
│                 │  用户斜杠命令    │        │  LLM SkillTool   │  │
│                 │  /<trigger>     │        │  skill("<name>") │  │
│                 └────────┬────────┘        └────────┬─────────┘  │
│                          │                          │             │
│                          ▼                          ▼             │
│                      ┌──────────────────────────────┐            │
│                      │        SkillLoader            │            │
│                      │  生成 XML prompt 注入主对话    │            │
│                      └──────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

### 模块职责

| 模块 | 文件 | 职责 |
|:-----|:-----|:-----|
| **SkillDefinition** | `src/skills/skill-types.ts` | 定义 Skill 数据结构，提供 `parseSkillFile()` 解析 Markdown 文件 |
| **SkillRegistry** | `src/skills/skill-registry.ts` | 技能注册中心：加载目录、按名称查找、触发匹配、生成系统提示词元数据 |
| **SkillLoader** | `src/skills/skill-loader.ts` | 构建 `<skill>` XML 格式的 prompt 注入字符串 |
| **SkillTool** | `src/tools/skill-tool.ts` | 实现 Tool 接口，让 LLM 可以通过工具调用触发 Skill |

## Skill 定义格式

每个 Skill 是一个 Markdown 文件，由 YAML frontmatter 和正文两部分组成。兼容 [Agent Skills 开放标准](https://agentskills.io/specification)。

### SkillDefinition 接口

```typescript
interface SkillDefinition {
  name: string;        // 唯一标识（默认取文件名）
  description: string; // 描述（展示在 /skills 列表和系统提示词中）
  trigger: string;     // 斜杠命令触发，如 "/my-skill"
  prompt: string;      // Markdown 正文作为 prompt 模板
  skillPath?: string;  // Skill 目录的绝对路径（目录布局时自动设置）
}
```

### frontmatter 字段说明

| 字段 | 必填 | 说明 |
|:-----|:-----|:-----|
| `name` | 否 | Skill 唯一标识，默认取文件名（不含 `.md`） |
| `description` | 否 | 描述信息，展示在 `/skills` 列表和 LLM 系统提示词中 |
| `trigger` | 否 | 用户触发的斜杠命令，默认 `/<name>`，自动补前缀 `/` |

### 示例文件

```markdown
---
name: commit
description: Generate a conventional commit message for staged changes
trigger: /commit
---

Analyze the staged changes and generate a commit message following the Conventional Commits specification.

The commit message should:
1. Start with a type: feat, fix, docs, style, refactor, test, or chore
2. Include a scope in parentheses if applicable
3. Have a concise subject line (max 50 chars)
4. Include a body if the change is complex

Example format:
```
type(scope): subject

body (optional)
```
```

## Skill 注册与加载

### 目录布局

SkillRegistry 从 `.agent/skills/` 目录加载，采用目录布局（符合 Agent Skills 开放标准）：

```
.agent/skills/
├── my-skill/            # 每个子目录包含一个 SKILL.md
│   └── SKILL.md
└── another-skill/
    └── SKILL.md
```

- **目录布局**：每个子目录包含一个 `SKILL.md` 文件，目录名作为默认 name
- 目录不存在时静默跳过，文件解析失败时 warn 并跳过

### 加载流程

```typescript
// 初始化：扫描目录并加载 Skill
const skillRegistry = new SkillRegistry();
await skillRegistry.loadFromDirectory();  // 默认扫描 .agent/skills/
const skillLoader = new SkillLoader();

// 也可以编程注册内置 Skill
skillRegistry.registerBuiltin({
  name: "custom",
  description: "内置 Skill 示例",
  trigger: "/custom",
  prompt: "...",
});
```

### 系统提示词注入

注册完成后，SkillRegistry 生成 XML 元数据注入系统提示词，让 LLM 知道有哪些可用 Skill：

```typescript
const skillMetadata = skillRegistry.generateMetadataXml();
// 输出格式：
// <available_skills>
//   <skill>
//     <name>skill-name</name>
//     <description>skill description</description>
//   </skill>
//   ...
// </available_skills>
```

所有已注册的 Skill 都会出现在元数据中。

## 两种触发方式

Skill 支持两种触发路径：**用户斜杠命令**和 **LLM 工具调用**。

### 路径一：用户斜杠命令触发

用户在聊天中直接输入斜杠命令（如 `/my-skill some-args`）：

```typescript
// 主循环中的匹配逻辑
const skillMatch = skillRegistry.match(input.trim());
if (skillMatch) {
  // skillLoader.load() 构建 XML prompt
  const injectedPrompt = skillLoader.load(skillMatch.skill, skillMatch.args);
  // 通过主 Chat 发送，LLM 读取 prompt 后按指示行动
  const reply = await chat.send(injectedPrompt);
}
```

匹配规则：
- 精确匹配 trigger（如 `/my-skill`）
- 或以 trigger + 空格开头（如 `/my-skill arg1`），空格后部分作为参数
- 多个 trigger 可能匹配时，**最长 trigger 优先**

### 路径二：LLM 通过 SkillTool 调用

SkillTool 实现了 Tool 接口，注册到 ToolRegistry 后，LLM 可以在 Agent Loop 中自主调用：

```typescript
// SkillTool 注册（当存在 Skill 时）
const skills = skillRegistry.list();
if (skills.length > 0) {
  registry.register(new SkillTool(skillRegistry, skillLoader));
}
```

LLM 调用时：

```json
{
  "tool": "skill",
  "parameters": {
    "skill_name": "my-skill",
    "task": "需要传递给 Skill 的上下文信息"
  }
}
```

SkillTool 内部同样通过 SkillLoader 构建 prompt，作为工具结果返回给 LLM，LLM 读取后继续执行。

### Prompt 注入格式

无论哪种触发方式，最终都由 SkillLoader 生成统一的 XML 格式注入：

```xml
<skill name="my-skill">
Skill 的 Markdown 正文内容（prompt 模板）...
</skill>
User arguments: 用户传入的参数
```

这段文本被送入主 Agent 的对话上下文，Agent 读取后按照 prompt 指示，调用工具逐步完成任务。

## 完整工作流

以用户输入 `/my-skill some-args` 为例：

```
用户输入：/my-skill some-args

  ┌──────────────────────────────────────────────────────────────┐
  │ 1. skillRegistry.match("/my-skill some-args")                │
  │    → 匹配到 my-skill，args = "some-args"                     │
  └─────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ 2. skillLoader.load(skill, "some-args")                      │
  │    → 生成 <skill name="my-skill">...</skill> XML prompt      │
  └─────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ 3. chat.send(injectedPrompt)                                 │
  │    → prompt 注入主对话，LLM 按指示逐步执行                     │
  └─────────────────────────┬────────────────────────────────────┘
                            │
                            ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ 4. Agent Loop：LLM 根据 prompt 指示调用工具完成任务            │
  │    → 多轮工具调用 → 返回最终结果                               │
  └──────────────────────────────────────────────────────────────┘
```

整个流程由 Skill 的 prompt 驱动，Agent Loop 负责执行。用户只需输入斜杠命令，剩下的全自动。

## 管理命令

在聊天中输入 `/skills` 可以查看所有已加载的 Skill 信息：

```
Registered Skills (2):

  /commit — commit
    Description: Generate a conventional commit message for staged changes

  /test — test-writer
    Description: Generate unit tests for the specified file
```

## Skill 的价值

| 场景 | 不用 Skill | 用 Skill |
|:-----|:----------|:---------|
| 重复性流程 | 用户每次手动描述每一步 | 一条斜杠命令一键搞定 |
| 领域知识 | 用户需要知道具体步骤和参数 | Skill 封装了专家经验，自动执行 |
| 团队协作 | 每个人的操作方式不一致 | 统一的 Skill 定义保证流程一致性 |

Skill 本质上是**把专家经验固化成 Markdown 文件**。一个好的 Skill 库，能让 Agent 从"什么都能做但需要你教"变成"常见任务一键搞定"。与 Sub-Agent 相比，Skill 更轻量——不派生新的对话，而是在主 Agent 上下文中直接执行。

> **Agent Skill = Markdown 定义的自动化流程。用 YAML frontmatter 声明元数据，用 Markdown 正文编写 prompt，通过斜杠命令或 LLM 工具调用触发，注入主对话上下文执行。**
