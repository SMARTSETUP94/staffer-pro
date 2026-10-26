import { defineTool } from "@lovable.dev/mcp-js";
import type { McpAppContext } from "../policy";
import { v2ReadSchemas } from "../write-schemas";
import { readV2 } from "../v2-read-data";
export default defineTool.withAppContext<McpAppContext>()({
 name: "vehicules_disponibles", title: "Lire les véhicules disponibles sur une période", description: "Lire les véhicules disponibles sur une période. Lecture seule sous les permissions du compte, pagination limit/cursor.",
 inputSchema: v2ReadSchemas.vehicules_disponibles, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
 handler: (args, ctx) => readV2(ctx.appContext, "vehicules_disponibles", args),
});
