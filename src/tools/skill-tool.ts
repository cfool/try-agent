import { Tool, ToolDefinition, ToolExecuteResult } from "../tool-registry.js";
import { SkillRegistry } from "../skills/skill-registry.js";
import { SkillLoader } from "../skills/skill-loader.js";

/**
 * SkillTool — LLM 可调用的 Skill 工具。
 *
 * 当 LLM 在系统提示词中看到 <available_skills> 元数据时，
 * 可以通过调用此工具来触发对应的 Skill 执行。
 */
export class SkillTool implements Tool {
  definition: ToolDefinition;

  constructor(
    private skillRegistry: SkillRegistry,
    private skillLoader: SkillLoader
  ) {
    const invocableSkills = this.skillRegistry
      .list();

    const skillList = invocableSkills
      .map((s) => `- ${s.name}: ${s.description}`)
      .join("\n");

    this.definition = {
      name: "skill",
      description: `Activate a skill to perform a specialized task. Available skills:\n${skillList}`,
      parameters: {
        type: "object",
        properties: {
          skill_name: {
            type: "string",
            description: "The name of the skill to activate",
            enum: invocableSkills.map((s) => s.name),
          },
          task: {
            type: "string",
            description:
              "Context or arguments for the skill. " +
              "Include any relevant details the skill needs to complete the task.",
          },
        },
        required: ["skill_name"],
      },
    };
  }

  displayArgs(params: Record<string, unknown>): string {
    return `Loading skill: ${params.skill_name}`;
  }

  async execute(params: Record<string, unknown>): Promise<ToolExecuteResult> {
    const skillName = params.skill_name as string;
    const task = (params.task as string) ?? "";

    const skill = this.skillRegistry.get(skillName);
    if (!skill) {
      return {
        data: { error: `Skill "${skillName}" not found` },
        displayText: `Error: Skill "${skillName}" not found`,
      };
    }

    const prompt = this.skillLoader.load(skill, task);
    return {
      data: { skill: skillName, prompt },
      displayText: `[Skill:${skillName}] loaded — follow the instructions above`,
    };
  }
}
