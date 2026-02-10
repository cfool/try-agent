import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

export interface ProjectContext {
  cwd: string;
  files: string[];
  datetime: string;
}

/**
 * 收集当前项目的环境信息：工作目录、目录列表、当前时间。
 */
export function getProjectContext(cwd: string = process.cwd()): ProjectContext {
  let files: string[] = [];
  try {
    files = readdirSync(cwd).map((name) => {
      const fullPath = resolve(cwd, name);
      try {
        const stat = statSync(fullPath);
        return stat.isDirectory() ? `${name}/` : name;
      } catch {
        return name;
      }
    });
  } catch {
    // 读取目录失败时返回空列表
  }

  return {
    cwd,
    files,
    datetime: new Date().toISOString(),
  };
}

/**
 * 将项目信息格式化为可嵌入提示词的文本块。
 */
export function formatProjectContext(info: ProjectContext): string {
  const lines = [
    "<project-info>",
    `Working directory: ${info.cwd}`,
    `Current time: ${info.datetime}`,
    "",
    "Files and directories in workspace:",
    ...info.files.map((f) => `  ${f}`),
    "</project-info>",
  ];
  return lines.join("\n");
}
