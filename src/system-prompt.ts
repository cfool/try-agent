import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "prompts");

/**
 * 从 src/prompts/ 目录读取指定的 md 文件作为系统提示词。
 * 切换风格只需修改这里的文件名。
 */
export function getSystemPrompt(name: string = "personal-assistant"): string {
  const filePath = resolve(PROMPTS_DIR, `${name}.md`);
  return readFileSync(filePath, "utf-8").trim();
}
