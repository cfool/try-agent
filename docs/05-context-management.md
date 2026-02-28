---
title: 上下文管理
nav_order: 10
---

# 第 5 阶段：上下文管理 (Context Management)

**Branch:** `05-context`

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

本项目在 `src/context/chat-compress-service.ts` 中实现了 `ChatCompressService`，核心逻辑：

```typescript
// 当历史 token 数超过模型上限的 50% 时触发压缩
const COMPRESSION_TOKEN_THRESHOLD = 0.5;
// 压缩时保留最近 30% 的历史，压缩前 70%
const COMPRESSION_PRESERVE_FRACTION = 0.3;

async compressIfNeeded(history: Message[]): Promise<CompressionResult> {
  const originalTokenCount = estimateHistoryTokens(history);
  const threshold = MODEL_TOKEN_LIMIT * COMPRESSION_TOKEN_THRESHOLD;

  if (originalTokenCount <= threshold) {
    return { status: CompressionStatus.NOOP, ... };
  }

  // 1. 截断超出预算的旧工具输出
  const truncatedHistory = truncateHistoryToBudget(history);
  // 2. 按字符比例找切分点：压缩前 70%，保留后 30%
  const splitPoint = findCompressSplitPoint(truncatedHistory, ...);
  // 3. 调用 LLM 把旧历史压缩为 <state_snapshot> 格式的摘要
  const summary = await this.client.sendMessage(historyToCompress, ...);
  // 4. 组装新 history：摘要 + 保留的近期历史
  const newHistory = [summaryMessage, ...historyToKeep];
  // 5. 验证压缩后不会比压缩前更大
  return { status: CompressionStatus.COMPRESSED, newHistory };
}
```

压缩后的摘要使用 `<state_snapshot>` 格式包裹，保留用户需求、关键决策、文件路径等信息。如果存在上一次的 snapshot，新压缩会整合旧 snapshot 中仍然相关的内容。

**优点**：保留关键信息，压缩比高，按比例切分而非固定轮数更灵活。

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

上下文管理发生在每次调用 LLM **之前**。在本项目中，`Chat.send()` 方法的第一步就是检查是否需要压缩：

```
    ┌──────────────────────────────────────────────────────────────┐
    │                                                              │
    ▼                                                              │
 用户输入 → 压缩检测(compressIfNeeded) → buildMessages → 调用 LLM  │
                                                          │        │
                                                     有工具调用？ ──┘
                                                          │
                                                          否 → 返回文本给用户 ✅
```

每一圈循环都先过一遍上下文管理，确保发给 LLM 的内容**在窗口限制内、包含足够信息、成本可控**。

## 策略组合

实际项目中通常组合使用。本项目当前采用的组合：

```
┌─────────────────────────────────────────────────┐
│ 1. 系统提示词(systemInstruction)    (始终保留)   │
│ 2. 项目上下文(buildMessages注入)    (每轮刷新)   │
│ 3. 压缩摘要 <state_snapshot>       (摘要压缩)   │
│ 4. 截断后的近期历史                 (按比例保留) │
│ 5. 当前用户输入                    (始终保留)   │
└─────────────────────────────────────────────────┘
                    │
                    ▼
               发送给 LLM
```

> **上下文管理 = 在有限的白板上精打细算：哪些要保留、哪些压缩、哪些需要时再查。没有银弹，按场景组合。**
