import { readFile, writeFile } from "node:fs/promises";
import { Tool, ToolDefinition, ToolExecuteResult } from "../tool-registry.js";

export class EditFile implements Tool {
  definition: ToolDefinition = {
    name: "replace",
    description:
      "Edit a file by replacing occurrences of a string. " +
      "Finds old_string in the file and replaces it with new_string. " +
      "By default only the first occurrence is replaced; set replace_all to true to replace all occurrences.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The absolute or relative path to the file to edit",
        },
        old_string: {
          type: "string",
          description: "The exact string to search for in the file",
        },
        new_string: {
          type: "string",
          description: "The string to replace old_string with",
        },
        replace_all: {
          type: "boolean",
          description:
            "Whether to replace all occurrences (default: false, only replaces the first occurrence)",
        },
      },
      required: ["file_path", "old_string", "new_string"],
    },
  };

  displayArgs(params: Record<string, unknown>): string {
    const filePath = params.file_path as string;
    const oldStr = params.old_string as string;
    const newStr = params.new_string as string;
    const replaceAll = params.replace_all as boolean | undefined;
    const truncate = (s: string, max: number) =>
      s.length > max ? s.slice(0, max) + "..." : s;
    const mode = replaceAll ? " (all)" : "";
    return `${filePath}${mode}: "${truncate(oldStr, 30)}" -> "${truncate(newStr, 30)}"`;
  }

  async execute(params: Record<string, unknown>): Promise<ToolExecuteResult> {
    const filePath = params.file_path as string;
    const oldString = params.old_string as string;
    const newString = params.new_string as string;
    const replaceAll = (params.replace_all as boolean) ?? false;

    const content = await readFile(filePath, "utf-8");

    if (!content.includes(oldString)) {
      const data = {
        filePath,
        success: false,
        error: `old_string not found in ${filePath}`,
      };
      return { data, displayText: `Edit failed: old_string not found in ${filePath}` };
    }

    const updated = replaceAll
      ? content.replaceAll(oldString, newString)
      : content.replace(oldString, newString);

    await writeFile(filePath, updated, "utf-8");

    const occurrences = content.split(oldString).length - 1;
    const replacements = replaceAll ? occurrences : 1;

    const data = {
      filePath,
      success: true,
      replacements,
      message: `Successfully edited ${filePath}`,
    };

    const displayText = `Edited ${filePath} (${replacements} replacement${replacements > 1 ? "s" : ""})`;

    return { data, displayText };
  }
}
