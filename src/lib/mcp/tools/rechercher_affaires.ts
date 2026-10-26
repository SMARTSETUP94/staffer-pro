import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { pageSchema, dateSchema, rangeSchema } from "../schemas";
import { readTool, type McpAppContext } from "../policy";
import { readData } from "../read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "rechercher_affaires", title: "Rechercher les affaires", description: "Rechercher les chantiers autorisés par numéro, nom, typologie, statut et dates de montage.",
 inputSchema: { q: z.string().max(120).optional(), typologie: z.enum(["fabrication","montage_demontage","stockage","prototype","non_operationnel"]).optional(), statut: z.string().max(40).optional(), montage_du: dateSchema.optional(), montage_au: dateSchema.optional(), ...pageSchema },
 annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readTool(ctx.appContext, "rechercher_affaires", args, () => readData(ctx.appContext, "rechercher_affaires", args)),
});
