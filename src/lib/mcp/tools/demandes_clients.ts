import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { pageSchema, dateSchema, rangeSchema } from "../schemas";
import { readTool, type McpAppContext } from "../policy";
import { readData } from "../read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "demandes_clients", title: "Demandes clients", description: "Métadonnées des demandes clients ; ni corps des emails ni candidatures ou données RH.",
 inputSchema: { statut: z.string().max(40).optional(), ...pageSchema },
 annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readTool(ctx.appContext, "demandes_clients", args, () => readData(ctx.appContext, "demandes_clients", args)),
});
