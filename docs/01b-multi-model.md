---
title: 多模型支持
nav_order: 2
parent: 实战开发
---

# 第 1.5 阶段：给 AI 换个"大脑" (Multi-Model Support)

**Branch:** `01b-multi-model`

在[上一章](./01-hello-ai.md)我们给 AI 换了各种"人设"(System Prompt)，但无论人设怎么变，驱动它的"大脑"始终是同一个模型。

如果说 System Prompt 是演员的**剧本**，那模型供应商 (Model Provider) 就是演员的**大脑**。同一个剧本，让不同的演员来演，效果天差地别。

这个项目就像一个"大脑"插拔机器人，我们内置了对 **Gemini**、**DeepSeek**、**智谱 (ZhiPu)** 和 **腾讯混元 (Tencent Hunyuan)** 的支持。你可以随时给你的 AI 代理换个"脑子"！

## 为什么要换"大脑"？

不同的"大脑"有不同的特长：

*   **Gemini (gemini-3-flash-preview)**: Google 出品，综合能力强，像个全能学霸。
*   **DeepSeek (deepseek-v3.2)**: 在代码和推理方面有奇效，是个逻辑鬼才。
*   **智谱 (glm-5)**: 中文理解能力超群，是个本土文学家。
*   **腾讯混元 (hunyuan-turbos-latest)**: 腾讯自研大模型，国内访问快、中文能力强。
*   **成本与速度**: 不同模型的定价和响应速度也不同。

换着用，总能找到最适合你当前任务的那个"大脑"。

## 核心问题：各家 API 协议不统一

要支持多模型，第一个绕不开的问题就是——**各家供应商的 API 协议各不相同**。

举个例子，同样是"发送一条消息并调用工具"，Gemini 和 OpenAI 系的请求格式天差地别：

| 差异点 | Gemini 原生 API | OpenAI 兼容 API (DeepSeek / 智谱 / 混元) |
|---|---|---|
| 端点格式 | `models/{model}:generateContent` | `/chat/completions` |
| 角色名称 | `user` / `model` | `user` / `assistant` / `system` |
| System Prompt | 顶层 `system_instruction` 字段 | `role: "system"` 的消息 |
| 工具声明 | `tools: [{ function_declarations: [...] }]` | `tools: [{ type: "function", function: {...} }]` |
| 工具调用结果 | `role: "user"` + `functionResponse` 部分 | `role: "tool"` + `tool_call_id` |
| 工具调用参数 | 直接是 JSON 对象 (`args: {...}`) | 序列化为字符串 (`arguments: "{...}"`) |
| 认证方式 | URL 参数 `?key=xxx` | Header `Authorization: Bearer xxx` |

> 关于工具调用的协议差异，在03/04，给agent增加工具调用的章节中会有相关代码

如果你要做一个支持多模型供应商的 Agent，就必须考虑这些协议差异，并做好协议转换。好消息是，目前大部分国内模型供应商（DeepSeek、智谱、腾讯混元等）都提供了兼容 OpenAI 格式的 API，这大大降低了适配成本——你只需要处理两种协议：**Gemini 原生** 和 **OpenAI 兼容**。

## 架构设计：Provider 抽象层

理解了协议差异问题后，我们的解决方案就很自然了：**统一接口 + 分层抽象**。

```
ModelClient (统一入口：注册、切换、路由)
  │
  ├── GeminiProvider              (Gemini 原生协议适配)
  │     转换: Message ↔ GeminiContent
  │     角色映射: "model" → "model", "tool" → "user" + functionResponse
  │
  └── OpenAICompatibleProvider    (OpenAI 协议适配)
        转换: Message ↔ ChatMessage
        角色映射: "model" → "assistant", "tool" → "tool" + tool_call_id
        │
        ├── DeepSeekProvider      (baseUrl: api.deepseek.com)
        ├── ZhiPuProvider         (baseUrl: open.bigmodel.cn/api/paas/v4)
        └── TencentProvider       (baseUrl: api.hunyuan.cloud.tencent.com/v1)
```

### 第一层：统一的 ModelProvider 接口

不管底层协议怎么变，上层代码只看一个接口：

```typescript
// src/model/providers/types.ts
export interface ModelProvider {
  name: string;
  sendMessage(
    messages: Message[],
    options?: SendMessageOptions
  ): Promise<SendMessageResult>;
}
```

`SendMessageOptions` 支持传入 `systemInstruction` 和 `tools`（函数声明），`SendMessageResult` 会返回文本或函数调用请求。上层的 Chat、Agent Loop、工具调用等逻辑完全不需要关心底层用的是哪家 API。

### 第二层：协议适配

每个 Provider 的核心工作就是**协议转换**——把统一的 `Message` 翻译成各家 API 能理解的格式，再把响应翻译回来。

**GeminiProvider** 需要处理 Gemini 特有的格式（比如工具结果要以 `role: "user"` 发送，函数参数直接是 JSON 对象），以及 Gemini 独有的 `thoughtSignature` 字段。

**OpenAICompatibleProvider** 则处理 OpenAI 格式的转换（`role: "model"` → `"assistant"`、函数参数需要 `JSON.stringify` 序列化等）。由于 DeepSeek、智谱、腾讯混元都兼容这套格式，它们只需继承这个基类，提供自己的 `baseUrl` 就行：

```typescript
// src/model/providers/deepseek.ts — 只需 5 行就完成一个新供应商的接入
export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(options: { apiKey: string; model: string }) {
    super({
      name: "deepseek",
      apiKey: options.apiKey,
      model: options.model,
      baseUrl: "https://api.deepseek.com",
    });
  }
}
```

这意味着，如果你将来要接入一个新的 OpenAI 兼容供应商（比如 Moonshot、百川等），只需要写一个类似的子类，改个 `baseUrl` 就完事了。

### 第三层：ModelClient 注册与切换

`ModelClient` 负责模型的注册和运行时切换。每个模型以 `name`（模型标识）和 `alias`（显示名）注册：

```typescript
// src/model/client.ts
client.registerModel({
  name: 'deepseek-v3.2',
  alias: 'DeepSeek-V3.2',
  provider: new DeepSeekProvider({ apiKey: deepseekKey, model: 'deepseek-chat' })
});
```

`name` 是你在 `/use` 命令和 `MODEL` 环境变量中使用的标识符，`alias` 是展示给用户看的友好名称。

## 如何换"大脑"？

三步走：搞到 Key -> 配置 Key -> 切换着用。

### 1. 搞到 API Keys

就像你需要一把钥匙才能打开 Gemini 的门一样，你也需要其他家的钥匙。

*   **Gemini**: 去 [Google AI Studio](https://aistudio.google.com/) 获取 API Key。
*   **DeepSeek**: 去 [DeepSeek 官网](https://platform.deepseek.com/api_keys) 注册并获取 API Key。
*   **智谱**: 去 [智谱开放平台](https://open.bigmodel.cn/overview) 注册并获取 API Key。
*   **腾讯混元**: 去 [腾讯混元控制台](https://hunyuan.cloud.tencent.com/#/app/apiKeyMana) 获取 API Key。

### 2. 配置 `.env` 文件

把你新搞到的钥匙串在钥匙链 (`.env` 文件) 上：

```env
# Google Gemini (全能学霸)
GEMINI_API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# DeepSeek (逻辑鬼才)
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# 智谱 (本土文学家)
ZHIPU_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxx

# 腾讯混元 (国产之光)
TENCENT_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

程序启动时会自动检测哪些 Key 存在，并注册对应的模型。**不需要的供应商可以不配置**，只要至少配了一个就行。

### 3. 切换"大脑"

我们提供了两种切换方式：

#### 方式一：指定默认模型

想让你的 AI 默认就用某个模型？在 `.env` 里用 `MODEL` 环境变量指定模型名：

```env
# 指定默认模型（填模型注册名，不是 provider 名）
MODEL=hunyuan-turbos-latest
```

支持的模型名：

| 模型名 | 别名 | 供应商 |
|---|---|---|
| `gemini-3-flash-preview` | Gemini-3-Flash | Google |
| `deepseek-v3.2` | DeepSeek-V3.2 | DeepSeek |
| `glm-5` | GLM-5 | 智谱 |
| `hunyuan-turbos-latest` | Hunyuan-Turbos | 腾讯 |

如果不设置 `MODEL`，程序会使用第一个成功注册的模型。

#### 方式二：运行时热插拔

更酷的是，你可以在聊天过程中，随时给 AI 换"脑"！就像给机器人换芯片一样。

只要在聊天框里输入 `/use` 命令 + **模型名**：

```
You: /use deepseek-v3.2
```
> 系统会回应：
> `Switched to Model: DeepSeek-V3.2`

然后，你的下一句话就会由 DeepSeek 来处理了。

```
You: /use glm-5
```
> 系统会回应：
> `Switched to Model: GLM-5`

切换到腾讯混元：

```
You: /use hunyuan-turbos-latest
```

想换回 Gemini？也一样：

```
You: /use gemini-3-flash-preview
```

> **注意**：`/use` 后面跟的是模型注册名（即上表中"模型名"列的值），不是供应商名称。如果输入了不存在的名称，系统会提示可用的模型列表。

> **提示**：在 [第 9 部分：TUI](./09-tui.md) 中，`/use` 命令将升级为交互式的 `/model` 命令，通过选择面板切换模型，无需手动输入模型名。

**动手试试：**
1.  配置好至少两个模型的 API Key。
2.  启动项目 (`npm start`)。
3.  问一个相同的问题，比如"用 Python 写一个快速排序"，然后用 `/use` 命令切换模型，看看不同"大脑"给出的代码风格和解释有什么不一样。

**能力：** 可以在多个"大脑"之间无缝切换，为不同的任务选择最合适的 AI 模型。
**类比：** 你现在拥有一个复仇者联盟，而不是只有一个钢铁侠。
