/**
 * 简单 YAML frontmatter 行解析器。
 * 仅处理 flat key-value 格式（不支持嵌套），无需引入 js-yaml 依赖。
 *
 * 支持的格式：
 * ```
 * ---
 * name: my-agent
 * description: A helpful agent
 * tools: read_file, write_file
 * model: gemini
 * maxTurns: 10
 * ---
 * ```
 */
export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const lines = raw.split("\n");

  // 必须以 "---" 开头
  if (lines[0]?.trim() !== "---") {
    return { meta: {}, body: raw };
  }

  const meta: Record<string, string> = {};
  let closingIndex = -1;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") {
      closingIndex = i;
      break;
    }
    const colonPos = line.indexOf(":");
    if (colonPos > 0) {
      const key = line.slice(0, colonPos).trim();
      const value = line.slice(colonPos + 1).trim();
      meta[key] = value;
    }
  }

  if (closingIndex === -1) {
    // 没有找到闭合的 "---"，当作无 frontmatter 处理
    return { meta: {}, body: raw };
  }

  const body = lines.slice(closingIndex + 1).join("\n").trim();
  return { meta, body };
}
