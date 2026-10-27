import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { pageSchema, dateSchema, rangeSchema } from "../schemas";
import { readTool, type McpAppContext } from "../policy";
import { readData } from "../read-data";
import { MCP_TYPOLOGIES } from "../typologie";
export default defineTool.withAppContext<McpAppContext>()({
 name: "rechercher_affaires", title: "Rechercher les affaires", description: "Rechercher les chantiers autorisés par numéro, nom, typologie (« opportunite » pour les 9XXX), statut et dates de montage. Les opportunités indiquent aussi typologie_future. equipe_projet donne les 7 rôles (nom + période).",
 inputSchema: { q: z.string().max(120).optional(), typologie: z.enum(MCP_TYPOLOGIES).optional(), statut: z.string().max(40).optional(), montage_du: dateSchema.optional(), montage_au: dateSchema.optional(), ...pageSchema },
 annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readTool(ctx.appContext, "rechercher_affaires", args, () => readData(ctx.appContext, "rechercher_affaires", args)),
});
