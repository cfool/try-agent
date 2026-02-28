# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An AI Agent tutorial codebase (Chinese language docs) that builds a CLI AI agent step-by-step. The final product is an interactive terminal agent supporting multi-model LLM backends, tool calling, MCP protocol, sub-agents, and a skill system.

## Commands

- `npm start` — Run the agent (uses `tsx src/index.ts`)
- `npm start -- --model <name>` — Run with a specific model (e.g., `deepseek-v3.2`)
- `npx tsc --noEmit` — Type-check without emitting

There are no test or lint scripts configured.

## Architecture

### Entry Flow

`src/index.ts` → parses CLI args with yargs → `src/tui/index.tsx` starts the Ink/React TUI app → creates a `Chat` instance which runs the ReAct agent loop.

### Core Agent Loop (`src/chat.ts`)

The `Chat` class implements a ReAct (think-act-observe) loop:
1. Builds messages with project context prepended to history
2. Streams LLM response via `ModelClient.streamMessage()`
3. If response contains `functionCalls`, executes them in parallel via `ToolRegistry`
4. Pushes tool results back into history, loops until no more tool calls or max rounds hit

Context compression (`ChatCompressService`) triggers automatically when history exceeds token thresholds.

### Model System (`src/model/`)

`ModelClient` is a registry of `ModelProvider` implementations. Providers are registered at module load time in `src/model/client.ts` based on which env vars (`GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `ZHIPU_API_KEY`, `TENCENT_API_KEY`) are set. All providers implement both `sendMessage()` and `streamMessage()` (AsyncGenerator yielding `StreamChunk`).

The message format uses a Gemini-style schema (`role: "user" | "model" | "tool"` with `Part[]` containing text, functionCall, or functionResponse). Non-Gemini providers translate to/from this format internally.

### Tool System (`src/tools/`)

`ToolRegistry` holds `Tool` instances. Each tool exports a `definition` (JSON Schema for params) and an `execute()` method. Tools: `run-shell-command`, `read-file`, `write-file`, `edit-file`, `read-folder`, `sub-agent-tool`, `skill-tool`, `get-task-output`.

### Event Bus (`src/chat-events.ts`)

`ChatEventBus` (typed `EventEmitter`) decouples the agent loop from the TUI. Events: `text_delta`, `tool_call`, `tool_result`, `compressed`, `background_task_started`, `background_task_complete`.

### TUI (`src/tui/`)

Built with Ink (React for terminals). `use-chat.ts` is the main hook managing Chat state. Slash commands are registered in `slash-commands.ts`. Components render messages, tool calls, markdown (with syntax highlighting via lowlight), and background task status.

### Sub-Agents and Skills

- **Sub-agents** (`src/subagents/`): Specialized agents (e.g., `codebase-investigator`) registered in `SubAgentRegistry`, invoked via the `sub-agent-tool`.
- **Skills** (`src/skills/`): Reusable automation workflows loaded from `.agent/skills/` directory by `SkillLoader`, registered in `SkillRegistry`, invoked via `skill-tool`.

### Documentation (`docs/`)

Tutorial chapters (00–11) deployed as GitHub Pages. The docs are standalone Markdown files with no static site generator — they rely on GitHub's default Markdown rendering.

## Configuration

- `.env` — API keys for model providers (not committed)
- `.mcp.json` — MCP server definitions (currently just `fetch-mcp`)
- `.agent/` — Agent-specific configs (skills, sub-agent definitions)
- System prompts live in `src/prompts/*.md` with YAML frontmatter parsed by `src/utils/frontmatter.ts`

## Key Conventions

- ESM-only (`"type": "module"` in package.json) — all imports use `.js` extensions
- TypeScript with `"jsx": "react-jsx"` for Ink components
- Runtime via `tsx` (no build step needed for development)
- Chinese language used in code comments, docs, and UI strings
