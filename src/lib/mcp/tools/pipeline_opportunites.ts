import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { pageSchema, dateSchema, rangeSchema } from "../schemas";
import { readTool, type McpAppContext } from "../policy";
import { readData } from "../read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "pipeline_opportunites", title: "Consulter le pipeline", description: "Opportunités actives avec jalon et prochaine action selon vos droits commerciaux.",
 inputSchema: { filtre: z.string().max(40).optional(), ...pageSchema },
 annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readTool(ctx.appContext, "pipeline_opportunites", args, () => readData(ctx.appContext, "pipeline_opportunites", args)),
});
