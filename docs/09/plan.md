# Plan: 为 AI Agent 添加 Ink/React TUI 交互界面

## Context

当前 AI Agent 使用 `readline` 做简单的命令行交互，所有 UI 输出（tool call、tool result、压缩提示等）都通过 `console.log` 直接打印。为了提供更好的交互体验，需要引入 Ink + React 框架构建 TUI，所有 UI 代码放到 `src/tui/` 目录下。

核心思路：通过 EventEmitter 将 `Chat` 类的 UI 输出解耦，TUI 层订阅事件驱动渲染；同时提取共享的初始化逻辑到 `src/init.ts`，使原有 readline 入口和新 TUI 入口共存。

---

## 实现步骤

### Step 1: 安装依赖 & 更新配置

**package.json** — 新增依赖：
- `ink@5`, `react@18`, `ink-text-input@6`, `@types/react@18`
- 新增 script: `"tui": "tsx src/tui/index.tsx"`

**tsconfig.json** — 添加 `"jsx": "react-jsx"` 以支持 `.tsx` 文件

### Step 2: 创建事件总线 — `src/chat-events.ts` (新文件)

定义类型安全的 `ChatEventBus`（继承 Node.js `EventEmitter`），事件类型包括：
- `tool_call` — `{ name, args }`
- `tool_result` — `{ name, output, isError }`
- `compressed` — `{ from, to }`

### Step 3: 修改 `src/chat.ts` — 接入事件总线

- `ChatOptions` 新增可选 `events?: ChatEventBus`
- 替换第 74 行和第 84 行的 `console.log`：有 events 时 emit 事件，无 events 时保留原 console.log（向后兼容）

### Step 4: 修改 `src/context/chat-compress-service.ts` — 接入事件总线

- 构造函数新增可选 `events?: ChatEventBus`
- 替换第 278 行的 `console.log` 为事件发射

### Step 5: 提取初始化逻辑 — `src/init.ts` (新文件)

从 `src/index.ts` 前 81 行提取 `initializeApp()` 函数，返回 `AppContext`：
```typescript
interface AppContext {
  client, registry, mcpManager, subAgentRegistry, skillRegistry, skillLoader, systemPrompt
}
```

### Step 6: 重构 `src/index.ts` — 使用共享初始化

改为调用 `initializeApp()`，readline 循环逻辑不变，不传 ChatEventBus（保持 console.log 行为）。

### Step 7: 创建 TUI 组件 — `src/tui/` 目录

```
src/tui/
├── index.tsx                  # TUI 入口，调用 initializeApp() + render(<App />)
├── types.ts                   # DisplayMessage 等 UI 类型
├── use-chat.ts                # useChat hook：管理消息列表、loading 状态、事件订阅
└── components/
    ├── App.tsx                # 根组件，路由 slash 命令
    ├── StatusBar.tsx          # 顶部状态栏：模型名 + 快捷键提示
    ├── MessageList.tsx        # 消息列表（展示最近 50 条）
    ├── Message.tsx            # 单条消息渲染（user/assistant/tool_call/tool_result/error/system）
    └── InputBox.tsx           # 输入框（使用 ink-text-input）
```

**组件树**：
```
<App>
  <StatusBar />          ← 模型名 + "Thinking..." / 命令提示
  <MessageList>          ← 消息历史
    <Message />          ← 按角色渲染不同样式
  </MessageList>
  <InputBox />           ← 用户输入（loading 时禁用）
</App>
```

**useChat hook** 核心逻辑：
- 创建 `ChatEventBus` + `Chat` 实例（通过 useRef 持久化）
- useEffect 订阅事件 → `setMessages`
- 暴露 `sendMessage`, `newChat`, `switchModel`, `addSystemMessage`

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 修改 | 添加 ink/react 依赖 + tui script |
| `tsconfig.json` | 修改 | 添加 `jsx: "react-jsx"` |
| `src/chat-events.ts` | 新建 | 事件总线定义 |
| `src/chat.ts` | 修改 | 支持可选事件总线 |
| `src/context/chat-compress-service.ts` | 修改 | 支持可选事件总线 |
| `src/init.ts` | 新建 | 共享初始化逻辑 |
| `src/index.ts` | 修改 | 使用 init.ts |
| `src/tui/types.ts` | 新建 | UI 类型 |
| `src/tui/use-chat.ts` | 新建 | Chat 状态 hook |
| `src/tui/index.tsx` | 新建 | TUI 入口 |
| `src/tui/components/App.tsx` | 新建 | 根组件 |
| `src/tui/components/StatusBar.tsx` | 新建 | 状态栏 |
| `src/tui/components/MessageList.tsx` | 新建 | 消息列表 |
| `src/tui/components/Message.tsx` | 新建 | 消息渲染 |
| `src/tui/components/InputBox.tsx` | 新建 | 输入框 |

---

## 验证方式

1. `npm start` — 原有 readline 入口应正常工作，行为不变
2. `npm run tui` — 启动 Ink TUI，可以：
   - 输入消息并收到回复
   - 看到 tool call / tool result 的可视化显示
   - 使用 /exit, /new, /model, /agents, /skills 命令
   - 顶部显示当前模型名
   - loading 时输入框禁用并显示 "Thinking..."
3. TypeScript 类型检查通过：`npx tsc --noEmit`