import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { pageSchema } from "../schemas";
import { readTool, type McpAppContext } from "../policy";
import { readData } from "../read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "relances_a_faire", title: "Relances à faire", description: "Opportunités actives à relancer (mêmes règles et montants HT retenus que le pipeline), triées par priorité : devis envoyé sans réponse, prochaine action en retard, validité proche, inactivité, sans prochaine action. Périmètre « mes affaires » ; tous=true réservé aux administrateurs. Aucun coût ni marge. Lecture seule : tracer une relance avec ajouter_action_opportunite ; ne jamais envoyer d'e-mail.",
 inputSchema: { tous: z.boolean().default(false), ...pageSchema },
 annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readTool(ctx.appContext, "relances_a_faire", args, () => readData(ctx.appContext, "relances_a_faire", args)),
});
