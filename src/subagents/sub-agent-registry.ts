import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { SubAgentDefinition, parseSubAgentFile } from "./sub-agent-types.js";

/**
 * SubAgentRegistry — 从 `.agents/` 目录加载子 Agent 定义。
 *
 * 参考 McpClientManager 的初始化模式：
 * - 目录不存在时静默跳过
 * - 文件解析失败时 warn 并跳过
 */
export class SubAgentRegistry {
  private agents = new Map<string, SubAgentDefinition>();

  /**
   * 注册一个内置（编程方式定义）的子 Agent。
   * 用于在代码中直接定义的 Agent，而非从 .md 文件加载。
   */
  registerBuiltin(definition: SubAgentDefinition): void {
    if (this.agents.has(definition.name)) {
      console.warn(`[SubAgent] Built-in agent "${definition.name}" overwrites existing definition`);
    }
    this.agents.set(definition.name, definition);
  }

  /**
   * 扫描指定目录下所有 `.md` 文件并解析为子 Agent 定义。
   * 默认扫描工作目录下的 `.agents/` 目录。
   */
  async loadFromDirectory(dir?: string): Promise<void> {
    const agentsDir = dir ?? resolve(process.cwd(), ".agent/agents");

    let files: string[];
    try {
      files = await readdir(agentsDir);
    } catch {
      // 目录不存在，静默跳过
      return;
    }

    const mdFiles = files.filter((f) => f.endsWith(".md"));

    for (const fileName of mdFiles) {
      try {
        const filePath = join(agentsDir, fileName);
        const content = await readFile(filePath, "utf-8");
        const definition = parseSubAgentFile(content, fileName);
        this.agents.set(definition.name, definition);
      } catch (err) {
        console.warn(
          `[SubAgent] Failed to parse "${fileName}":`,
          err instanceof Error ? err.message : err
        );
      }
    }

    if (this.agents.size > 0) {
      const names = Array.from(this.agents.keys()).join(", ");
      console.log(`[SubAgent] Loaded ${this.agents.size} agent(s): ${names}`);
    }
  }

  /** 按名称查找子 Agent 定义 */
  get(name: string): SubAgentDefinition | undefined {
    return this.agents.get(name);
  }

  /** 返回所有已加载的子 Agent 定义 */
  list(): SubAgentDefinition[] {
    return Array.from(this.agents.values());
  }

  /** 是否没有加载任何子 Agent */
  get isEmpty(): boolean {
    return this.agents.size === 0;
  }
}
