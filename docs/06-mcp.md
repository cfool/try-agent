# 第 6 阶段：MCP 协议 (Model Context Protocol)

每个工具都要写一套"定义→解析→执行"的胶水代码。工具一多，维护成本爆炸。MCP 就是为解决这个问题而生的**标准化协议**。

## MCP 解决的问题

没有 MCP 时，每对接一个外部工具，你都要：

```
Agent A 对接 GitHub   → 写一套 GitHub 工具定义 + 执行逻辑
Agent A 对接 Slack    → 写一套 Slack 工具定义 + 执行逻辑
Agent B 对接 GitHub   → 再写一套（跟 A 的还不一样）
Agent B 对接 Slack    → 再写一套...
```

**M 个 Agent × N 个工具 = M × N 套集成代码。** 这就是碎片化。

有了 MCP：

```
Agent A ─┐                  ┌─ GitHub MCP Server
Agent B ─┤── MCP 协议 ──────┤─ Slack MCP Server
Agent C ─┘   (标准接口)      └─ 数据库 MCP Server
```

**M + N 套代码就够了。** 每个 Agent 只需实现 MCP Client，每个工具只需实现 MCP Server。

## MCP 架构

MCP 采用三层架构：

```
┌─────────────────────────────────────────────────┐
│                    Host                          │
│   (Agent 应用，如 Claude Code、Cursor)            │
│                                                  │
│   ┌────────────┐  ┌────────────┐                │
│   │ MCP Client │  │ MCP Client │  ...           │
│   └─────┬──────┘  └─────┬──────┘                │
│         │               │                        │
└─────────┼───────────────┼────────────────────────┘
          │ MCP 协议       │ MCP 协议
          ▼               ▼
   ┌────────────┐  ┌────────────┐
   │ MCP Server │  │ MCP Server │
   │  (GitHub)  │  │ (Database) │
   └────────────┘  └────────────┘
```

| 角色 | 职责 |
|:-----|:-----|
| **Host** | Agent 应用本身，管理多个 Client |
| **MCP Client** | 负责与一个 MCP Server 建立连接、收发消息 |
| **MCP Server** | 工具提供方，暴露工具定义和执行能力 |

## 与直接 Function Calling 的对比

| | 直接 Function Calling | MCP |
|:--|:-----|:-----|
| **工具定义** | 硬编码在 Agent 中 | Server 动态暴露，Client 自动发现 |
| **新增工具** | 改 Agent 代码 | 启动新的 MCP Server，无需改 Agent |
| **跨 Agent 复用** | 每个 Agent 各写各的 | 同一个 Server 给所有 Agent 用 |
| **工具运行位置** | 和 Agent 同进程 | 可以在本地、远程、容器中 |

## MCP 通信过程

一次完整的 MCP 工具调用：

```
Agent(Host)              MCP Client              MCP Server
    │                        │                        │
    │  1. 启动时             │   ── initialize ──▶    │
    │                        │   ◀── 工具列表 ────    │
    │                        │                        │
    │  2. 用户提问           │                        │
    │  ──"查 GitHub issue"─▶ │                        │
    │                        │                        │
    │  3. LLM 决定调工具     │                        │
    │  ── tool_call ──────▶  │   ── execute ────▶     │
    │                        │   ◀── result ─────     │
    │  ◀── tool_result ───── │                        │
    │                        │                        │
    │  4. LLM 生成回复       │                        │
    │  ◀── 返回给用户        │                        │
```

关键点：

1. **初始化阶段**：MCP Client 连接 Server，获取可用工具列表
2. **调用阶段**：LLM 决定调用哪个工具，Client 转发给对应 Server 执行
3. **Agent 无感知**：对 Agent 来说，MCP 工具和本地工具的使用方式一样

## MCP Server 示例

一个最简单的 MCP Server 长这样（概念伪代码）：

```typescript
const server = new MCPServer({
  name: "weather-server",
  version: "1.0.0",
});

// 注册工具
server.tool("get_weather", { city: { type: "string" } }, async (args) => {
  const weather = await fetchWeather(args.city);
  return { temperature: weather.temp, condition: weather.desc };
});

// 启动，等待 Client 连接
server.listen();
```

Agent 端不需要知道天气怎么查的，只要连上这个 Server，就多了一个 `get_weather` 工具。

> **MCP = AI 工具的 USB 标准。Server 是外设，Client 是接口，Host 是你的电脑。插上就能用。**
