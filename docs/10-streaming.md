# 第 10 阶段：流式输出与并行工具调用 (Streaming & Parallel Tool Calls)

> **导航**：首页 » 进阶架构
>
> ⬅️ [上一章：TUI 交互界面](./09-tui.md) | ➡️ [下一章：后台任务管理](./11-background-task.md)

---

**Branch:** `10-streaming`

到上一章为止，Agent 每次调用模型都是"一次性"返回完整结果——用户发消息后只能干等，直到模型生成完毕才能看到回复。对于短回答还好，但模型生成一段长代码或详细分析时，等待 5-10 秒没有任何反馈，体验很差。而且工具调用也是串行的——模型决定同时读三个文件，代码却一个一个排队执行。

这一章做两件事：**流式输出**让用户逐字看到模型回复，**并行工具调用**让多个工具同时执行。

## 为什么需要流式输出

| 问题 | 之前（非流式） | 之后（流式） |
|:-----|:-------------|:------------|
| **首字延迟** | 等模型生成完所有内容才显示 | 第一个 token 生成后立刻显示 |
| **用户体验** | 长时间无反馈，不知道是卡住了还是在思考 | 文字逐步出现，感觉"AI 在实时说话" |
| **中间打断** | 不可能，只能等到最后 | 看到方向不对可以提前知道 |
| **TUI 集成** | 等回复完毕后一次性渲染 | 配合 Markdown 渲染实时更新 |

## 核心思路：AsyncGenerator + SSE

流式输出的本质：把一次"等全部完成再返回"的 `Promise` 调用，改成"边生成边返回"的 `AsyncGenerator`。

```
之前：sendMessage() → Promise<Result>     等…… 等…… 等…… → 一次拿到完整结果

之后：streamMessage() → AsyncGenerator    → chunk1 → chunk2 → chunk3 → ... → done
                                           "你"     "好，"    "这段"          实时显示
```

底层传输协议用的是 **SSE（Server-Sent Events）**——HTTP 长连接，服务端持续推送 `data: {...}` 格式的 JSON 块。OpenAI 和 Gemini 都用这个协议。

## StreamChunk 接口

先定义流式传输的数据单元。每个 chunk 可能包含文本增量、工具调用，或者两者都有：

```typescript
// src/model/providers/types.ts
/**
 * 流式响应的增量数据块。
 * - deltaText: 本次增量的文本片段
 * - functionCalls: 当模型决定调用工具时，在流结束时返回完整的 functionCall 列表
 */
export interface StreamChunk {
  deltaText?: string;
  functionCalls?: FunctionCall[];
}
```

对应地，`ModelProvider` 接口新增 `streamMessage` 方法：

```typescript
export interface ModelProvider {
  name: string;
  sendMessage(
    messages: Message[],
    options?: SendMessageOptions
  ): Promise<SendMessageResult>;

  /**
   * 流式发送消息，返回 AsyncGenerator 逐步产出 StreamChunk。
   * 最后一个 yield 的 chunk 可能包含 functionCall（如果模型决定调用工具）。
   */
  streamMessage(
    messages: Message[],
    options?: SendMessageOptions
  ): AsyncGenerator<StreamChunk, void, unknown>;
}
```

两个方法并存：`sendMessage` 用于不需要流式的场景（如上下文压缩调用），`streamMessage` 用于面向用户的对话。

## SSE 流解析

两种 API 格式都需要解析 SSE 流，核心逻辑相同：读取 HTTP 响应的 body 流 → 按行拆分 → 解析 `data:` 前缀的 JSON。

### OpenAI 兼容格式

OpenAI（以及 DeepSeek、智谱等兼容接口）的流式响应格式：

```
data: {"choices":[{"delta":{"content":"你"},"finish_reason":null}]}
data: {"choices":[{"delta":{"content":"好"},"finish_reason":null}]}
data: {"choices":[{"delta":{"content":"！"},"finish_reason":"stop"}]}
data: [DONE]
```

关键点：工具调用通过 `delta.tool_calls` 增量传输，参数分多个 chunk 拼接。

```typescript
// src/model/providers/openai-compatible.ts
async *streamMessage(
  messages: Message[],
  options?: SendMessageOptions
): AsyncGenerator<StreamChunk, void, unknown> {
  const chatMessages = this.toChatMessages(messages, options);
  const url = `${this.baseUrl}/chat/completions`;

  const requestBody: Record<string, unknown> = {
    model: this.model,
    messages: chatMessages,
    stream: true,  // 唯一的区别：加上 stream: true
  };
  // ... tools 配置同非流式

  const res = await fetch(url, { /* ... */ });

  // 解析 SSE 流
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // 用于按 index 累积多个 tool_call 的增量数据
  const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";  // 保留最后一行（可能不完整）

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") return;

      const chunk = JSON.parse(data) as ChatCompletionChunk;
      const choice = chunk.choices[0];
      if (!choice) continue;

      // 文本增量 → 立即 yield
      if (choice.delta.content) {
        yield { deltaText: choice.delta.content };
      }

      // 工具调用增量 → 按 index 累积
      if (choice.delta.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          let pending = pendingToolCalls.get(tc.index);
          if (!pending) {
            pending = { id: "", name: "", args: "" };
            pendingToolCalls.set(tc.index, pending);
          }
          if (tc.id) pending.id = tc.id;
          if (tc.function?.name) pending.name = tc.function.name;
          if (tc.function?.arguments) pending.args += tc.function.arguments;
        }
      }

      // 流结束时一次性 yield 完整的 functionCalls
      if (choice.finish_reason === "tool_calls" || choice.finish_reason === "stop") {
        if (pendingToolCalls.size > 0) {
          const sorted = [...pendingToolCalls.entries()].sort((a, b) => a[0] - b[0]);
          yield {
            functionCalls: sorted.map(([, tc]) => ({
              id: tc.id,
              name: tc.name,
              args: JSON.parse(tc.args) as Record<string, unknown>,
            })),
          };
        }
      }
    }
  }
}
```

SSE 解析有三个关键细节：

1. **buffer 拼接**：`reader.read()` 返回的数据可能在任意位置断开，一行 JSON 可能分两次到达。用 buffer 累积，按 `\n` 拆分，最后一行留到下次。
2. **tool_call 增量拼接**：模型的工具调用参数可能分多个 chunk 到达（尤其是参数较长时）。用 `pendingToolCalls` Map 按 `index` 累积，流结束时组装完整的 `FunctionCall`。
3. **`[DONE]` 信号**：OpenAI 格式用 `data: [DONE]` 标记流结束。

### Gemini 格式

Gemini 的流式端点和 SSE 格式略有不同：

```
端点：/models/{model}:streamGenerateContent?alt=sse
```

```typescript
// src/model/providers/gemini.ts
async *streamMessage(
  messages: Message[],
  options?: SendMessageOptions
): AsyncGenerator<StreamChunk, void, unknown> {
  const body = this.toGeminiRequest(messages, options);
  // Gemini 流式接口使用 streamGenerateContent 端点，加 alt=sse 返回 SSE 格式
  const url = `.../${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

  const res = await fetch(url, { /* ... */ });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const parsed = JSON.parse(trimmed.slice(6)) as GeminiResponse;

      const candidate = parsed.candidates?.[0];
      if (!candidate?.content?.parts) continue;

      // 文本增量
      for (const part of candidate.content.parts) {
        if (part.text) {
          yield { deltaText: part.text };
        }
      }

      // Gemini 的 functionCall 在单个 chunk 中完整返回（不需要增量拼接）
      const fcParts = candidate.content.parts.filter((p) => p.functionCall);
      if (fcParts.length > 0) {
        yield {
          functionCalls: fcParts.map((p) => ({
            id: generateGeminiCallId(),
            name: p.functionCall!.name,
            args: p.functionCall!.args,
          })),
        };
      }
    }
  }
}
```

Gemini 和 OpenAI 的关键差异：**Gemini 的 functionCall 在单个 chunk 中完整返回**，不需要增量拼接。这简化了 Gemini 端的解析逻辑。

### 对比

| 差异 | OpenAI 兼容 | Gemini |
|:-----|:-----------|:-------|
| 请求参数 | `stream: true` | 换端点 `streamGenerateContent?alt=sse` |
| 文本增量 | `choices[0].delta.content` | `candidates[0].content.parts[].text` |
| 工具调用 | 增量传输，需按 index 拼接 | 单 chunk 完整返回 |
| 流结束 | `data: [DONE]` | 连接关闭 |

## ModelClient 代理层

`ModelClient` 作为中间层，新增 `streamMessage` 方法，透传给当前活跃的 provider：

```typescript
// src/model/client.ts
async *streamMessage(
  messages: Message[],
  options?: SendMessageOptions
): AsyncGenerator<StreamChunk, void, unknown> {
  const provider = this.providers.get(this.currentModel)!.provider;
  yield* provider.streamMessage(messages, options);
}
```

`yield*` 把底层 provider 的 AsyncGenerator 直接委托出去，一行搞定。

## Chat 层改造

`Chat.send()` 是最大的改造点。之前调用 `sendMessage` 拿到完整结果，现在改为消费 `streamMessage` 的流：

```typescript
// src/chat.ts — send() 方法
async send(text: string): Promise<string> {
  // ... 压缩检测、追加用户消息

  for (let i = 0; i < this.maxRounds; i++) {
    const messages = this.buildMessages();

    // 使用流式接口调用模型
    let fullText = "";
    let functionCalls: FunctionCall[] = [];

    const stream = this.client.streamMessage(messages, {
      systemInstruction: this.systemPrompt,
      tools: tools.length > 0 ? tools : undefined,
    });

    for await (const chunk of stream) {
      if (chunk.deltaText) {
        fullText += chunk.deltaText;
        this.events.emit("text_delta", { delta: chunk.deltaText });
      }
      if (chunk.functionCalls) {
        functionCalls.push(...chunk.functionCalls);
      }
    }

    // 构建 model 消息的 parts：文本 + 所有 functionCall
    const modelParts: Part[] = [];
    if (fullText) modelParts.push({ text: fullText });
    for (const fc of functionCalls) {
      modelParts.push({ functionCall: fc });
    }
    if (modelParts.length === 0) modelParts.push({ text: "" });
    this.history.push({ role: "model", parts: modelParts });

    if (functionCalls.length === 0) {
      return fullText;
    }

    // 并发执行所有工具调用
    // ... 见下一节
  }
}
```

关键变化：

1. **`sendMessage` → `streamMessage`**：返回值从 `Promise<Result>` 变成 `AsyncGenerator<StreamChunk>`
2. **`for await...of`**：逐个消费 chunk，文本增量通过 `text_delta` 事件实时推送给 TUI
3. **累积完整结果**：虽然是流式接收，但 `fullText` 和 `functionCalls` 仍然累积完整结果，用于写入 history

## 并行工具调用

之前模型返回多个工具调用时，是串行执行的。现在改为 `Promise.all` 并发：

```typescript
// src/chat.ts — 工具调用部分

// 发射所有 tool_call 事件
for (const fc of functionCalls) {
  const displayArgs = this.toolRegistry!.formatArgs(fc.name, fc.args);
  this.events.emit("tool_call", { name: fc.name, args: displayArgs });
}

// 并发执行所有工具调用
const toolResults = await Promise.all(
  functionCalls.map((fc) => this.toolRegistry!.execute(fc.name, fc.args))
);

// 将所有工具结果推入 history（放在同一条 tool 消息中）
const toolParts: Part[] = [];
for (let j = 0; j < functionCalls.length; j++) {
  const fc = functionCalls[j];
  const toolResult = toolResults[j];
  // ... 构建 functionResponse parts
}
this.history.push({ role: "tool", parts: toolParts });
```

```
之前（串行）：read_file(a.ts) → 等完 → read_file(b.ts) → 等完 → read_file(c.ts) → 等完
             ├── 2s ──┤          ├── 2s ──┤          ├── 2s ──┤
             总计 6s

之后（并行）：read_file(a.ts) ─┐
             read_file(b.ts) ─┼─ Promise.all → 等最慢的完成
             read_file(c.ts) ─┘
             ├──── 2s ────┤
             总计 2s
```

模型在一次响应中可能返回多个 functionCall（比如同时读取 3 个文件来理解代码），`Promise.all` 让它们并发执行，总耗时等于最慢那个而非所有之和。

## 事件总线扩展

事件总线新增 `text_delta` 事件，用于流式文本的实时推送：

```typescript
// src/chat-events.ts
export interface TextDeltaEvent {
  delta: string;
}

export interface ChatEventMap {
  tool_call: [ToolCallEvent];
  tool_result: [ToolResultEvent];
  compressed: [CompressedEvent];
  text_delta: [TextDeltaEvent];    // 新增
}
```

| 事件 | 触发时机 | 携带数据 |
|:-----|:--------|:---------|
| `text_delta` | 模型流式输出每个文本片段 | 增量文本字符串 |
| `tool_call` | 流结束后发现有工具调用 | 工具名 + 参数 |
| `tool_result` | 工具执行完毕 | 输出 + 是否出错 |
| `compressed` | 上下文压缩完成 | 压缩前后 token 数 |

## TUI 实时渲染

TUI 层的 `useChat` hook 订阅 `text_delta` 事件，实现流式消息的实时更新：

```typescript
// src/tui/use-chat.ts
// 用于追踪当前正在流式输出的 assistant 消息 id
const streamingIdRef = useRef<number | null>(null);

const onTextDelta = (e: { delta: string }) => {
  if (streamingIdRef.current === null) {
    // 创建新的 assistant 消息
    const id = nextId++;
    streamingIdRef.current = id;
    setMessages((prev) => [
      ...prev,
      { id, type: "assistant", text: e.delta, timestamp: new Date() },
    ]);
  } else {
    // 追加到已有的流式消息
    const sid = streamingIdRef.current;
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === sid ? { ...msg, text: msg.text + e.delta } : msg
      )
    );
  }
};
```

设计要点：

1. **`streamingIdRef`**：用 ref 追踪当前正在流式输出的消息 id。第一个 delta 到达时创建新消息，后续 delta 追加到同一条消息。
2. **tool_call 断流**：当 `tool_call` 事件到达时，将 `streamingIdRef` 置空——因为工具调用意味着模型的文本输出阶段结束了，下一轮流式输出应该创建新消息。
3. **send 回调简化**：`send()` 完成后不再手动追加 assistant 消息——流式文本已通过 `text_delta` 事件实时添加到消息列表。

```typescript
// 之前（非流式）
chatRef.current.send(text)
  .then((reply) => addMessage("assistant", reply));

// 之后（流式）
chatRef.current.send(text)
  .then(() => {
    // 流式输出已通过 text_delta 事件实时添加到消息列表，无需再手动添加
    streamingIdRef.current = null;
  });
```

## 完整数据流

流式输出下，一条消息从输入到显示的完整路径：

```
用户在 InputBox 输入 "解释这段代码"，按 Enter
    │
    ▼
┌──────────────────────────────────────────────────┐
│ useChat.sendMessage()                             │
│  ① addMessage("user", "解释这段代码")              │
│  ② setLoading(true)  → StatusBar 显示 Working... │
│  ③ chatRef.current.send(text)                     │
└─────────────────────┬────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│ Chat.send() — 消费 streamMessage 流               │
│                                                    │
│  for await (const chunk of stream) {               │
│    chunk.deltaText → events.emit("text_delta")  ──┼──→ useChat 订阅
│  }                                                 │    → 第一个 delta: 创建 assistant 消息
│                                                    │    → 后续 delta: 追加到同一消息
│  // 流结束，检查有没有工具调用                         │    → React 重渲染 → 用户看到文字逐步出现
│  functionCalls.length === 0 → return fullText      │
└─────────────────────┬────────────────────────────┘
                      │（如果有工具调用）
                      ▼
┌──────────────────────────────────────────────────┐
│ 并行工具执行                                       │
│  streamingIdRef = null  （断流）                    │
│  events.emit("tool_call") × N                     │
│  Promise.all([execute, execute, ...])             │
│  events.emit("tool_result") × N                   │
│                                                    │
│  → 进入下一轮循环 → 再次消费 streamMessage 流       │
└──────────────────────────────────────────────────┘
```

## 目录结构变更

```
src/
├── chat-events.ts                 ← 新增 text_delta 事件（修改）
├── chat.ts                        ← sendMessage → streamMessage + Promise.all（修改）
├── model/
│   ├── client.ts                  ← 新增 streamMessage 代理方法（修改）
│   └── providers/
│       ├── types.ts               ← 新增 StreamChunk 接口 + streamMessage 方法（修改）
│       ├── gemini.ts              ← 新增 streamMessage SSE 解析（修改）
│       └── openai-compatible.ts   ← 新增 streamMessage SSE 解析（修改）
└── tui/
    └── use-chat.ts                ← text_delta 订阅 + streamingIdRef 管理（修改）
```

本章没有新增文件，所有改动都是在已有文件上扩展。

## 总结

```
之前：sendMessage → Promise → 等完 → 一次性显示
      工具调用串行执行
        ↓
问题：首字延迟高，用户体验差，多工具调用效率低
        ↓
解法：streamMessage → AsyncGenerator → 逐 chunk 推送
      Promise.all 并行工具执行
        ↓
之后：文字实时出现，工具并发执行，响应速度提升
```

流式输出的改造贯穿四层：**Provider** 解析 SSE 流并 yield chunk → **ModelClient** 透传 AsyncGenerator → **Chat** 消费流并 emit `text_delta` 事件 → **TUI** 订阅事件实时更新消息。每一层只做自己该做的事，层与层之间通过 AsyncGenerator 和 EventBus 解耦。并行工具调用是顺手的优化——把 `for` 循环改成 `Promise.all`，一行代码换来成倍的速度提升。

> **流式输出 = AsyncGenerator + SSE 解析 + 事件推送。模型边想边说，用户边看边等，工具并发执行。从"等结果"到"看过程"，体验从等待变成了对话。**

---

> **导航**：首页 » 进阶架构
>
> ⬅️ [上一章：TUI 交互界面](./09-tui.md) | ➡️ [下一章：后台任务管理](./11-background-task.md)
