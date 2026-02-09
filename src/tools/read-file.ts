import { readFile } from "node:fs/promises";
import { Tool, ToolDefinition } from "../tool-registry.js";

export class ReadFile implements Tool {
  definition: ToolDefinition = {
    name: "read_file",
    description:
      "Read the contents of a file at the given path. Returns the file content as text. " +
      "Use the optional offset and limit parameters to read a specific range of lines.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The absolute or relative path to the file to read",
        },
        offset: {
          type: "number",
          description:
            "The 1-based line number to start reading from (default: 1)",
        },
        limit: {
          type: "number",
          description: "The maximum number of lines to read (default: all lines)",
        },
      },
      required: ["file_path"],
    },
  };

  async execute(params: Record<string, unknown>): Promise<unknown> {
    const filePath = params.file_path as string;
    const offset = (params.offset as number | undefined) ?? 1;
    const limit = params.limit as number | undefined;

    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");

    const startIndex = Math.max(0, offset - 1);
    const sliced =
      limit !== undefined
        ? lines.slice(startIndex, startIndex + limit)
        : lines.slice(startIndex);

    const numbered = sliced.map(
      (line, i) => `${startIndex + i + 1}\t${line}`
    );

    return {
      filePath,
      totalLines: lines.length,
      fromLine: startIndex + 1,
      toLine: startIndex + sliced.length,
      content: numbered.join("\n"),
    };
  }
}
