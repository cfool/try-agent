# 环境配置 (Setup)

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

## 5. 运行 Hello World

一切准备就绪，运行项目看看效果：

```bash
npm start
```

如果看到类似下面的输出，说明配置成功！🎉

```text
Starting Gemini CLI...
You:
```

试着输入 "你好" 并回车。

## 下一步

环境配置完成后，请阅读 [**第 0 章：核心概念**](./00-concepts.md)，了解 Agent 背后的基本原理。
