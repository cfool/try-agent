import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Tool, ToolDefinition, ToolExecuteResult } from "./tool-registry.js";

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

  displayArgs(params: Record<string, unknown>): string {
    return params.folder_path as string;
  }

  async execute(params: Record<string, unknown>): Promise<ToolExecuteResult> {
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

    const data = {
      folderPath,
      totalEntries: items.length,
      entries: items,
    };

    const listing = items
      .map((e) => `  ${e.type === "directory" ? "📁" : "📄"} ${e.name}`)
      .join("\n");
    const displayText = `${folderPath} (${items.length} entries)\n${listing}`;

    return { data, displayText };
  }
}
