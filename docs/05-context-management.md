# 第 5 阶段：上下文管理 (Context Management)

> **导航**：首页 » 进阶架构
>
> ⬅️ [上一章：工程化完善](./04b-refinement.md) | ➡️ [下一章：MCP 协议](./06-mcp.md)

---

上下文窗口是 Agent 的"工作记忆"，但它有硬性限制。对话越长、工具调用越多，token 消耗越快。上下文管理就是在**记住该记的**和**控制开销**之间找到平衡。

## 为什么需要上下文管理

三个现实问题：

| 问题 | 说明 |
|:-----|:-----|
| **Token 限制** | 每个模型有上下文窗口上限（如 128K tokens），超出就截断 |
| **成本** | Token 数量直接决定 API 费用，历史越长越贵 |
| **速度** | 输入 token 越多，模型响应延迟越高 |

一个复杂任务可能需要几十轮工具调用，每轮都带上完整历史，token 数呈线性增长。不做管理，几轮下来就会撞上限制。

## 常见策略

### 策略 1：滑动窗口

最简单的方案——只保留最近 N 轮对话，丢弃更早的消息。

```typescript
function slidingWindow(history: Message[], maxTurns: number): Message[] {
  if (history.length <= maxTurns * 2) {
    return history;
  }
  // 始终保留 system prompt（第一条消息）
  const systemPrompt = history[0];
  const recentMessages = history.slice(-(maxTurns * 2));
  return [systemPrompt, ...recentMessages];
}
```

**优点**：实现简单，效果直接。

**缺点**：早期信息完全丢失，AI 可能"忘记"用户一开始的需求。

### 策略 2：摘要压缩

让 LLM 把旧的对话历史**压缩成一段摘要**，用短文替代长历史。

```
原始历史（5000 tokens）：
  用户问了天气 → AI 查了天气 → 用户问了新闻 → AI 查了新闻 → ...

压缩后（200 tokens）：
  "用户先查了深圳天气（25°C 晴），然后查了今日科技新闻（共 3 条），
   接着要求将新闻翻译成英文。"
```

```typescript
async function compressHistory(
  history: Message[],
  maxTokens: number
): Promise<Message[]> {
  const tokenCount = estimateTokens(history);
  if (tokenCount <= maxTokens) {
    return history;
  }

  // 把前半部分历史交给 LLM 压缩
  const oldMessages = history.slice(0, -6);  // 保留最近 3 轮
  const summary = await llm.summarize(oldMessages);

  return [
    { role: "system", content: `之前的对话摘要：${summary}` },
    ...history.slice(-6),
  ];
}
```

**优点**：保留关键信息，压缩比高。

**缺点**：压缩本身消耗 token，且可能丢失细节。

### 策略 3：RAG 检索增强

不把所有信息都塞进上下文，而是存到外部知识库。需要时**按需检索**，只取相关内容注入上下文。

```
用户提问："上次讨论的数据库方案是什么？"

  1. 把问题转成向量 → 去向量数据库检索
  2. 找到相关的历史片段 → 注入当前上下文
  3. LLM 基于检索结果回答
```

**优点**：上下文永远保持精简，可以"记住"无限量的历史。

**缺点**：需要额外的向量数据库基础设施，检索可能不精准。

## 在 Agent Loop 中的位置

上下文管理发生在每次调用 LLM **之前**：

```
    ┌──────────────────────────────────────────────────┐
    │                                                  │
    ▼                                                  │
 用户输入 → 上下文管理（裁剪/压缩/检索） → 调用 LLM    │
                                              │        │
                                         有工具调用？ ──┘
                                              │
                                              否 → 返回文本给用户 ✅
```

每一圈循环都先过一遍上下文管理，确保发给 LLM 的内容**在窗口限制内、包含足够信息、成本可控**。

## 策略组合

实际项目中通常组合使用：

```
┌─────────────────────────────────────────────┐
│ 1. 系统提示词                    (始终保留)  │
│ 2. 压缩摘要（旧历史）            (摘要压缩)  │
│ 3. 检索到的相关知识片段           (RAG)      │
│ 4. 最近 N 轮对话                 (滑动窗口)  │
│ 5. 当前用户输入                  (始终保留)  │
└─────────────────────────────────────────────┘
                    │
                    ▼
               发送给 LLM
```

> **上下文管理 = 在有限的白板上精打细算：哪些要保留、哪些压缩、哪些需要时再查。没有银弹，按场景组合。**

---

> **导航**：首页 » 进阶架构
>
> ⬅️ [上一章：工程化完善](./04b-refinement.md) | ➡️ [下一章：MCP 协议](./06-mcp.md)
