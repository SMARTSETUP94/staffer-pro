import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { v2ReadSchemas } from "../write-schemas";
import { readV2 } from "../v2-read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "planning_logistique", title: "Lire le planning logistique et les conflits véhicule", description: "Lire le planning logistique et les conflits véhicule. Lecture seule sous les permissions du compte, pagination limit/cursor.",
 inputSchema: v2ReadSchemas.planning_logistique, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readV2(ctx.appContext, "planning_logistique", args),
});
