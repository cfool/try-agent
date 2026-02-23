import { SkillDefinition } from "./skill-types.js";

/**
 * SkillLoader — loads a Skill by building a prompt injection string.
 *
 * Unlike SubAgent (which spawns an independent Chat), a Skill injects its
 * prompt/description into the **main agent's conversation context** so that
 * the main agent continues to operate with that knowledge loaded.
 */
export class SkillLoader {
  /**
   * Load a skill by building a prompt string to inject into the main conversation.
   * The caller (main agent loop or SkillTool) is responsible for feeding this
   * string into the active Chat as context.
   *
   * @param skill Skill definition
   * @param args  User-provided arguments (text after the trigger command)
   * @returns     Formatted prompt string to inject
   */
  load(skill: SkillDefinition, args: string): string {
    let injection = `<skill name="${skill.name}">\n${skill.prompt}\n</skill>`;
    if (args) {
      injection += `\nUser arguments: ${args}`;
    }
    return injection;
  }
}
