import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { pageSchema, dateSchema, rangeSchema } from "../schemas";
import { readTool, type McpAppContext } from "../policy";
import { readData } from "../read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "demandes_clients", title: "Demandes clients", description: "Métadonnées des demandes clients (boîte, fil, opportunité rattachée) ; ni corps des emails ni candidatures ou données RH.",
 inputSchema: { statut: z.string().max(40).optional(), source_boite: z.enum(["devis", "logistique", "smart"]).optional(), ...pageSchema },
 annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readTool(ctx.appContext, "demandes_clients", args, () => readData(ctx.appContext, "demandes_clients", args)),
});
