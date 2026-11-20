import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { pageSchema, dateSchema, rangeSchema } from "../schemas";
import { readTool, type McpAppContext } from "../policy";
import { readData } from "../read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "pipeline_opportunites", title: "Consulter le pipeline", description: "Pipeline actif uniquement : a_faire, envoye, a_l_etude, presque_gagne ; montant retenu HT, version de devis et source du montant, urgence sur actions non closes. inclure_clos ajoute perdu/gagne en lecture seule, sans urgence ni totalisation. « filtre » recherche code, intitulé et client.",
 inputSchema: { filtre: z.string().max(40).optional(), inclure_clos: z.boolean().default(false), ...pageSchema },
 annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readTool(ctx.appContext, "pipeline_opportunites", args, () => readData(ctx.appContext, "pipeline_opportunites", args)),
});
