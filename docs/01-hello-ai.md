---
title: Hello AI
nav_order: 1
parent: 实战开发
---

# 第 1 阶段：让 AI 开口说话 (Hello AI)

**Branch:** `01-hello`

就干了一件事——调 API：

```
终端输入 → HTTP 请求 → Gemini API → HTTP 响应 → 终端输出
```

调 API 时，请求体里最关键的两个参数：

```typescript
const body = {
  system_instruction: {               // ① 系统提示词
    parts: [{ text: "你是一个..." }],
  },
  contents: [                          // ② 用户提问
    { role: "user", parts: [{ text: "你好" }] },
  ],
};
```

- **`system_instruction`（系统提示词）**：告诉 AI "你是谁、该怎么做"的隐藏指令。用户看不到，但 AI 会始终遵守。比如 `"你是一个编程助手，只回答技术问题"`。
- **`contents`（对话内容）**：用户实际发送的消息。每条消息带 `role`（谁说的）和 `parts`（说了什么）。

> 系统提示词 = 写给演员的剧本，用户提问 = 观众的提问。演员按剧本人设回答观众。

核心代码是 `gemini-client.ts` 里的一个 `fetch` 调用：

```typescript
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
```

## 试试不同的系统提示词

项目预置了 5 种风格的系统提示词（在 `src/prompts/` 目录下），同样的问题，换一个提示词，AI 的回答风格完全不同：

| 提示词 | 风格 | 问"什么是递归"时可能的回答 |
|:------|:-----|:----------------------|
| `personal-assistant` | 简洁礼貌的私人助手 | "递归是函数调用自身的编程技巧……" |
| `coding-mentor` | 资深编程导师，先讲为什么 | "在讲递归之前，你有没有想过为什么有些问题适合拆成子问题？" |
| `strict-engineer` | 严格的高级工程师 | "递归：函数直接或间接调用自身。注意：必须有终止条件，否则栈溢出。" |
| `sarcastic-friend` | 毒舌老友 | "你认真的吗……递归就是自己调自己，就像你问我什么是递归一样。" |
| `anime-girl` | 会编程的猫娘"小码" | "嗨嗨！递归就像照两面镜子，镜子里还有镜子喵~" |

在 `src/index.ts` 中修改一行就能切换：

```typescript
// 切换提示词风格：修改这里的参数即可
// 可选: personal-assistant | sarcastic-friend | coding-mentor | anime-girl | strict-engineer
const systemPrompt = getSystemPrompt("anime-girl");
```

**动手试试：** 把参数改成 `"strict-engineer"` 或 `"sarcastic-friend"`，然后重新运行，用同一个问题感受不同风格的回答。

> 系统提示词决定了 AI 的"人设"。同一个大脑，换一套剧本，就是完全不同的角色。

**能力：** 单轮问答，你说一句它答一句，关终端就全忘。
**类比：** 一条金鱼，记忆只有 7 秒。
