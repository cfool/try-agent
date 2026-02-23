import { parseFrontmatter } from "../utils/frontmatter.js";

/**
 * SubAgent 定义：从 Markdown + YAML frontmatter 文件解析而来。
 */
export interface SubAgentDefinition {
  /** 唯一标识（默认取文件名，不含扩展名） */
  name: string;
  /** 描述（用于 LLM 决策选择子 Agent） */
  description: string;
  /** Markdown 正文作为子 Agent 的系统提示词 */
  systemPrompt: string;
  /** 允许的工具名列表（不设则继承全部） */
  tools?: string[];
  /** 模型 provider 覆盖（如 "deepseek"） */
  model?: string;
  /** 最大工具调用轮数 */
  maxTurns?: number;
}

/**
 * 解析一个子 Agent 定义文件。
 *
 * @param content  文件原始内容
 * @param fileName 文件名（不含路径，用于提取默认 name）
 */
export function parseSubAgentFile(content: string, fileName: string): SubAgentDefinition {
  const { meta, body } = parseFrontmatter(content);

  const defaultName = fileName.replace(/\.md$/i, "");

  const definition: SubAgentDefinition = {
    name: meta.name || defaultName,
    description: meta.description || "",
    systemPrompt: body,
  };

  if (meta.tools) {
    definition.tools = meta.tools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  if (meta.model) {
    definition.model = meta.model;
  }

  if (meta.maxTurns) {
    const parsed = parseInt(meta.maxTurns, 10);
    if (!isNaN(parsed) && parsed > 0) {
      definition.maxTurns = parsed;
    }
  }

  return definition;
}
