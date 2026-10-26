import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { pageSchema, dateSchema, rangeSchema } from "../schemas";
import { readTool, type McpAppContext } from "../policy";
import { readData } from "../read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "echeances", title: "Échéances chantier", description: "Montages et démontages à venir dans les 14, 31 ou 92 prochains jours.",
 inputSchema: { fenetre: z.enum(["14j","1m","3m"]), ...pageSchema },
 annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readTool(ctx.appContext, "echeances", args, () => readData(ctx.appContext, "echeances", args)),
});
