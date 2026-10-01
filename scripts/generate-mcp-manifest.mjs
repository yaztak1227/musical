import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { musicalTools } from "../dist/mcp/tools/catalog.js";

const outputPath = path.resolve("src-tauri", "mcp-tools.json");
const tools = musicalTools.map((tool) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: z.toJSONSchema(tool.inputSchema),
  outputSchema: { type: "object", additionalProperties: true },
  _meta: {
    "musical/modelVisible": tool.modelVisible,
    "musical/risk": tool.risk,
  },
}));

await writeFile(outputPath, `${JSON.stringify(tools, null, 2)}\n`, "utf8");
