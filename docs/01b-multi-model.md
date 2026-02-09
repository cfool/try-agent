# 第 1.5 阶段：给 AI 换个"大脑" (Multi-Model Support)

> **导航**：首页 » 实战开发
>
> ⬅️ [上一章：Hello AI](./01-hello-ai.md) | ➡️ [下一章：Memory](./02-memory.md)

---

**Branch:** `01b-multi-model`

在[上一章](./01-hello-ai.md)我们给 AI 换了各种"人设"(System Prompt)，但无论人设怎么变，驱动它的"大脑"始终是 Google 的 Gemini。

如果说 System Prompt 是演员的**剧本**，那模型供应商 (Model Provider) 就是演员的**大脑**。同一个剧本，让不同的演员来演，效果天差地别。

这个项目就像一个"大脑"插拔机器人，除了 Gemini，我们还内置了对 **DeepSeek** 和 **智谱 (ZhiPu)** 的支持。你可以随时给你的 AI 代理换个"脑子"！

## 为什么要换"大脑"？

不同的"大脑"有不同的特长：

*   **Gemini**: 综合能力强，像个全能学霸。
*   **DeepSeek**: 据说在代码和推理方面有奇效，是个逻辑鬼才。
*   **智谱 (GLM系列)**: 中文理解能力超群，是个本土文学家。
*   **成本与速度**: 不同模型的定价和响应速度也不同。

换着用，总能找到最适合你当前任务的那个"大脑"。

## 如何换"大脑"？

三步走：搞到 Key -> 配置 Key -> 切换着用。

### 1. 搞到 API Keys

就像你需要一把钥匙才能打开 Gemini 的门一样，你也需要其他家的钥匙。

*   **DeepSeek**: 去 [DeepSeek 官网](https://platform.deepseek.com/api_keys) 注册并获取 API Key。
*   **智谱**: 去 [智谱开放平台](https://open.bigmodel.cn/overview) 注册并获取 API Key。

### 2. 配置 `.env` 文件

把你新搞到的钥匙串在钥匙链 (`.env` 文件) 上：

```env
# Google Gemini (老朋友了)
GEMINI_API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# DeepSeek (逻辑鬼才)
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# 智谱 (本土文学家)
ZHIPU_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. 切换"大脑"

我们提供了两种切换方式：

#### 方式一：指定默认"大脑"

想让你的 AI 默认就用 DeepSeek？在 `.env` 里加一行：

```env
MODEL_PROVIDER=deepseek
```

这样，每次启动 `npm start`，它都会自动加载 DeepSeek 的大脑。支持的值有 `gemini`, `deepseek`, `zhipu`。

#### 方式二：运行时热插拔

更酷的是，你可以在聊天过程中，随时给 AI 换"脑"！就像给机器人换芯片一样。

只要在聊天框里输入 `/use` 命令：

```
You: /use deepseek
```
> 系统会回应：
> `Switched to provider: deepseek`

然后，你的下一句话就会由 DeepSeek 来处理了。

```
You: /use zhipu
```
> 系统会回应：
> `Switched to provider: zhipu`

想换回 Gemini？也一样：

```
You: /use gemini
```

**动手试试：**
1.  配置好至少两个模型的 API Key。
2.  启动项目 (`npm start`)。
3.  问一个相同的问题，比如"用 Python 写一个快速排序"，然后用 `/use` 命令切换模型，看看不同"大脑"给出的代码风格和解释有什么不一样。

**能力：** 可以在多个"大脑"之间无缝切换，为不同的任务选择最合适的 AI 模型。
**类比：** 你现在拥有一个复仇者联盟，而不是只有一个钢铁侠。

---

> **导航**：首页 » 实战开发
>
> ⬅️ [上一章：Hello AI](./01-hello-ai.md) | ➡️ [下一章：Memory](./02-memory.md)
