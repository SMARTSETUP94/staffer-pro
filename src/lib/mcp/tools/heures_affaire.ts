import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { pageSchema, dateSchema, rangeSchema } from "../schemas";
import { readTool, type McpAppContext } from "../policy";
import { readData } from "../read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "heures_affaire", title: "Heures d’une affaire", description: "Heures saisies et validées par personne et métier, sans taux de salaire ni commentaires.",
 inputSchema: { affaire_id: z.string().uuid(), du: dateSchema.optional(), au: dateSchema.optional(), ...pageSchema },
 annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readTool(ctx.appContext, "heures_affaire", args, () => readData(ctx.appContext, "heures_affaire", args)),
});
