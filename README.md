# AI Agent 开发教程

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

欢迎来到 AI Agent 开发教程！本教程将带你从零开始，一步步构建一个最小可运行的命令行 AI 智能体（Agent），帮助你从代码层面理解AI Agent的逻辑。

你将不仅仅是调用 API，而是深入理解 Agent 的核心架构：**大脑（LLM）、记忆（Context）、手脚（Tools）和技能（Skills）**。

## 项目简介

这是一个**可运行的代码库**，教程中的每个阶段都对应 Git 历史中的关键 Commit。你可以通过 `git checkout` 切换到对应状态，亲自修改代码并观察效果。

**最终你将获得：**
- 一个能够执行 Shell 命令的 AI Agent
- 支持多模型切换（Gemini、DeepSeek、智谱）
- 完整的工具系统（文件读写、命令执行等）
- MCP 协议集成能力
- Sub-Agent 协作模式
- 可扩展的 Skill 系统

## 快速开始

```bash
# 1. 克隆项目
git clone <repository-url>
cd try_agent

# 2. 安装依赖
npm install

# 3. 配置环境变量
echo "GEMINI_API_KEY=your_api_key_here" > .env

# 4. 运行
npm start
```

详细配置请参考 [**环境配置 (Setup)**](docs/SETUP.md)。

## 前置要求

- **Node.js**: v18 或更高版本
- **Git**: 用于版本控制
- **API Key**: 至少一个模型供应商的 API Key（Gemini / DeepSeek / 智谱）

## 教程目录

建议按以下顺序阅读和实践：

### 🏁 准备工作
*   [**环境配置 (Setup)**](docs/SETUP.md) - 安装依赖，获取 API Key，跑通 Hello World。

### 📚 核心概念
*   [**第 0 章：核心概念 (Concepts)**](docs/00-concepts.md) - 什么是 LLM、Context、Agent、MCP？这里有最通俗易懂的解释。

### 🛠️ 实战开发
*   [**第 1 阶段：让 AI 开口说话 (Hello AI)**](docs/01-hello-ai.md) - 第一次调用 Gemini API，体验不同的系统提示词 (Persona)。
*   [**第 1.5 阶段：给 AI 换个"大脑" (Multi-Model)**](docs/01b-multi-model.md) - 支持多模型切换，体验不同模型的特点。
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

**推荐学习路径：**
1. 先阅读 [核心概念](docs/00-concepts.md) 建立认知基础
2. 按顺序完成实战开发章节，每章都有对应的 Git Branch
3. 动手修改代码，观察变化
4. 尝试进阶架构，扩展 Agent 能力

## 项目结构

```
try_agent/
├── docs/               # 教程文档
├── src/                # 源代码
│   ├── index.ts        # 入口文件
│   ├── chat.ts         # Agent 核心逻辑
│   ├── tools/          # 工具实现
│   └── prompts/        # 系统提示词
├── .env                # 环境变量配置
├── package.json        # 项目依赖
└── tsconfig.json       # TypeScript 配置
```

## 常用命令

| 命令 | 说明 |
|:-----|:-----|
| `npm start` | 启动 Agent |

## 常见问题

**Q: 启动后没有反应？**
A: 检查 `.env` 文件是否正确配置了 API Key。

**Q: 如何切换模型？**
A: 运行时使用 `/use <provider>` 命令，或在 `.env` 中设置 `MODEL_PROVIDER`。

**Q: Token 超限怎么办？**
A: 参考 [上下文管理](docs/05-context-management.md) 章节。

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 许可证

本项目采用 [MIT](LICENSE) 许可证。

---

开始你的 AI Agent 之旅吧！ 🚀
