import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { pageSchema, dateSchema, rangeSchema } from "../schemas";
import { readTool, type McpAppContext } from "../policy";
import { readData } from "../read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "fiche_affaire", title: "Consulter une affaire", description: "Identité, dates, équipe, objets et devis autorisés ; aucun salaire individuel.",
 inputSchema: { affaire_id: z.string().uuid().optional(), numero: z.string().regex(/^\d{4,5}$/).optional(), ...pageSchema },
 annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readTool(ctx.appContext, "fiche_affaire", args, () => readData(ctx.appContext, "fiche_affaire", args)),
});
