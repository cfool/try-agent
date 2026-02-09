# AI Agent 开发教程

欢迎来到 AI Agent 开发教程！本教程将带你从零开始，一步步构建一个功能完备的命令行 AI 智能体（Agent）。

你将不仅仅是调用 API，而是深入理解 Agent 的核心架构：**大脑（LLM）、记忆（Context）、手脚（Tools）和技能（Skills）**。

## 教程目录

建议按以下顺序阅读和实践：

### 🏁 准备工作
*   [**环境配置 (Setup)**](docs/SETUP.md) - 安装依赖，获取 API Key，跑通 Hello World。

### 📚 核心概念
*   [**第 0 章：核心概念 (Concepts)**](docs/00-concepts.md) - 什么是 LLM、Context、Agent、MCP？这里有最通俗易懂的解释。

### 🛠️ 实战开发
*   [**第 1 阶段：让 AI 开口说话 (Hello AI)**](docs/01-hello-ai.md) - 第一次调用 Gemini API，体验不同的系统提示词 (Persona)。
*   [**第 2 阶段：让 AI 记住上下文 (Memory)**](docs/02-memory.md) - 解决 LLM "健忘"的问题，实现多轮对话。
*   [**第 3 阶段：给 AI 一双手 (Tools)**](docs/03-tools.md) - 实现 Tool Calling，让 AI 能执行 Shell 命令。
*   [**第 4 阶段：Agent Loop (ReAct)**](docs/04-agent-loop.md) - 构建 "思考-行动-观察" 循环，让 AI 自主完成多步任务。
*   [**第 4.5 阶段：工程化完善 (Refinement)**](docs/04b-refinement.md) - 注入项目上下文、优化文件工具、提升交互体验。

### 🚀 进阶架构
*   [**第 5 阶段：上下文管理 (Context Management)**](docs/05-context-management.md) - 滑动窗口、摘要压缩、RAG，解决 Token 限制问题。
*   [**第 6 阶段：MCP 协议 (Model Context Protocol)**](docs/06-mcp.md) - 学习 AI 时代的 "USB 标准"，连接万物。
*   [**第 7 阶段：Sub-Agent 模式 (子智能体)**](docs/07-sub-agent.md) - 让多个 AI 专家分工协作，解决复杂任务。
*   [**第 8 阶段：Agent Skill (技能)**](docs/08-agent-skill.md) - 封装自动化流程，让 Agent 掌握 "一键大招"。

## 学习建议

本项目不仅仅是文档，更是一个**可运行的代码库**。
教程中的每个阶段都对应 Git 历史中的关键 Commit。你可以通过 `git checkout` 切换到对应状态，亲自修改代码并观察效果。

开始你的 AI Agent 之旅吧！ 🚀