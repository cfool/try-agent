# 环境配置 (Setup)

> **导航**：首页 » 准备工作
>
> ⬅️ [返回目录](../README.md) | ➡️ [下一章：核心概念](./00-concepts.md)

---

在开始构建 Agent 之前，我们需要准备好开发环境。

## 1. 前置要求

确保你的电脑上安装了：

*   **Node.js**: 推荐 v18 或更高版本。
*   **Git**: 用于版本控制。
*   **包管理器**: npm (随 Node.js 安装), pnpm, 或 yarn。

## 2. 获取 Gemini API Key

本项目使用 Google Gemini 模型。你需要一个 API Key：

1.  访问 [Google AI Studio](https://aistudio.google.com/)。
2.  登录你的 Google 账号。
3.  点击 **"Get API key"**。
4.  点击 **"Create API key"**。
5.  复制生成的 Key（以 `AIza` 开头）。

> **注意**：Gemini API 目前有免费额度，足够开发测试使用。

## 3. 安装项目依赖

在终端中执行：

```bash
# 1. 克隆项目 (如果你还没克隆)
# git clone <repository-url>
# cd try_agent

# 2. 安装依赖
npm install
```

## 4. 配置环境变量

项目根目录下需要一个 `.env` 文件来存储敏感配置（如 API Key）。

1.  新建一个配置文件：
    ```bash
    touch .env
    ```

2.  编辑 `.env` 文件，填入你的 API Key：
    ```env
    GEMINI_API_KEY=AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    ```

## 5. 配置多模型供应商 (可选)

除了默认的 Google Gemini，本项目还支持其他模型供应商，如 DeepSeek 和智谱 (ZhiPu)。

1.  **获取 API Key**:
    *   **DeepSeek**: 访问 [DeepSeek 官网](https://platform.deepseek.com/api_keys) 获取 API Key。
    *   **智谱**: 访问 [智谱开放平台](https://open.bigmodel.cn/overview) 获取 API Key。

2.  **配置环境变量**:
    在 `.env` 文件中，添加相应模型的 API Key：
    ```env
    # ... 其他配置
    DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
    ZHIPU_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxx
    ```

3.  **指定默认模型 (可选)**:
    你可以通过 `MODEL_PROVIDER` 环境变量设置启动时默认使用的模型。例如，要默认使用 DeepSeek：
    ```env
    # ... 其他配置
    MODEL_PROVIDER=deepseek
    ```
    如果不设置，程序将默认使用 `gemini`，如果 `gemini` 未配置，则使用第一个配置的供应商。

## 6. 运行与切换模型

一切准备就绪，运行项目：

```bash
npm start
```

如果看到类似下面的输出，说明配置成功！🎉

```text
[DEBUG] Using preferred provider: gemini
Active provider: gemini
AI Chat (type 'exit' to quit, 'new' to start a new chat, '/use <provider>' to switch)

You:
```

### 在运行时切换模型

你可以在聊天中随时使用 `/use` 命令切换模型供应商。

*   切换到 DeepSeek:
    ```
    You: /use deepseek
    ```
*   切换到智谱:
    ```
    You: /use zhipu
    ```
*   切换回 Gemini:
    ```
    You: /use gemini
    ```

## 下一步

环境配置完成后，请阅读 [**第 0 章：核心概念**](./00-concepts.md)，了解 Agent 背后的基本原理。

---

> **导航**：首页 » 准备工作
>
> ⬅️ [返回目录](../README.md) | ➡️ [下一章：核心概念](./00-concepts.md)
