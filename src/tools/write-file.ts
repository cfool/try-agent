import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Tool, ToolDefinition } from "../tool-registry.js";

export class WriteFile implements Tool {
  definition: ToolDefinition = {
    name: "write_file",
    description:
      "Write content to a file at the given path. " +
      "Creates the file if it does not exist, and overwrites it if it does. " +
      "Automatically creates parent directories if needed.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "The absolute or relative path to the file to write",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
      },
      required: ["file_path", "content"],
    },
  };

  async execute(params: Record<string, unknown>): Promise<unknown> {
    const filePath = params.file_path as string;
    const content = params.content as string;

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");

    return {
      filePath,
      bytesWritten: Buffer.byteLength(content, "utf-8"),
      message: `Successfully wrote to ${filePath}`,
    };
  }
}
