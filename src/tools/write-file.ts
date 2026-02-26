import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Tool, ToolDefinition, ToolExecuteResult } from "./tool-registry.js";

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

  displayArgs(params: Record<string, unknown>): string {
    const filePath = params.file_path as string;
    const content = params.content as string;
    const bytes = Buffer.byteLength(content, "utf-8");
    return `${filePath} (${bytes} bytes)`;
  }

  async execute(params: Record<string, unknown>): Promise<ToolExecuteResult> {
    const filePath = params.file_path as string;
    const content = params.content as string;

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");

    const bytesWritten = Buffer.byteLength(content, "utf-8");
    const data = {
      filePath,
      bytesWritten,
      message: `Successfully wrote to ${filePath}`,
    };

    const displayText = `Wrote ${bytesWritten} bytes to ${filePath}`;

    return { data, displayText };
  }
}
