import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Tool, ToolDefinition } from "../tool-registry.js";

export class ReadFolder implements Tool {
  definition: ToolDefinition = {
    name: "read_folder",
    description:
      "List the contents of a directory at the given path. " +
      "Returns file and subdirectory names with their types.",
    parameters: {
      type: "object",
      properties: {
        folder_path: {
          type: "string",
          description: "The absolute or relative path to the directory to list",
        },
      },
      required: ["folder_path"],
    },
  };

  async execute(params: Record<string, unknown>): Promise<unknown> {
    const folderPath = params.folder_path as string;
    const entries = await readdir(folderPath);

    const items = await Promise.all(
      entries.map(async (name) => {
        try {
          const fullPath = join(folderPath, name);
          const info = await stat(fullPath);
          return {
            name,
            type: info.isDirectory() ? "directory" : "file",
            size: info.size,
          };
        } catch {
          return { name, type: "unknown", size: 0 };
        }
      })
    );

    return {
      folderPath,
      totalEntries: items.length,
      entries: items,
    };
  }
}
