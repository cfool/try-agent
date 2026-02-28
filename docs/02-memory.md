---
title: 记忆与上下文
nav_order: 6
---

# 第 2 阶段：让 AI 记住上下文 (Memory)

**Branch:** `02-memory`

## 问题发现

完成第一阶段后，试着和 AI 多聊几轮：

```
你: 我叫张三
AI: 你好张三！很高兴认识你～

你: 我叫什么名字？
AI: 抱歉，我不知道你叫什么名字，你还没告诉我呢～
```

**AI 完全不记得上一句你说了什么。**

这不是 bug，而是 LLM 的本质特性：**每次 API 调用都是一次全新的、独立的请求**。服务器不会帮你保存任何状态——上一秒你告诉它你叫张三，下一秒它就忘了。

就像每次打电话给一个失忆症患者，他永远不记得上次通话的内容。

## 解决方案

既然 LLM 不帮你记，那就**自己记，然后每次都念给它听**。

引入 `Chat` 类，维护一个 `history` 数组：

```typescript
export class Chat {
  private history: Message[] = [];

  async send(text: string): Promise<string> {
    this.history.push({ role: "user", text });
    const reply = await this.client.sendMessage(this.history, this.systemPrompt);
    this.history.push({ role: "model", text: reply });
    return reply;
  }
}
```

秘密在于：**每次调 API 都把完整对话历史发过去。** LLM 本身是无状态的，"记忆"完全靠客户端的数组模拟。就像每次见面都把日记本念给失忆症患者听。

```
第 1 轮：发送 [消息1]                    → AI 回复
第 2 轮：发送 [消息1, 回复1, 消息2]       → AI 回复
第 3 轮：发送 [消息1, 回复1, 消息2, 回复2, 消息3] → AI 回复
```

**能力：** 多轮对话，但只会"说"不会"做"。
**类比：** 嘴很能说但手是摆设的人。
