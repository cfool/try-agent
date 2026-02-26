import type { Message, Part } from "../model/providers/types.js";
import { ModelClient } from "../model/client.js";
import type { ChatEventBus } from "../chat-events.js";

/**
 * 压缩阈值：当 history 的估算 token 数超过模型 token 上限的此比例时触发压缩。
 */
const COMPRESSION_TOKEN_THRESHOLD = 0.5;

/**
 * 保留比例：压缩时保留最近 30% 的历史，压缩前 70%。
 */
const COMPRESSION_PRESERVE_FRACTION = 0.3;

/**
 * functionResponse 的 token 预算。
 * 超出预算的旧工具输出会被截断，防止单条巨大结果撑爆上下文。
 */
const FUNCTION_RESPONSE_TOKEN_BUDGET = 50_000;

/**
 * 模型 token 上限（简化版，固定值）。
 * 实际项目中应根据模型动态获取。
 */
const MODEL_TOKEN_LIMIT = 1_000_000;

const COMPRESSION_SYSTEM_PROMPT = `You are a conversation compressor. Your job is to create a concise <state_snapshot> that captures all essential information from the conversation history.

The snapshot MUST preserve:
- All user requirements and constraints
- Key decisions made during the conversation
- Important file paths, code snippets, and technical details
- Tool call results that are still relevant
- Any established context the assistant needs to continue working

Format your response as:
<state_snapshot>
[Your compressed summary here]
</state_snapshot>

Write in the same language the user used. Be thorough but concise.`;

export enum CompressionStatus {
  NOOP = "noop",
  COMPRESSED = "compressed",
  FAILED_EMPTY_SUMMARY = "failed_empty_summary",
  FAILED_INFLATED = "failed_inflated",
}

export interface CompressionResult {
  newHistory: Message[] | null;
  originalTokenCount: number;
  newTokenCount: number;
  status: CompressionStatus;
}

/** 1 token ≈ 4 characters */
function estimateTokens(parts: Part[]): number {
  let chars = 0;
  for (const part of parts) {
    if (part.text) {
      chars += part.text.length;
    }
    if (part.functionCall) {
      chars += part.functionCall.name.length;
      chars += JSON.stringify(part.functionCall.args).length;
    }
    if (part.functionResponse) {
      chars += part.functionResponse.name.length;
      chars += JSON.stringify(part.functionResponse.response).length;
    }
  }
  return Math.ceil(chars / 4);
}

function estimateHistoryTokens(history: Message[]): number {
  return estimateTokens(history.flatMap((c) => c.parts));
}

/**
 * 找到压缩切分点：保留最后 fraction 比例的历史，压缩前面的部分。
 * 切分点只会选在"user text 消息"处，确保不会拆散 functionCall/functionResponse 对。
 */
function findCompressSplitPoint(
  contents: Message[],
  fraction: number
): number {
  const charCounts = contents.map((c) => JSON.stringify(c).length);
  const totalChars = charCounts.reduce((a, b) => a + b, 0);
  const targetChars = totalChars * fraction;

  let lastSplitPoint = 0;
  let cumulativeChars = 0;

  for (let i = 0; i < contents.length; i++) {
    const content = contents[i];
    // 只在 user text 消息处切分（跳过 functionResponse-only 的 user 消息）
    if (
      content.role === "user" &&
      !content.parts?.some((p) => !!p.functionResponse)
    ) {
      if (cumulativeChars >= targetChars) {
        return i;
      }
      lastSplitPoint = i;
    }
    cumulativeChars += charCounts[i];
  }

  // 如果最后一条是 model 且无 functionCall，可以压缩全部
  const last = contents[contents.length - 1];
  if (last?.role === "model" && !last?.parts?.some((p) => p.functionCall)) {
    return contents.length;
  }

  return lastSplitPoint;
}

/**
 * 反向 token 预算截断：从最新消息向前遍历，
 * 优先保留近期工具输出的完整性，超出预算的旧工具输出被截断。
 */
function truncateHistoryToBudget(history: Message[]): Message[] {
  let functionResponseTokens = 0;
  const result: Message[] = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const content = history[i];
    const newParts: Part[] = [];

    for (let j = (content.parts?.length ?? 0) - 1; j >= 0; j--) {
      const part = content.parts[j];

      if (part.functionResponse) {
        const resStr = JSON.stringify(part.functionResponse.response);
        const tokens = estimateTokens([{ text: resStr }]);

        if (
          functionResponseTokens + tokens >
          FUNCTION_RESPONSE_TOKEN_BUDGET
        ) {
          // 超出预算：截断到最后 30 行
          const lines = resStr.split("\n");
          const truncated =
            lines.length > 30
              ? `[Truncated: ${lines.length - 30} lines omitted]\n` +
                lines.slice(-30).join("\n")
              : resStr;

          newParts.unshift({
            functionResponse: {
              id: part.functionResponse.id,
              name: part.functionResponse.name,
              response: { output: truncated } as Record<string, unknown>,
            },
          });
          functionResponseTokens += estimateTokens([{ text: truncated }]);
        } else {
          functionResponseTokens += tokens;
          newParts.unshift(part);
        }
      } else {
        newParts.unshift(part);
      }
    }

    result.unshift({ ...content, parts: newParts });
  }

  return result;
}

/**
 * ChatCompressService — 检测对话历史是否超出 token 阈值，
 * 超出时将旧消息通过 LLM 压缩为摘要，返回压缩后的新 history。
 *
 * 参考 Gemini CLI 的压缩策略：
 * - 按字符比例切分而非固定轮数
 * - 压缩前先截断大工具输出
 * - 验证压缩后 token 数不膨胀
 */
export class ChatCompressService {
  private client: ModelClient;
  private events: ChatEventBus;

  constructor(client: ModelClient, events: ChatEventBus) {
    this.client = client;
    this.events = events;
  }

  async compressIfNeeded(history: Message[]): Promise<CompressionResult> {
    const originalTokenCount = estimateHistoryTokens(history);
    const threshold = MODEL_TOKEN_LIMIT * COMPRESSION_TOKEN_THRESHOLD;

    if (originalTokenCount <= threshold) {
      return {
        newHistory: null,
        originalTokenCount,
        newTokenCount: originalTokenCount,
        status: CompressionStatus.NOOP,
      };
    }

    // 1. 截断大工具输出
    const truncatedHistory = truncateHistoryToBudget(history);

    // 2. 找切分点：压缩前 70%，保留后 30%
    const splitPoint = findCompressSplitPoint(
      truncatedHistory,
      1 - COMPRESSION_PRESERVE_FRACTION
    );

    const historyToCompress = truncatedHistory.slice(0, splitPoint);
    const historyToKeep = truncatedHistory.slice(splitPoint);

    if (historyToCompress.length === 0) {
      return {
        newHistory: null,
        originalTokenCount,
        newTokenCount: originalTokenCount,
        status: CompressionStatus.NOOP,
      };
    }

    // 3. 调用 LLM 生成摘要
    const hasPreviousSnapshot = historyToCompress.some((c) =>
      c.parts?.some((p) => p.text?.includes("<state_snapshot>"))
    );

    const anchorInstruction = hasPreviousSnapshot
      ? "A previous <state_snapshot> exists in the history. Integrate all still-relevant information from that snapshot into the new one, updating it with more recent events."
      : "Generate a new <state_snapshot> based on the provided history.";

    const summaryResult = await this.client.sendMessage(
      [
        ...historyToCompress,
        {
          role: "user",
          parts: [
            {
              text: `${anchorInstruction}\n\nGenerate the <state_snapshot>.`,
            },
          ],
        },
      ],
      { systemInstruction: COMPRESSION_SYSTEM_PROMPT }
    );

    const summary = summaryResult.text?.trim() ?? "";

    if (!summary) {
      return {
        newHistory: null,
        originalTokenCount,
        newTokenCount: originalTokenCount,
        status: CompressionStatus.FAILED_EMPTY_SUMMARY,
      };
    }

    // 4. 组装新 history
    const newHistory: Message[] = [
      { role: "user", parts: [{ text: summary }] },
      {
        role: "model",
        parts: [{ text: "Got it. Thanks for the additional context!" }],
      },
      ...historyToKeep,
    ];

    // 5. 验证：压缩后不应比压缩前更大
    const newTokenCount = estimateHistoryTokens(newHistory);
    if (newTokenCount > originalTokenCount) {
      return {
        newHistory: null,
        originalTokenCount,
        newTokenCount,
        status: CompressionStatus.FAILED_INFLATED,
      };
    }

    this.events.emit("compressed", {
      from: originalTokenCount,
      to: newTokenCount,
    });

    return {
      newHistory,
      originalTokenCount,
      newTokenCount,
      status: CompressionStatus.COMPRESSED,
    };
  }
}
