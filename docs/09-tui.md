# 第 9 阶段：TUI 交互界面 (Terminal UI)

> **导航**：首页 » 进阶架构
>
> ⬅️ [上一章：Agent Skill](./08-agent-skill.md) | ➡️ [下一章：流式输出](./10-streaming.md)

---

**Branch:** `09-tui`

到目前为止，Agent 的所有交互都通过 `readline` + `console.log` 完成——能用，但体验粗糙。工具调用和结果混在一起打印，看不出谁是谁；没有斜杠命令补全，输错了只能重新打；界面也没有状态提示，不知道 Agent 在想还是卡住了。

这一章用 **Ink**（React for CLI）给 Agent 套上一个真正的终端 UI。

## 为什么需要 TUI

| 问题 | readline 时代 | TUI 之后 |
|:-----|:-------------|:---------|
| **消息可读性** | 所有输出混在一起，user/AI/tool 分不清 | 按角色着色：用户绿色、AI 蓝色、工具洋红、错误红色 |
| **AI 回复格式** | 纯文本输出，代码没高亮，表格就是竖线 | Markdown 渲染：语法高亮、标题层级、表格边框、行内格式 |
| **工具调用展示** | 一行 `[Tool Call]` 日志，调用和结果混在一起 | 专用卡片：配对展示、diff 对比、状态颜色区分 |
| **斜杠命令** | 手动 if-else 匹配，没有补全 | 输入 `/` 弹出候选列表，Tab 补全 |
| **加载状态** | 没有反馈，不知道在等什么 | 状态栏显示 "Working..." + 已用时间，输入框自动禁用 |
| **新手引导** | 没有任何提示 | 欢迎页展示项目名称、功能概述、使用提示 |
| **代码解耦** | Chat 类直接 console.log，UI 和逻辑混在一起 | 事件总线解耦，Chat 只管发事件，UI 层订阅渲染 |

## 核心思路：事件驱动

之前 `Chat` 类在工具调用时直接 `console.log` 输出信息。这对 readline 够用，但 TUI 需要精确控制渲染——你不能在 React 组件树外面随便 `console.log`，否则画面会乱掉。

解法：引入 **ChatEventBus**，把"发生了什么"和"怎么展示"彻底分开。

```
之前：Chat → console.log → 终端

之后：Chat → EventBus → TUI 订阅 → React 渲染
```

Chat 类不再关心 UI 怎么显示，只管 emit 事件。TUI 层订阅事件后，把信息转换成消息列表交给 React 渲染。

## 事件总线

事件总线继承自 Node.js 的 `EventEmitter`，加上 TypeScript 类型约束：

```typescript
// src/chat-events.ts
import { EventEmitter } from "node:events";

export interface ToolCallEvent {
  name: string;
  args: string;
  rawArgs?: Record<string, unknown>;
}

export interface ToolResultEvent {
  name: string;
  output: string;
  isError: boolean;
}

export interface CompressedEvent {
  from: number;
  to: number;
}

export interface ChatEventMap {
  tool_call: [ToolCallEvent];
  tool_result: [ToolResultEvent];
  compressed: [CompressedEvent];
}

export class ChatEventBus extends EventEmitter<ChatEventMap> {}
```

三种事件覆盖了 Agent 运行时用户需要看到的所有"后台动态"：

| 事件 | 触发时机 | 携带数据 |
|:-----|:--------|:---------|
| `tool_call` | LLM 决定调用工具 | 工具名 + 参数 + 原始参数 |
| `tool_result` | 工具执行完毕 | 工具名 + 输出 + 是否出错 |
| `compressed` | 上下文压缩完成 | 压缩前后的 token 数 |

在 `Chat` 类中，原来的 `console.log` 替换为事件发射（`events` 是必需参数，不是可选的）：

```typescript
// src/chat.ts — 工具调用时
this.events.emit("tool_call", {
  name,
  args: displayArgs,
  rawArgs: args as Record<string, unknown>,
});
```

## TUI 组件架构

TUI 用 Ink（React for CLI）构建，组件树如下：

```
<App>                          ← 根组件：注册命令，路由输入
  <WelcomeBox />               ← 顶部：项目名称 + 功能简介 + 使用提示
  <MessageList>                ← 中间：消息列表（最近 50 条）
    <Message />                ←   普通消息：按角色着色
    <ToolCallBox />            ←   工具调用：专用卡片式展示
    ...
  </MessageList>
  <InputBox />                 ← 输入框：文本输入 + 斜杠命令补全
  <StatusBar />                ← 底部：当前模型名 + 加载状态 + 计时
</App>
```

与之前相比，布局做了三处调整：顶部增加了 `WelcomeBox` 欢迎页，工具调用从普通消息升级为专用的 `ToolCallBox` 卡片，`StatusBar` 移到底部更符合终端习惯。

### 欢迎页

启动后第一眼看到的是 `WelcomeBox`——一个圆角边框卡片，显示项目名称、功能概述和使用提示：

```tsx
// src/tui/components/WelcomeBox.tsx
export const WelcomeBox: React.FC = () => (
  <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
    <Text bold color="cyan">Try Agent — AI 命令行智能体</Text>
    <Text> </Text>
    <Text>
      一个可运行的 AI Agent，支持多模型切换、工具调用、MCP 协议、Sub-Agent 协作与 Skill 扩展。
    </Text>
    <Text> </Text>
    <Text dimColor>输入消息开始对话，输入 / 查看可用命令</Text>
  </Box>
);
```

目的很简单：让新用户一打开就知道这是什么、能干什么、怎么开始。

### 消息类型

TUI 内部用 `DisplayMessage` 表示每条消息。相比纯文本时代，新增了 `toolCall` 和 `toolResult` 结构化字段，用于驱动 `ToolCallBox` 的渲染：

```typescript
interface DisplayMessage {
  id: number;
  type: MessageType;  // "user" | "assistant" | "tool_call" | "tool_result" | "error" | "system"
  text: string;
  timestamp: Date;
  toolCall?: ToolCallData;    // 工具调用的结构化数据
  toolResult?: ToolResultData; // 工具结果的结构化数据
}

interface ToolCallData {
  toolName: string;
  args: string;
  rawArgs?: Record<string, unknown>; // 原始参数，用于 diff 展示等
}

interface ToolResultData {
  toolName: string;
  output: string;
  isError: boolean;
}
```

### Message 组件

`Message` 根据 `type` 分支渲染不同样式。关键变化：**assistant 消息不再直接输出纯文本，而是通过 `MarkdownDisplay` 组件渲染富文本**（后面详细介绍）：

```tsx
// src/tui/components/Message.tsx
export const Message: React.FC<MessageProps> = ({ message, isPending = false }) => {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns ?? 80;

  switch (message.type) {
    case "user":
      return (
        <Box>
          <Text bold color="green">{"> "}</Text>
          <Text backgroundColor="#333333">{message.text}</Text>
        </Box>
      );
    case "assistant":
      return (
        <Box flexDirection="row">
          <Text bold color="blue">{"● "}</Text>
          <Box flexDirection="column">
            <MarkdownDisplay
              text={message.text}
              isPending={isPending}
              terminalWidth={terminalWidth - 2}
            />
          </Box>
        </Box>
      );
    // ... tool_call, error, system 等
  }
};
```

## 工具调用可视化：ToolCallBox

之前工具调用只是一行 `[Tool Call] read_file({...})` 的纯文本。现在升级为专用的 `ToolCallBox` 卡片组件，提供三个维度的增强：

### 1. 调用与结果配对

`MessageList` 在渲染时，会把相邻的 `tool_call` 和 `tool_result` 消息自动配对，合并为一个 `ToolCallBox`：

```tsx
// src/tui/components/MessageList.tsx
if (msg.type === "tool_call" && msg.toolCall) {
  const next = visible[i + 1];
  if (next && (next.type === "tool_result" || next.type === "error") && next.toolResult) {
    elements.push(<ToolCallBox toolCall={msg.toolCall} toolResult={next.toolResult} />);
    i += 2; // 跳过已配对的 result
    continue;
  }
  // 结果还没到，先显示调用中的状态
  elements.push(<ToolCallBox toolCall={msg.toolCall} />);
}
```

### 2. 工具名称智能展示

不同工具有专属的标题格式，比纯粹打印函数名更直观：

```typescript
function getTitle(toolCall: ToolCallData): string {
  switch (toolCall.toolName) {
    case "replace":          return `Edit  ${filePath}`;
    case "run_shell_command": return `Shell  $ ${cmd}`;
    case "read_file":        return `ReadFile  ${filePath}`;
    case "write_file":       return `WriteFile  ${filePath}`;
    case "read_folder":      return `ReadFolder  ${folderPath}`;
    default:                 return `${toolName}  ${args}`;
  }
}
```

### 3. 边框颜色区分状态

一眼就能看出工具执行的状态：

| 状态 | 边框颜色 |
|:-----|:---------|
| Shell 命令 | 黄色 |
| 正常工具调用 | 青色 |
| 执行出错 | 红色 |

对于 `replace`（编辑文件）工具，还会渲染类似 `git diff` 的红绿对比，直观展示修改内容：

```tsx
function renderDiff(rawArgs: Record<string, unknown>): React.ReactNode {
  const oldStr = String(rawArgs.old_string ?? "");
  const newStr = String(rawArgs.new_string ?? "");
  // 旧内容红色 - 开头，新内容绿色 + 开头
  for (const line of oldStr.split("\n")) {
    lines.push(<Text color="red">{"- "}{line}</Text>);
  }
  for (const line of newStr.split("\n")) {
    lines.push(<Text color="green">{"+ "}{line}</Text>);
  }
}
```

最终效果：

```
╭ Edit  src/index.ts ──────────────────────╮
│ - const name = "old";                     │
│ + const name = "new";                     │
│                                           │
│ Applied successfully                      │
╰───────────────────────────────────────────╯
```

## Markdown 渲染

之前 `assistant` 的回复只是纯文本输出——代码没有高亮，标题没有样式，表格就是一堆竖线。现在通过一套完整的 Markdown 渲染组件，在终端里实现富文本展示。

### 架构

```
MarkdownDisplay            ← 入口：解析 Markdown 语法，分发给子组件
  ├── RenderCodeBlock      ← 代码块：语法高亮 + 行号
  │     └── CodeColorizer  ← 底层：lowlight 解析 + 主题着色
  ├── RenderListItem       ← 列表项：有序/无序，支持缩进
  ├── RenderTable          ← 表格：自适应列宽 + Unicode 边框
  │     └── TableRenderer  ← 底层：列宽计算 + 内容截断
  └── RenderInline         ← 行内格式：粗体/斜体/删除线/代码/链接/下划线
        └── InlineMarkdownRenderer
```

### 支持的 Markdown 元素

| 语法 | 渲染效果 |
|:-----|:---------|
| `# H1` ~ `#### H4` | 不同层级标题：H1/H2 链接蓝、H3 加粗、H4 斜体 |
| `` ``` code ``` `` | 语法高亮代码块（30+ 语言） |
| `**bold**` | **加粗** |
| `*italic*` | *斜体* |
| `~~strikethrough~~` | ~~删除线~~ |
| `` `code` `` | 行内代码 |
| `[text](url)` | 链接（蓝色高亮） |
| `<u>underline</u>` | 下划线 |
| `- item` / `1. item` | 有序/无序列表，支持嵌套缩进 |
| `\| a \| b \|` | 自适应终端宽度的表格 |
| `---` | 水平分割线 |

### 代码高亮

代码块通过 `lowlight`（highlight.js 的 AST 版本）解析语法树，再映射到终端颜色。颜色定义集中在 `theme.ts`：

```typescript
// src/tui/theme.ts — 语法高亮颜色映射
export const theme: Theme = {
  colors: {
    'hljs-keyword':  'magenta',   // 关键字：紫色
    'hljs-string':   'green',     // 字符串：绿色
    'hljs-number':   'yellow',    // 数字：黄色
    'hljs-comment':  'gray',      // 注释：灰色
    'hljs-built_in': 'cyan',      // 内置类型：青色
    'hljs-title':    'blueBright', // 函数名：亮蓝
    // ... 35+ 映射规则
  },
};
```

### 性能优化

Markdown 渲染有两个关键的性能策略：

1. **只高亮可见行**：代码块传入 `availableHeight`，`CodeColorizer` 只处理终端能显示的行数，不浪费算力在屏幕外的内容上。

2. **生成中内容截断**：当模型还在流式输出时（`isPending = true`），超长代码块会被截断并显示 `... generating more ...`，避免终端频繁重绘导致闪烁。

```tsx
// 生成中的长代码截断
if (isPending && content.length > MAX_CODE_LINES_WHEN_PENDING) {
  const truncatedContent = content.slice(0, MAX_CODE_LINES_WHEN_PENDING);
  return (
    <Box paddingLeft={1} flexDirection="column">
      {colorizeCode({ code: truncatedContent.join('\n'), language: lang })}
      <Text color={theme.text.secondary}>... generating more ...</Text>
    </Box>
  );
}
```

## useChat Hook：状态管理核心

`useChat` 是整个 TUI 的状态管理中枢，连接了 Chat 实例和 React 渲染：

```typescript
// src/tui/use-chat.ts
export function useChat(ctx: AppContext): UseChatReturn {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelName, setModelName] = useState(/* 从 client 读取 */);

  // Chat 实例通过 useRef 持久化，避免重渲染时丢失对话上下文
  const chatRef = useRef<Chat>(
    new Chat(ctx.client, ctx.systemPrompt, ctx.registry, {
      events: ctx.events,
    })
  );

  // 订阅事件总线 → 自动追加消息到列表
  useEffect(() => {
    ctx.events.on("tool_call", (e) => addMessage("tool_call", `${e.name}(${e.args})`));
    ctx.events.on("tool_result", (e) => addMessage(e.isError ? "error" : "tool_result", e.output));
    ctx.events.on("compressed", (e) => addMessage("system", `[Context] Compressed: ${e.from} → ${e.to} tokens`));
    return () => { /* 清理监听 */ };
  }, []);

  // 发送消息：追加 user 消息 → 设 loading → 等回复 → 追加 assistant 消息
  const sendMessage = useCallback((text: string) => {
    addMessage("user", text);
    setLoading(true);
    chatRef.current.send(text)
      .then((reply) => addMessage("assistant", reply))
      .catch((err) => addMessage("error", String(err)))
      .finally(() => setLoading(false));
  }, []);

  return { messages, loading, modelName, sendMessage, newChat, switchModel, addSystemMessage };
}
```

关键设计：
- **useRef 持久化 Chat 实例**：React 重渲染不会丢失对话上下文
- **事件驱动消息追加**：工具调用/结果通过事件自动出现在消息列表中，不需要手动管理
- **loading 状态**：`send` 开始时设 true，结束时设 false，UI 据此显示"Working..."

## 斜杠命令系统

之前的斜杠命令用 `if (input === '/exit')` 硬编码。TUI 需要自动补全、动态注册，所以引入了 `SlashCommandRegistry`：

```typescript
// src/tui/slash-commands.ts
export class SlashCommandRegistry {
  private commands = new Map<string, SlashCommandDefinition>();
  private listeners = new Set<Listener>();
  private snapshot: SlashCommand[] = [];

  register(def: SlashCommandDefinition): void { /* ... */ }
  list(): SlashCommand[] { /* ... */ }
  execute(input: string): boolean { /* ... */ }
  subscribe(listener: Listener): () => void { /* ... */ }
  getSnapshot(): SlashCommand[] { /* ... */ }
}
```

这是一个带 **发布-订阅** 的注册表。`subscribe` + `getSnapshot` 是为了配合 React 的 `useSyncExternalStore`——命令列表变化时自动触发 UI 重渲染。

### 内置命令

App 组件在挂载时注册内置命令：

| 命令 | 功能 |
|:-----|:-----|
| `/exit` | 退出应用 |
| `/new` | 开始新对话 |
| `/model` | 交互式选择模型（由之前的 `/use <model>` 升级而来） |
| `/agents` | 列出已注册的子 Agent |
| `/skills` | 列出已注册的技能 |

此外，所有已注册的 Skill 的 trigger 也会自动注册为斜杠命令。比如 Skill 定义了 `trigger: /commit`，启动后 `/commit` 就直接可用。

### 输入框补全

`InputBox` 组件在用户输入 `/` 时，自动弹出匹配的命令列表：

```
┌─────────────────────────────────────────────────────┐
│  You: /sk                                            │
└─────────────────────────────────────────────────────┘
  > /skills  List registered skills
```

- 方向键上下选择候选项
- Tab 补全选中的命令
- Enter 直接执行

补全逻辑由 `useCommandList` hook 实现，用 `useSyncExternalStore` 订阅命令注册表变化，按前缀过滤：

```typescript
// src/tui/use-command-list.ts
export function useCommandList(registry: SlashCommandRegistry, input: string): SlashCommand[] {
  const allCommands = useSyncExternalStore(
    (cb) => registry.subscribe(cb),
    () => registry.getSnapshot()
  );
  if (!input.startsWith("/")) return [];
  const prefix = input.toLowerCase();
  return allCommands.filter((cmd) => cmd.name.toLowerCase().startsWith(prefix));
}
```

## TUI 入口

TUI 的入口在 `src/tui/index.tsx`，负责初始化所有服务并启动 Ink 渲染：

```typescript
// src/tui/index.tsx
export async function startApp(options: StartAppOptions = {}): Promise<void> {
  // 1. 初始化模型客户端
  // 2. 注册工具（Shell、File、MCP...）
  // 3. 创建事件总线
  // 4. 加载子 Agent 和 Skill
  // 5. 构建系统提示词
  // 6. 创建斜杠命令注册表

  const ctx: AppContext = {
    client, registry, mcpManager, subAgentRegistry,
    skillRegistry, skillLoader, systemPrompt, events, commands,
  };

  render(<App ctx={ctx} />);
}
```

所有之前分散在各章实现的模块——工具注册、MCP、Sub-Agent、Skill——在这里汇聚到一个 `AppContext` 里，作为 props 传递给组件树。

主入口 `src/index.ts` 也做了简化，增加了 CLI 参数解析：

```typescript
// src/index.ts
import yargs from "yargs";
import { startApp } from "./tui/index.js";

const argv = await yargs(hideBin(process.argv))
  .option("model", { alias: "m", type: "string", describe: "Model to use" })
  .parse();

await startApp({ model: argv.model });
```

现在可以通过 `npm start -- -m deepseek` 在启动时指定模型了。

## 完整数据流

一条用户消息从输入到显示的完整路径：

```
用户在 InputBox 输入 "帮我看看这个文件"，按 Enter
    │
    ▼
┌──────────────────────────────────────────────────┐
│ App.handleSubmit()                                │
│  → 判断是否斜杠命令（否）                           │
│  → 调用 useChat.sendMessage()                     │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│ useChat.sendMessage()                             │
│  ① addMessage("user", "帮我看看这个文件")          │
│  ② setLoading(true)  → StatusBar 显示 Working... │
│  ③ chatRef.current.send(text)                     │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│ Chat.send() — Agent Loop 运行                     │
│  LLM 决定调用 read_file 工具                       │
│  → events.emit("tool_call", {...})                │
│  工具执行完毕                                      │
│  → events.emit("tool_result", {...})              │
│  LLM 生成最终回复                                  │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│ useChat 事件监听                                   │
│  "tool_call"  → addMessage("tool_call", ...)      │
│  "tool_result" → addMessage("tool_result", ...)   │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│ sendMessage 回调                                   │
│  ④ addMessage("assistant", reply)                 │
│  ⑤ setLoading(false) → 输入框恢复                 │
└──────────────────────────────────────────────────┘
                      │
                      ▼
           MessageList 重新渲染
           显示完整对话过程
```

## 目录结构

```
src/
├── chat-events.ts              ← 事件总线（新增）
├── chat.ts                     ← 接入事件总线（修改）
├── index.ts                    ← 简化，使用 TUI 入口（修改）
└── tui/                        ← TUI 目录（新增）
    ├── index.tsx               ← 入口：初始化 + 渲染
    ├── types.ts                ← UI 类型定义（含 ToolCallData/ToolResultData）
    ├── theme.ts                ← 主题：颜色 token + 语法高亮映射
    ├── slash-commands.ts       ← 斜杠命令注册表
    ├── use-chat.ts             ← Chat 状态管理 hook
    ├── use-command-list.ts     ← 命令补全 hook
    └── components/
        ├── App.tsx             ← 根组件（含 WelcomeBox 布局）
        ├── WelcomeBox.tsx      ← 欢迎页卡片
        ├── StatusBar.tsx       ← 状态栏（底部，含计时）
        ├── MessageList.tsx     ← 消息列表（自动配对工具调用）
        ├── Message.tsx         ← 单条消息（assistant 走 Markdown 渲染）
        ├── ToolCallBox.tsx     ← 工具调用卡片（diff、状态颜色）
        ├── InputBox.tsx        ← 输入框 + 补全
        └── markdown/           ← Markdown 渲染子系统
            ├── MarkdownDisplay.tsx       ← 入口：解析 + 分发
            ├── InlineMarkdownRenderer.tsx ← 行内格式（粗体/斜体/删除线/代码/链接/下划线）
            ├── CodeColorizer.tsx         ← 语法高亮（lowlight + 主题）
            ├── TableRenderer.tsx         ← 表格（自适应列宽 + Unicode 边框）
            ├── MaxSizedBox.tsx           ← 溢出容器（高度限制 + 截断提示）
            └── OverflowContext.tsx        ← 溢出状态管理
```

## 新增依赖

| 包 | 用途 |
|:---|:-----|
| `ink` | React for CLI——在终端里用 React 组件构建 UI |
| `react` | Ink 的基础，组件、hook、状态管理 |
| `ink-text-input` | Ink 的文本输入组件 |
| `yargs` | CLI 参数解析（`--model`、`--help`） |
| `lowlight` | highlight.js 的 AST 版本，用于代码语法高亮 |

类比：Ink 之于终端，就像 React 之于浏览器。同样是组件化、声明式渲染，只不过渲染目标从 DOM 变成了终端字符。

## 总结

```
之前：readline + console.log
        ↓
问题：UI 和逻辑耦合，没有状态反馈，没有命令补全
        ↓
解法：EventBus 解耦 + Ink/React 渲染
        ↓
优化：工具调用卡片化 + Markdown 富文本 + 欢迎页
        ↓
之后：组件化 TUI，事件驱动，终端里的富交互体验
```

TUI 不是换了个皮肤那么简单。**事件总线**让 Chat 逻辑和 UI 渲染彻底解耦——以后换成 Web UI、Electron 界面，Chat 层的代码一行不用改，只需要换一个事件订阅者。**斜杠命令注册表**让命令管理标准化——新增命令只需调 `register()`，补全、执行自动就绪。**ToolCallBox** 把工具调用从杂乱的日志升级为结构化的卡片，一眼看清调了什么、结果如何。**Markdown 渲染**让 AI 回复的代码有高亮、表格有边框、标题有层级——终端也能有接近 IDE 的阅读体验。

> **TUI = EventBus + Ink/React + Markdown + ToolCallBox。事件总线解耦逻辑和渲染，React 组件化管理终端界面，Markdown 渲染提升可读性，工具调用卡片化提升可观测性。结果：Agent 从"能用"升级到"好用"。**

---

> **导航**：首页 » 进阶架构
>
> ⬅️ [上一章：Agent Skill](./08-agent-skill.md) | ➡️ [下一章：流式输出](./10-streaming.md)
