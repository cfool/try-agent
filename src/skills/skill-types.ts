import { parseFrontmatter } from "../utils/frontmatter.js";

/**
 * Skill 定义：从 Markdown + YAML frontmatter 文件解析而来。
 * Skill = 预封装的 prompt + 工具组合 + 执行流程，由用户斜杠命令或 LLM 工具调用触发。
 *
 * 兼容 Agent Skills 开放标准 (https://agentskills.io/specification)：
 * - name, description 为必填字段
 * - allowed-tools（空格分隔）为标准字段
 * - trigger, model, maxTurns, disable-model-invocation 为自定义扩展
 */
export interface SkillDefinition {
  /** 唯一标识（默认取文件名，不含扩展名） */
  name: string;
  /** 描述（展示在 /skills 列表中） */
  description: string;
  /** 斜杠命令触发，如 "/commit" */
  trigger: string;
  /** Markdown 正文作为 prompt 模板 */
  prompt: string;
  /** Skill 目录的绝对路径（用于 progressive disclosure，仅目录布局时设置） */
  skillPath?: string;
}

/**
 * 解析一个 Skill 定义文件。
 *
 * @param content   文件原始内容
 * @param fileName  文件名（不含路径，用于提取默认 name）
 * @param skillPath 可选，Skill 目录的绝对路径（目录布局时传入）
 */
export function parseSkillFile(content: string, fileName: string, skillPath?: string): SkillDefinition {
  const { meta, body } = parseFrontmatter(content);

  const defaultName = fileName.replace(/\.md$/i, "");

  // trigger 自动补前缀 "/"
  let trigger = meta.trigger || `/${defaultName}`;
  if (!trigger.startsWith("/")) {
    trigger = `/${trigger}`;
  }

  const definition: SkillDefinition = {
    name: meta.name || defaultName,
    description: meta.description || "",
    trigger,
    prompt: body,
  };

  if (skillPath) {
    definition.skillPath = skillPath;
  }

  return definition;
}
