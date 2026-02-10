import { readFile, writeFile } from "node:fs/promises";
import { Tool, ToolDefinition } from "../tool-registry.js";

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

  async execute(params: Record<string, unknown>): Promise<unknown> {
    const filePath = params.file_path as string;
    const oldString = params.old_string as string;
    const newString = params.new_string as string;
    const replaceAll = (params.replace_all as boolean) ?? false;

    const content = await readFile(filePath, "utf-8");

    if (!content.includes(oldString)) {
      return {
        filePath,
        success: false,
        error: `old_string not found in ${filePath}`,
      };
    }

    const updated = replaceAll
      ? content.replaceAll(oldString, newString)
      : content.replace(oldString, newString);

    await writeFile(filePath, updated, "utf-8");

    const occurrences = content.split(oldString).length - 1;

    return {
      filePath,
      success: true,
      replacements: replaceAll ? occurrences : 1,
      message: `Successfully edited ${filePath}`,
    };
  }
}
