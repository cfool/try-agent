# 第 4 阶段：Agent Loop (ReAct)

> **导航**：首页 » 实战开发
>
> ⬅️ [上一章：Tools](./03-tools.md) | ➡️ [下一章：工程化完善](./04b-refinement.md)

---

**Branch:** `04-loop`

## 问题发现

在第三阶段，我们让 AI 拥有了工具调用的能力。但试着给它一个稍微复杂的任务：

```
你: 帮我看看 src 目录下有哪些文件，然后告诉我 index.ts 里写了什么。
AI: (调用 ls src) -> 返回文件列表 [index.ts, chat.ts, ...]
(此时程序可能已经结束，或者 AI 只能干巴巴地复述一遍文件列表)
```

**AI 只能完成"单步动作"。**

现实任务通常需要多步协作：先查文件列表，再读具体内容，最后整理汇报。如果我们的代码逻辑是"用户提问 -> 调用一次 API -> 结束"，那么 AI 永远无法完成链式操作。它无法根据上一步工具返回的结果（观察到的现象）来决定下一步该做什么。

就像一个没有指挥官的士兵：你让他冲锋，他冲出战壕就停在那了，不知道下一步是该开火还是掩护。

## 解决方案

引入 **Agent Loop（智能体循环）**。

真正的 Agent 需要一个自动化的驱动循环——调完工具看结果，把结果喂回给 AI，让它继续判断：是任务完成了可以回复用户了，还是需要再调另一个工具？

这个过程通常被称为 **ReAct (Reason + Act)**：
1. **Reasoning（推理）**：AI 思考当前状况，决定下一步。
2. **Acting（行动）**：AI 发出工具调用请求，代码执行工具。
3. **Observation（观察）**：代码将工具执行结果反馈给 AI，AI 观察结果。

循环往复，直到 AI 给出最终答案。

## 核心循环

`chat.ts` 中的核心循环：

```typescript
async send(text: string): Promise<string> {
  this.history.push({ role: "user", parts: [{ text }] });

  const tools = this.getToolDeclarations();

  for (let i = 0; i < this.maxRounds; i++) {   // 安全阀：默认最多 100 圈
    const messages = this.buildMessages();

    const result = await this.client.sendMessage(messages, {
      systemInstruction: this.systemPrompt,
      tools: tools.length > 0 ? tools : undefined,
    });
    this.history.push({ role: "model", parts: [result] });

    if (!result.functionCall) {          // 无工具调用 → 返回文本
      return result.text ?? "";
    }

    const { id, name, args } = result.functionCall;
    const toolResult = await this.toolRegistry!.execute(name, args);

    this.history.push({                  // 工具结果存入历史
      role: "tool",
      parts: [{ functionResponse: { id, name, response: toolResult.result } }],
    });
  }                                      // 回到循环顶部，AI 继续决策

  throw new Error("Max tool call rounds exceeded");
}
```

## 实际运行过程

```
用户："帮我看看当前目录有什么文件，然后统计代码行数"

第 1 圈：AI → 执行 ls -la → 代码返回结果
第 2 圈：AI → 执行 wc -l src/*.ts → 代码返回结果
第 3 圈：AI → 返回文本总结 → 循环结束 ✅
```

## 流程图

```
    ┌──────────────────────────────────────┐
    │                                      │
    ▼                                      │
 调用 LLM ──▶ AI 返回结果 ──▶ 有工具调用？ ─┘
                               │
                               否 → 返回文本给用户 ✅
```

`maxRounds` 默认为 100（可通过 `ChatOptions` 配置），是安全阀，防止 AI 死循环。

## 扩展

`ToolRegistry` 支持随时扩展新工具，当前已内置多个工具：

```typescript
registry.register(new RunShellCommand({ timeoutMs: 30_000 }));
registry.register(new ReadFile());
registry.register(new ReadFolder());
registry.register(new WriteFile());
registry.register(new EditFile());
```

工具越多，Agent 能力越强。但原理不变：**LLM 决策，工具执行，循环驱动。**

---

> **导航**：首页 » 实战开发
>
> ⬅️ [上一章：Tools](./03-tools.md) | ➡️ [下一章：工程化完善](./04b-refinement.md)
