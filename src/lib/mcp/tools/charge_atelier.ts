import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { pageSchema, dateSchema, rangeSchema } from "../schemas";
import { readTool, type McpAppContext } from "../policy";
import { readData } from "../read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "charge_atelier", title: "Charge atelier", description: "Charge prévisionnelle par jour et métier comparée à la capacité en personnes par jour.",
 inputSchema: { ...rangeSchema, metier: z.number().int().positive().optional(), ...pageSchema },
 annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readTool(ctx.appContext, "charge_atelier", args, () => readData(ctx.appContext, "charge_atelier", args)),
});
