import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { SkillDefinition, parseSkillFile } from "./skill-types.js";

/**
 * SkillRegistry — 从 `.agent/skills/` 目录加载 Skill 定义。
 *
 * 目录布局（推荐，符合 Agent Skills 开放标准）：每个子目录包含 SKILL.md
 *
 * 参考 SubAgentRegistry 的初始化模式：
 * - 目录不存在时静默跳过
 * - 文件解析失败时 warn 并跳过
 */
export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();

  /**
   * 注册一个内置（编程方式定义）的 Skill。
   */
  registerBuiltin(definition: SkillDefinition): void {
    if (this.skills.has(definition.name)) {
      console.warn(`[Skill] Built-in skill "${definition.name}" overwrites existing definition`);
    }
    this.skills.set(definition.name, definition);
  }

  /**
   * 扫描指定目录，目录格式：
   * 子目录/SKILL.md（per Agent Skills spec）
   *
   * 默认扫描工作目录下的 `.agent/skills/` 目录。
   */
  async loadFromDirectory(dir?: string): Promise<void> {
    const skillsDir = dir ?? resolve(process.cwd(), ".agent/skills");

    let entries: string[];
    try {
      entries = await readdir(skillsDir);
    } catch {
      // 目录不存在，静默跳过
      return;
    }

    for (const entry of entries) {
      const entryPath = join(skillsDir, entry);

      try {
        const entryStat = await stat(entryPath);

        if (entryStat.isDirectory()) {
          // 目录布局：检查是否包含 SKILL.md
          const skillMdPath = join(entryPath, "SKILL.md");
          try {
            const content = await readFile(skillMdPath, "utf-8");
            // 目录名作为默认 name 的来源，fileName 传 entry（目录名）
            const definition = parseSkillFile(content, entry, entryPath);
            this.skills.set(definition.name, definition);
          } catch {
            // 子目录中没有 SKILL.md，静默跳过
          }
        }
      } catch (err) {
        console.warn(
          `[Skill] Failed to parse "${entry}":`,
          err instanceof Error ? err.message : err
        );
      }
    }

    if (this.skills.size > 0) {
      const names = Array.from(this.skills.keys()).join(", ");
      console.log(`[Skill] Loaded ${this.skills.size} skill(s): ${names}`);
    }
  }

  /** 按名称查找 Skill 定义 */
  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  /** 返回所有已加载的 Skill 定义 */
  list(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /** 是否没有加载任何 Skill */
  get isEmpty(): boolean {
    return this.skills.size === 0;
  }

  /**
   * 生成 <available_skills> XML 元数据，用于注入系统提示词。
   * 仅包含未禁止 LLM 调用的 Skill。
   *
   * @returns XML 字符串，若无可用 Skill 则返回空字符串
   */
  generateMetadataXml(): string {
    const invocableSkills = Array.from(this.skills.values());

    if (invocableSkills.length === 0) {
      return "";
    }

    const skillEntries = invocableSkills
      .map(
        (s) =>
          `  <skill>\n    <name>${s.name}</name>\n    <description>${s.description}</description>\n  </skill>`
      )
      .join("\n");

    return `<available_skills>\n${skillEntries}\n</available_skills>`;
  }

  /**
   * 匹配用户输入是否触发某个 Skill。
   * 匹配规则：精确匹配 trigger，或以 trigger + " " 开头（带参数），优先匹配最长 trigger。
   *
   * @returns `{ skill, args }` 或 `undefined`
   */
  match(input: string): { skill: SkillDefinition; args: string } | undefined {
    const trimmed = input.trim();
    let bestMatch: { skill: SkillDefinition; args: string } | undefined;
    let longestTrigger = 0;

    for (const skill of this.skills.values()) {
      const trigger = skill.trigger;

      if (trimmed === trigger) {
        if (trigger.length > longestTrigger) {
          longestTrigger = trigger.length;
          bestMatch = { skill, args: "" };
        }
      } else if (trimmed.startsWith(trigger + " ")) {
        if (trigger.length > longestTrigger) {
          longestTrigger = trigger.length;
          bestMatch = { skill, args: trimmed.slice(trigger.length + 1).trim() };
        }
      }
    }

    return bestMatch;
  }
}
